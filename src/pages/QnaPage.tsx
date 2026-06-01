// ============================================================================
// QnaPage — /qna 단독 페이지 (Figma 1003:379)
//
// 구조:
//   - 헤더 영역 (gap 24, py 24):
//     · 제목 "Q&A" 48px Medium + 부제 3줄 16px Regular
//     · "질문 남기기" 버튼 (검정 px-24 py-16 radius-16, 20px SemiBold)
//   - 리스트: QnaAccordionItem 반복, 한 번에 하나만 펼침
//   - 페이지네이션: 5개씩 (PAGE_SIZE = 5)
//
// 데이터:
//   - loadQuestions({ page, pageSize: 5 }) + countQuestions() 총 개수
//   - 어드민이면 loadQuestionsAdmin으로 작성자 정보 포함
//   - Realtime 구독: 변경 시 현재 페이지 reload + count 갱신
//
// 모달 통합:
//   - InquiryModal: 미로그인 → signInWithMicrosoft, 로그인 → 모달
//   - AnswerModal: 어드민이 "답변 하기" 클릭 시
//
// 변경 이력:
//   2026-06-01  최초 작성 (단계 8)
// ============================================================================

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  loadQuestions,
  loadQuestionsAdmin,
  countQuestions,
  subscribeQna,
} from '@/lib/qna';
import type {
  EsgQnaQuestionWithAnswer,
  EsgQnaQuestionWithAuthor,
} from '@/types/esg';
import { QnaAccordionItem } from '@/components/faq-qna/QnaAccordionItem';
import { Pagination } from '@/components/faq-qna/Pagination';
import { InquiryModal } from '@/components/faq-qna/InquiryModal';
import { AnswerModal } from '@/components/faq-qna/AnswerModal';

const PAGE_SIZE = 5;

export function QnaPage() {
  const { currentUser, isAdmin, signInWithMicrosoft } = useCurrentUser();

  const [items, setItems] = useState<EsgQnaQuestionWithAnswer[]>([]);
  const [authorMap, setAuthorMap] = useState<Map<string, EsgQnaQuestionWithAuthor>>(new Map());
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [answerTarget, setAnswerTarget] = useState<EsgQnaQuestionWithAuthor | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const reload = async (page: number = currentPage) => {
    try {
      // 페이지+개수 동시 조회
      const [count, rows] = await Promise.all([
        countQuestions(),
        isAdmin
          ? loadQuestionsAdmin({ page, pageSize: PAGE_SIZE })
          : loadQuestions({ page, pageSize: PAGE_SIZE }),
      ]);
      setTotalCount(count);

      if (isAdmin) {
        const adminRows = rows as EsgQnaQuestionWithAuthor[];
        const map = new Map<string, EsgQnaQuestionWithAuthor>();
        for (const row of adminRows) map.set(row.id, row);
        setAuthorMap(map);
        setItems(adminRows as EsgQnaQuestionWithAnswer[]);
      } else {
        setItems(rows as EsgQnaQuestionWithAnswer[]);
        setAuthorMap(new Map());
      }

      // 현재 페이지가 totalPages를 초과하면 마지막 페이지로 조정
      const newTotalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
      if (page > newTotalPages) {
        setCurrentPage(newTotalPages);
      }
    } catch (e) {
      console.error('[QnaPage] load:', e);
    } finally {
      setLoading(false);
    }
  };

  // 페이지 변경 시 reload
  useEffect(() => {
    void reload(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, isAdmin]);

  // Realtime: 현재 페이지 + count 갱신
  useEffect(() => {
    const cleanup = subscribeQna(() => { void reload(currentPage); });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, isAdmin]);

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
    const target = authorMap.get(questionId);
    if (!target) {
      console.error('[QnaPage] author info missing for', questionId);
      return;
    }
    setAnswerTarget(target);
  };

  const handlePageChange = (page: number) => {
    setExpandedId(null);   // 페이지 이동 시 펼친 항목 닫기
    setCurrentPage(page);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 176 }}>
      <div style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 영역 (제목 그룹 + 질문 남기기 버튼) */}
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            padding: '24px 0',
            fontFamily: 'var(--font-sans)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1
              style={{ margin: 0, fontWeight: 500, fontSize: 48, lineHeight: 1.2, color: '#111' }}
            >
              Q&amp;A
            </h1>
            <div style={{ fontWeight: 400, fontSize: 16, lineHeight: 1.5, color: '#111' }}>
              <p style={{ margin: 0 }}>행사 프로그램에 대해 궁금하신 점이 있다면 남겨주세요.</p>
              <p style={{ margin: 0 }}>질문 내용은 익명으로 등록되며,</p>
              <p style={{ margin: 0 }}>담당자가 직접 답변해 드립니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAskQuestionClick}
            style={{
              alignSelf: 'flex-start',
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 16,
              padding: '16px 24px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              fontSize: 20,
              lineHeight: 1.5,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            질문 남기기
          </button>
        </header>

        {/* 리스트 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading && items.length === 0 && (
            <div style={{ padding: '24px 0', fontFamily: 'var(--font-sans)', fontSize: 16, color: '#96a0b3' }}>
              불러오는 중…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ padding: '24px 0', fontFamily: 'var(--font-sans)', fontSize: 16, color: '#96a0b3' }}>
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

        {/* 페이지네이션 (총 페이지 > 1 일 때만 자동 표시) */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />

        {/* 모달 */}
        {inquiryOpen && (
          <InquiryModal
            onClose={() => setInquiryOpen(false)}
            onSuccess={() => {
              // 등록 후 첫 페이지로 이동 (최신 질문 보이게)
              if (currentPage !== 1) setCurrentPage(1);
              else void reload(1);
            }}
          />
        )}
        {answerTarget && (
          <AnswerModal
            question={answerTarget}
            onClose={() => setAnswerTarget(null)}
            onSuccess={() => { void reload(currentPage); }}
          />
        )}
      </div>
    </div>
  );
}
