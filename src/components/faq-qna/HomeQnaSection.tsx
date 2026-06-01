// ============================================================================
// HomeQnaSection — 홈 Q&A 섹션
//
// 변경 이력:
//   2026-06-01  최초 작성
//   2026-06-01  buggfix: authorMap → items 직접 검색
//   2026-06-01  CSS 마이그레이션 (faq-qna.css)
// ============================================================================

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { loadQuestions, loadQuestionsAdmin, subscribeQna } from '@/lib/qna';
import type {
  EsgQnaQuestionWithAnswer,
  EsgQnaQuestionWithAuthor,
} from '@/types/esg';
import { QnaAccordionItem } from './QnaAccordionItem';
import { InquiryModal } from './InquiryModal';
import { AnswerModal } from './AnswerModal';
import './faq-qna.css';

const HOME_PAGE_SIZE = 5;

export function HomeQnaSection() {
  const { currentUser, isAdmin, signInWithMicrosoft } = useCurrentUser();

  const [items, setItems] = useState<EsgQnaQuestionWithAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [answerTarget, setAnswerTarget] = useState<EsgQnaQuestionWithAuthor | null>(null);

  const reload = async () => {
    try {
      if (isAdmin) {
        const adminRows = await loadQuestionsAdmin({ pageSize: HOME_PAGE_SIZE });
        setItems(adminRows as EsgQnaQuestionWithAnswer[]);
      } else {
        const rows = await loadQuestions({ pageSize: HOME_PAGE_SIZE });
        setItems(rows);
      }
    } catch (e) {
      console.error('[HomeQnaSection] load:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isAdmin]);

  useEffect(() => {
    const cleanup = subscribeQna(() => { void reload(); });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleAskQuestionClick = () => {
    if (!currentUser) {
      void signInWithMicrosoft();
      return;
    }
    setInquiryOpen(true);
  };

  const handleAnswerClick = (questionId: string) => {
    const target = items.find((q) => q.id === questionId) as EsgQnaQuestionWithAuthor | undefined;
    if (!target || !target.author) {
      console.error('[HomeQnaSection] author info missing for', questionId, target);
      alert('작성자 정보를 불러올 수 없습니다. 새로고침 후 다시 시도해 주세요.');
      return;
    }
    setAnswerTarget(target);
  };

  return (
    <section
      aria-labelledby="home-qna-title"
      className="faqqna-section"
    >
      {/* Q&A 헤더 — 제목 그룹 + 질문 남기기 버튼 */}
      <header className="faqqna-qna-header">
        <div className="faqqna-qna-header__title-group">
          <h2 id="home-qna-title" className="faqqna-section__title">Q&amp;A</h2>
          <div className="faqqna-section__subtitle">
            <p>행사 프로그램에 대해 궁금하신 점이 있다면 남겨주세요.</p>
            <p>질문 내용은 익명으로 등록되며,</p>
            <p>담당자가 직접 답변해 드립니다.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAskQuestionClick}
          className="faqqna-ask-button"
        >
          질문 남기기
        </button>
      </header>

      {/* 리스트 */}
      <div className="faqqna-section__list">
        {loading && items.length === 0 && (
          <div className="faqqna-section__empty">불러오는 중…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="faqqna-section__empty">
            아직 등록된 질문이 없습니다. 첫 질문을 남겨보세요.
          </div>
        )}
        {items.map((qna) => (
          <QnaAccordionItem
            key={qna.id}
            qna={qna}
            isExpanded={expandedId === qna.id}
            onToggle={() => handleToggle(qna.id)}
            isAdmin={isAdmin}
            onAnswerClick={() => handleAnswerClick(qna.id)}
          />
        ))}
      </div>

      {/* 모달 */}
      {inquiryOpen && (
        <InquiryModal
          onClose={() => setInquiryOpen(false)}
          onSuccess={() => { void reload(); }}
        />
      )}
      {answerTarget && (
        <AnswerModal
          question={answerTarget}
          onClose={() => setAnswerTarget(null)}
          onSuccess={() => { void reload(); }}
        />
      )}
    </section>
  );
}
