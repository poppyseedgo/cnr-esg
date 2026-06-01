// ============================================================================
// AdminFaq — FAQ 등록/관리 어드민 페이지 (/admin/faq)
//
// 기능:
//   - 목록 조회 (loadFaqs includeUnpublished:true → 미게시 포함)
//   - 신규 등록 폼 (질문 + 답변 + 게시 여부)
//   - 인라인 편집 (질문/답변 textarea → 저장)
//   - 순서 변경 (↑↓ 버튼, reorderFaqs로 일괄 sort_order 갱신)
//   - 게시 토글 (is_published 즉시 update)
//   - 삭제 (확인 후 deleteFaq)
//   - Realtime 구독: 다른 어드민 변경 즉시 반영
//
// 디자인 톤:
//   - AdminBazaarGuide와 동일 (흰 카드 + 회색 보조 + 검정 액션)
//   - 사용자 측 디자인(Figma 1003:306)과는 별개 — 어드민 인터페이스
//
// 변경 이력:
//   2026-06-01  최초 작성 (단계 9)
// ============================================================================

import { useEffect, useState } from 'react';
import {
  loadFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
  subscribeFaq,
} from '@/lib/faq';
import type { EsgFaqRow } from '@/types/esg';

export function AdminFaq() {
  const [faqs, setFaqs] = useState<EsgFaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 행별 편집 중인 값 (id → { question, answer })
  // 행이 편집 중일 때만 entry 존재. 저장/취소 시 제거.
  const [editingMap, setEditingMap] = useState<Map<string, { question: string; answer: string }>>(new Map());

  // 신규 등록 폼
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [newPublished, setNewPublished] = useState(true);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    try {
      setError(null);
      const rows = await loadFaqs({ includeUnpublished: true });
      setFaqs(rows);
    } catch (e) {
      console.error('[AdminFaq] load:', e);
      setError(e instanceof Error ? e.message : 'FAQ를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  // Realtime
  useEffect(() => {
    const cleanup = subscribeFaq(() => { void reload(); });
    return cleanup;
  }, []);

  // ── 신규 등록 ─────────────────────────────────────────────
  const handleCreate = async () => {
    const q = newQ.trim();
    const a = newA.trim();
    if (!q || !a) {
      alert('질문과 답변을 모두 입력해 주세요.');
      return;
    }
    setCreating(true);
    try {
      // sort_order: 맨 위로 (현재 최소값 - 1, 비어 있으면 0)
      const minOrder = faqs.length > 0 ? Math.min(...faqs.map((f) => f.sort_order)) - 1 : 0;
      await createFaq({
        question: q,
        answer: a,
        sort_order: minOrder,
        is_published: newPublished,
      });
      setNewQ('');
      setNewA('');
      setNewPublished(true);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setCreating(false);
    }
  };

  // ── 편집 시작/취소/저장 ────────────────────────────────────
  const startEdit = (faq: EsgFaqRow) => {
    setEditingMap((prev) => {
      const next = new Map(prev);
      next.set(faq.id, { question: faq.question, answer: faq.answer });
      return next;
    });
  };

  const cancelEdit = (id: string) => {
    setEditingMap((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const updateEditField = (id: string, field: 'question' | 'answer', value: string) => {
    setEditingMap((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (!cur) return prev;
      next.set(id, { ...cur, [field]: value });
      return next;
    });
  };

  const saveEdit = async (id: string) => {
    const edit = editingMap.get(id);
    if (!edit) return;
    const q = edit.question.trim();
    const a = edit.answer.trim();
    if (!q || !a) {
      alert('질문과 답변을 모두 입력해 주세요.');
      return;
    }
    try {
      await updateFaq(id, { question: q, answer: a });
      cancelEdit(id);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    }
  };

  // ── 게시 토글 ─────────────────────────────────────────────
  const togglePublished = async (faq: EsgFaqRow) => {
    try {
      await updateFaq(faq.id, { is_published: !faq.is_published });
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '상태 변경 실패');
    }
  };

  // ── 삭제 ──────────────────────────────────────────────────
  const handleDelete = async (faq: EsgFaqRow) => {
    if (!confirm(`이 FAQ를 삭제하시겠습니까?\n\n${faq.question}`)) return;
    try {
      await deleteFaq(faq.id);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  // ── 순서 이동 (sort_order 일괄 재계산) ────────────────────
  const moveItem = async (id: string, direction: -1 | 1) => {
    const idx = faqs.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= faqs.length) return;
    // 새 순서 배열
    const next = [...faqs];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    try {
      await reorderFaqs(next.map((f) => f.id));
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '순서 변경 실패');
    }
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      {/* 헤더 */}
      <div>
        <h2 style={{ margin: 0 }}>❓ FAQ 관리</h2>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
          행사 운영 관련 FAQ를 등록/수정/삭제합니다. 사용자 측 홈·/faq 페이지에 즉시 반영됩니다.
        </p>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* 신규 등록 폼 */}
      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>➕ 새 FAQ 추가</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="질문">
            <input
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              placeholder="예: 29주년 창립기념일 행사는 언제인가요?"
              style={inputStyle}
            />
          </Field>
          <Field label="답변">
            <textarea
              rows={3}
              value={newA}
              onChange={(e) => setNewA(e.target.value)}
              placeholder="답변 내용을 입력하세요. 줄바꿈은 그대로 표시됩니다."
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
              <input
                type="checkbox"
                checked={newPublished}
                onChange={(e) => setNewPublished(e.target.checked)}
              />
              즉시 게시 (체크 해제 시 비공개로 추가)
            </label>
            <button
              onClick={handleCreate}
              disabled={creating || !newQ.trim() || !newA.trim()}
              style={{
                ...primaryBtnStyle,
                background: creating || !newQ.trim() || !newA.trim() ? '#cbd5e1' : '#00422b',
                cursor: creating || !newQ.trim() || !newA.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? '등록 중…' : '추가'}
            </button>
          </div>
        </div>
      </section>

      {/* 목록 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: '8px 0 0', fontSize: 16 }}>
          📋 FAQ 목록 ({faqs.length}개)
        </h3>

        {faqs.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>
            등록된 FAQ가 없습니다. 위에서 첫 항목을 추가해보세요.
          </div>
        ) : (
          faqs.map((faq, idx) => {
            const editing = editingMap.get(faq.id);
            const isEditing = editing != null;
            return (
              <article key={faq.id} style={cardStyle}>
                {/* 헤더 — 순서/게시상태/액션 버튼 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <code style={{ fontSize: 11, color: '#94a3b8', minWidth: 24 }}>#{idx + 1}</code>
                    {!faq.is_published && (
                      <span style={{
                        background: '#fee2e2', color: '#b91c1c',
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      }}>
                        비공개
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => moveItem(faq.id, -1)}
                      disabled={idx === 0}
                      title="위로 이동"
                      style={{ ...iconBtnStyle, opacity: idx === 0 ? 0.3 : 1, cursor: idx === 0 ? 'not-allowed' : 'pointer' }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(faq.id, 1)}
                      disabled={idx === faqs.length - 1}
                      title="아래로 이동"
                      style={{
                        ...iconBtnStyle,
                        opacity: idx === faqs.length - 1 ? 0.3 : 1,
                        cursor: idx === faqs.length - 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => togglePublished(faq)}
                      title={faq.is_published ? '비공개 전환' : '게시 전환'}
                      style={{ ...secondaryBtnStyle, fontSize: 12 }}
                    >
                      {faq.is_published ? '🚫 비공개' : '✓ 게시'}
                    </button>
                    {!isEditing ? (
                      <>
                        <button
                          onClick={() => startEdit(faq)}
                          style={{ ...secondaryBtnStyle, fontSize: 12 }}
                        >
                          ✏️ 수정
                        </button>
                        <button
                          onClick={() => handleDelete(faq)}
                          style={{ ...secondaryBtnStyle, fontSize: 12, color: '#b91c1c' }}
                        >
                          🗑 삭제
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => saveEdit(faq.id)}
                          style={{ ...primaryBtnStyle, padding: '6px 12px', fontSize: 12 }}
                        >
                          ✓ 저장
                        </button>
                        <button
                          onClick={() => cancelEdit(faq.id)}
                          style={{ ...secondaryBtnStyle, fontSize: 12 }}
                        >
                          취소
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 본문 — 편집 모드 vs 읽기 모드 */}
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Field label="질문" compact>
                      <input
                        value={editing.question}
                        onChange={(e) => updateEditField(faq.id, 'question', e.target.value)}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="답변" compact>
                      <textarea
                        rows={3}
                        value={editing.answer}
                        onChange={(e) => updateEditField(faq.id, 'answer', e.target.value)}
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#111', wordBreak: 'break-word' }}>
                      Q. {faq.question}
                    </div>
                    <div style={{
                      fontSize: 14, color: '#475569', whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word', lineHeight: 1.5,
                    }}>
                      A. {faq.answer}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

// ── 헬퍼 스타일 ───────────────────────────────────────────
function Field({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

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

const iconBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  width: 28,
  height: 28,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
};
