// ============================================================================
// HomeQnaSection — 홈 Q&A 섹션 (Figma 933:102 Q&A 영역)
//
// 구조:
//   - 헤더 영역 (gap 24, py 24):
//       제목 그룹 (gap 8): "Q&A" 48px Medium + 부제 3줄 16px Regular
//       "질문 남기기" 버튼 (검정 px-24 py-16 radius-16, 20px SemiBold)
//   - 리스트: QnaAccordionItem 반복, 한 번에 하나만 펼침
//   - 페이지네이션 없음 (홈은 최근 5개만, 더 보려면 /qna)
//
// 데이터:
//   - loadQuestions({ pageSize: 5 }) 마운트 시 + Realtime
//   - hidden 제외 (RLS도 차단)
//
// 동작:
//   - "질문 남기기" 클릭:
//       미로그인 → signInWithMicrosoft (또는 안내) 호출
//       로그인 → InquiryModal 오픈
//   - 어드민이 "답변 하기" 클릭 → AnswerModal 오픈 (해당 질문 + 작성자 정보)
//   - 모달 등록 성공 → reload (Realtime도 트리거되지만 즉시성 위해 직접 호출)
//
// 익명 처리: QnaAccordionItem이 작성자 표시 안 함. 어드민 답변 모달만 작성자 노출.
//
// 변경 이력:
//   2026-06-01  최초 작성
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

const HOME_PAGE_SIZE = 5;

export function HomeQnaSection() {
  const { currentUser, isAdmin, signInWithMicrosoft } = useCurrentUser();

  // 데이터: 어드민이면 EsgQnaQuestionWithAuthor (author 포함), 아니면 EsgQnaQuestionWithAnswer
  // 둘 다 EsgQnaQuestionWithAnswer 형태로 보관(전자가 후자를 확장). 어드민 분기 시 cast로 author 접근.
  const [items, setItems] = useState<EsgQnaQuestionWithAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 모달
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [answerTarget, setAnswerTarget] = useState<EsgQnaQuestionWithAuthor | null>(null);

  const reload = async () => {
    try {
      if (isAdmin) {
        // 어드민: 작성자 정보 포함 조회 → items에 author 들어 있음 (cast로 접근)
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

  // Realtime
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
      // 미로그인: Microsoft SSO 트리거
      void signInWithMicrosoft();
      return;
    }
    setInquiryOpen(true);
  };

  const handleAnswerClick = (questionId: string) => {
    // items 자체가 어드민이면 EsgQnaQuestionWithAuthor 데이터를 갖고 있음 (loadQuestionsAdmin 결과).
    // authorMap stale 위험 회피 위해 items에서 직접 찾음.
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
      style={{ display: 'flex', flexDirection: 'column', gap: 40, width: '100%' }}
    >
      {/* 헤더 영역 (제목 그룹 + 질문 남기기 버튼) */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          padding: '24px 0',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2
            id="home-qna-title"
            style={{
              margin: 0,
              fontWeight: 500,
              fontSize: 48,
              lineHeight: 1.2,
              color: '#111',
            }}
          >
            Q&amp;A
          </h2>
          <div
            style={{
              fontWeight: 400,
              fontSize: 16,
              lineHeight: 1.5,
              color: '#111',
            }}
          >
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
          <div
            style={{
              padding: '24px 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              color: '#96a0b3',
            }}
          >
            불러오는 중…
          </div>
        )}
        {!loading && items.length === 0 && (
          <div
            style={{
              padding: '24px 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              color: '#96a0b3',
            }}
          >
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
