// ============================================================================
// adminAnalytics.ts — 어드민 방문/이벤트 집계 API               // ← [2026-07-14]
//
// 서버 RPC(esg_visit_stats / esg_event_stats)가 집계의 SSOT.
// 클라이언트는 기간만 넘기고 표시/CSV만 담당한다(대용량 로우를 브라우저로 끌어오지 않음).
// ============================================================================

import { supabase as _supabase } from './supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface VisitByDay {
  d: string;          // YYYY-MM-DD (KST)
  page_views: number;
  visitors: number;
}
export interface VisitByPath {
  path: string;
  page_views: number;
  visitors: number;
}
export interface VisitStats {
  page_views: number;
  unique_visitors: number;    // distinct(user_id ?? session_id) — 상한 개념
  logged_in_visitors: number; // 로그인 순 인원
  anon_visitors: number;      // 비로그인 세션 수
  sessions: number;
  by_day: VisitByDay[];
  by_path: VisitByPath[];
}

export interface OrderMatrixRow {
  order_type: 'bazaar' | 'auction' | 'goods';
  payment_status: string;
  cnt: number;
  amount: number;
}
export interface EventStats {
  orders: OrderMatrixRow[];
  orders_total: number;
  bids: number;
  bidders: number;
  donations: number;
  donations_paid: number;
  donations_paid_amount: number;
  intake_items: number;
  intake_qty: number;
  posts: number;
  comments: number;
}

function guard(r: { success?: boolean; error?: string } | null): void {
  if (!r?.success) {
    throw new Error(r?.error === 'NOT_ADMIN' ? '관리자 권한이 필요합니다.' : (r?.error ?? '집계 실패'));
  }
}

/** 기간별 방문 집계 ([from, to) — to 는 미포함) */
export async function loadVisitStats(fromIso: string, toIso: string): Promise<VisitStats> {
  const { data, error } = await supabase.rpc('esg_visit_stats', { p_from: fromIso, p_to: toIso });
  if (error) throw error;
  guard(data);
  return {
    page_views: data.page_views ?? 0,
    unique_visitors: data.unique_visitors ?? 0,
    logged_in_visitors: data.logged_in_visitors ?? 0,
    anon_visitors: data.anon_visitors ?? 0,
    sessions: data.sessions ?? 0,
    by_day: data.by_day ?? [],
    by_path: data.by_path ?? [],
  };
}

/** 기간별 행사 이벤트 집계 */
export async function loadEventStats(fromIso: string, toIso: string): Promise<EventStats> {
  const { data, error } = await supabase.rpc('esg_event_stats', { p_from: fromIso, p_to: toIso });
  if (error) throw error;
  guard(data);
  return {
    orders: data.orders ?? [],
    orders_total: data.orders_total ?? 0,
    bids: data.bids ?? 0,
    bidders: data.bidders ?? 0,
    donations: data.donations ?? 0,
    donations_paid: data.donations_paid ?? 0,
    donations_paid_amount: data.donations_paid_amount ?? 0,
    intake_items: data.intake_items ?? 0,
    intake_qty: data.intake_qty ?? 0,
    posts: data.posts ?? 0,
    comments: data.comments ?? 0,
  };
}
