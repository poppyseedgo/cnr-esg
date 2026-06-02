// ============================================================================
// EventModal.tsx — 공용 행사안내 모달 (Big size 760px, Figma 989:262)
//
// 책임:
//   - EVENT_MODAL_CONTENT[modalKey] 에서 content 매핑
//   - ModalShell 위에 title/subtitle/hero/body/buttons 본문 구성
//   - size="big" 고정 (이 모달은 행사안내 전용)
//
// 셸 동작(오버레이/ESC/scroll lock/포커스/X 버튼)은 ModalShell이 담당.
// 사이즈별 헤더 패딩, 폰트 크기, 폭 등 디자인 토큰은 EventModal.css가 담당.
//
// 변경 이력:
//   2026-05-28  최초 작성 (인프라)
//   2026-06-01  Figma 989:262 Big size 1:1 적용
//   2026-06-01  ModalShell 도입 — 셸/본문 책임 분리 (단계 4)
// ============================================================================

import { EVENT_MODAL_CONTENT, type EventModalKey } from './eventModalContent';
import { ModalShell, type ModalShellButton } from '@/components/modal/ModalShell';
import './EventModal.css';

// 기존 EventModalButton 타입을 ModalShellButton과 동일시 (re-export로 호환 유지)
// eventModalContent.tsx가 이 타입을 import 중이라 깨지지 않게 alias.
export type EventModalButton = ModalShellButton;

interface Props {
  modalKey: EventModalKey;
  onClose: () => void;
}

export function EventModal({ modalKey, onClose }: Props) {
  const content = EVENT_MODAL_CONTENT[modalKey];

  // 기본 버튼: "닫기" 하나 (content에 buttons 미정의 시)
  const buttons: ModalShellButton[] = content.buttons ?? [
    { label: '닫기', variant: 'close', onClick: onClose },
  ];

  return (
    <ModalShell
      size="big"
      onClose={onClose}
      ariaLabel={content.title}
      contentsClassName={content.contentsClassName}
      header={
        <div className="esg-modal__title-group">
          <h2 className="esg-modal__title esg-modal__title--big">{content.title}</h2>
          {content.subtitle != null && (
            <div className="esg-modal__subtitle esg-modal__subtitle--big">
              {typeof content.subtitle === 'string'
                ? <p>{content.subtitle}</p>
                : content.subtitle}
            </div>
          )}
        </div>
      }
      footer={buttons}
    >
      {/* 대표 이미지 (있을 때만) */}
      {content.hero !== undefined && (
        <div className="esg-modal__hero">
          {content.hero
            ? <img src={content.hero} alt="" />
            : <span className="esg-modal__hero-placeholder">이미지 영역</span>
          }
        </div>
      )}
      {/* 본문 */}
      <div className="esg-modal__body">{content.body}</div>
    </ModalShell>
  );
}
