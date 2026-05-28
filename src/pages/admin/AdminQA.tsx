// ============================================================================
// AdminQA — 상품 Q&A 통합 관리 (/admin/qa)
//
// 기능:
//   - 모든 상품(바자회/경매)의 모든 Q&A 통합 조회
//   - 필터: 상태(전체/미답변/답변완료/숨김) + 타입(전체/바자회/경매)
//   - 검색: 질문 본문 + 작성자명
//   - 답변 작성/수정/삭제 (어드민)
//   - 질문 숨김/복원
//   - 상품 페이지로 이동 링크
//   - 무한 스크롤 + Realtime
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAllQuestions,
  loadProductNames,
  updateQuestionStatus,
  subscribeAllQuestions,
  type AdminQAFilter,
} from '@/lib/adminProductQuestions';
import {
  loadAnswers,
  createAnswer,
  updateAnswer,
  deleteAnswer,
  deleteQuestion,
} from '@/lib/productQuestions';
import { formatRelativeTime } from '@/lib/notifications';
import type {
  EsgProductQuestionRow,
  EsgProductQuestionAnswerRow,
} from '@/types/esg';

const PAGE_SIZE = 30;

type StatusFilter = 'all' | 'open' | 'answered' | 'hidden';
type TypeFilter = 'all' | 'bazaar' | 'auction';

export function AdminQA() {
  const [items, setItems] = useState<EsgProductQuestionRow[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [answersMap, setAnswersMap] = useState<Record<string, EsgProductQuestionAnswerRow[]>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadingMoreRef = useRef(false);

  const load = async (reset: boolean) => {
    if (reset) {
      setLoading(true);
    } else {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      const before = reset ? undefined : items[items.length - 1]?.created_at;
      const filter: AdminQAFilter = {
        limit: PAGE_SIZE,
        before,
        status: statusFilter,
        productType: typeFilter,
        searchQuery: searchQuery.trim() || undefined,
      };
      const rows = await loadAllQuestions(filter);

      // 상품명 일괄 조회 (N+1 회피)
      const names = await loadProductNames(
        rows.map((r) => ({ type: r.product_type, id: r.product_id })),
      );

      // 각 질문별 답변 로드 (병렬)
      const answersEntries = await Promise.all(
        rows.map(async (q) => {
          try {
            const ans = await loadAnswers(q.id);
            return [q.id, ans] as const;
          } catch {
            return [q.id, [] as EsgProductQuestionAnswerRow[]] as const;
          }
        }),
      );
      const aMap: Record<string, EsgProductQuestionAnswerRow[]> = {};
      for (const [qid, ans] of answersEntries) aMap[qid] = [...ans];

      if (reset) {
        setItems(rows);
        setProductNames(names);
        setAnswersMap(aMap);
      } else {
        setItems((prev) => [...prev, ...rows]);
        setProductNames((prev) => ({ ...prev, ...names }));
        setAnswersMap((prev) => ({ ...prev, ...aMap }));
      }
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      console.error('[AdminQA] load error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  // 필터/검색 변경 시 reset
  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, searchQuery]);

  // Realtime
  useEffect(() => {
    const cleanup = subscribeAllQuestions(() => void load(true));
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 무한 스크롤
  useEffect(() => {
    const onScroll = () => {
      if (loadingMore || !hasMore || loading) return;
      const near = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
      if (near) void load(false);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, loading, items]);

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const refresh = () => void load(true);

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>❓ Q&A 통합 관리</h2>
      <p style={{ color: '#666', fontSize: 13, margin: '0 0 16px' }}>
        모든 상품(바자회/경매)의 사용자 질문을 한 곳에서 답변할 수 있습니다.
      </p>

      {/* 필터 + 검색 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* 상태 탭 */}
        <FilterTabs<StatusFilter>
          label="상태"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'open', label: '미답변' },
            { value: 'answered', label: '답변완료' },
            { value: 'hidden', label: '숨김' },
            { value: 'all', label: '전체' },
          ]}
        />

        {/* 타입 탭 */}
        <FilterTabs<TypeFilter>
          label="타입"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: '전체' },
            { value: 'bazaar', label: '🛍 바자회' },
            { value: 'auction', label: '🔨 경매' },
          ]}
        />

        {/* 검색 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="질문 내용 또는 작성자명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            style={{
              flex: 1,
              padding: '8px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            style={{
              padding: '8px 16px',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            검색
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
              }}
              style={{
                padding: '8px 12px',
                background: '#fff',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✕ 초기화
            </button>
          )}
        </div>
      </div>

      {/* 결과 */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : items.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            border: '1px dashed #ddd',
          }}
        >
          <div style={{ fontSize: 40, opacity: 0.4, marginBottom: 12 }}>❓</div>
          <p style={{ margin: 0, color: '#888' }}>조건에 맞는 질문이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              productName={productNames[`${q.product_type}:${q.product_id}`] ?? '(상품 정보 없음)'}
              answers={answersMap[q.id] ?? []}
              onChange={refresh}
            />
          ))}
          {loadingMore && (
            <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 12 }}>
              불러오는 중…
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: '#bbb', fontSize: 11 }}>
              마지막 질문입니다
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 필터 탭 공통 컴포넌트
// ============================================================================

function FilterTabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#666', fontWeight: 600, minWidth: 36 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 99,
              fontSize: 12,
              border: '1px solid',
              borderColor: value === o.value ? '#222' : '#ddd',
              background: value === o.value ? '#222' : '#fff',
              color: value === o.value ? '#fff' : '#444',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 개별 질문 카드 (답변 작성/수정/삭제 포함)
// ============================================================================

function QuestionCard({
  question,
  productName,
  answers,
  onChange,
}: {
  question: EsgProductQuestionRow;
  productName: string;
  answers: EsgProductQuestionAnswerRow[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(answers.length === 0); // 답변 없으면 폼 펼침
  const [answerBody, setAnswerBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const productLink =
    question.product_type === 'bazaar'
      ? `/bazaar/${question.product_id}`
      : `/auction/${question.product_id}`;

  const handleAnswer = async () => {
    if (!answerBody.trim()) return;
    setSubmitting(true);
    try {
      await createAnswer({ question_id: question.id, body: answerBody.trim() });
      setAnswerBody('');
      setShowForm(false);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '답변 등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAnswer = async (id: string) => {
    if (!editBody.trim()) return;
    setSubmitting(true);
    try {
      await updateAnswer(id, editBody.trim());
      setEditingId(null);
      setEditBody('');
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '수정 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAnswer = async (id: string) => {
    if (!confirm('답변을 삭제하시겠습니까?')) return;
    try {
      await deleteAnswer(id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const handleDeleteQuestion = async () => {
    if (!confirm('질문을 삭제하시겠습니까? 모든 답변도 함께 삭제됩니다.')) return;
    try {
      await deleteQuestion(question.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const handleToggleHide = async () => {
    const next = question.status === 'hidden' ? 'open' : 'hidden';
    try {
      await updateQuestionStatus(question.id, next);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '상태 변경 실패');
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* 상품 정보 (상단) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: '1px solid #f0f0f0',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            background: question.product_type === 'bazaar' ? '#dbeafe' : '#fef3c7',
            color: question.product_type === 'bazaar' ? '#1e40af' : '#92400e',
          }}
        >
          {question.product_type === 'bazaar' ? '🛍 바자회' : '🔨 경매'}
        </span>
        <Link
          to={productLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#222',
            textDecoration: 'none',
          }}
        >
          {productName} <span style={{ color: '#0ea5e9', fontSize: 11 }}>↗</span>
        </Link>
      </div>

      {/* 질문 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            background:
              question.status === 'answered'
                ? '#dcfce7'
                : question.status === 'hidden'
                ? '#f3f4f6'
                : '#fef3c7',
            color:
              question.status === 'answered'
                ? '#166534'
                : question.status === 'hidden'
                ? '#888'
                : '#92400e',
          }}
        >
          {question.status === 'answered'
            ? '답변완료'
            : question.status === 'hidden'
            ? '숨김'
            : '미답변'}
        </span>
        {question.is_private && (
          <span style={{ fontSize: 11, color: '#888' }}>🔒 비공개</span>
        )}
        <span style={{ fontSize: 12, fontWeight: 600 }}>{question.user_name_snapshot}</span>
        <span style={{ fontSize: 11, color: '#999' }}>· {question.user_email}</span>
        <span style={{ fontSize: 11, color: '#999' }}>· {formatRelativeTime(question.created_at)}</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleToggleHide}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#888',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 8px',
          }}
        >
          {question.status === 'hidden' ? '복원' : '숨김'}
        </button>
        <button
          type="button"
          onClick={handleDeleteQuestion}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 8px',
          }}
        >
          삭제
        </button>
      </div>

      {/* 질문 본문 */}
      <div
        style={{
          fontSize: 14,
          color: '#222',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          marginBottom: 12,
        }}
      >
        {question.body}
      </div>

      {/* 답변 목록 */}
      {answers.length > 0 && (
        <div
          style={{
            borderLeft: '3px solid #6DED73',
            paddingLeft: 12,
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {answers.map((a) => (
            <div key={a.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    background: '#0ea5e9',
                    color: '#fff',
                  }}
                >
                  ADMIN
                </span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{a.admin_name_snapshot}</span>
                <span style={{ fontSize: 11, color: '#999' }}>
                  · {formatRelativeTime(a.created_at)}
                </span>
                <div style={{ flex: 1 }} />
                {editingId === a.id ? null : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(a.id);
                        setEditBody(a.body);
                      }}
                      style={smallActionBtn}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnswer(a.id)}
                      style={{ ...smallActionBtn, color: '#dc2626' }}
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
              {editingId === a.id ? (
                <div>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    disabled={submitting}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: 8,
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      marginBottom: 6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditBody('');
                      }}
                      disabled={submitting}
                      style={smallActionBtn}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateAnswer(a.id)}
                      disabled={submitting || !editBody.trim()}
                      style={{ ...smallActionBtn, background: '#0ea5e9', color: '#fff', border: 'none' }}
                    >
                      {submitting ? '저장…' : '저장'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#222', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {a.body}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 답변 작성 */}
      {showForm ? (
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <textarea
            value={answerBody}
            onChange={(e) => setAnswerBody(e.target.value)}
            placeholder="답변을 입력하세요"
            disabled={submitting}
            rows={3}
            maxLength={5000}
            style={{
              width: '100%',
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {answers.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setAnswerBody('');
                }}
                disabled={submitting}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                취소
              </button>
            )}
            <button
              type="button"
              onClick={handleAnswer}
              disabled={submitting || !answerBody.trim()}
              style={{
                padding: '6px 16px',
                background: submitting || !answerBody.trim() ? '#ccc' : '#0ea5e9',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: submitting || !answerBody.trim() ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {submitting ? '등록 중…' : answers.length > 0 ? '추가 답변' : '답변 등록'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 14px',
            background: '#0ea5e9',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + 추가 답변
        </button>
      )}
    </div>
  );
}

const smallActionBtn: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 11,
  color: '#444',
};
