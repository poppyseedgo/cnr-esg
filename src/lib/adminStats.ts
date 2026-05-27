// ============================================================================
// adminStats.ts — 어드민 대시보드 통계 API
//
// 함수:
//   - loadAdminStats()           : 모든 통계 한 번에 (병렬 쿼리)
//
// 데이터:
//   - donation: esg_donation_stats view 활용 (총 모금/참여/바자회·경매 분리)
//   - operations: 운영 알림 (결제 대기, 활성 경매, 재고 부족, 숨김 게시글)
//   - topProducts: 바자회 주문 수 기준 TOP 5
//   - topAuctions: 경매 입찰 수 기준 TOP 5
//   - posts: 카테고리별 게시글 수 + 총 좋아요/댓글
//
// 어드민 RLS:
//   - esg_orders, esg_posts, esg_auctions, esg_products 모두 어드민 SELECT 통과
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgDonationStatsRow,
  EsgPostCategory,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 타입
// ============================================================================

export interface OperationsAlerts {
  /** 결제 대기 중인 주문 수 (입금 확인 필요) */
  pendingOrders: number;
  /** 결제 대기 총액 (미확정 모금) */
  pendingAmount: number;
  /** 진행 중인 경매 수 */
  activeAuctions: number;
  /** 입찰 없는 진행 중 경매 수 */
  auctionsWithNoBids: number;
  /** 재고 부족 상품 수 (가용 재고 < 5) */
  lowStockProducts: number;
  /** 숨김 처리된 게시글 수 */
  hiddenPosts: number;
}

export interface TopProductItem {
  product_id: string;
  name: string;
  thumbnail_url: string | null;
  total_orders: number;
  total_quantity: number;
}

export interface TopAuctionItem {
  auction_id: string;
  product_name: string;
  thumbnail_url: string | null;
  current_price: number;
  bid_count: number;
  status: string;
}

export interface PostsStats {
  /** 카테고리별 게시글 수 (status='published'만) */
  byCategory: Record<EsgPostCategory, number>;
  /** 총 좋아요 합계 */
  totalLikes: number;
  /** 총 댓글 합계 */
  totalComments: number;
  /** 총 게시 중 게시글 수 */
  totalPublished: number;
  /** 익명 게시글 비율 (%) */
  anonymousRatio: number;
}

export interface EmailStats {
  pending: number;
  sent: number;
  failed: number;
  dead: number;
  /** 마지막 24시간 발송 성공 수 */
  sent24h: number;
  /** 가장 오래된 pending의 created_at (있을 시) */
  oldestPendingAt: string | null;
}

export interface AdminStats {
  donation: EsgDonationStatsRow;
  operations: OperationsAlerts;
  topProducts: TopProductItem[];
  topAuctions: TopAuctionItem[];
  posts: PostsStats;
  emails: EmailStats;
}

// ============================================================================
// 메인 함수
// ============================================================================

/**
 * 모든 어드민 통계를 병렬로 조회.
 * 6개 쿼리 + esg_donation_stats view → Promise.all로 동시 실행.
 */
export async function loadAdminStats(): Promise<AdminStats> {
  const [
    donation,
    operations,
    topProducts,
    topAuctions,
    posts,
    emails,
  ] = await Promise.all([
    loadDonationStats(),
    loadOperationsAlerts(),
    loadTopProducts(),
    loadTopAuctions(),
    loadPostsStats(),
    loadEmailStats(),
  ]);

  return { donation, operations, topProducts, topAuctions, posts, emails };
}

// ============================================================================
// 1. 모금 통계 (view 활용)
// ============================================================================

async function loadDonationStats(): Promise<EsgDonationStatsRow> {
  const { data, error } = await supabase
    .from('esg_donation_stats')
    .select('*')
    .single();
  if (error) throw error;
  return data as EsgDonationStatsRow;
}

// ============================================================================
// 2. 운영 알림
// ============================================================================

async function loadOperationsAlerts(): Promise<OperationsAlerts> {
  // 결제 대기 주문 (count + sum)
  const { data: pendingData, error: pendingErr } = await supabase
    .from('esg_orders')
    .select('total_amount')
    .eq('payment_status', 'pending');
  if (pendingErr) throw pendingErr;
  const pendingOrders = pendingData?.length ?? 0;
  const pendingAmount = (pendingData ?? []).reduce(
    (sum: number, o: { total_amount: number }) => sum + o.total_amount,
    0
  );

  // 진행 중 경매 + 입찰 없음 카운트
  const { data: activeAuctionData, error: activeErr } = await supabase
    .from('esg_auctions')
    .select('bid_count')
    .eq('status', 'active');
  if (activeErr) throw activeErr;
  const activeAuctions = activeAuctionData?.length ?? 0;
  const auctionsWithNoBids = (activeAuctionData ?? []).filter(
    (a: { bid_count: number }) => a.bid_count === 0
  ).length;

  // 재고 부족 상품 (가용 재고 < 5, on_sale만)
  const { data: lowStockData, error: lowStockErr } = await supabase
    .from('esg_products')
    .select('stock, reserved_stock')
    .eq('status', 'on_sale');
  if (lowStockErr) throw lowStockErr;
  const lowStockProducts = (lowStockData ?? []).filter(
    (p: { stock: number; reserved_stock: number }) => p.stock - p.reserved_stock < 5
  ).length;

  // 숨김 게시글
  const { count: hiddenPosts, error: hiddenErr } = await supabase
    .from('esg_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'hidden');
  if (hiddenErr) throw hiddenErr;

  return {
    pendingOrders,
    pendingAmount,
    activeAuctions,
    auctionsWithNoBids,
    lowStockProducts,
    hiddenPosts: hiddenPosts ?? 0,
  };
}

// ============================================================================
// 3. TOP 5 바자회 상품 (paid 주문 수 기준)
// ============================================================================

async function loadTopProducts(): Promise<TopProductItem[]> {
  // paid 주문 + items JOIN. PostgREST 중첩 SELECT 활용.
  const { data, error } = await supabase
    .from('esg_order_items')
    .select(
      `
      product_id,
      product_name_snapshot,
      thumbnail_snapshot,
      quantity,
      esg_orders!inner(payment_status, order_type)
    `
    )
    .eq('esg_orders.payment_status', 'paid')
    .eq('esg_orders.order_type', 'bazaar');
  if (error) throw error;

  // 클라이언트 집계 (product_id로 group by)
  const agg = new Map<
    string,
    { name: string; thumbnail: string | null; orders: number; quantity: number }
  >();

  for (const item of (data ?? []) as Array<{
    product_id: string | null;
    product_name_snapshot: string;
    thumbnail_snapshot: string | null;
    quantity: number;
  }>) {
    if (!item.product_id) continue;
    const existing = agg.get(item.product_id);
    if (existing) {
      existing.orders += 1;
      existing.quantity += item.quantity;
    } else {
      agg.set(item.product_id, {
        name: item.product_name_snapshot,
        thumbnail: item.thumbnail_snapshot,
        orders: 1,
        quantity: item.quantity,
      });
    }
  }

  return Array.from(agg.entries())
    .map(([product_id, v]) => ({
      product_id,
      name: v.name,
      thumbnail_url: v.thumbnail,
      total_orders: v.orders,
      total_quantity: v.quantity,
    }))
    .sort((a, b) => b.total_orders - a.total_orders)
    .slice(0, 5);
}

// ============================================================================
// 4. TOP 5 경매 (입찰 수 기준)
// ============================================================================

async function loadTopAuctions(): Promise<TopAuctionItem[]> {
  const { data, error } = await supabase
    .from('esg_auctions')
    .select('id, product_name, thumbnail_url, current_price, bid_count, status')
    .in('status', ['active', 'ended'])
    .order('bid_count', { ascending: false })
    .limit(5);
  if (error) throw error;

  return (data ?? []).map(
    (a: {
      id: string;
      product_name: string;
      thumbnail_url: string | null;
      current_price: number;
      bid_count: number;
      status: string;
    }) => ({
      auction_id: a.id,
      product_name: a.product_name,
      thumbnail_url: a.thumbnail_url,
      current_price: a.current_price,
      bid_count: a.bid_count,
      status: a.status,
    })
  );
}

// ============================================================================
// 5. 게시판 통계
// ============================================================================

async function loadPostsStats(): Promise<PostsStats> {
  // published 게시글만 (어드민이지만 운영 통계는 공개 기준)
  const { data, error } = await supabase
    .from('esg_posts')
    .select('category, like_count, comment_count, is_anonymous')
    .eq('status', 'published');
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    category: EsgPostCategory;
    like_count: number;
    comment_count: number;
    is_anonymous: boolean;
  }>;

  const byCategory: Record<EsgPostCategory, number> = {
    zero_waste: 0,
    wise_life: 0,
  };
  let totalLikes = 0;
  let totalComments = 0;
  let anonymousCount = 0;

  for (const p of rows) {
    if (byCategory[p.category] !== undefined) {
      byCategory[p.category] += 1;
    }
    totalLikes += p.like_count;
    totalComments += p.comment_count;
    if (p.is_anonymous) anonymousCount += 1;
  }

  return {
    byCategory,
    totalLikes,
    totalComments,
    totalPublished: rows.length,
    anonymousRatio: rows.length > 0 ? Math.round((anonymousCount / rows.length) * 100) : 0,
  };
}

// ============================================================================
// 6. 이메일 outbox 통계
// ============================================================================

async function loadEmailStats(): Promise<EmailStats> {
  // 작은 테이블이라 SELECT * 후 클라 집계 (수천 건까지 빠름)
  const { data, error } = await supabase
    .from('esg_email_outbox')
    .select('status, sent_at, created_at')
    .limit(10000);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    status: string;
    sent_at: string | null;
    created_at: string;
  }>;

  const stats: EmailStats = {
    pending: 0,
    sent: 0,
    failed: 0,
    dead: 0,
    sent24h: 0,
    oldestPendingAt: null,
  };

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let oldestPending: string | null = null;

  for (const r of rows) {
    if (r.status === 'pending') {
      stats.pending += 1;
      if (!oldestPending || r.created_at < oldestPending) {
        oldestPending = r.created_at;
      }
    } else if (r.status === 'sent') {
      stats.sent += 1;
      if (r.sent_at && new Date(r.sent_at).getTime() > dayAgo) {
        stats.sent24h += 1;
      }
    } else if (r.status === 'failed') {
      stats.failed += 1;
    } else if (r.status === 'dead') {
      stats.dead += 1;
    }
  }
  stats.oldestPendingAt = oldestPending;
  return stats;
}
