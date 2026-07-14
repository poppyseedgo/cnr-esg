// ============================================================================
// adminFunding.ts — 굿즈(펀딩) 집계 SSOT                        // ← [2026-07-14]
//
// 목적(요구사항 2):
//   "굿즈는 입금이 완료되지 않아도, 펀딩이 종료된 상품일 경우 펀딩내역을 모두
//    합산해서 얼마인지 알 수 있어야 하고 CSV 출력도 가능해야 한다."
//
// 설계:
//   - 원천 데이터는 단 하나: esg_orders(order_type='goods') + esg_order_items.
//     → adminOrders.loadAllOrders({ type:'goods' }) 재사용(전량 페이지네이션 적용본).
//       별도 RPC를 새로 만들지 않으므로 DB 마이그레이션 없이 배포 가능하고,
//       주문 화면과 항상 동일한 숫자를 낸다(집계 중복 정의 방지).
//   - 상품 메타는 esg_products(section='goods', purchase_type='funding') 전량.
//     (hidden 포함 — 종료 후 숨긴 상품도 정산 대상)
//   - 상태별 버킷을 전부 분리 집계하고, "유효 합계"를 명시적으로 정의한다.
//
// 합계 정의(고정):
//   유효 합계(valid) = pledged(펀딩 참여중) + pending(입금 대기) + paid(결제 완료)
//     → 입금 여부와 무관한 "펀딩 참여 총액". 요구사항 2의 답이 이 값이다.
//   미입금(unpaid)   = pledged + pending
//   입금 완료(paid)  = paid
//   제외(excluded)   = cancelled + expired + refunded
//     → 관리자가 취소한 참여는 달성률(esg_funding_progress)에서도 빠지므로
//       유효 합계에서 제외하되, 컬럼으로 그대로 노출해 은폐하지 않는다.
//
// 종료 판정(SSOT):
//   isFundingClosed = funding_status !== 'live' (성사/실패 확정) OR 마감일 경과
// ============================================================================

import { supabase as _supabase } from './supabase';
import { loadAllOrders } from './adminOrders';
import type {
  EsgProductRow,
  EsgPaymentStatus,
  EsgFundingGoalType,
  EsgFundingStatus,
} from '@/types/esg';
import type { OrderWithItems } from './orders';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/** 상태별 집계 버킷 */
export interface FundingBucket {
  count: number;    // 참여 건수(주문 건수)
  quantity: number; // 수량 합
  amount: number;   // 금액 합(원)
}

const emptyBucket = (): FundingBucket => ({ count: 0, quantity: 0, amount: 0 });

const addBucket = (b: FundingBucket, qty: number, amount: number): void => {
  b.count += 1;
  b.quantity += qty;
  b.amount += amount;
};

const sumBuckets = (...bs: FundingBucket[]): FundingBucket =>
  bs.reduce(
    (acc, b) => ({
      count: acc.count + b.count,
      quantity: acc.quantity + b.quantity,
      amount: acc.amount + b.amount,
    }),
    emptyBucket()
  );

/** 펀딩 상품 1건의 집계 결과 */
export interface FundingProductSummary {
  product_id: string;
  name: string;
  product_status: string;                    // on_sale / sold_out / hidden ...
  goal_type: EsgFundingGoalType | null;
  goal_amount: number | null;
  goal_quantity: number | null;
  funding_deadline: string | null;           // ISO
  funding_status: EsgFundingStatus | null;   // live / succeeded / failed
  payment_deadline: string | null;           // ISO (입금 기한)
  closed: boolean;                           // 종료 여부(성사/실패 확정 or 마감일 경과)
  /** 상태별 버킷 */
  byStatus: Record<EsgPaymentStatus, FundingBucket>;
  valid: FundingBucket;    // pledged + pending + paid  ← 요구사항 2의 "합산 금액"
  unpaid: FundingBucket;   // pledged + pending
  paid: FundingBucket;     // paid
  excluded: FundingBucket; // cancelled + expired + refunded
  backers: number;         // 유효 참여 고유 인원(중복 참여 1인 처리)
  achievement: number | null; // 달성률 % (목표 미설정 시 null)
}

/** 참여 1건(주문 1건) 상세 — 상세 CSV용 */
export interface FundingParticipationRow {
  product_id: string;
  product_name: string;
  closed: boolean;
  order_number: string;
  user_name: string;
  user_dept: string;
  user_email: string;
  payer_name: string;
  quantity: number;
  amount: number;
  payment_status: EsgPaymentStatus;
  paid_at: string | null;
  created_at: string;
}

export interface FundingSummaryResult {
  products: FundingProductSummary[];
  participations: FundingParticipationRow[];
}

/** 종료(마감) 판정 — SSOT */
export function isFundingClosed(
  p: Pick<EsgProductRow, 'funding_status' | 'funding_deadline'>,
  now: number = Date.now()
): boolean {
  if (p.funding_status && p.funding_status !== 'live') return true; // 성사/실패 확정
  if (p.funding_deadline) return now >= new Date(p.funding_deadline).getTime();
  return false;
}

const ALL_STATUSES: EsgPaymentStatus[] = [
  'pledged',
  'pending',
  'paid',
  'cancelled',
  'expired',
  'refunded',
];

const emptyByStatus = (): Record<EsgPaymentStatus, FundingBucket> =>
  ALL_STATUSES.reduce((acc, s) => {
    acc[s] = emptyBucket();
    return acc;
  }, {} as Record<EsgPaymentStatus, FundingBucket>);

/**
 * 굿즈 펀딩 전체 집계.
 * - 모든 결제 상태를 포함한다(입금 미완료 포함).
 * - 종료 여부와 무관하게 전 상품을 반환하고, closed 플래그로 구분한다.
 */
export async function loadFundingSummary(): Promise<FundingSummaryResult> {
  // 1) 펀딩 상품 메타 (hidden 포함)
  const { data: prodData, error: prodErr } = await supabase
    .from('esg_products')
    .select('*')
    .eq('section', 'goods')
    .eq('purchase_type', 'funding')
    .order('created_at', { ascending: false });
  if (prodErr) throw prodErr;
  const products = (prodData ?? []) as EsgProductRow[];

  // 2) 굿즈 주문 전량(전 상태) + items — 전량 페이지네이션된 loadAllOrders 재사용
  const orders: OrderWithItems[] = await loadAllOrders({ type: 'goods', sortOrder: 'oldest' });

  const now = Date.now();

  // 3) 상품별 누적
  const summaries = new Map<string, FundingProductSummary>();
  const backerSets = new Map<string, Set<string>>(); // product_id → user key 집합(유효 참여만)

  for (const p of products) {
    summaries.set(p.id, {
      product_id: p.id,
      name: p.name,
      product_status: p.status,
      goal_type: p.funding_goal_type,
      goal_amount: p.funding_goal_amount,
      goal_quantity: p.funding_goal_quantity,
      funding_deadline: p.funding_deadline,
      funding_status: p.funding_status,
      payment_deadline: p.payment_deadline,
      closed: isFundingClosed(p, now),
      byStatus: emptyByStatus(),
      valid: emptyBucket(),
      unpaid: emptyBucket(),
      paid: emptyBucket(),
      excluded: emptyBucket(),
      backers: 0,
      achievement: null,
    });
    backerSets.set(p.id, new Set());
  }

  const participations: FundingParticipationRow[] = [];

  for (const o of orders) {
    for (const it of o.items) {
      if (!it.product_id) continue;
      const s = summaries.get(it.product_id);
      if (!s) continue; // 펀딩 상품이 아닌 굿즈(일반결제) → 집계 대상 아님

      const qty = it.quantity;
      const amount = it.price_snapshot * it.quantity;
      const st = o.payment_status;

      addBucket(s.byStatus[st] ?? (s.byStatus[st] = emptyBucket()), qty, amount);

      if (st === 'pledged' || st === 'pending' || st === 'paid') {
        backerSets.get(it.product_id)!.add(o.user_id ?? o.user_email);
      }

      participations.push({
        product_id: it.product_id,
        product_name: s.name,
        closed: s.closed,
        order_number: o.order_number,
        user_name: o.user_name_snapshot,
        user_dept: o.user_dept_snapshot ?? '',
        user_email: o.user_email,
        payer_name: o.payer_name ?? '',
        quantity: qty,
        amount,
        payment_status: st,
        paid_at: o.paid_at,
        created_at: o.created_at,
      });
    }
  }

  // 4) 파생 합계 + 달성률
  for (const s of summaries.values()) {
    s.paid = s.byStatus.paid;
    s.unpaid = sumBuckets(s.byStatus.pledged, s.byStatus.pending);
    s.valid = sumBuckets(s.byStatus.pledged, s.byStatus.pending, s.byStatus.paid);
    s.excluded = sumBuckets(s.byStatus.cancelled, s.byStatus.expired, s.byStatus.refunded);
    s.backers = backerSets.get(s.product_id)?.size ?? 0;

    if (s.goal_type === 'amount' && s.goal_amount && s.goal_amount > 0) {
      s.achievement = Math.round((s.valid.amount / s.goal_amount) * 1000) / 10;
    } else if (s.goal_type === 'quantity' && s.goal_quantity && s.goal_quantity > 0) {
      s.achievement = Math.round((s.valid.quantity / s.goal_quantity) * 1000) / 10;
    } else {
      s.achievement = null;
    }
  }

  return {
    products: [...summaries.values()],
    participations,
  };
}
