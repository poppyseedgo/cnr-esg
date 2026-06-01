// ============================================================================
// AdminQnaEvent — 행사 Q&A 답변/관리 어드민 페이지 (/admin/qna-event)
//
// ※ 기존 /admin/qa는 상품 Q&A(esg_product_questions)용. 이 페이지는 별도 시스템
//    esg_qna_questions/answers (행사 운영 관련) 관리.
//
// 기능:
//   - 필터: 상태(전체/대기/완료/숨김) + 카테고리(전체/general/zero_waste/wise_life/bazaar/auction)
//   - 목록: loadQuestionsAdmin (작성자 정보 + 답변 포함)
//   - 답변 대기 항목: AnswerModal로 답변 등록
//   - 답변 완료 항목: 답변 수정/삭제(질문 status='pending' 자동 복원, DB 트리거)
//   - 숨김/복원/삭제 (질문 자체)
//   - Realtime 구독
//
// 익명 처리: 어드민 페이지라서 작성자(이름/부서) 노출. 사용자 측은 자동 익명.
//
// 변경 이력:
//   2026-06-01  최초 작성 (단계 10)
// ============================================================================

import { useEffect, useState } from 'react';
import {
  loadQuestionsAdmin,
  hideQuestion,
  restoreQuestion,
  deleteQuestion,
  updateAnswer,
  deleteAnswer,
  subscribeQna,
} from '@/lib/qna';
import {
  ESG_QNA_CATEGORY_LABELS,
  type EsgQnaCategory,
  type EsgQnaQuestionStatus,
  type EsgQnaQuestionWithAuthor,
} from '@/types/esg';
import { AnswerModal } from '@/components/faq-qna/AnswerModal';

type StatusFilter = 'all' | EsgQnaQuestionStatus;
type CategoryFilter = 'all' | EsgQnaCategory;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all',      label: '전체' },
  { value: 'pending',  label: '답변 대기' },
  { value: 'answered', label: '답변 완료' },
  { value: 'hidden',   label: '숨김' },
];

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all',        label: '전체' },
  { value: 'general',    label: '일반' },
  { value: 'zero_waste', label: '제로 웨이스트' },
  { value: 'wise_life',  label: '슬기로운 사회생활' },
  { value: 'bazaar',     label: 'C&R 바자회' },
  { value: 'auction',    label: 'C&R 경매' },
];

const PAGE_SIZE = 30;

export function AdminQnaEvent() {
  const [items, setItems] = useState<EsgQnaQuestionWithAuthor[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');  // 기본: 답변 대기 우선
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 답변 모달 (대상 질문)
  const [answerTarget, setAnswerTarget] = useState<EsgQnaQuestionWithAuthor | null>(null);

  // 답변 수정 인라인 편집 (questionId → 편집 중인 텍스트)
  const [editingAnswer, setEditingAnswer] = useState<Map<string, string>>(new Map());

  const reload = async () => {
    try {
      setError(null);
      const rows = await loadQuestionsAdmin({
        status: statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        page: 1,
        pageSize: PAGE_SIZE,
      });
      setItems(rows);
    } catch (e) {
      console.error('[AdminQnaEvent] load:', e);
      setError(e instanceof Error ? e.message : 'Q&A를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  // Realtime
  useEffect(() => {
    const cleanup = subscribeQna(() => { void reload(); });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  // ── 액션 핸들러 ───────────────────────────────────────────
  const handleHide = async (q: EsgQnaQuestionWithAuthor) => {
    if (!confirm('이 질문을 숨김 처리하시겠습니까?\n사용자 화면에서 보이지 않게 됩니다.')) return;
    try {
      await hideQuestion(q.id);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '숨김 처리 실패');
    }
  };

  const handleRestore = async (q: EsgQnaQuestionWithAuthor) => {
    try {
      await restoreQuestion(q.id);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '복원 실패');
    }
  };

  const handleDelete = async (q: EsgQnaQuestionWithAuthor) => {
    if (!confirm(`이 질문을 영구 삭제합니다.\n답변도 함께 삭제됩니다.\n\n${q.content}`)) return;
    try {
      await deleteQuestion(q.id);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const startEditAnswer = (q: EsgQnaQuestionWithAuthor) => {
    if (!q.answer) return;
    setEditingAnswer((prev) => {
      const next = new Map(prev);
      next.set(q.id, q.answer!.content);
      return next;
    });
  };

  const cancelEditAnswer = (qid: string) => {
    setEditingAnswer((prev) => {
      const next = new Map(prev);
      next.delete(qid);
      return next;
    });
  };

  const saveEditAnswer = async (q: EsgQnaQuestionWithAuthor) => {
    const newContent = editingAnswer.get(q.id);
    if (!newContent || !q.answer) return;
    const trimmed = newContent.trim();
    if (!trimmed) {
      alert('답변 내용을 입력해 주세요.');
      return;
    }
    try {
      await updateAnswer(q.answer.id, trimmed);
      cancelEditAnswer(q.id);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '답변 수정 실패');
    }
  };

  const handleDeleteAnswer = async (q: EsgQnaQuestionWithAuthor) => {
    if (!q.answer) return;
    if (!confirm('답변을 삭제하시겠습니까?\n질문 상태가 "답변 대기"로 되돌아갑니다.')) return;
    try {
      await deleteAnswer(q.answer.id);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '답변 삭제 실패');
    }
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      {/* 헤더 */}
      <div>
        <h2 style={{ margin: 0 }}>💬 Q&A 답변 관리 (행사)</h2>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
          사용자가 등록한 행사 관련 질문에 답변합니다. 사용자 화면은 익명 표시이지만 여기서는 작성자가 노출됩니다.
        </p>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* 필터 영역 */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FilterRow label="상태">
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                active={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="카테고리">
            {CATEGORY_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                active={categoryFilter === opt.value}
                onClick={() => setCategoryFilter(opt.value)}
              >
                {opt.label}
              </FilterChip>
            ))}
          </FilterRow>
        </div>
      </section>

      {/* 목록 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: '8px 0 0', fontSize: 16 }}>
          📋 질문 목록 ({items.length}개)
        </h3>

        {items.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>
            조건에 맞는 질문이 없습니다.
          </div>
        ) : (
          items.map((q) => {
            const editingText = editingAnswer.get(q.id);
            const isEditingAns = editingText !== undefined;
            return (
              <article key={q.id} style={cardStyle}>
                {/* 상단 메타 — 카테고리/상태/액션 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusBadge status={q.status} />
                    <CategoryBadge>
                      {ESG_QNA_CATEGORY_LABELS[q.category]}
                    </CategoryBadge>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {new Date(q.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {q.status !== 'hidden' && (
                      <button onClick={() => handleHide(q)} style={{ ...secondaryBtnStyle, fontSize: 12 }}>
                        🙈 숨김
                      </button>
                    )}
                    {q.status === 'hidden' && (
                      <button onClick={() => handleRestore(q)} style={{ ...secondaryBtnStyle, fontSize: 12 }}>
                        ↩ 복원
                      </button>
                    )}
                    <button onClick={() => handleDelete(q)} style={{ ...secondaryBtnStyle, fontSize: 12, color: '#b91c1c' }}>
                      🗑 삭제
                    </button>
                  </div>
                </div>

                {/* 작성자 */}
                <div style={{ marginBottom: 8, fontSize: 13, color: '#475569' }}>
                  <span style={{ fontWeight: 600, color: '#111' }}>
                    {q.author?.name ?? '(알 수 없음)'}
                  </span>
                  {q.author?.dept && (
                    <span style={{ marginLeft: 6, color: '#94a3b8', fontSize: 12 }}>
                      {q.author.dept}
                    </span>
                  )}
                  {q.author?.email && (
                    <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 11 }}>
                      {q.author.email}
                    </span>
                  )}
                </div>

                {/* 질문 내용 */}
                <div style={{
                  padding: 12, background: '#f8fafc', borderRadius: 8,
                  fontSize: 14, color: '#111', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 10,
                }}>
                  Q. {q.content}
                </div>

                {/* 답변 영역 */}
                {q.answer ? (
                  <div style={{
                    padding: 12, background: '#ecfdf5', borderRadius: 8,
                    border: '1px solid #d1fae5',
                  }}>
                    {isEditingAns ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          rows={3}
                          value={editingText}
                          onChange={(e) => setEditingAnswer((prev) => {
                            const next = new Map(prev);
                            next.set(q.id, e.target.value);
                            return next;
                          })}
                          style={{ ...inputStyle, background: '#fff' }}
                        />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => cancelEditAnswer(q.id)} style={{ ...secondaryBtnStyle, fontSize: 12 }}>
                            취소
                          </button>
                          <button onClick={() => saveEditAnswer(q)} style={{ ...primaryBtnStyle, padding: '6px 12px', fontSize: 12 }}>
                            ✓ 저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          fontSize: 14, color: '#111', lineHeight: 1.5,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          A. {q.answer.content}
                        </div>
                        <div style={{
                          marginTop: 8, display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', fontSize: 11, color: '#94a3b8',
                        }}>
                          <span>
                            답변 등록: {new Date(q.answer.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => startEditAnswer(q)} style={{ ...secondaryBtnStyle, fontSize: 11, padding: '4px 8px' }}>
                              ✏️ 수정
                            </button>
                            <button onClick={() => handleDeleteAnswer(q)} style={{ ...secondaryBtnStyle, fontSize: 11, padding: '4px 8px', color: '#b91c1c' }}>
                              🗑 답변 삭제
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  q.status === 'pending' && (
                    <button
                      onClick={() => setAnswerTarget(q)}
                      style={{
                        ...primaryBtnStyle,
                        width: '100%',
                        background: '#111',
                        padding: '12px',
                      }}
                    >
                      ✍️ 답변 하기
                    </button>
                  )
                )}
              </article>
            );
          })
        )}
      </section>

      {/* 답변 모달 */}
      {answerTarget && (
        <AnswerModal
          question={answerTarget}
          onClose={() => setAnswerTarget(null)}
          onSuccess={() => { void reload(); }}
        />
      )}
    </div>
  );
}

// ── 헬퍼 컴포넌트 ─────────────────────────────────────────
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ minWidth: 60, fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid',
        borderColor: active ? '#111' : '#e2e8f0',
        background: active ? '#111' : '#fff',
        color: active ? '#fff' : '#475569',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: EsgQnaQuestionStatus }) {
  const config: Record<EsgQnaQuestionStatus, { bg: string; color: string; label: string }> = {
    pending:  { bg: '#fef3c7', color: '#92400e', label: '답변 대기' },
    answered: { bg: '#dcfce7', color: '#15803d', label: '답변 완료' },
    hidden:   { bg: '#f3f4f6', color: '#6b7280', label: '숨김' },
  };
  const c = config[status];
  return (
    <span style={{
      background: c.bg, color: c.color,
      padding: '4px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600,
    }}>
      {c.label}
    </span>
  );
}

function CategoryBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: '#e0f2fe', color: '#0369a1',
      padding: '4px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 500,
    }}>
      {children}
    </span>
  );
}

// ── 공용 스타일 ───────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  lineHeight: 1.5,
  resize: 'vertical',
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 16,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#00422b',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: '#fff',
  color: '#64748b',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};
