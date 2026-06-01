// ============================================================================
// ActivityGate.tsx — 활동 페이지 진입 가드 (URL 직접 접근/북마크 대응)
//
// 동작:
//   - 어드민(role='ADMIN' && is_active=true): 항상 통과
//   - 비어드민 + 시작 전(before): 홈으로 이동 + ?modal=<key> 세팅 → 가이드 모달 표시
//   - 비어드민 + 진행 중/종료: 통과
//
// 사용:
//   <ActivityGate activityKey="bazaar">
//     <BazaarPage />
//   </ActivityGate>
//
// ※ 헤더 클릭 가로채기와 별개로 작동 (URL 직접 입력 / 북마크 / 새로고침 대응).
// ※ useEventGate 훅과 단일 출처 정책을 공유.
//
// 변경 이력:
//   2026-06-01  최초 작성
// ============================================================================

import { useEffect } from 'react';
import { useEventGate } from '@/hooks/useEventGate';
import { useEventPhase } from '@/hooks/useEventPhase';
import type { EsgActivityKey } from '@/types/esg';

interface Props {
  activityKey: EsgActivityKey;
  children: React.ReactNode;
}

export function ActivityGate({ activityKey, children }: Props) {
  const { blocked, redirectToGuide } = useEventGate(activityKey);
  const { loading } = useEventPhase();

  // 비어드민 + 시작 전이면 홈으로 이동하면서 모달 띄움.
  // useEffect로 처리해야 함 — 렌더 중 navigate는 React가 막음.
  useEffect(() => {
    if (loading) return;          // 활동 기간 로드 전엔 판단 보류
    if (blocked) redirectToGuide();
  }, [loading, blocked, redirectToGuide]);

  // 로드 중이거나 차단된 경우 children을 그리지 않음 (깜빡임 방지)
  if (loading || blocked) return null;
  return <>{children}</>;
}
