// ============================================================================
// EventModal.tsx — 공용 행사안내 모달 셸 (내용 3종 주입 재사용)
//
// 기능:
//   - dim + blur 오버레이, 중앙 정렬, auto full-height (CSS)
//   - 닫기: X 버튼 / 하단 닫기 버튼 / ESC / 배경(overlay) 클릭
//   - body scroll lock (배경 스크롤 방지, 스크롤바 폭 보정으로 레이아웃 안 튐)
//   - 포커스: 열 때 모달로, 닫을 때 직전 포커스 요소로 복귀 (접근성)
//
// 사용: HomeHero에서 ?modal=<key> 읽어 <EventModal modalKey onClose/>
//
// 변경 이력:
//   2026-05-28  최초 작성 (인프라)
// ============================================================================

import { useEffect, useRef } from 'react';
import { EVENT_MODAL_CONTENT, type EventModalKey } from './eventModalContent';
import './EventModal.css';

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

  // body scroll lock (스크롤바 폭 보정 → 배경 레이아웃 안 튐)
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

  return (
    <div
      className="esg-modal__overlay"
      onClick={onClose}                          /* 배경 클릭 닫기 */
      role="dialog"
      aria-modal="true"
      aria-label={content.title}
    >
      <div
        className="esg-modal"
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}     /* 모달 내부 클릭은 닫힘 방지 */
      >
        {/* X 버튼 */}
        <button className="esg-modal__close" onClick={onClose} aria-label="닫기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        {/* 본문 (스크롤 영역) */}
        <div className="esg-modal__body">
          <h2 className="esg-modal__title">{content.title}</h2>
          <p className="esg-modal__subtitle">{content.subtitle}</p>
          {content.body}
        </div>

        {/* 하단 fixed 닫기 버튼 */}
        <div className="esg-modal__footer">
          <button className="esg-modal__close-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
