// ============================================================================
// wishlist.ts — 찜(위시리스트) 프론트 API + 세션 캐시 스토어
//
// [변경 이력]
//   2026-06-24  최초 작성. 백엔드(esg_wishlists 테이블 + RLS)는 기존 완비.
//               · 본인 찜 product id Set을 세션 1회 로드 → 모든 카드 공유(쿼리 N→1)
//               · add/remove(낙관적) + window 이벤트 동기화(cart.ts 패턴 동일)
//               · useSyncExternalStore 연동(subscribeWishlist + isWishlistedSync)
//
// [설계 — 근본 구조]
//   - esg_wishlists RLS: 본인 row만 select/modify → "상품별 총 찜 수"는 조회 불가.
//     (Figma의 heart count(15)는 디자인상 image 영역 밖(top 370)에 위치해 clip되어
//      비표시 상태 → 본 구현도 미표시. 추후 총합이 필요하면 SECURITY DEFINER 집계 뷰 별도.)
//   - 식별자는 호출자(useWishlist 훅)가 currentUser에서 주입 → auth.getUser() 핫패스 호출 0.
//   - target_type='product' 만 사용(경매는 동일 API에 'auction' 전달로 재사용 가능).
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgWishlistTargetType, EsgProductRow } from '@/types/esg'; // ← [2026-06-24] 찜 목록 상품 로드용 EsgProductRow

// supabase-js 2.49 타입 추론 한계 우회 — cart.ts와 동일 컨벤션(테이블 쿼리 시 row=never 붕괴 방지)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

const WISHLIST_CHANGED_EVENT = 'esg:wishlist-changed';

// 세션 캐시: 본인이 찜한 product id 집합 + 캐시 소유 유저 id ----------------------
let cache: Set<string> | null = null;          // ← 찜 product id 집합(미로딩=null)
let cacheUserId: string | null = null;         // ← 캐시가 속한 유저(유저 바뀌면 무효화)
let inflight: Promise<Set<string>> | null = null; // ← 동시 호출 1회 fetch 공유
const EMPTY: Set<string> = new Set();          // ← 미로딩/비로그인 시 안정 참조

// ── [2026-07-06] 경매(auction) 찜: 상품과 분리된 '병렬' 캐시(상품 경로 무영향, 무회귀) ──
let auctionCache: Set<string> | null = null;
let auctionCacheUserId: string | null = null;
let auctionInflight: Promise<Set<string>> | null = null;

// ── 변경 알림(window 이벤트 단일 신호 — cart.ts와 동일 패턴) ──────────────────
function emit(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WISHLIST_CHANGED_EVENT));
  }
}

/**
 * 본인 찜 product id Set 로드(유저별 1회 캐시).
 * @param userId  현재 로그인 유저 id(없으면 빈 Set). 캐시 소유자와 다르면 재조회.
 */
export async function loadMyWishlistProductIds(userId: string | null): Promise<Set<string>> {
  if (cache && cacheUserId === userId) return cache;           // ← 동일 유저 캐시 hit
  if (inflight) return inflight;                                // ← 진행 중 fetch 공유
  inflight = (async () => {
    if (!userId) { cache = new Set(); cacheUserId = null; emit(); return cache; } // 비로그인
    const { data, error } = await supabase
      .from('esg_wishlists')
      .select('target_id')
      .eq('target_type', 'product');                           // RLS가 본인 row만 노출
    if (error) {
      console.error('[wishlist] load error:', error);
      cache = new Set(); cacheUserId = userId; emit(); return cache; // 실패=빈 집합(찜 미표시)
    }
    cache = new Set((data ?? []).map((r: { target_id: string }) => r.target_id));
    cacheUserId = userId;
    emit();
    return cache;
  })();
  try { return await inflight; } finally { inflight = null; }
}

/** 현재 캐시 스냅샷(동기). 미로딩 시 안정된 빈 Set 반환. */
export function getWishlistSnapshot(): Set<string> {
  return cache ?? EMPTY;
}

/**
 * 본인이 찜한 '상품' 전체를 찜한 순서(최신순)로 로드. ("나의 찜한 내역" 리스트용)
 *
 * [설계 — 근본 구조]
 *   esg_wishlists.target_id 는 폴리모픽(product|auction)이라 esg_products 로의
 *   FK가 없음 → PostgREST 임베드 불가. 그래서 2단계로 조회한다:
 *     1) esg_wishlists 에서 본인 찜 product target_id + created_at (RLS=본인 row)
 *     2) esg_products 를 .in('id', ids) 로 일괄 조회(공개 읽기 RLS: on_sale/sold_out)
 *   찜한 순서를 보존하기 위해 1)의 id 순서대로 2) 결과를 재정렬한다.
 *   (읽을 수 없는 상품 — 예: hidden — 은 2)에서 빠지므로 자동 제외)
 */
export async function loadMyWishlistProducts(): Promise<EsgProductRow[]> {
  // 1) 본인 찜 product id(최신 찜 순)
  const { data: w, error: wErr } = await supabase
    .from('esg_wishlists')
    .select('target_id, created_at')
    .eq('target_type', 'product')
    .order('created_at', { ascending: false });
  if (wErr) throw wErr;
  const ids: string[] = (w ?? []).map((r: { target_id: string }) => r.target_id);
  if (ids.length === 0) return [];

  // 2) 상품 상세 일괄 조회
  const { data: products, error: pErr } = await supabase
    .from('esg_products')
    .select('*')
    .in('id', ids);
  if (pErr) throw pErr;

  // 찜한 순서 보존(id 순서대로 매핑)
  const byId = new Map<string, EsgProductRow>((products ?? []).map((p: EsgProductRow) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is EsgProductRow => !!p);
}

/** 특정 상품 찜 여부(동기). useSyncExternalStore의 getSnapshot으로 사용(boolean=값 비교). */
export function isWishlistedSync(productId: string): boolean {
  return (cache ?? EMPTY).has(productId);
}

/** 찜 추가(idempotent). user_id는 RLS WITH CHECK(user_id=auth.uid())로 서버 재검증. */
export async function addWishlist(
  userId: string,
  userEmail: string,
  productId: string,
  targetType: EsgWishlistTargetType = 'product',
): Promise<void> {
  if (cache && cacheUserId === userId) cache.add(productId);    // ← 낙관적 반영
  emit();
  const { error } = await supabase.from('esg_wishlists').upsert(
    { user_id: userId, user_email: userEmail, target_type: targetType, target_id: productId },
    { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true }, // 중복=무시
  );
  if (error) {
    if (cache && cacheUserId === userId) cache.delete(productId); // ← 롤백
    emit();
    throw error;
  }
}

/** 찜 해제. */
export async function removeWishlist(
  userId: string,
  productId: string,
  targetType: EsgWishlistTargetType = 'product',
): Promise<void> {
  if (cache && cacheUserId === userId) cache.delete(productId);  // ← 낙관적 반영
  emit();
  const { error } = await supabase
    .from('esg_wishlists')
    .delete()
    .eq('target_type', targetType)
    .eq('target_id', productId);                                 // RLS가 본인 row로 한정
  if (error) {
    if (cache && cacheUserId === userId) cache.add(productId);    // ← 롤백
    emit();
    throw error;
  }
}

/** 토글. 현재 캐시 기준으로 add/remove 분기. @returns 토글 후 찜 여부 */
export async function toggleWishlist(
  userId: string,
  userEmail: string,
  productId: string,
  targetType: EsgWishlistTargetType = 'product',
): Promise<boolean> {
  if (isWishlistedSync(productId)) {
    await removeWishlist(userId, productId, targetType);
    return false;
  }
  await addWishlist(userId, userEmail, productId, targetType);
  return true;
}

/** useSyncExternalStore 구독(window 이벤트). 반환=구독 해제 함수. */
export function subscribeWishlist(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(WISHLIST_CHANGED_EVENT, cb);
  return () => window.removeEventListener(WISHLIST_CHANGED_EVENT, cb);
}

/** 로그아웃 등으로 캐시 무효화(다음 로드 시 재조회). 상품+경매 캐시 모두 초기화. */
export function resetWishlistCache(): void {
  cache = null; cacheUserId = null;
  auctionCache = null; auctionCacheUserId = null; // ← [2026-07-06] 경매 캐시도 함께 초기화
  emit();
}

// ============================================================================
// [2026-07-06] 경매(auction) 찜 — 상품 경로와 동일 패턴의 병렬 구현
//   · esg_wishlists.target_type='auction' 사용(테이블/RLS 기존 완비 → DB 변경 없음).
//   · 상품용 cache/함수는 그대로 두고 경매 전용 캐시/함수만 추가 → 상품 찜 무영향.
// ============================================================================

/** 본인 경매 찜 id Set 로드(유저별 1회 캐시). */
export async function loadMyWishlistAuctionIds(userId: string | null): Promise<Set<string>> {
  if (auctionCache && auctionCacheUserId === userId) return auctionCache;
  if (auctionInflight) return auctionInflight;
  auctionInflight = (async () => {
    if (!userId) { auctionCache = new Set(); auctionCacheUserId = null; emit(); return auctionCache; }
    const { data, error } = await supabase
      .from('esg_wishlists')
      .select('target_id')
      .eq('target_type', 'auction');                            // RLS가 본인 row만 노출
    if (error) {
      console.error('[wishlist] auction load error:', error);
      auctionCache = new Set(); auctionCacheUserId = userId; emit(); return auctionCache;
    }
    auctionCache = new Set((data ?? []).map((r: { target_id: string }) => r.target_id));
    auctionCacheUserId = userId; emit(); return auctionCache;
  })();
  try { return await auctionInflight; } finally { auctionInflight = null; }
}

/** 특정 경매 찜 여부(동기). useSyncExternalStore getSnapshot용. */
export function isAuctionWishlistedSync(auctionId: string): boolean {
  return (auctionCache ?? EMPTY).has(auctionId);
}

/** 경매 찜 토글(낙관적 + 서버 반영). @returns 토글 후 찜 여부 */
export async function toggleAuctionWishlist(
  userId: string,
  userEmail: string,
  auctionId: string,
): Promise<boolean> {
  const currently = isAuctionWishlistedSync(auctionId);
  const owns = auctionCache && auctionCacheUserId === userId;
  if (currently) {
    if (owns) auctionCache!.delete(auctionId); // 낙관적
    emit();
    const { error } = await supabase
      .from('esg_wishlists').delete().eq('target_type', 'auction').eq('target_id', auctionId);
    if (error) { if (owns) auctionCache!.add(auctionId); emit(); throw error; } // 롤백
    return false;
  } else {
    if (owns) auctionCache!.add(auctionId); // 낙관적
    emit();
    const { error } = await supabase.from('esg_wishlists').upsert(
      { user_id: userId, user_email: userEmail, target_type: 'auction', target_id: auctionId },
      { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true },
    );
    if (error) { if (owns) auctionCache!.delete(auctionId); emit(); throw error; } // 롤백
    return true;
  }
}
