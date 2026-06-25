// ============================================================================
// useMyPendingOrders.ts — 내 결제대기(바자회) 주문 구독 훅
//
// [변경 이력]
//   2026-06-25  최초 작성.
//
// [설계]
//   - pendingOrders 공유 스토어를 useSyncExternalStore 로 구독(상단 알림바·네비 dot 공유).
//   - 마운트 시 startPendingOrdersSync(uid)(ref-count) → 소비처가 여러 개여도 Realtime 1회.
//   - 만료 임박/통과(카운트다운 0)는 소비처에서 useNowTick(시간)으로 판정 → 여기선 raw 만료시각만.
// ============================================================================

import { useEffect, useSyncExternalStore } from 'react';
import { useCurrentUser } from './useCurrentUser';
import {
  startPendingOrdersSync,
  getPendingExpiries,
  subscribePendingOrders,
} from '@/lib/pendingOrders';

/** pending 바자회 주문들의 expires_at(ISO) 배열. 없으면 빈 배열. */
export function useMyPendingOrders(): { expiries: string[] } {
  const { currentUser } = useCurrentUser();

  useEffect(() => {
    const stop = startPendingOrdersSync(currentUser?.id ?? null);
    return stop;
  }, [currentUser?.id]);

  const expiries = useSyncExternalStore(
    subscribePendingOrders,
    getPendingExpiries,
    () => [],
  );

  return { expiries };
}
