// ============================================================================
// ModalShell.tsx — 모든 모달의 공통 셸 (오버레이 / 헤더 골격 / 푸터 골격 / 동작)
//
// 책임:
//   - 오버레이: dim + blur, 중앙 정렬, ESC/배경 클릭 닫기
//   - 모달 박스: size별 폭 (Big 760 / Medium 520)
//   - 헤더 골격: 좌측 children(title/subtitle 자유 구성) + 우측 X 버튼
//   - 푸터 골격: padding 8, gap 8, 버튼 1~3개 균등 (variant: close/confirm/primary)
//   - 본문: children(스크롤 영역 + 하단 그라데이션 페이드)
//   - body scroll lock (스크롤바 폭 보정)
//   - 포커스: 열 때 모달로, 닫을 때 직전 포커스 요소로 복귀
//
// Big vs Medium 차이 (Figma):
//   Big   (760): 행사안내 모달, 헤더 padding 16+pl20+pr16, 제목 40px Medium + 부제 20px
//   Medium(520): 문의/답변 모달, 헤더 padding 20/16, 제목 24px Medium, 부제 없음
//
// 사용:
//   <ModalShell size="big" onClose={...} header={<...>} footer={[btn1, btn2]}>
//     <div>본문</div>
//   </ModalShell>
// ============================================================================

import { useEffect, useRef, type ReactNode } from 'react';

export type ModalSize = 'big' | 'medium';

export interface ModalShellButton {
  label: string;
  variant: 'close' | 'confirm' | 'primary';
  onClick: () => void;
  /** 비활성화 (예: 입력값 부족) */
  disabled?: boolean;
}

interface Props {
  size: ModalSize;
  onClose: () => void;
  /** 헤더 좌측 컨텐츠 (제목 + 선택적 부제). X 버튼은 셸이 자동 렌더. */
  header: ReactNode;
  /** 본문 (스크롤 영역). 패딩/그라데이션 페이드는 셸이 자동 처리. */
  children: ReactNode;
  /** 푸터 버튼 1~3개. 생략 시 footer 자체 미표시. */
  footer?: ModalShellButton[];
  /** aria-label 또는 aria-labelledby로 쓸 모달 제목 식별자 */
  ariaLabel?: string;
}

export function ModalShell({ size, onClose, header, children, footer, ariaLabel }: Props) {
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
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className={`esg-modal esg-modal--${size}`}
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — 좌측 children + 우측 X 버튼 (셸이 X 자동 추가) */}
        <header className={`esg-modal__header esg-modal__header--${size}`}>
          <div className="esg-modal__header-inner">{header}</div>
          <button className="esg-modal__close" onClick={onClose} aria-label="닫기" type="button">
            <img src="/icons/close.svg" alt="" />
          </button>
        </header>

        {/* Contents (스크롤 영역) */}
        <div className={`esg-modal__contents esg-modal__contents--${size}`}>{children}</div>

        {/* 스크롤 페이드 (footer 위) — footer 있을 때만 의미 있음 */}
        {footer && footer.length > 0 && (
          <div className={`esg-modal__fade esg-modal__fade--${size}`} aria-hidden="true" />
        )}

        {/* Footer (선택) */}
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
