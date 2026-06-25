// ============================================================================
// useProductReservation.ts — 상품별 활성 예약(입금 대기) 구독 훅
//
// [변경 이력]
//   2026-06-25  최초 작성.
//
// [설계]
//   - reservations.ts 세션 스토어를 useSyncExternalStore 로 구독 → 카드 N개가
//     동일 스냅샷 공유(찜 훅과 동일 철학).
//   - 마운트 시 loadReservationStatus() 1회(idempotent: inflight 공유 → fetch 1회).
//     어떤 페이지에서 카드를 써도 예약 상태가 채워지도록 훅이 로드를 보장.
//   - 카운트다운 0 통과(만료→판매중)는 useNowTick(시간)이 담당 → 여기선 시간 미관여.
// ============================================================================

import { useEffect, useSyncExternalStore } from 'react';
import {
  getReservation,
  subscribeReservations,
  loadReservationStatus,
  type ReservationInfo,
} from '@/lib/reservations';

export function useProductReservation(productId: string): ReservationInfo | null {
  // 마운트 시 1회 로드(스토어 공유 → 카드 여러 개여도 fetch 1회)
  useEffect(() => {
    loadReservationStatus().catch(console.error);
  }, []);

  return useSyncExternalStore(
    subscribeReservations,
    () => getReservation(productId), // 동일 참조 유지(리로드 전까지) → 안정 스냅샷
    () => null,                       // SSR 스냅샷
  );
}
