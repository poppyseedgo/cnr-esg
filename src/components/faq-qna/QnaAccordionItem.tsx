// ============================================================================
// QnaAccordionItem — Q&A 단일 아코디언 행 (홈 + /qna 페이지 공용)
//
// 토큰 (Figma 933:102 / 1003:379):
//   행 헤더:
//     - height 80px, padding-right 24, padding-y 24
//     - 좌측: 클로버 Q&A 아이콘 36×36 + gap 16 + 카테고리 칩 + 질문 24px Medium + 상태 배지
//     - 우측: 답변완료 → arrow-down 32×32 / 답변대기+어드민 → "답변 하기" 버튼
//   펼침 영역 (답변 완료 시만):
//     - padding 24 / 64 / 24 / 24, radius 24
//     - reply 아이콘 32×32 + gap 16 + 답변 20px Regular line 1.5
//   행 구분선: border-bottom 1px solid #bababa (Q&A 전용, FAQ보다 진함)
//
// 상태별 분기:
//   - answered: 펼침 가능 (답변 표시) → 우측 arrow-down (회전)
//   - pending + 어드민: 우측 "답변 하기" 버튼 (펼침 불가)
//   - pending + 일반: 우측 영역 비움 (답변이 없으니 펼침 의미 없음)
//
// 익명 처리: 작성자 정보는 표시 안 함 (UI 레이어 책임, props에 author 없음)
// ============================================================================

import type { EsgQnaQuestionWithAnswer } from '@/types/esg';
import { QnaCategoryChip } from './QnaCategoryChip';
import { QnaStatusBadge } from './QnaStatusBadge';

interface Props {
  qna: EsgQnaQuestionWithAnswer;
  isExpanded: boolean;
  onToggle: () => void;
  /** 어드민 여부 — 답변대기 행에서 "답변 하기" 버튼 표시 */
  isAdmin: boolean;
  /** "답변 하기" 클릭 핸들러 (어드민 모달 오픈) */
  onAnswerClick?: () => void;
}

export function QnaAccordionItem({
  qna,
  isExpanded,
  onToggle,
  isAdmin,
  onAnswerClick,
}: Props) {
  const isPending = qna.status === 'pending';
  const isAnswered = qna.status === 'answered';
  const hasAnswer = isAnswered && qna.answer != null;

  // 클릭 가능 여부: 답변 완료 시만 펼침 가능
  const canExpand = hasAnswer;

  const panelId = `qna-panel-${qna.id}`;
  const headerId = `qna-header-${qna.id}`;

  // 우측 영역 결정
  const rightArea = (() => {
    if (canExpand) {
      return (
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
      );
    }
    if (isPending && isAdmin) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();          // 헤더 onClick(펼침 토글) 방지
            onAnswerClick?.();
          }}
          style={{
            flexShrink: 0,
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            padding: '8px 16px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 14,
            lineHeight: 1.5,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.15s',
          }}
        >
          답변 하기
        </button>
      );
    }
    // pending + 일반 사용자: 빈 자리 (정렬 유지를 위해 32×32 spacer)
    return <div style={{ width: 32, height: 32, flexShrink: 0 }} aria-hidden="true" />;
  })();

  return (
    <div style={{ borderBottom: '1px solid #bababa' }}>
      {/* 헤더 */}
      <button
        id={headerId}
        type="button"
        onClick={canExpand ? onToggle : undefined}
        aria-expanded={canExpand ? isExpanded : undefined}
        aria-controls={canExpand ? panelId : undefined}
        disabled={!canExpand}
        style={{
          width: '100%',
          minHeight: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 24px 24px 0',
          background: 'transparent',
          border: 'none',
          cursor: canExpand ? 'pointer' : 'default',
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
            flexWrap: 'wrap',           // 좁은 화면에서 자연스럽게 줄바꿈
          }}
        >
          <img
            src="/icons/clover-qna.svg"
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            style={{ flexShrink: 0, display: 'block' }}
          />
          <QnaCategoryChip category={qna.category} />
          <span
            style={{
              fontWeight: 500,
              fontSize: 24,
              lineHeight: 1.2,
              color: '#111',
              wordBreak: 'break-word',
              flex: '1 1 auto',
              minWidth: 0,
            }}
          >
            {qna.content}
          </span>
          <QnaStatusBadge status={qna.status} />
        </div>
        {rightArea}
      </button>

      {/* 답변 패널 (답변 완료 시만) */}
      {hasAnswer && isExpanded && qna.answer && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            padding: '24px 24px 64px 24px',
            borderRadius: 24,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <img
            src="/icons/reply.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            style={{ flexShrink: 0, display: 'block' }}
          />
          <div
            style={{
              fontWeight: 400,
              fontSize: 20,
              lineHeight: 1.5,
              color: '#111',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              flex: '1 1 auto',
              minWidth: 0,
            }}
          >
            {qna.answer.content}
          </div>
        </div>
      )}
    </div>
  );
}
