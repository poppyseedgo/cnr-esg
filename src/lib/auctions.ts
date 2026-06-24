// ============================================================================
// auctions.ts — 경매 API
//
// 함수:
//   - loadAuctions(opts?)            : 경매 목록 (status 필터)
//   - loadAuction(id)                : 단일 경매
//   - loadBids(auctionId, limit?)    : 입찰 이력 (최근 순)
//   - loadMyBidAuctions(userId)      : 내가 입찰한 경매 목록 (각 경매 + 내 최고 입찰가)
//   - placeBid(auctionId, amount)    : 입찰 RPC 호출
//   - subscribeAuction(id, callback) : 단일 경매 Realtime (현재가/입찰자 실시간 갱신)
//   - subscribeAuctions(callback)    : 전체 경매 Realtime (목록용)
//   - subscribeBids(auctionId, cb)   : 특정 경매의 입찰 이력 Realtime
//
// 설계:
//   - 입찰은 RPC만 가능 (RLS가 INSERT 차단)
//   - 입찰 이력은 누구나 SELECT 가능 (공개)
//   - 동시성: RPC가 SELECT FOR UPDATE로 안전 처리
// ============================================================================

import { supabase as _supabase } from './supabase';
import { callRpc } from './supabase';
import { trackBid } from './analytics'; // ← [2026-06-02 추가] GA4 입찰 추적
import { loadPublicProfiles } from './profiles'; // ← [2026-06-04 추가] 공개 프로필 일괄 조회 SSOT
import type {
  EsgAuctionRow,
  EsgAuctionBidPublicRow,
  EsgAuctionStatus,
  EsgProfilePublicRow,
  PlaceBidInput,
  PlaceBidResult,
} from '@/types/esg';

// supabase-js 2.49 타입 추론 한계 우회 (TODO #1)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/**
 * 입찰 이력 + 사용자 프로필 (익명 처리됨).
 *
 * - bids는 esg_auction_bids_public view에서 가져옴 (DB 레벨 익명 마스킹)
 * - profile은 별도 일괄 조회 (익명 + 타인이면 null 유지)
 * - 익명 + 타인의 입찰자는 anonymous_handle로 구분 (같은 사람 = 같은 hash)
 */
export interface BidWithProfile extends EsgAuctionBidPublicRow {
  profile: Pick<EsgProfilePublicRow, 'id' | 'name' | 'dept' | 'avatar_url'> | null;
}

// ============================================================================
// RPC 에러 매핑
// ============================================================================

const PLACE_BID_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: '로그인이 필요합니다.',
  EVENT_ARCHIVED: '이벤트가 종료되었습니다.',
  AUCTION_NOT_CONFIGURED: '경매 설정이 없습니다. 관리자에게 문의하세요.',
  AUCTION_PHASE_NOT_STARTED: '아직 경매 기간이 아닙니다.',
  AUCTION_PHASE_ENDED: '경매 기간이 종료되었습니다.',
  BIDS_DISABLED: '입찰이 일시 중단되었습니다. (관리자 설정)',
  USER_NOT_FOUND: '사용자 정보를 찾을 수 없습니다.',
  AUCTION_NOT_FOUND: '경매를 찾을 수 없습니다.',
  AUCTION_CANCELLED: '취소된 경매입니다.',
  AUCTION_ENDED: '이미 종료된 경매입니다.',
  AUCTION_NOT_ACTIVE: '진행 중이 아닌 경매입니다.',
  AUCTION_NOT_STARTED: '아직 시작 전인 경매입니다.',
  ALREADY_HIGHEST_BIDDER: '이미 최고 입찰자입니다.',
};

function humanizeBidError(result: PlaceBidResult): string {
  const err = result.error;
  if (!err) return '알 수 없는 오류가 발생했습니다.';
  if (err === 'BID_TOO_LOW' && result.required_min) {
    return `최소 입찰가는 ${result.required_min.toLocaleString()}원입니다.`;
  }
  return PLACE_BID_ERRORS[err] ?? err;
}

// ============================================================================
// 조회
// ============================================================================

export interface LoadAuctionsOptions {
  statuses?: EsgAuctionStatus[];
  limit?: number;  // ← [2026-06-04] 무한 스크롤 페이징
  offset?: number; // ← [2026-06-04]
}

/** 경매 목록 (sort_order 순). status 필터 없으면 cancelled 제외하고 전부 노출 */
export async function loadAuctions(opts: LoadAuctionsOptions = {}): Promise<EsgAuctionRow[]> {
  const { statuses, limit, offset = 0 } = opts;
  let query = supabase
    .from('esg_auctions')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: true });

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses);
  } else {
    query = query.in('status', ['scheduled', 'active', 'ended']);
  }

  if (typeof limit === 'number') query = query.range(offset, offset + limit - 1); // ← [2026-06-04] 페이징

  const { data, error } = await query;
  if (error) throw error;
  return attachDonors((data ?? []) as EsgAuctionRow[]); // ← [2026-06-23] 기부자 이름·아바타 주입
}

// ── [2026-06-23] 기부자 보강 ──────────────────────────────────────────────
// esg_auction_donor_public(공개 뷰)에서 auction_id별 기부자 이름·아바타를 일괄 조회해 주입.
// best-effort: 뷰 미적용/오류여도 경매 표시는 정상(기부자만 생략).
interface AuctionDonorPublicRow {
  auction_id: string;
  donor_name: string;
  donor_avatar_url: string | null;
}
async function attachDonors(auctions: EsgAuctionRow[]): Promise<EsgAuctionRow[]> {
  if (auctions.length === 0) return auctions;
  const ids = auctions.map((a) => a.id);
  const { data, error } = await supabase
    .from('esg_auction_donor_public')
    .select('auction_id, donor_name, donor_avatar_url')
    .in('auction_id', ids);
  if (error) {
    console.warn('[attachDonors] 기부자 조회 실패:', error.message);
    return auctions;
  }
  const map = new Map<string, { name: string; avatar_url: string | null }>();
  for (const r of (data ?? []) as AuctionDonorPublicRow[]) {
    map.set(r.auction_id, { name: r.donor_name, avatar_url: r.donor_avatar_url });
  }
  return auctions.map((a) => ({ ...a, donor: map.get(a.id) ?? null }));
}

/** 단일 경매 */
export async function loadAuction(id: string): Promise<EsgAuctionRow | null> {
  const { data, error } = await supabase
    .from('esg_auctions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [enriched] = await attachDonors([data as EsgAuctionRow]); // ← [2026-06-23] 기부자 주입
  return enriched ?? (data as EsgAuctionRow);
}

/**
 * 입찰 이력 + 사용자 프로필 (최근 순).
 * - bids는 esg_auction_bids_public view에서 (익명 마스킹됨)
 * - profiles는 esg_profile_public view에서 IN 절로 일괄 조회 (N+1 아님)
 * - 익명 + 타인의 row는 user_id가 null이라 profile 조회 안 됨 → profile = null
 */
export async function loadBids(
  auctionId: string,
  limit = 30
): Promise<BidWithProfile[]> {
  // 1) 입찰 이력 (익명 마스킹된 view)
  const { data: bidsData, error: bidsErr } = await supabase
    .from('esg_auction_bids_public')
    .select('*')
    .eq('auction_id', auctionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (bidsErr) throw bidsErr;
  const bids = (bidsData ?? []) as EsgAuctionBidPublicRow[];

  if (bids.length === 0) return [];

  // 2) profile 일괄 조회 (SSOT) — 익명/타인은 view에서 user_id=null이라 자동 제외
  const profileMap = await loadPublicProfiles(bids.map((b) => b.user_id)); // ← [2026-06-04 수정] 인라인 쿼리 → 공통 로더(중복 제거)

  // 3) JOIN (익명 + 타인은 user_id가 null이라 profile도 null)
  return bids.map((b) => ({
    ...b,
    profile: b.user_id ? profileMap.get(b.user_id) ?? null : null,
  }));
}

// ============================================================================
// 익명 번호 매핑
// ============================================================================

/**
 * 익명 입찰자에게 1, 2, 3... 번호를 부여한다.
 * - 첫 등장(가장 오래된 입찰) 순서로 번호 할당
 * - 같은 anonymous_handle은 항상 같은 번호 (같은 사람이라는 표시)
 *
 * 반환: Map<anonymous_handle, 번호>
 *
 * 사용 예:
 *   const numMap = buildAnonymousNumberMap(bids);
 *   bids.forEach(b => {
 *     if (b.is_anonymous && !b.is_self && b.anonymous_handle) {
 *       const display = `익명 #${numMap.get(b.anonymous_handle)}`;
 *     }
 *   });
 */
export function buildAnonymousNumberMap(bids: BidWithProfile[]): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 0;
  // 오래된 순으로 정렬해서 첫 등장 순서대로 번호 부여
  const sorted = [...bids].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  for (const b of sorted) {
    if (b.is_anonymous && !b.is_self && b.anonymous_handle && !map.has(b.anonymous_handle)) {
      counter += 1;
      map.set(b.anonymous_handle, counter);
    }
  }
  return map;
}

// ============================================================================
// 내 입찰 관련
// ============================================================================

export interface MyBidAuction {
  auction: EsgAuctionRow;
  myMaxBid: number;
  myBidCount: number;
  amIWinner: boolean;
  amIHighestBidder: boolean;
}

/** 내가 입찰한 경매 목록 (각 경매에 대한 내 최고 입찰가 포함) */
export async function loadMyBidAuctions(userId: string): Promise<MyBidAuction[]> {
  // 1) 내가 입찰한 경매 ID 모으기 + 각 경매에서 내 최고가
  const { data: bids, error: bidsErr } = await supabase
    .from('esg_auction_bids')
    .select('auction_id, bid_amount')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (bidsErr) throw bidsErr;

  const bidMap = new Map<string, { max: number; count: number }>();
  for (const b of (bids ?? []) as Array<{ auction_id: string; bid_amount: number }>) {
    const cur = bidMap.get(b.auction_id);
    if (cur) {
      cur.max = Math.max(cur.max, b.bid_amount);
      cur.count = cur.count + 1;
    } else {
      bidMap.set(b.auction_id, { max: b.bid_amount, count: 1 });
    }
  }

  if (bidMap.size === 0) return [];

  // 2) 해당 경매들 조회
  const { data: auctions, error: aucErr } = await supabase
    .from('esg_auctions')
    .select('*')
    .in('id', Array.from(bidMap.keys()))
    .order('ends_at', { ascending: false });
  if (aucErr) throw aucErr;

  return ((auctions ?? []) as EsgAuctionRow[]).map((auction) => {
    const my = bidMap.get(auction.id)!;
    return {
      auction,
      myMaxBid: my.max,
      myBidCount: my.count,
      amIWinner: auction.winner_id === userId,
      amIHighestBidder: auction.current_bidder_id === userId,
    };
  });
}

// ============================================================================
// 입찰
// ============================================================================

/** 입찰 RPC 호출. 실패 시 친절한 에러 메시지 throw. 성공 시 결과 반환. */
export async function placeBid(
  auctionId: string,
  bidAmount: number,
  options: { isAnonymous?: boolean } = {}
): Promise<PlaceBidResult> {
  if (bidAmount < 0) throw new Error('입찰 금액은 0보다 커야 합니다.');

  const result = (await callRpc('place_bid', {
    p_auction_id: auctionId,
    p_bid_amount: bidAmount,
    p_is_anonymous: options.isAnonymous === true,
  } as PlaceBidInput)) as PlaceBidResult;

  if (!result.success) {
    throw new Error(humanizeBidError(result));
  }

  // 입찰 성공 시 같은 탭 즉시 신호 (Realtime 도착 전 갱신 보장)
  notifyAuctionChanged(auctionId);

  trackBid({ auctionId, bidAmount, isAnonymous: options.isAnonymous === true }); // ← [2026-06-02 추가] GA4 place_bid (성공 시에만)

  return result;
}

// ============================================================================
// Realtime
// ============================================================================

/**
 * 입찰 변경 즉시 신호 (window event).
 *
 * Realtime은 1~수초 지연 가능 (네트워크/서버 부하). UI는 즉시 반영되어야 함.
 * 같은 탭 내 다른 컴포넌트에서 즉시 갱신하려면 이 이벤트 활용.
 *
 * 사용:
 *   - placeBid 성공 후 자동 호출 (이미 위에서 처리)
 *   - 어드민 finalize/cancel 등 수동 호출 가능
 */
const AUCTION_CHANGED_EVENT = 'esg:auction-changed';

export function notifyAuctionChanged(auctionId?: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUCTION_CHANGED_EVENT, { detail: { auctionId } })
    );
  }
}

export function onAuctionChanged(callback: (auctionId?: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { auctionId?: string };
    callback(detail?.auctionId);
  };
  window.addEventListener(AUCTION_CHANGED_EVENT, handler);
  return () => window.removeEventListener(AUCTION_CHANGED_EVENT, handler);
}

/**
 * 단일 경매 Realtime (현재가, 최고 입찰자 등 즉시 반영).
 * UPDATE만 구독 — 입찰 이력은 subscribeBids에서 따로.
 */
export function subscribeAuction(auctionId: string, callback: () => void): () => void {
  const channelName = `esg-auction-${auctionId.slice(0, 8)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'esg_auctions',
        filter: `id=eq.${auctionId}`,
      },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** 경매 목록 Realtime (전체 변경 구독) */
export function subscribeAuctions(callback: () => void): () => void {
  const channelName = `esg-auctions-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_auctions' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** 특정 경매의 입찰 이력 Realtime (INSERT만 — 입찰은 추가만 됨) */
export function subscribeBids(auctionId: string, callback: () => void): () => void {
  const channelName = `esg-bids-${auctionId.slice(0, 8)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'esg_auction_bids',
        filter: `auction_id=eq.${auctionId}`,
      },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// 헬퍼
// ============================================================================

/** 경매 상태 한국어 라벨 */
export const AUCTION_STATUS_LABELS: Record<EsgAuctionStatus, string> = {
  scheduled: '예정',
  active: '진행 중',
  ended: '종료',
  cancelled: '취소됨',
};

export const AUCTION_STATUS_COLORS: Record<EsgAuctionStatus, { bg: string; color: string }> = {
  scheduled: { bg: '#fef3c7', color: '#92400e' },
  active: { bg: '#dcfce7', color: '#166534' },
  ended: { bg: '#f0f0f0', color: '#666' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

/** 다음 최소 입찰가 = 현재가 + 호가 단위 */
export function getMinimumBid(auction: Pick<EsgAuctionRow, 'current_price' | 'bid_unit'>): number {
  return auction.current_price + auction.bid_unit;
}

/** 경매 종료까지 남은 ms (음수면 종료 후) */
export function getAuctionTimeLeft(endsAt: string): number {
  return new Date(endsAt).getTime() - Date.now();
}
