// ============================================================================
// FaqAccordionItem — FAQ 단일 아코디언 행 (홈 + /faq 페이지 공용)
//
// 토큰 (Figma 933:102 / 1003:306):
//   행 헤더:
//     - height 80px, padding-right 24, padding-y 24
//     - 좌측: 클로버 아이콘 36×36 + gap 16 + 질문 텍스트 24px Medium line 1.2
//     - 우측: arrow-down 32×32 (펼침 시 회전)
//   펼침 영역:
//     - padding-top 24, padding-bottom 44
//     - 내부 박스: padding 24, radius 24, 20px Regular line 1.4 color #111
//   행 구분선: border-bottom 1px solid #e3e9f5 (FAQ 전용 색)
//
// Props:
//   - faq: EsgFaqRow (질문, 답변)
//   - isExpanded: 현재 펼침 상태 (부모가 관리 — 한 번에 하나만)
//   - onToggle: 헤더 클릭 시 호출
// ============================================================================

import type { EsgFaqRow } from '@/types/esg';

interface Props {
  faq: EsgFaqRow;
  isExpanded: boolean;
  onToggle: () => void;
}

export function FaqAccordionItem({ faq, isExpanded, onToggle }: Props) {
  // 접근성: 펼침 패널 ID
  const panelId = `faq-panel-${faq.id}`;
  const headerId = `faq-header-${faq.id}`;

  return (
    <div style={{ borderBottom: '1px solid #e3e9f5' }}>
      {/* 헤더 (클릭 영역) */}
      <button
        id={headerId}
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        style={{
          width: '100%',
          minHeight: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 24px 24px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          <img
            src="/icons/clover-faq.svg"
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            style={{ flexShrink: 0, display: 'block' }}
          />
          <span
            style={{
              fontWeight: 500,
              fontSize: 24,
              lineHeight: 1.2,
              color: '#111',
              wordBreak: 'break-word',
            }}
          >
            {faq.question}
          </span>
        </div>
        {/* arrow-down: 펼침 시 180도 회전 */}
        <img
          src="/icons/arrow-down.svg"
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          style={{
            flexShrink: 0,
            display: 'block',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: '#1C1B1F',
          }}
        />
      </button>

      {/* 펼침 패널 */}
      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          style={{
            paddingTop: 24,
            paddingBottom: 44,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div
            style={{
              padding: 24,
              borderRadius: 24,
              fontWeight: 400,
              fontSize: 20,
              lineHeight: 1.4,
              color: '#111',
              whiteSpace: 'pre-wrap',  // 줄바꿈 보존 (DB에 \n 저장된 경우)
              wordBreak: 'break-word',
            }}
          >
            {faq.answer}
          </div>
        </div>
      )}
    </div>
  );
}
