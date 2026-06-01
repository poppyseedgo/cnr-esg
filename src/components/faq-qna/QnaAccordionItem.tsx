// ============================================================================
// QnaAccordionItem — Q&A 단일 아코디언 행
//
// 데스크탑 (Figma 1024:595):
//   행 80px, py-24 좌우0
//   좌측 [클로버(36) + 카테고리칩(14px) + 질문(24px Medium)]
//   우측 [상태배지 + 답변하기 버튼(어드민+pending)]
//
// 모바일 자체 설계 (≤768px, FAQ 패턴 베이스):
//   세로 3단:
//     ① 메타 row: [칩(12px)] [상태배지(12px)]
//     ② 본문 row: 질문(24px Medium) [keyboard_arrow_down(32)]
//     ③ 액션 row: [답변하기(14px)] (어드민+pending만)
//
// 마크업 결정 — 외부 button → div[role="button"]:
//   답변하기는 별도 <button> 요소. <button> 중첩 금지 위반 방지를 위해
//   외부 헤더는 div + role="button" + 키보드 핸들러로 처리.
//
// 변경 이력:
//   2026-06-01  Figma 1024:595 정밀 매핑 (데스크탑)
//   2026-06-01  CSS 마이그레이션 + 모바일 자체 설계 (세로 3단)
//   2026-06-01  button 중첩 제거 — 외부 헤더 div[role="button"] + 키보드 핸들러
// ============================================================================

import type { EsgQnaQuestionWithAnswer } from '@/types/esg';
import { QnaCategoryChip } from './QnaCategoryChip';
import { QnaStatusBadge } from './QnaStatusBadge';
import './faq-qna.css';

interface Props {
  qna: EsgQnaQuestionWithAnswer;
  isExpanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
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
  const canExpand = hasAnswer;
  const showAdminButton = isPending && isAdmin;

  const panelId = `qna-panel-${qna.id}`;
  const headerId = `qna-header-${qna.id}`;

  const handleHeaderClick = () => {
    if (canExpand) onToggle();
  };

  // 키보드 접근성: Enter / Space로 펼침 토글
  const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (!canExpand) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  // 답변하기 버튼 — 헤더 클릭과 분리
  const handleAnswerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAnswerClick?.();
  };

  return (
    <div className="faqqna-qna">
      {/* 외부 헤더: button 중첩 회피 위해 div + role */}
      <div
        id={headerId}
        role={canExpand ? 'button' : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onClick={handleHeaderClick}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={canExpand ? isExpanded : undefined}
        aria-controls={canExpand ? panelId : undefined}
        className={`faqqna-qna__header ${canExpand ? 'faqqna-qna__header--clickable' : 'faqqna-qna__header--disabled'}`}
      >
        {/* ── 데스크탑 구조 ── */}
        <div className="faqqna-qna__header-left">
          <img
            src="/icons/clover-qna.svg"
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            className="faqqna-qna__clover"
          />
          <QnaCategoryChip category={qna.category} />
          <span className="faqqna-qna__question">{qna.content}</span>
        </div>
        <div className="faqqna-qna__header-right">
          <QnaStatusBadge status={qna.status} />
          {showAdminButton && (
            <button
              type="button"
              onClick={handleAnswerClick}
              className="faqqna-qna__answer-button"
            >
              답변 하기
            </button>
          )}
        </div>

        {/* ── 모바일 구조 ── */}
        <div className="faqqna-qna__mobile-meta">
          <QnaCategoryChip category={qna.category} />
          <QnaStatusBadge status={qna.status} />
        </div>
        <div className="faqqna-qna__mobile-question">
          <span>{qna.content}</span>
          {canExpand && (
            <img
              src="/icons/keyboard_arrow_down.svg"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className={`faqqna-qna__arrow ${isExpanded ? 'faqqna-qna__arrow--expanded' : ''}`}
            />
          )}
        </div>
        {showAdminButton && (
          <div className="faqqna-qna__mobile-action">
            <button
              type="button"
              onClick={handleAnswerClick}
              className="faqqna-qna__answer-button"
            >
              답변 하기
            </button>
          </div>
        )}
      </div>

      {/* 답변 패널 */}
      {hasAnswer && isExpanded && qna.answer && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="faqqna-qna__panel"
        >
          <img
            src="/icons/reply.svg"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="faqqna-qna__reply-icon"
          />
          <div className="faqqna-qna__answer-text">
            {qna.answer.content}
          </div>
        </div>
      )}
    </div>
  );
}
