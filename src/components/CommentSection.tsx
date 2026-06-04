// ============================================================================
// CHANGELOG
//   2026-06-04
//     - [수정] 댓글 작성자 아바타 = profiles.avatar_url 적용 (C&R Space와 동일)
//         · 손수 만든 이니셜 원 제거 → 공통 <Avatar> 컴포넌트로 교체
//         · esg_profile_public에서 작성자 아바타 일괄 조회(loadAvatarMap, N+1 아님)
//         · 익명 댓글은 view에서 user_id=null → 아바타 미조회(유출 없음)
// ============================================================================

// ============================================================================
// CommentSection — 게시글 상세 페이지의 댓글 영역
//
// 기능:
//   - 댓글 목록 (published만, 오래된 순)
//   - 작성 폼 (로그인 + comments_enabled일 때만)
//   - 익명 토글
//   - 본인/관리자만 삭제 버튼
//   - Realtime 구독 (다른 사람이 댓글 쓰면 즉시 반영)
//
// 디자인은 Phase 6에서 피그마 기반 교체.
// ============================================================================

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventPhase } from '@/hooks/useEventPhase';
import {
  loadComments,
  createComment,
  deleteComment,
  subscribeComments,
} from '@/lib/comments';
import { loadAvatarMap } from '@/lib/profiles';  // ← [추가] 작성자 아바타 일괄 조회(SSOT)
import { Avatar } from '@/components/Avatar';      // ← [추가] 공통 아바타 컴포넌트
import { signInWithMicrosoft } from '@/lib/auth';
import { formatKSTFull } from '@/utils/time';
import type { EsgCommentPublicRow } from '@/types/esg';

const MAX_CONTENT = 1000;

interface CommentSectionProps {
  postId: string;
}

export function CommentSection({ postId }: CommentSectionProps) {
  const { currentUser, isAdmin } = useCurrentUser();
  const { settings } = useEventPhase();

  const [comments, setComments] = useState<EsgCommentPublicRow[]>([]);
  const [avatarMap, setAvatarMap] = useState<Map<string, string | null>>(new Map());  // ← [추가] user_id→avatar_url
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 작성 폼 상태
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 어드민은 comments_enabled 무관 항상 작성 가능
  const commentsEnabled = settings.comments_enabled !== false || isAdmin; // 기본 true
  const isAdminBypass = settings.comments_enabled === false && isAdmin;

  // 목록 로드
  const reload = async () => {
    try {
      setError(null);
      const list = await loadComments(postId);
      setComments(list);
      // 작성자 아바타 일괄 조회 (익명은 user_id=null이라 자동 제외 → 유출 없음)
      const map = await loadAvatarMap(list.map((c) => c.user_id));  // ← [추가] 아바타 일괄 로드(N+1 아님)
      setAvatarMap(map);                                            // ← [추가]
    } catch (e) {
      console.error('[CommentSection] load error:', e);
      setError(e instanceof Error ? e.message : '댓글을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // Realtime 구독
  useEffect(() => {
    const cleanup = subscribeComments(postId, () => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // 댓글 작성
  const handleSubmit = async () => {
    if (!currentUser) return;
    setSubmitError(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setSubmitError('댓글 내용을 입력하세요.');
      return;
    }
    if (trimmed.length > MAX_CONTENT) {
      setSubmitError(`댓글은 ${MAX_CONTENT}자 이내여야 합니다.`);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createComment(
        {
          id: currentUser.id,
          email: currentUser.email,
          name: currentUser.name,
          dept: currentUser.dept,
        },
        {
          post_id: postId,
          content: trimmed,
          is_anonymous: isAnonymous,
        }
      );
      // 새 댓글 즉시 표시 (Realtime이 갱신할 때까지 기다리지 않고)
      setComments((prev) =>
        prev.find((c) => c.id === created.id) ? prev : [...prev, created]
      );
      setContent('');
      setIsAnonymous(false);
    } catch (e) {
      console.error('[CommentSection] submit error:', e);
      setSubmitError(e instanceof Error ? e.message : '댓글 작성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // 댓글 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await deleteComment(id);
      // 즉시 목록에서 제거
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error('[CommentSection] delete error:', e);
      alert('삭제에 실패했습니다.');
    }
  };

  return (
    <section
      style={{
        marginTop: 24,
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>
        💬 댓글 <span style={{ color: '#888', fontWeight: 400 }}>({comments.length})</span>
      </h2>

      {/* 댓글 비활성 안내 (일반 사용자에게만) */}
      {settings.comments_enabled === false && !isAdmin && (
        <div
          style={{
            padding: 12,
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          🚫 댓글 작성이 일시 중단되었습니다 (관리자 설정)
        </div>
      )}

      {/* 어드민 우회 안내 */}
      {isAdminBypass && (
        <div
          style={{
            padding: 12,
            background: '#f0f9ff',
            color: '#0c4a6e',
            borderRadius: 8,
            fontSize: 12,
            marginBottom: 16,
            border: '1px solid #bae6fd',
          }}
        >
          <strong style={{ color: '#0ea5e9' }}>🔧 ADMIN</strong> · 댓글 작성이 비상 차단된 상태이지만
          관리자 권한으로 작성 가능합니다.
        </div>
      )}

      {/* 작성 폼 */}
      {currentUser ? (
        commentsEnabled && (
          <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CONTENT}
              placeholder="댓글을 입력하세요"
              rows={3}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 14,
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: '#666',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  disabled={submitting}
                  style={{ cursor: 'inherit' }}
                />
                익명으로 작성
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  {content.length} / {MAX_CONTENT}
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !content.trim()}
                  style={{
                    padding: '8px 16px',
                    background: submitting || !content.trim() ? '#ccc' : '#1a1a1a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: submitting || !content.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {submitting ? '작성 중…' : '댓글 작성'}
                </button>
              </div>
            </div>
            {submitError && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{submitError}</div>
            )}
          </div>
        )
      ) : (
        <div
          style={{
            padding: 16,
            background: '#f5f5f5',
            borderRadius: 8,
            textAlign: 'center',
            color: '#666',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          댓글을 작성하려면{' '}
          <button
            type="button"
            onClick={() => signInWithMicrosoft().catch(console.error)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0ea5e9',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: 'inherit',
              padding: 0,
            }}
          >
            로그인
          </button>
          하세요
        </div>
      )}

      {/* 댓글 목록 */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
          댓글을 불러오는 중…
        </div>
      ) : error ? (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      ) : comments.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#bbb', fontSize: 13 }}>
          아직 댓글이 없습니다. 첫 번째 댓글을 작성해보세요.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              avatarUrl={c.user_id ? avatarMap.get(c.user_id) ?? null : null}
              isMine={!!currentUser && c.user_id === currentUser.id}
              isAdmin={isAdmin}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// CommentItem
// ============================================================================

function CommentItem({
  comment,
  avatarUrl,
  isMine,
  isAdmin,
  onDelete,
}: {
  comment: EsgCommentPublicRow;
  avatarUrl: string | null;  // ← [추가] 작성자 아바타 URL (익명/없으면 null)
  isMine: boolean;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}) {
  const canDelete = isMine || isAdmin;
  // 본인 댓글이고 익명이면 "본인 (익명)" 표시, 아니면 view의 user_name 그대로
  const displayName = comment.user_name;
  const displayDept = comment.is_anonymous && !isMine && !isAdmin ? null : comment.user_dept;

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {/* 아바타 — 공통 Avatar 컴포넌트 (이미지→실패시 이니셜→익명시 마스크) */}
      <Avatar
        name={displayName}
        avatarUrl={avatarUrl}
        size={36}
        isMe={isMine}
        anonymous={comment.is_anonymous}
        colorSeed={comment.is_anonymous ? comment.id : undefined}
      />{/* ← [수정] 손수 만든 이니셜 원 제거 → 프로필 이미지 적용 */}

      {/* 내용 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
            flexWrap: 'wrap',
            fontSize: 13,
          }}
        >
          <strong style={{ color: '#222' }}>{displayName}</strong>
          {displayDept && <span style={{ color: '#888' }}>· {displayDept}</span>}
          <span style={{ color: '#aaa', fontSize: 11, marginLeft: 'auto' }}>
            {formatKSTFull(comment.created_at)}
            {comment.updated_at !== comment.created_at && (
              <span style={{ marginLeft: 4 }}>(수정됨)</span>
            )}
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            color: '#222',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {comment.content}
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(comment.id)}
            style={{
              marginTop: 6,
              background: 'none',
              border: 'none',
              color: '#aaa',
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
