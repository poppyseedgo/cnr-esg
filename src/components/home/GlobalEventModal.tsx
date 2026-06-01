// ============================================================================
// GlobalEventModal.tsx — 글로벌 모달 컨테이너
//
// 역할: ?modal=brand|bazaar|wise|zero 를 감지해 EventModal을 렌더한다.
//       AppLayout에 한 번만 마운트되면 어떤 페이지에서도 모달이 뜸.
//
// 이전: HomeHero에서만 모달을 렌더했음 → 홈 외 페이지에선 모달 안 뜸
// 이후: AppLayout에서 항상 마운트 → 어디서든 ?modal=xxx 만 있으면 자동 표시
//
// 변경 이력:
//   2026-06-01  최초 작성 (HomeHero에서 모달 로직 이전)
// ============================================================================

import { useSearchParams } from 'react-router-dom';
import { EventModal } from './EventModal';
import { isEventModalKey } from './eventModalContent';

export function GlobalEventModal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawModal = searchParams.get('modal');
  const activeModal = isEventModalKey(rawModal) ? rawModal : null;

  // 닫기: ?modal= 파라미터 제거
  const closeModal = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('modal');
        return next;
      },
      { replace: false },
    );
  };

  if (!activeModal) return null;
  return <EventModal modalKey={activeModal} onClose={closeModal} />;
}
