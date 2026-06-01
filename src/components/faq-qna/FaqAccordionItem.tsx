// ============================================================================
// FaqAccordionItem — FAQ 단일 아코디언 행
//
// 데스크탑 (Figma 933:102 / 1003:306):
//   - 행 80px, py-24 pr-24
//   - 클로버(36) + 질문(24px Medium) | arrow-down(32)
//
// 모바일 (Figma 1034:881, ≤768px):
//   - 행 py-16
//   - 클로버 제거
//   - 화살표는 keyboard_arrow_down.svg
//   - 펼침 pt-16 pb-24, 답변박스 py-24
//
// 변경 이력:
//   2026-06-01  최초 작성
//   2026-06-01  CSS 마이그레이션 + 모바일 (Figma 1034:881) — 클로버 제거, 화살표 교체
// ============================================================================

import type { EsgFaqRow } from '@/types/esg';
import './faq-qna.css';

interface Props {
  faq: EsgFaqRow;
  isExpanded: boolean;
  onToggle: () => void;
}

export function FaqAccordionItem({ faq, isExpanded, onToggle }: Props) {
  const panelId = `faq-panel-${faq.id}`;
  const headerId = `faq-header-${faq.id}`;

  return (
    <div className="faqqna-faq">
      <button
        id={headerId}
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className="faqqna-faq__header"
      >
        <div className="faqqna-faq__header-left">
          <img
            src="/icons/clover-faq.svg"
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            className="faqqna-faq__clover"
          />
          <span className="faqqna-faq__question">{faq.question}</span>
        </div>
        <img
          src="/icons/keyboard_arrow_down.svg"
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          className={`faqqna-faq__arrow ${isExpanded ? 'faqqna-faq__arrow--expanded' : ''}`}
        />
      </button>

      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="faqqna-faq__panel"
        >
          <div className="faqqna-faq__answer-box">
            {faq.answer}
          </div>
        </div>
      )}
    </div>
  );
}
