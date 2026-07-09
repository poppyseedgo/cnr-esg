// ============================================================================
// ProductDetailTabs — 바자회/경매 상세 페이지 하단 탭 영역
//
// 탭:
//   - 입찰내역 (경매만)
//   - 상세설명 (markdown 렌더링)
//   - 상품수령 (어드민 공통 설정 markdown)
//   - Q&A (질문 목록 + 작성 + 어드민 답변)
//
// 호출 측:
//   <ProductDetailTabs
//     productType="bazaar" | "auction"
//     productId={...}
//     description={...}   // 상세설명 markdown
//     bids={...}          // 경매 전용
//   />
//
// [변경이력]
//   2026-07-06 · showDescriptionTab prop 추가(기본 true, 하위호환).
//              경매 상세는 상세설명을 상단(기부자 아래)으로 옮기며 이 탭을 false로 숨김.
//              바자회 등 기존 호출부는 prop 미전달 → 기존과 100% 동일 동작.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { loadSetting } from '@/lib/settings';
import {
  loadQuestions,
  loadAnswers,
  createQuestion,
  createAnswer,
  deleteQuestion,
  deleteAnswer,
  subscribeQuestions,
} from '@/lib/productQuestions';
import { formatRelativeTime } from '@/lib/notifications';
import { loadAvatarMap } from '@/lib/profiles'; // ← [추가] 질문 작성자 아바타 일괄 조회(SSOT)
import { UserChip } from './UserChip';           // ← [추가] 글쓴이 공통 컴포넌트
import { MarkdownRenderer } from './MarkdownRenderer';
import type {
  EsgProductQuestionRow,
  EsgProductQuestionAnswerRow,
} from '@/types/esg';

export type ProductType = 'bazaar' | 'auction';

interface ProductDetailTabsProps {
  productType: ProductType;
  productId: string;
  /** 상세설명 markdown */
  description: string | null | undefined;
  /** 경매: 입찰내역 렌더링 함수 (이미 페이지에 그려진 내용 그대로 옮길 수 있도록 자유롭게) */
  bidsContent?: ReactNode;
  /** 상세설명 탭 노출 여부 (기본 true). 경매 상세는 설명을 상단으로 옮겨 false. */ // ← [2026-07-06]
  showDescriptionTab?: boolean; // ← [2026-07-06]
  /** 외부 제어(경매 상세의 우측 버튼에서 탭 전환). 미지정 시 내부 상태 사용(하위호환). */ // ← [2026-07-06]
  activeTab?: TabKey;
  onActiveTabChange?: (t: TabKey) => void;
  /** 스크롤 앵커용 컨테이너 id. */ // ← [2026-07-06]
  id?: string;
}

export type TabKey = 'bids' | 'description' | 'delivery' | 'qa';

export function ProductDetailTabs({
  productType,
  productId,
  description,
  bidsContent,
  showDescriptionTab = true, // ← [2026-07-06] 기본 true(하위호환). 경매만 false로 상세설명 탭 숨김
  activeTab: controlledTab,   // ← [2026-07-06] 제어형(우측 버튼)
  onActiveTabChange,          // ← [2026-07-06]
  id,                         // ← [2026-07-06] 스크롤 앵커
}: ProductDetailTabsProps) {
  // 경매면 입찰내역, 바자회면 상세설명부터. 단 상세설명 탭이 숨겨지면(굿즈) 첫 노출 탭으로 폴백. // ← [2026-07-09]
  const [internalTab, setInternalTab] = useState<TabKey>(
    productType === 'auction' ? 'bids' : showDescriptionTab ? 'description' : 'delivery', // ← [2026-07-09] 숨김 시 '상품수령'
  );
  const activeTab = controlledTab ?? internalTab; // ← [2026-07-06] 제어형이면 외부값 우선
  const setActiveTab = (t: TabKey) => {           // ← [2026-07-06] 외부/내부 동기
    onActiveTabChange?.(t);
    if (controlledTab === undefined) setInternalTab(t);
  };

  const tabs: Array<{ key: TabKey; label: string; show: boolean }> = [
    { key: 'bids', label: '입찰내역', show: productType === 'auction' },
    { key: 'description', label: '상세설명', show: showDescriptionTab }, // ← [2026-07-06] true→prop(경매는 상단 이동으로 숨김)
    { key: 'delivery', label: '상품수령', show: true },
    { key: 'qa', label: 'Q&A', show: true },
  ];

  return (
    <div id={id} style={{ marginTop: 32, scrollMarginTop: 24 }}>
      {/* 탭 헤더 */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          borderBottom: '1px solid #e5e7eb',
          overflowX: 'auto',
        }}
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: '2px solid',
                borderColor: activeTab === t.key ? '#000' : 'transparent',
                color: activeTab === t.key ? '#000' : '#888',
                fontSize: 14,
                fontWeight: activeTab === t.key ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* 탭 본문 */}
      <div style={{ padding: '24px 0' }}>
        {activeTab === 'bids' && (
          <div>{bidsContent ?? <Empty text="입찰 내역이 없습니다." />}</div>
        )}
        {activeTab === 'description' && <DescriptionTab content={description} />}
        {activeTab === 'delivery' && <DeliveryTab />}
        {activeTab === 'qa' && <QATab productType={productType} productId={productId} />}
      </div>
    </div>
  );
}

// ============================================================================
// 상세설명 탭
// ============================================================================

function DescriptionTab({ content }: { content: string | null | undefined }) {
  if (!content?.trim()) {
    return <Empty text="상세 설명이 등록되지 않았습니다." />;
  }
  return <MarkdownRenderer content={content} />;
}

// ============================================================================
// 상품수령 탭 (어드민 설정 markdown)
// ============================================================================

function DeliveryTab() {
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSetting('delivery_info')
      .then((v) => setInfo(typeof v === 'string' ? v : null))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Empty text="불러오는 중…" />;
  if (!info?.trim()) return <Empty text="수령 안내가 등록되지 않았습니다." />;
  return <MarkdownRenderer content={info} />;
}

// ============================================================================
// Q&A 탭
// ============================================================================

function QATab({ productType, productId }: { productType: ProductType; productId: string }) {
  const { currentUser, isAdmin } = useCurrentUser();
  const [items, setItems] = useState<EsgProductQuestionRow[]>([]);
  const [avatarMap, setAvatarMap] = useState<Map<string, string | null>>(new Map()); // ← [추가] 질문자 user_id→avatar_url
  const [answersMap, setAnswersMap] = useState<Record<string, EsgProductQuestionAnswerRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    try {
      const qs = await loadQuestions(productType, productId);
      setItems(qs);
      // 질문 작성자 아바타 일괄 조회 (N+1 아님)
      const avatars = await loadAvatarMap(qs.map((q) => q.user_id)); // ← [추가]
      setAvatarMap(avatars);                                         // ← [추가]
      // 각 질문별 답변 로드 (병렬)
      const answersEntries = await Promise.all(
        qs.map(async (q): Promise<readonly [string, EsgProductQuestionAnswerRow[]]> => {
          try {
            const answers = await loadAnswers(q.id);
            return [q.id, answers];
          } catch {
            return [q.id, [] as EsgProductQuestionAnswerRow[]];
          }
        }),
      );
      const map: Record<string, EsgProductQuestionAnswerRow[]> = {};
      for (const [qid, ans] of answersEntries) map[qid] = ans;
      setAnswersMap(map);
    } catch (e) {
      console.error('[QATab] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    const cleanup = subscribeQuestions(productType, productId, reload);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, productId]);

  const handleSubmit = async () => {
    if (!newQuestion.trim()) {
      alert('질문 내용을 입력해주세요.');
      return;
    }
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }
    setSubmitting(true);
    try {
      await createQuestion({
        product_type: productType,
        product_id: productId,
        body: newQuestion.trim(),
        is_private: isPrivate,
      });
      setNewQuestion('');
      setIsPrivate(false);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* 새 질문 폼 */}
      {currentUser ? (
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <textarea
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="이 상품에 대해 궁금한 점을 질문해주세요"
            disabled={submitting}
            rows={3}
            maxLength={2000}
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                disabled={submitting}
              />
              비공개 (작성자와 어드민만 조회)
            </label>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !newQuestion.trim()}
              style={{
                padding: '8px 16px',
                background: submitting || !newQuestion.trim() ? '#ccc' : '#0ea5e9',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: submitting || !newQuestion.trim() ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {submitting ? '등록 중…' : '질문 등록'}
            </button>
          </div>
        </div>
      ) : (
        <Empty text="질문하려면 로그인이 필요합니다." />
      )}

      {/* 질문 목록 */}
      {loading ? (
        <Empty text="불러오는 중…" />
      ) : items.length === 0 ? (
        <Empty text="아직 등록된 질문이 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((q) => (
            <QuestionItem
              key={q.id}
              question={q}
              avatarUrl={q.user_id ? avatarMap.get(q.user_id) ?? null : null}
              answers={answersMap[q.id] ?? []}
              isOwner={currentUser?.id === q.user_id}
              isAdmin={isAdmin}
              onChange={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionItem({
  question,
  avatarUrl,
  answers,
  isOwner,
  isAdmin,
  onChange,
}: {
  question: EsgProductQuestionRow;
  avatarUrl: string | null; // ← [추가] 질문 작성자 아바타
  answers: EsgProductQuestionAnswerRow[];
  isOwner: boolean;
  isAdmin: boolean;
  onChange: () => void;
}) {
  const [showAnswerForm, setShowAnswerForm] = useState(false);
  const [answerBody, setAnswerBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAnswer = async () => {
    if (!answerBody.trim()) return;
    setSubmitting(true);
    try {
      await createAnswer({ question_id: question.id, body: answerBody.trim() });
      setAnswerBody('');
      setShowAnswerForm(false);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '답변 등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!confirm('질문을 삭제하시겠습니까?')) return;
    try {
      await deleteQuestion(question.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
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

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 14,
      }}
    >
      {/* 질문 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: question.status === 'answered' ? '#dcfce7' : '#fef3c7',
            color: question.status === 'answered' ? '#166534' : '#92400e',
          }}
        >
          {question.status === 'answered' ? '답변완료' : '대기중'}
        </span>
        {question.is_private && (
          <span style={{ fontSize: 11, color: '#888' }}>🔒 비공개</span>
        )}
        <UserChip
          name={question.user_name_snapshot}
          avatarUrl={avatarUrl}
          size={20}
          isMe={isOwner}
          nameSize={12}
        />{/* ← [수정] 공통 UserChip */}
        <span style={{ fontSize: 11, color: '#999' }}>
          · {formatRelativeTime(question.created_at)}
        </span>
        <div style={{ flex: 1 }} />
        {(isOwner || isAdmin) && (
          <button
            type="button"
            onClick={handleDeleteQuestion}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#bbb',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            삭제
          </button>
        )}
      </div>

      {/* 질문 본문 */}
      <div style={{ fontSize: 14, color: '#222', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {question.body}
      </div>

      {/* 답변 목록 */}
      {answers.length > 0 && (
        <div style={{ marginTop: 12, borderLeft: '3px solid #6DED73', paddingLeft: 12 }}>
          {answers.map((a) => (
            <div key={a.id} style={{ marginBottom: 10 }}>
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
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteAnswer(a.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#bbb',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    삭제
                  </button>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#222',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {a.body}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 답변 작성 (어드민) */}
      {isAdmin && (
        <div style={{ marginTop: 12 }}>
          {showAnswerForm ? (
            <div
              style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 6,
                padding: 10,
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
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAnswerForm(false);
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
                <button
                  type="button"
                  onClick={handleAnswer}
                  disabled={submitting || !answerBody.trim()}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: 4,
                    background: submitting || !answerBody.trim() ? '#ccc' : '#0ea5e9',
                    color: '#fff',
                    cursor: submitting || !answerBody.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {submitting ? '등록 중…' : '답변 등록'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAnswerForm(true)}
              style={{
                padding: '6px 12px',
                background: '#0ea5e9',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              + 답변 작성
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 공통
// ============================================================================

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 32,
        textAlign: 'center',
        color: '#999',
        fontSize: 13,
        background: '#fafafa',
        borderRadius: 8,
      }}
    >
      {text}
    </div>
  );
}
