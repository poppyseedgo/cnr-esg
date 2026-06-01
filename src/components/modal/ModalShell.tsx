// ============================================================================
// ModalShell.tsx — 모든 모달의 공통 셸
//
// 책임:
//   - 오버레이: dim + blur, 중앙 정렬(데스크탑) / 하단 정렬(모바일 bottom sheet),
//     ESC/배경 클릭 닫기
//   - 모달 박스: size별 폭 (Big 760 / Medium 520) — 모바일에서는 100% 폭 bottom sheet
//   - 헤더 골격: 좌측 children(title/subtitle) + 우측 X 버튼
//   - 푸터 골격: padding 8, gap 8, 버튼 1~3개 균등 (variant: close/confirm/primary)
//   - 본문: children(스크롤 영역 + 하단 그라데이션 페이드)
//   - body scroll lock (스크롤바 폭 보정)
//   - 포커스: 열 때 모달로, 닫을 때 직전 포커스 요소로 복귀
//
// 모바일 bottom sheet (≤768px):
//   - 하단에서 슬라이드 업 (cubic-bezier 0.32, 0.72, 0, 1 — iOS 표준)
//   - 상단 모서리 radius 24, max-height 90vh
//   - drag handle (상단 중앙, 회색 가로선)
//   - drag handle 드래그 다운: 100px+ 또는 fast velocity → 닫기 (슬라이드 다운 애니메이션 후 onClose)
//                              미만 → 원위치 (스냅백)
//   - X 버튼/dim 클릭/ESC도 동일하게 닫기 (드래그 외 즉시 onClose)
//   - 푸터 safe-area-inset-bottom 처리
//
// 변경 이력:
//   2026-06-01  ModalShell 도입 (셸/본문 책임 분리)
//   2026-06-01  모바일 bottom sheet 변환 — drag handle + touch 제스처
// ============================================================================

import { useEffect, useRef, type ReactNode } from 'react';

export type ModalSize = 'big' | 'medium';

export interface ModalShellButton {
  label: string;
  variant: 'close' | 'confirm' | 'primary';
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  size: ModalSize;
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
  footer?: ModalShellButton[];
  ariaLabel?: string;
}

// 모바일 bottom sheet 닫기 임계값
const CLOSE_THRESHOLD_PX = 100;     // 100px 이상 끌면 닫기
const CLOSE_ANIMATION_MS = 280;     // 슬라이드 다운 후 onClose

export function ModalShell({ size, onClose, header, children, footer, ariaLabel }: Props) {
  // 모달 박스 = drag sheet 같은 노드라 ref 하나로 충분
  const sheetRef = useRef<HTMLDivElement>(null);

  // 드래그 상태 — ref로 관리 (setState 60Hz 리렌더 피함)
  const dragRef = useRef({
    dragging: false,
    startY: 0,
    currentDelta: 0,
  });

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // body scroll lock
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

  // 포커스 관리
  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  // ── drag handle 터치 핸들러 (모바일만) ──
  // 본문이 아닌 handle 영역에만 바인딩 → 본문 스크롤과 충돌 없음
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragRef.current.dragging = true;
    dragRef.current.startY = touch.clientY;
    dragRef.current.currentDelta = 0;
    // 드래그 시작 시 transition 제거 (즉각 반응)
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const touch = e.touches[0];
    const delta = touch.clientY - dragRef.current.startY;
    // 아래 방향만 허용 (위 방향은 시트 고정)
    if (delta > 0) {
      dragRef.current.currentDelta = delta;
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.dragging = false;
    const delta = dragRef.current.currentDelta;

    // transition 복원
    sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';

    if (delta > CLOSE_THRESHOLD_PX) {
      // 닫기: 슬라이드 다운 후 onClose
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(onClose, CLOSE_ANIMATION_MS);
    } else {
      // 원위치 (스냅백)
      sheetRef.current.style.transform = '';
    }
  };

  return (
    <div
      className="esg-modal__overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        ref={sheetRef}
        className={`esg-modal esg-modal--${size}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — 모바일에서만 보임 (CSS) */}
        <div
          className="esg-modal__handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          aria-hidden="true"
        >
          <div className="esg-modal__handle-bar" />
        </div>

        {/* Header */}
        <header className={`esg-modal__header esg-modal__header--${size}`}>
          <div className="esg-modal__header-inner">{header}</div>
          <button className="esg-modal__close" onClick={onClose} aria-label="닫기" type="button">
            <img src="/icons/close.svg" alt="" />
          </button>
        </header>

        {/* Contents */}
        <div className={`esg-modal__contents esg-modal__contents--${size}`}>{children}</div>

        {/* Scroll fade (데스크탑) */}
        {footer && footer.length > 0 && (
          <div className={`esg-modal__fade esg-modal__fade--${size}`} aria-hidden="true" />
        )}

        {/* Footer */}
        {footer && footer.length > 0 && (
          <footer className="esg-modal__footer">
            {footer.map((btn, i) => (
              <button
                key={i}
                className={`esg-modal__btn esg-modal__btn--${btn.variant}`}
                onClick={btn.onClick}
                disabled={btn.disabled}
                type="button"
              >
                {btn.label}
              </button>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}
