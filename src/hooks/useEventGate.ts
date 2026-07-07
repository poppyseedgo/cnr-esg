// ============================================================================
// useEventGate.ts — 활동 페이지/메뉴 접근 가드 (어드민 우회 + 시작 전 모달 안내)
//
// 정책:
//   - 어드민(role='ADMIN' && is_active=true): 항상 통과 — blocked=false
//   - 비어드민 + 시작 전(before)         : 차단 — blocked=true, 모달 키 반환
//   - 비어드민 + 진행 중(active)         : 통과 — blocked=false
//   - 비어드민 + 종료(closed)            : 통과 — blocked=false (결과 조회 가능)
//
// 사용:
//   const { blocked, modalKey, openGuide } = useEventGate('bazaar');
//   - 헤더 NavMenuItem: blocked면 e.preventDefault() + openGuide() (페이지 이동 안 함)
//   - 페이지 진입 가드 <ActivityGate>: blocked면 홈 + ?modal= 으로 리다이렉트
//
// 단일 출처:
//   헤더와 페이지 가드가 같은 훅을 사용 → 정책 변경 시 여기 한 곳만 수정.
//
// 변경 이력:
//   2026-06-01  최초 작성
// ============================================================================

import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { EsgActivityKey } from '@/types/esg';
import type { EventModalKey } from '@/components/home/eventModalContent';

/** EsgActivityKey ↔ EventModalKey 매핑 (auction은 bazaar 통합 모달 사용) */
const ACTIVITY_TO_MODAL: Record<EsgActivityKey, EventModalKey> = {
  zero_waste: 'zero',
  wise_life: 'wise',
  bazaar: 'bazaar',
  auction: 'bazaar', // 경매도 바자회 통합 모달
};

export interface UseEventGateResult {
  /** 비어드민이 시작 전 활동에 접근하려는 상태 (true = 차단) */
  blocked: boolean;
  /** 차단 시 띄울 모달 키 (활동에 대응) */
  modalKey: EventModalKey;
  /** 홈으로 이동하면서 가이드 모달을 띄움 — 페이지 진입 가드용 */
  redirectToGuide: () => void;
  /** 현재 페이지에서 가이드 모달만 열기 — 헤더 메뉴 클릭 가로채기용 */
  openGuide: () => void;
}

export function useEventGate(activityKey: EsgActivityKey): UseEventGateResult {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const modalKey = ACTIVITY_TO_MODAL[activityKey];

  // ← [2026-07-08] 안내 모달 전면 제거: 모든 이벤트가 오픈/종료된 상태이므로 게이트 비활성.
  //    blocked=false → 네비 클릭이 openGuide()를 호출하지 않고 그대로 이동, ActivityGate도 통과.
  const blocked = false;

  /** 홈으로 이동 + ?modal= 세팅 (URL 직접 접근/북마크 차단용) */
  const redirectToGuide = useCallback(() => {
    navigate(`/?modal=${modalKey}`, { replace: true });
  }, [navigate, modalKey]);

  /** 현재 페이지에서 모달만 열기 (헤더 클릭 가로채기용) */
  const openGuide = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('modal', modalKey);
        return next;
      },
      { replace: false },
    );
  }, [setSearchParams, modalKey]);

  return { blocked, modalKey, redirectToGuide, openGuide };
}
