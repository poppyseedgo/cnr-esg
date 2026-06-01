// ============================================================================
// QnaAccordionItem — Q&A 단일 아코디언 행 (홈 + /qna 페이지 공용)
//
// 디자인 출처: Figma 1024:595 (정밀 매핑)
//
// 행 헤더 (높이 80px):
//   - padding: 24px 0 (좌우 0, Figma 1024:572)
//   - 좌측 그룹 (gap 16): 클로버(36×36) + 카테고리 칩 + 질문 텍스트 24px Medium
//   - 우측 그룹 (gap 16):
//       · 상태 배지 (대기 #e3e9f5 / 완료 #d4f6ff)
//       · 답변하기 버튼 (어드민 + pending) 16px Medium 흰색
//       (화살표 없음 — Figma 1024:595에 부재)
//   - 행 구분선: border-b 1px solid #bababa
//
// 펼침 영역 (답변 완료 시만):
//   - padding 24/24/64/24, gap 16
//   - reply.svg (32×32) + 답변 본문 20px Regular line 1.5
//
// 상태별 분기:
//   - answered + answer 있음:
//       클릭 가능, 펼침 가능. 우측 [상태배지만]
//   - pending + 어드민:
//       우측 [상태배지 + 답변하기 버튼]. 펼침 불가
//   - pending + 일반:
//       우측 [상태배지만]. 펼침 불가
//
// 익명 처리: 작성자 정보는 표시 안 함 (UI 레이어 책임).
//
// 변경 이력:
//   2026-06-01  최초 작성 (Figma 933:102 기준)
//   2026-06-01  Figma 1024:595 정밀 매핑 — 화살표 제거, 상태배지 우측 그룹 이동,
//               답변하기 16px, reply.svg 교체, 행 좌우 padding 0
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
          padding: '24px 0',          // ← Figma 1024:572 좌우 0
          background: 'transparent',
          border: 'none',
          cursor: canExpand ? 'pointer' : 'default',
          fontFamily: 'var(--font-sans)',
          textAlign: 'left',
        }}
      >
        {/* 좌측: 클로버 + 칩 + 질문 (상태배지 X) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flex: '1 1 auto',
            minWidth: 0,
            flexWrap: 'wrap',
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
        </div>

        {/* 우측 그룹: 상태배지 + (답변하기 OR nothing) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexShrink: 0,
          }}
        >
          <QnaStatusBadge status={qna.status} />
          {isPending && isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAnswerClick?.();
              }}
              style={{
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 999,
                padding: '8px 16px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 16,             // ← Figma 1024:582 정확값 (이전 14 → 16)
                lineHeight: 1.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'opacity 0.15s',
              }}
            >
              답변 하기
            </button>
          )}
        </div>
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
            src="/icons/reply.svg"        // ← png → svg 교체
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
