// ============================================================================
// adminRoster.ts — 명단 관리 API (관리자 전용)
//
// 목적: 흩어진 3개 명단을 한곳에서 조회 + CSV 내보내기 (버그 #5).
//   - 물품 기부자  : esg_bazaar_intake (접수대장)
//   - 금액 기부자  : esg_donations (payment_status='paid')
//   - 구매자       : esg_orders (payment_status='paid', 바자회+경매)
//
// 권한: 세 테이블 모두 관리자 SELECT RLS 통과 (esg_is_admin()).
// 규모: 사내 이벤트(임직원 ~300명) 기준. PostgREST 기본 1000행 제한 회피용으로 limit 상향.
//
// 변경 이력:
//   2026-06-16  최초 작성 — 명단 관리 통합 조회
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

// ----------------------------------------------------------------------------
// 1) 물품 기부자 — 접수대장 전체 (검수/게시 상태 무관, 기부 사실 기준)
// ----------------------------------------------------------------------------
export interface ItemDonorRow {
  id: string;
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
      'id, donor_name_snapshot, donor_dept_snapshot, name, category, listed_price, quantity, publish_status, note, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return ((data ?? []) as EsgBazaarIntakeRow[]).map((r) => ({
    id: r.id,
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

// ----------------------------------------------------------------------------
// 2) 금액 기부자 — 완료(paid)된 자발적 기부
// ----------------------------------------------------------------------------
export interface MoneyDonorRow {
  id: string;
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
      'id, donation_number, user_name_snapshot, user_dept_snapshot, user_email, amount, payer_name, is_anonymous, paid_at, message'
    )
    .eq('payment_status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return ((data ?? []) as EsgDonationRow[]).map((r) => ({
    id: r.id,
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

// ----------------------------------------------------------------------------
// 3) 구매자 — 완료(paid)된 주문 (바자회 + 경매)
// ----------------------------------------------------------------------------
export interface BuyerRow {
  id: string;
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
      'id, order_number, order_type, user_name_snapshot, user_dept_snapshot, user_email, total_amount, payer_name, paid_at'
    )
    .eq('payment_status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return ((data ?? []) as EsgOrderRow[]).map((r) => ({
    id: r.id,
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
