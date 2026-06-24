// ============================================================================
// useWishlist.ts — 상품별 찜 상태 + 토글 훅
//
// [변경 이력]
//   2026-06-24  최초 작성(Task 2 카드 리디자인의 찜 버튼 구동).
//
// [설계]
//   - 세션 캐시(lib/wishlist.ts)를 useSyncExternalStore로 구독 → 카드 N개가
//     동일 스냅샷 공유, 한 카드에서 토글하면 같은 상품의 다른 위치(상세/사이드바)도 동기화.
//   - 캐시 로드는 유저 단위 1회(idempotent) → 카드가 여러 개여도 fetch 1회.
//   - 비로그인 상태에서 토글 시 Microsoft 로그인 유도(상세 페이지와 동일 UX).
// ============================================================================

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { signInWithMicrosoft } from '@/lib/auth';
import {
  loadMyWishlistProductIds,
  subscribeWishlist,
  isWishlistedSync,
  toggleWishlist,
  resetWishlistCache,
} from '@/lib/wishlist';

interface UseWishlistResult {
  wishlisted: boolean;          // 현재 상품 찜 여부
  toggle: () => Promise<void>;  // 토글(비로그인=로그인 유도)
  loggedIn: boolean;            // 로그인 여부(가드 표시용)
}

export function useWishlist(productId: string): UseWishlistResult {
  const { currentUser } = useCurrentUser();
  const userId = currentUser?.id ?? null;

  // 유저 단위 1회 로드(로그인/로그아웃 시 자동 재조회·무효화)
  useEffect(() => {
    if (userId) loadMyWishlistProductIds(userId).catch(console.error);
    else resetWishlistCache();
  }, [userId]);

  const wishlisted = useSyncExternalStore(
    subscribeWishlist,
    () => isWishlistedSync(productId), // 클라 스냅샷(boolean=값 비교 → 동일 Set 참조여도 변화 감지)
    () => false,                        // 서버 스냅샷(SSR 무관, 항상 false)
  );

  const toggle = useCallback(async () => {
    if (!currentUser) { signInWithMicrosoft().catch(console.error); return; }
    try {
      await toggleWishlist(currentUser.id, currentUser.email, productId);
    } catch (e) {
      console.error('[useWishlist] toggle error:', e);
    }
  }, [currentUser?.id, currentUser?.email, productId]);

  return { wishlisted, toggle, loggedIn: !!currentUser };
}
