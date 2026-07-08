// ============================================================================
// useMyActiveBids.ts — 내가 입찰한 '진행 중' 경매가 있는지 구독 훅
//
// [변경 이력]
//   2026-07-08  최초 작성. 경매 사이드바 '나의 입찰 내역' 빨간 dot(깜빡임) 판정용.
//
// [용도]
//   내가 입찰하거나(참여) / 밀려났을 때 → 진행 중(active) 경매에 내 입찰이 남아
//   있으면 true. AuctionSidebar 의 '나의 입찰 내역' 우측에 결제대기 dot 과 동일한
//   스타일의 빨간 점(cnrPendingBlink)을 띄우는 데 사용.
//
// [설계]
//   - 판정 SSOT: loadMyBidAuctions(uid)(내 입찰 경매 목록) 중 status==='active'
//     가 하나라도 있으면 hasActiveBids=true. (별도 집계 컬럼/중복 로직 없음)
//   - 실시간 갱신 이중 신호(프로젝트 표준 패턴):
//       · onAuctionChanged   : 같은 탭 즉시(placeBid 성공 직후 등)
//       · subscribeAuctions  : 타 사용자 입찰(밀려남) / 경매 종료(active→ended)
//         반영 → 종료 시 dot 자동 소멸.
//   - 잦은 경매 UPDATE(라이브 입찰 폭주)에도 재조회를 줄이기 위해 400ms 디바운스.
//   - enabled=false(모바일/보조내비 미노출)면 조회·구독을 아예 하지 않음(부하 0).
//   - 비로그인/오류 시 false(안전).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { loadMyBidAuctions, onAuctionChanged, subscribeAuctions } from '@/lib/auctions';

/** 내가 입찰한 '진행 중' 경매가 하나라도 있으면 true. */
export function useMyActiveBids(enabled: boolean = true): { hasActiveBids: boolean } {
  const { currentUser } = useCurrentUser();
  const [hasActiveBids, setHasActiveBids] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const uid = currentUser?.id ?? null;
    // 미노출(모바일 등)이거나 비로그인이면 조회/구독 없이 즉시 false 고정.
    if (!enabled || !uid) {
      setHasActiveBids(false);
      return;
    }

    let alive = true;

    const refresh = () => {
      loadMyBidAuctions(uid)
        .then((list) => {
          if (alive) setHasActiveBids(list.some((x) => x.auction.status === 'active'));
        })
        .catch((e) => console.warn('[useMyActiveBids]', e));
    };

    // 외부 신호는 버스트를 합쳐 400ms 뒤 1회만 재조회.
    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(refresh, 400);
    };

    refresh(); // 최초 1회는 즉시(마운트 시 dot 지연 없이 반영)
    const offEvent = onAuctionChanged(scheduleRefresh);     // 같은 탭 즉시 신호
    const offRealtime = subscribeAuctions(scheduleRefresh); // 타 사용자 입찰/종료 실시간

    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      offEvent();
      offRealtime();
    };
  }, [currentUser?.id, enabled]);

  return { hasActiveBids };
}
