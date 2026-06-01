// ============================================================================
// EventModal.tsx — 공용 행사안내 모달 (Big size, Figma 989:262)
//
// 구조 (Figma 1:1):
//   - Header: 제목(40px Medium) + 부제(20px Regular) + X 버튼(우상단 32×32, 20×20 SVG)
//   - Contents: 대표이미지(720×360, optional) + 본문 텍스트, 패딩 20 균일, 내부 스크롤
//   - Footer: 버튼 1~3개 균등(flex-1), 패딩 8, gap 8, height 56
//     · 닫기(회색 #f1f5f9) / 확인(검정 #111) / 편집(딥그린 #00422b)
//   - Footer 위 62px 흰색 그라데이션 (스크롤 시 하단 흐릿)
//
// 기능:
//   - 닫기: X / 하단 닫기 버튼 / ESC / 배경 클릭
//   - body scroll lock (스크롤바 폭 보정)
//   - 포커스 복귀 (닫을 때 직전 포커스 요소로)
//
// 변경 이력:
//   2026-05-28  최초 작성 (인프라)
//   2026-06-01  Figma 989:262 Big size 1:1 적용, 가변 버튼 props
// ============================================================================

import { useEffect, useRef, type ReactNode } from 'react';
import { EVENT_MODAL_CONTENT, type EventModalKey } from './eventModalContent';
import './EventModal.css';

export interface EventModalButton {
  label: string;
  variant: 'close' | 'confirm' | 'primary';
  onClick: () => void;
}

interface Props {
  modalKey: EventModalKey;
  onClose: () => void;
}

export function EventModal({ modalKey, onClose }: Props) {
  const content = EVENT_MODAL_CONTENT[modalKey];
  const modalRef = useRef<HTMLDivElement>(null);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // body scroll lock (스크롤바 폭 보정 → 레이아웃 안 튐)
  useEffect(() => {
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, []);

  // 포커스: 열 때 모달로, 닫을 때 직전 요소로 복귀
  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  // 기본 버튼: "닫기" 하나 (content에 buttons 정의 없으면 사용)
  const buttons: EventModalButton[] = content.buttons ?? [
    { label: '닫기', variant: 'close', onClick: onClose },
  ];

  return (
    <div
      className="esg-modal__overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="esg-modal-title"
    >
      <div
        className="esg-modal"
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="esg-modal__header">
          <div className="esg-modal__title-group">
            <h2 id="esg-modal-title" className="esg-modal__title">{content.title}</h2>
            <p className="esg-modal__subtitle">{content.subtitle}</p>
          </div>
          <button className="esg-modal__close" onClick={onClose} aria-label="닫기">
            <img src="/icons/close.svg" alt="" />
          </button>
        </header>

        {/* Contents (스크롤 영역) */}
        <div className="esg-modal__contents">
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
        </div>

        {/* 스크롤 페이드 (footer 위) */}
        <div className="esg-modal__fade" aria-hidden="true" />

        {/* Footer (버튼 1~3개 균등) */}
        <footer className="esg-modal__footer">
          {buttons.map((btn, i) => (
            <button
              key={i}
              className={`esg-modal__btn esg-modal__btn--${btn.variant}`}
              onClick={btn.onClick}
            >
              {btn.label}
            </button>
          ))}
        </footer>
      </div>
    </div>
  );
}

// 외부에서 ReactNode 본문 받을 수 있게 타입 export
export type { ReactNode };
