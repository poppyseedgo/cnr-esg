// ============================================================================
// adminRevenue.ts — 어드민 수익(실판매) 집계 API (관리자 전용)
//
// 목적: 실판매 집계 SSOT(DB RPC)를 감싸 대시보드/명단에 타입 안전하게 공급.
//   프론트에서 흩어져 계산하던 수익 지표를 DB 한 곳(20260710_001/002 마이그레이션)에서 읽는다.
//
// 실판매 판정(고정):
//   구매 수익 = esg_orders(payment_status='paid') total_amount, order_type별
//   기부 수익 = esg_donations(payment_status='paid') amount
//   전체 수익 = 바자회 + 경매 + 굿즈 + 금액기부
//   ※ 펀딩 pledged/pending 은 미집계 (paid 전환 후에만 수익 인정)
//
// 권한: 모든 RPC 는 DB 내부 esg_is_admin() 게이트. 비관리자는 예외/실패 반환.
//
// 변경 이력:
//   2026-07-10  최초 작성 — 수익 개요/랭킹/이벤트별 구매자 RPC 래퍼
// ============================================================================

import { supabase as _supabase } from './supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

const n = (v: unknown): number => Number(v ?? 0); // bigint 문자열 방지용

// ============================================================================
// 1) 수익 개요 — esg_admin_revenue_overview()
// ============================================================================
export interface EventRevenue {
  revenue: number;
  orders: number;
}

export interface RevenueOverview {
  total_revenue: number;      // 전체 수익 (구매 + 기부)
  purchase_revenue: number;   // 구매 수익 (바자회 + 경매 + 굿즈)
  donation_revenue: number;   // 금액 기부 수익
  total_participants: number; // 순 참여자 (구매 OR 기부)
  events: {
    bazaar: EventRevenue;
    auction: EventRevenue;
    goods: EventRevenue;
    donation: EventRevenue;
  };
}

export async function loadRevenueOverview(): Promise<RevenueOverview> {
  const { data, error } = await supabase.rpc('esg_admin_revenue_overview');
  if (error) throw error;
  const r = data as {
    success: boolean;
    error?: string;
    total_revenue?: number;
    purchase_revenue?: number;
    donation_revenue?: number;
    total_participants?: number;
    events?: Record<string, { revenue?: number; orders?: number }>;
  };
  if (!r?.success) throw new Error(r?.error ?? '수익 개요를 불러오지 못했습니다.');
  const ev = (k: string): EventRevenue => ({
    revenue: n(r.events?.[k]?.revenue),
    orders: n(r.events?.[k]?.orders),
  });
  return {
    total_revenue: n(r.total_revenue),
    purchase_revenue: n(r.purchase_revenue),
    donation_revenue: n(r.donation_revenue),
    total_participants: n(r.total_participants),
    events: {
      bazaar: ev('bazaar'),
      auction: ev('auction'),
      goods: ev('goods'),
      donation: ev('donation'),
    },
  };
}

// ============================================================================
// 2) 실판매 상위 물품 — esg_admin_top_items(p_event, p_limit)
//    event=null → 전체 합산, 'bazaar'|'auction'|'goods' → 이벤트별
// ============================================================================
export type RevenueEvent = 'bazaar' | 'auction' | 'goods';

export interface TopItem {
  item_key: string;
  event_type: string;
  item_name: string;
  thumbnail_url: string | null;
  sold_qty: number;
  revenue: number;
  order_count: number;
}

export async function loadTopItems(
  event: RevenueEvent | null = null,
  limit = 10
): Promise<TopItem[]> {
  const { data, error } = await supabase.rpc('esg_admin_top_items', {
    p_event: event,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((x) => ({
    item_key: String(x.item_key),
    event_type: String(x.event_type),
    item_name: String(x.item_name ?? ''),
    thumbnail_url: (x.thumbnail_url as string | null) ?? null,
    sold_qty: n(x.sold_qty),
    revenue: n(x.revenue),
    order_count: n(x.order_count),
  }));
}

// ============================================================================
// 3) 실판매 상위 물품 기부자 — esg_admin_top_item_donors(p_limit)
// ============================================================================
export interface TopItemDonor {
  donor_key: string;
  donor_id: string | null;
  donor_name: string;
  donor_dept: string | null;
  is_internal: boolean;
  item_kinds: number;
  sold_qty: number;
  revenue: number;
}

export async function loadTopItemDonors(limit = 10): Promise<TopItemDonor[]> {
  const { data, error } = await supabase.rpc('esg_admin_top_item_donors', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((x) => ({
    donor_key: String(x.donor_key),
    donor_id: (x.donor_id as string | null) ?? null,
    donor_name: String(x.donor_name ?? ''),
    donor_dept: (x.donor_dept as string | null) ?? null,
    is_internal: Boolean(x.is_internal),
    item_kinds: n(x.item_kinds),
    sold_qty: n(x.sold_qty),
    revenue: n(x.revenue),
  }));
}

// ============================================================================
// 4) 구매 총액 상위 구매자 — esg_admin_top_buyers(p_limit)
// ============================================================================
export interface TopBuyer {
  buyer_key: string;
  user_id: string | null;
  buyer_name: string;
  buyer_dept: string | null;
  user_email: string;
  order_count: number;
  total_amount: number;
  bazaar_amount: number;
  auction_amount: number;
  goods_amount: number;
}

export async function loadTopBuyers(limit = 10): Promise<TopBuyer[]> {
  const { data, error } = await supabase.rpc('esg_admin_top_buyers', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((x) => ({
    buyer_key: String(x.buyer_key),
    user_id: (x.user_id as string | null) ?? null,
    buyer_name: String(x.buyer_name ?? ''),
    buyer_dept: (x.buyer_dept as string | null) ?? null,
    user_email: String(x.user_email ?? ''),
    order_count: n(x.order_count),
    total_amount: n(x.total_amount),
    bazaar_amount: n(x.bazaar_amount),
    auction_amount: n(x.auction_amount),
    goods_amount: n(x.goods_amount),
  }));
}

// ============================================================================
// 5) 이벤트별 구매자 명단 — esg_admin_event_buyers(p_event)
// ============================================================================
export interface EventBuyer {
  buyer_key: string;
  user_id: string | null;
  buyer_name: string;
  buyer_dept: string | null;
  user_email: string;
  order_count: number;
  item_qty: number;
  total_amount: number;
  last_paid_at: string | null;
}

export async function loadEventBuyers(event: RevenueEvent): Promise<EventBuyer[]> {
  const { data, error } = await supabase.rpc('esg_admin_event_buyers', { p_event: event });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((x) => ({
    buyer_key: String(x.buyer_key),
    user_id: (x.user_id as string | null) ?? null,
    buyer_name: String(x.buyer_name ?? ''),
    buyer_dept: (x.buyer_dept as string | null) ?? null,
    user_email: String(x.user_email ?? ''),
    order_count: n(x.order_count),
    item_qty: n(x.item_qty),
    total_amount: n(x.total_amount),
    last_paid_at: (x.last_paid_at as string | null) ?? null,
  }));
}

// ============================================================================
// 대시보드용 묶음 로더 (병렬)
// ============================================================================
export interface RevenueDashboardData {
  overview: RevenueOverview;
  topItems: TopItem[];        // 전체 합산 상위 물품
  topDonors: TopItemDonor[];  // 실판매 상위 물품 기부자
  topBuyers: TopBuyer[];      // 구매 총액 상위 구매자
}

export async function loadRevenueDashboard(): Promise<RevenueDashboardData> {
  const [overview, topItems, topDonors, topBuyers] = await Promise.all([
    loadRevenueOverview(),
    loadTopItems(null, 10),
    loadTopItemDonors(10),
    loadTopBuyers(10),
  ]);
  return { overview, topItems, topDonors, topBuyers };
}
