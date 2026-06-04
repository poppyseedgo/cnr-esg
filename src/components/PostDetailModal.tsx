// ============================================================================
// PostDetailModal — 게시글 상세 모달 (페이지 대신)
//
// 사양:
//   - postId prop으로 받아 모달에서 로드
//   - max-height: 90vh, 내부 스크롤
//   - ESC/외부 클릭/X 버튼으로 닫기
//   - 이미지, 본문, 좋아요, 댓글 모두 표시
//   - 작성자/어드민이면 수정/삭제 가능
//   - 직접 URL 공유 필요 시 "전체 보기" 링크 제공
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { loadPost, deletePost, toggleLike, isLikedByMe } from '@/lib/posts';
import { loadAvatarMap } from '@/lib/profiles'; // ← [추가] 작성자 아바타 조회(SSOT)
import { UserChip } from '@/components/UserChip'; // ← [추가] 글쓴이 공통 컴포넌트
import { formatKSTFull } from '@/utils/time';
import { PostFormModal } from '@/components/PostFormModal';
import { CommentSection } from '@/components/CommentSection';
import type { EsgPostWithImagesRow } from '@/types/esg';

interface PostDetailModalProps {
  postId: string;
  open: boolean;
  onClose: () => void;
  /** 삭제 후 호출 (목록 새로고침 등) */
  onDeleted?: () => void;
}

export function PostDetailModal({ postId, open, onClose, onDeleted }: PostDetailModalProps) {
  const { currentUser, isAdmin } = useCurrentUser();
  const [post, setPost] = useState<EsgPostWithImagesRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageIdx, setImageIdx] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [authorAvatar, setAuthorAvatar] = useState<string | null>(null); // ← [추가] 작성자 아바타 URL

  const reload = async () => {
    if (!postId) return;
    try {
      setError(null);
      const p = await loadPost(postId);
      if (!p) {
        setError('게시글을 찾을 수 없습니다.');
      } else if (p.status === 'deleted') {
        setError('삭제된 게시글입니다.');
      } else {
        setPost(p);
        setImageIdx(0);
        // 작성자 아바타 (익명이면 user_id=null → 조회 안 됨 → null = 마스크)
        const map = await loadAvatarMap([p.user_id]);                  // ← [추가]
        setAuthorAvatar(p.user_id ? map.get(p.user_id) ?? null : null); // ← [추가]
        if (currentUser) {
          try {
            const isLiked = await isLikedByMe(p.id, currentUser.id);
            setLiked(isLiked);
          } catch (e) {
            console.error('[PostDetailModal] isLikedByMe error:', e);
          }
        }
      }
    } catch (e) {
      console.error('[PostDetailModal]', e);
      setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !postId) return;
    setLoading(true);
    setPost(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId, currentUser?.id]);

  // ESC + body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = orig;
    };
  }, [open, onClose]);

  if (!open) return null;

  const isOwner = !!(currentUser && post && currentUser.id === post.user_id);
  const canEdit = isOwner || isAdmin;
  const showRealName = isOwner || post?.is_anonymous === false;
  const authorName = showRealName
    ? post?.user_name ?? '익명'
    : '익명';

  const handleDelete = async () => {
    if (!post) return;
    if (!confirm('정말 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    setDeleting(true);
    try {
      await deletePost(post.id);
      onClose();
      onDeleted?.();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setDeleting(false);
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (!post || likeLoading) return;
    setLikeLoading(true);
    try {
      const result = await toggleLike(post.id, { id: currentUser.id, email: currentUser.email });
      setLiked(result === 'liked');
      // 카운트는 reload로 동기화 (간단)
      void reload();
    } catch (e) {
      console.error(e);
    } finally {
      setLikeLoading(false);
    }
  };

  const images = post?.images ?? [];
  const hasMultiple = images.length > 1;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid #eee',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
            {post?.category === 'zero_waste'
              ? '♻️ 제로 웨이스트'
              : post?.category === 'wise_life'
              ? '🤝 슬기로운 사회생활'
              : '게시글'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {post && (
              <Link
                to={`/posts/detail/${post.id}`}
                onClick={onClose}
                style={{
                  fontSize: 11,
                  color: '#0ea5e9',
                  textDecoration: 'none',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
                title="새 페이지에서 보기"
              >
                ↗ 전체 보기
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{
                width: 32,
                height: 32,
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 18,
                color: '#666',
                borderRadius: 6,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>불러오는 중…</div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{error}</div>
          ) : !post ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>게시글이 없습니다.</div>
          ) : (
            <div>
              {/* 제목 */}
              <h2 style={{ fontSize: 20, margin: '0 0 12px', fontWeight: 700 }}>
                {post.title}
              </h2>

              {/* 작성자 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 16,
                  fontSize: 12,
                  color: '#666',
                }}
              >
                <UserChip
                  name={authorName}
                  avatarUrl={authorAvatar}
                  size={28}
                  isMe={isOwner}
                  anonymous={!showRealName}
                  nameSize={12}
                  nameColor="#444"
                />{/* ← [수정] 공통 UserChip */}
                <span>·</span>
                <span>{formatKSTFull(post.created_at)}</span>
                {post.is_anonymous && (
                  <span
                    style={{
                      padding: '1px 6px',
                      background: '#f3f4f6',
                      borderRadius: 4,
                      fontSize: 10,
                    }}
                  >
                    🔒 익명
                  </span>
                )}
              </div>

              {/* 이미지 */}
              {images.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '4 / 3',
                      background: '#f5f5f5',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={images[imageIdx]?.url}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    {hasMultiple && (
                      <>
                        <button
                          type="button"
                          onClick={() => setImageIdx((i) => (i - 1 + images.length) % images.length)}
                          style={{
                            position: 'absolute',
                            left: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.5)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 16,
                          }}
                          aria-label="이전 이미지"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageIdx((i) => (i + 1) % images.length)}
                          style={{
                            position: 'absolute',
                            right: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.5)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 16,
                          }}
                          aria-label="다음 이미지"
                        >
                          ›
                        </button>
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 8,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            padding: '2px 10px',
                            borderRadius: 99,
                            fontSize: 11,
                          }}
                        >
                          {imageIdx + 1} / {images.length}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 본문 */}
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: '#222',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  marginBottom: 24,
                }}
              >
                {post.content}
              </div>

              {/* 좋아요 + 수정/삭제 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 24,
                  paddingTop: 12,
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <button
                  type="button"
                  onClick={handleLike}
                  disabled={likeLoading || !currentUser}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    background: liked ? '#fee2e2' : '#f5f5f5',
                    border: 'none',
                    borderRadius: 99,
                    cursor: currentUser ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    color: liked ? '#dc2626' : '#444',
                  }}
                >
                  {liked ? '❤️' : '🤍'} 좋아요 {post.like_count ?? 0}
                </button>

                {canEdit && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowEditModal(true)}
                      style={{
                        padding: '6px 12px',
                        background: '#fff',
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{
                        padding: '6px 12px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        borderRadius: 6,
                        cursor: deleting ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {deleting ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                )}
              </div>

              {/* 댓글 */}
              <CommentSection postId={post.id} />
            </div>
          )}
        </div>
      </div>

      {/* 수정 모달 */}
      {post && currentUser && showEditModal && (
        <PostFormModal
          category={post.category}
          initial={post}
          currentUser={currentUser}
          isAdminBypass={isAdmin && !isOwner}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}
