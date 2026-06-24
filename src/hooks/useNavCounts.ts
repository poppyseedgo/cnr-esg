// ============================================================================
// useNavCounts — 사이드바 공용 카운트(장바구니 수량 · 알림 미읽음 · 찜 개수)
//
// [변경 이력]
//   2026-06-24  신규. 1차(EsgSideNav)·2차(SecondarySidebar) 사이드바가 동일한
//               소스로 카운트를 표시하도록 로직을 단일 훅으로 추출(드리프트 제거).
//   2026-06-24  찜 개수(wishlistCount) 추가 — 공용 찜 캐시 기반, 토글 시 즉시 반영.
//
// [설계]
//   · cart: getCartCount + Realtime(subscribeMyCart) + window 이벤트(onCartChanged)
//   · 알림: getUnreadCount + Realtime(subscribeMyNotifications) + onNotificationChanged
//   · 비로그인 시 0. 동일 데이터 소스이므로 어느 사이드바든 같은 숫자를 보장.
// ============================================================================

import { useEffect, useState } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { getCartCount, subscribeMyCart, onCartChanged } from '@/lib/cart';
import { getUnreadCount, subscribeMyNotifications, onNotificationChanged } from '@/lib/notifications';
import { loadMyWishlistProductIds, subscribeWishlist, getWishlistSnapshot } from '@/lib/wishlist'; // ← [2026-06-24] 찜 카운트

export function useNavCounts(): { cartCount: number; unread: number; wishlistCount: number } {
  const { currentUser } = useCurrentUser();
  const [cartCount, setCartCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0); // ← [2026-06-24] 찜 개수

  // 장바구니 수량 (로그인 시)
  useEffect(() => {
    if (!currentUser) { setCartCount(0); return; }
    const userId = currentUser.id;
    const refresh = () => { getCartCount(userId).then(setCartCount).catch((e) => console.error('[useNavCounts] cart count error:', e)); };
    refresh();
    const offRT = subscribeMyCart(userId, refresh);
    const offEv = onCartChanged(refresh);
    return () => { offRT(); offEv(); };
  }, [currentUser?.id]);

  // 알림 미읽음 (로그인 시)
  useEffect(() => {
    if (!currentUser) { setUnread(0); return; }
    const userId = currentUser.id;
    const refresh = () => { getUnreadCount().then(setUnread).catch((e) => console.error('[useNavCounts] unread error:', e)); };
    refresh();
    const offRT = subscribeMyNotifications(userId, refresh);
    const offEv = onNotificationChanged(refresh);
    return () => { offRT(); offEv(); };
  }, [currentUser?.id]);

  // 찜 개수 (로그인 시) — 공용 찜 캐시 적재 후 size. 토글 시 window 이벤트로 즉시 갱신.
  useEffect(() => {
    if (!currentUser) { setWishlistCount(0); return; }
    let alive = true;
    loadMyWishlistProductIds(currentUser.id)
      .then((set) => { if (alive) setWishlistCount(set.size); })
      .catch((e) => console.error('[useNavCounts] wishlist count error:', e));
    const off = subscribeWishlist(() => setWishlistCount(getWishlistSnapshot().size)); // 추가/해제 즉시 반영
    return () => { alive = false; off(); };
  }, [currentUser?.id]);

  return { cartCount, unread, wishlistCount };
}
