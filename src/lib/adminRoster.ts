// ============================================================================
// adminRoster.ts — 명단 관리 API (관리자 전용)
//
// 목적: 흩어진 3개 명단을 한곳에서 조회 + 사람 단위 집계 + CSV 내보내기 (버그 #5 / 명단 세분화).
//   - 물품 기부자  : esg_bazaar_intake (접수대장)
//   - 금액 기부자  : esg_donations (payment_status='paid')
//   - 구매자       : esg_orders (payment_status='paid', 바자회+경매)
//
// 동일인 식별 원칙(cnr-space와 동일): user_id(uuid) → email 순. 이름 비교 금지.
//   ※ 물품 기부자는 intake에 email이 없어, 외부(donor_id=null)는 이름+부서로 묶음(한계).
//
// 권한: 세 테이블 모두 관리자 SELECT RLS 통과 (esg_is_admin()).
// 규모: 사내 이벤트(임직원 ~300명) 기준. PostgREST 기본 1000행 제한 회피용 limit 상향.
//
// 변경 이력:
//   2026-06-16  최초 작성 — 명단 통합 조회
//   2026-06-16  사람 단위 집계(dedup + 누적) 추가 — aggregateItemDonors/MoneyDonors/Buyers
// ============================================================================

import { supabase as _supabase } from './supabase';
import { categoryLabel } from './bazaarIntake';
import type {
  EsgBazaarIntakeRow,
  EsgDonationRow,
  EsgOrderRow,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

const MAX_ROWS = 5000; // 이벤트 규모상 충분. 초과 시 페이지네이션 도입 필요.

// ============================================================================
// 1) 물품 기부자 — 원본 행 (접수대장 전체)
// ============================================================================
export interface ItemDonorRow {
  id: string;
  donor_id: string | null;        // 임직원 profiles.id (외부면 null) — 식별 키
  donor_name: string;
  donor_dept: string | null;
  item_name: string;
  category_label: string;
  listed_price: number;
  quantity: number;
  publish_status: string;
  note: string | null;
  created_at: string;
}

export async function loadItemDonors(): Promise<ItemDonorRow[]> {
  const { data, error } = await supabase
    .from('esg_bazaar_intake')
    .select(
      'id, donor_id, donor_name_snapshot, donor_dept_snapshot, name, category, listed_price, quantity, publish_status, note, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return ((data ?? []) as EsgBazaarIntakeRow[]).map((r) => ({
    id: r.id,
    donor_id: r.donor_id,
    donor_name: r.donor_name_snapshot,
    donor_dept: r.donor_dept_snapshot,
    item_name: r.name,
    category_label: categoryLabel(r.category),
    listed_price: r.listed_price,
    quantity: r.quantity,
    publish_status: r.publish_status,
    note: r.note,
    created_at: r.created_at,
  }));
}

// ============================================================================
// 2) 금액 기부자 — 원본 행 (완료 paid)
// ============================================================================
export interface MoneyDonorRow {
  id: string;
  user_id: string | null;         // 식별 키 (없으면 email)
  donation_number: string;
  donor_name: string;
  donor_dept: string | null;
  user_email: string;
  amount: number;
  payer_name: string | null;
  is_anonymous: boolean;
  paid_at: string | null;
  message: string | null;
}

export async function loadMoneyDonors(): Promise<MoneyDonorRow[]> {
  const { data, error } = await supabase
    .from('esg_donations')
    .select(
      'id, user_id, donation_number, user_name_snapshot, user_dept_snapshot, user_email, amount, payer_name, is_anonymous, paid_at, message'
    )
    .eq('payment_status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return ((data ?? []) as EsgDonationRow[]).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    donation_number: r.donation_number,
    donor_name: r.user_name_snapshot,
    donor_dept: r.user_dept_snapshot,
    user_email: r.user_email,
    amount: r.amount,
    payer_name: r.payer_name,
    is_anonymous: r.is_anonymous,
    paid_at: r.paid_at,
    message: r.message,
  }));
}

// ============================================================================
// 3) 구매자 — 원본 행 (완료 paid, 바자회+경매)
// ============================================================================
export interface BuyerRow {
  id: string;
  user_id: string | null;         // 식별 키 (없으면 email)
  order_number: string;
  order_type: string;
  buyer_name: string;
  buyer_dept: string | null;
  user_email: string;
  total_amount: number;
  payer_name: string | null;
  paid_at: string | null;
}

export async function loadBuyers(): Promise<BuyerRow[]> {
  const { data, error } = await supabase
    .from('esg_orders')
    .select(
      'id, user_id, order_number, order_type, user_name_snapshot, user_dept_snapshot, user_email, total_amount, payer_name, paid_at'
    )
    .eq('payment_status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return ((data ?? []) as EsgOrderRow[]).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    order_number: r.order_number,
    order_type: r.order_type,
    buyer_name: r.user_name_snapshot,
    buyer_dept: r.user_dept_snapshot,
    user_email: r.user_email,
    total_amount: r.total_amount,
    payer_name: r.payer_name,
    paid_at: r.paid_at,
  }));
}

// ============================================================================
// 사람 단위 집계 (dedup + 누적)
//   - 같은 사람의 여러 행을 1건으로 묶고, 금액/수량/건수를 합산.
//   - 식별 키: user_id(uuid) → email/(이름+부서) 순.
// ============================================================================

/** 물품 기부자 집계 — 이름 1회 노출, 물품은 합산/펼침 */
export interface ItemDonorAgg {
  key: string;
  donor_name: string;
  donor_dept: string | null;
  is_internal: boolean;           // donor_id 존재 = 임직원
  item_kinds: number;             // 물품 종류(행) 수
  total_qty: number;              // 총 수량
  total_value: number;            // 책정가 × 수량 합
  items: { name: string; category_label: string; qty: number; status: string }[];
}

export function aggregateItemDonors(rows: ItemDonorRow[]): ItemDonorAgg[] {
  const map = new Map<string, ItemDonorAgg>();
  for (const r of rows) {
    const key = r.donor_id ? `u:${r.donor_id}` : `n:${r.donor_name}|${r.donor_dept ?? ''}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        donor_name: r.donor_name,
        donor_dept: r.donor_dept,
        is_internal: !!r.donor_id,
        item_kinds: 0,
        total_qty: 0,
        total_value: 0,
        items: [],
      };
      map.set(key, agg);
    }
    agg.item_kinds += 1;
    agg.total_qty += r.quantity;
    agg.total_value += r.listed_price * r.quantity;
    agg.items.push({
      name: r.item_name,
      category_label: r.category_label,
      qty: r.quantity,
      status: r.publish_status,
    });
  }
  return Array.from(map.values()).sort((a, b) => b.total_qty - a.total_qty);
}

/** 금액 기부자 집계 — 이름 1회 노출, 누적 기부액 */
export interface MoneyDonorAgg {
  key: string;
  donor_name: string;
  donor_dept: string | null;
  user_email: string;
  donation_count: number;
  total_amount: number;           // 누적 기부액
  anonymous_count: number;        // 익명으로 한 건수
  named_count: number;            // 실명으로 한 건수
  default_show_on_main: boolean;  // 메인 노출 기본값(실명 건이 1건이라도 있으면 노출)
  donations: { number: string; amount: number; anonymous: boolean; paid_at: string | null }[];
}

export function aggregateMoneyDonors(rows: MoneyDonorRow[]): MoneyDonorAgg[] {
  const map = new Map<string, MoneyDonorAgg>();
  for (const r of rows) {
    const key = r.user_id ? `u:${r.user_id}` : `e:${r.user_email}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        donor_name: r.donor_name,
        donor_dept: r.donor_dept,
        user_email: r.user_email,
        donation_count: 0,
        total_amount: 0,
        anonymous_count: 0,
        named_count: 0,
        default_show_on_main: false,
        donations: [],
      };
      map.set(key, agg);
    }
    agg.donation_count += 1;
    agg.total_amount += r.amount;
    if (r.is_anonymous) agg.anonymous_count += 1;
    else agg.named_count += 1;
    agg.donations.push({
      number: r.donation_number,
      amount: r.amount,
      anonymous: r.is_anonymous,
      paid_at: r.paid_at,
    });
  }
  // 메인 노출 기본값: 실명 기부가 1건이라도 있으면 노출, 전부 익명이면 숨김(개인정보 보호 기본)
  for (const agg of map.values()) agg.default_show_on_main = agg.named_count > 0;
  return Array.from(map.values()).sort((a, b) => b.total_amount - a.total_amount);
}

/** 구매자 집계 — 이름 1회 노출, 누적 구매액 */
export interface BuyerAgg {
  key: string;
  buyer_name: string;
  buyer_dept: string | null;
  user_email: string;
  order_count: number;
  total_amount: number;           // 누적 구매액
  orders: { number: string; type: string; amount: number; paid_at: string | null }[];
}

export function aggregateBuyers(rows: BuyerRow[]): BuyerAgg[] {
  const map = new Map<string, BuyerAgg>();
  for (const r of rows) {
    const key = r.user_id ? `u:${r.user_id}` : `e:${r.user_email}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        buyer_name: r.buyer_name,
        buyer_dept: r.buyer_dept,
        user_email: r.user_email,
        order_count: 0,
        total_amount: 0,
        orders: [],
      };
      map.set(key, agg);
    }
    agg.order_count += 1;
    agg.total_amount += r.total_amount;
    agg.orders.push({
      number: r.order_number,
      type: r.order_type,
      amount: r.total_amount,
      paid_at: r.paid_at,
    });
  }
  return Array.from(map.values()).sort((a, b) => b.total_amount - a.total_amount);
}
