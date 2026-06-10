// ============================================================================
// PostDetailPage — 게시글 상세
//
// 기능:
//   - 게시글 + 이미지 캐러셀 (단순 좌우 슬라이드)
//   - 작성자 정보 (익명/실명, 본인이면 실명 우선)
//   - 본인 또는 관리자면 수정/삭제 버튼
//   - 좋아요 버튼 (Phase 2-B에서 활성화, 현재는 disabled)
//   - 댓글 영역 (Phase 2-B에서 활성화)
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { loadPost, deletePost, toggleLike, isLikedByMe } from '@/lib/posts';
import { loadAvatarMap } from '@/lib/profiles'; // ← [추가] 작성자 아바타 조회(SSOT)
import { Avatar } from '@/components/Avatar';     // ← [추가]
import { formatKSTFull } from '@/utils/time';
import { PostFormModal } from '@/components/PostFormModal';
import { CommentSection } from '@/components/CommentSection';
import { signInWithMicrosoft } from '@/lib/auth';
import type { EsgPostCategory, EsgPostWithImagesRow } from '@/types/esg';

const CATEGORY_LABELS: Record<EsgPostCategory, string> = {
  zero_waste: '♻️ 제로 웨이스트 어워드',
  wise_life: '🤝 슬기로운 사회 생활 어워드',
};

const CATEGORY_SLUGS: Record<EsgPostCategory, string> = {
  zero_waste: 'zero-waste',
  wise_life: 'wise-life',
};

export function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
    if (!id) return;
    try {
      setError(null);
      const p = await loadPost(id);
      if (!p) {
        setError('게시글을 찾을 수 없습니다.');
      } else if (p.status === 'deleted') {
        setError('삭제된 게시글입니다.');
      } else {
        setPost(p);
        setImageIdx(0);
        // 작성자 아바타 (익명이면 user_id=null → null = 마스크)
        const avatarMap = await loadAvatarMap([p.user_id]);                  // ← [추가]
        setAuthorAvatar(p.user_id ? avatarMap.get(p.user_id) ?? null : null); // ← [추가]
        if (currentUser) {
          try {
            const isLiked = await isLikedByMe(p.id, currentUser.id);
            setLiked(isLiked);
          } catch (e) {
            console.error('[PostDetailPage] isLikedByMe error:', e);
          }
        }
      }
    } catch (e) {
      console.error('[PostDetailPage]', e);
      setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
        🌱 불러오는 중…
      </div>
    );
  }

  if (error || !post) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🚫</div>
        <h2>{error ?? '게시글을 찾을 수 없습니다'}</h2>
        <Link
          to="/posts"
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 20px',
            background: '#1a1a1a',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          게시판으로 돌아가기
        </Link>
      </div>
    );
  }

  // 권한: 본인 또는 관리자 (둘 다 수정/삭제 가능)
  const isMine = !!currentUser && post.user_id === currentUser.id;
  const canEdit = isMine || isAdmin;
  const canDelete = isMine || isAdmin;

  // 이미지 (없으면 cover 사용)
  const images = post.images?.length
    ? [...post.images].sort((a, b) => a.sort_order - b.sort_order)
    : post.cover_image_url
    ? [{ id: 'cover', url: post.cover_image_url, sort_order: 0 }]
    : [];

  // 작성자 표시 (본인이면 실명 우선, 익명 표시는 부가 정보)
  const displayName = isMine ? currentUser?.name ?? '본인' : post.user_name;
  const displayDept = post.is_anonymous && !isMine && !isAdmin ? null : post.user_dept;

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까? 삭제된 게시글은 복구할 수 없습니다.')) {
      return;
    }
    setDeleting(true);
    try {
      await deletePost(post.id);
      navigate(`/posts/${CATEGORY_SLUGS[post.category]}`);
    } catch (e) {
      console.error('[PostDetailPage] delete error:', e);
      alert('삭제에 실패했습니다.');
      setDeleting(false);
    }
  };

  return (
    <article style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link to="/posts" style={{ color: '#888', textDecoration: 'none' }}>
          📝 게시판
        </Link>
        <span style={{ color: '#bbb', margin: '0 6px' }}>›</span>
        <Link
          to={`/posts/${CATEGORY_SLUGS[post.category]}`}
          style={{ color: '#888', textDecoration: 'none' }}
        >
          {CATEGORY_LABELS[post.category]}
        </Link>
      </div>

      {/* 본문 카드 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {/* 이미지 캐러셀 */}
        {images.length > 0 && (
          <ImageCarousel
            images={images}
            currentIdx={imageIdx}
            onChange={setImageIdx}
          />
        )}

        {/* 헤더 */}
        <div style={{ padding: 24 }}>
          <h1 style={{ margin: '0 0 12px', fontSize: 22, lineHeight: 1.4 }}>
            {post.title}
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: 13,
              color: '#666',
              marginBottom: 24,
              paddingBottom: 16,
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                name={displayName}
                avatarUrl={authorAvatar}
                size={36}
                isMe={isMine}
                anonymous={post.is_anonymous && !isMine && !isAdmin}
              />{/* ← [추가] 작성자 아바타 */}
              <div>
                <strong style={{ color: '#222' }}>{displayName}</strong>
                {displayDept && (
                  <span style={{ marginLeft: 6, color: '#888' }}>· {displayDept}</span>
                )}
                {post.is_anonymous && (isMine || isAdmin) && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: '2px 6px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    익명
                  </span>
                )}
                <div style={{ marginTop: 2, color: '#aaa', fontSize: 12 }}>
                  {formatKSTFull(post.created_at)}
                  {post.updated_at !== post.created_at && (
                    <span style={{ marginLeft: 6 }}>(수정됨)</span>
                  )}
                </div>
              </div>
            </div>
            {(canEdit || canDelete) && (
              <div style={{ display: 'flex', gap: 6 }}>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowEditModal(true)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #ddd',
                      background: '#fff',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    수정
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #fecaca',
                      background: '#fff',
                      color: '#991b1b',
                      borderRadius: 6,
                      cursor: deleting ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {deleting ? '삭제 중…' : '삭제'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 본문 */}
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              color: '#222',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {post.content}
          </div>
        </div>

        {/* 좋아요 */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={async () => {
              if (!currentUser) {
                signInWithMicrosoft().catch(console.error);
                return;
              }
              if (!post || likeLoading) return;
              setLikeLoading(true);
              // 낙관적 업데이트: 먼저 UI 반영
              const willBeLiked = !liked;
              setLiked(willBeLiked);
              setPost({
                ...post,
                like_count: Math.max(0, post.like_count + (willBeLiked ? 1 : -1)),
              });
              try {
                const result = await toggleLike(post.id, {
                  id: currentUser.id,
                  email: currentUser.email,
                });
                // 서버 결과로 보정 (혹시 결과가 다르면)
                setLiked(result === 'liked');
              } catch (e) {
                console.error('[PostDetailPage] toggleLike error:', e);
                // rollback
                setLiked(!willBeLiked);
                setPost({
                  ...post,
                  like_count: Math.max(0, post.like_count + (willBeLiked ? -1 : 1)),
                });
                alert('좋아요 처리에 실패했습니다.');
              } finally {
                setLikeLoading(false);
              }
            }}
            disabled={likeLoading}
            style={{
              padding: '8px 16px',
              border: '1px solid',
              borderColor: liked ? '#ef4444' : '#eee',
              background: liked ? '#fef2f2' : '#fff',
              color: liked ? '#ef4444' : '#444',
              borderRadius: 20,
              cursor: likeLoading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
            aria-label={liked ? '좋아요 취소' : '좋아요'}
          >
            {liked ? '♥' : '♡'} 좋아요 {post.like_count}
          </button>
          <span style={{ color: '#aaa', fontSize: 12 }}>· 💬 댓글 {post.comment_count}</span>
        </div>
      </div>

      {/* 댓글 영역 */}
      <CommentSection postId={post.id} />

      {/* 수정 모달 */}
      {showEditModal && currentUser && (
        <PostFormModal
          category={post.category}
          initial={post}
          currentUser={currentUser}
          isAdminBypass={isAdmin && !isMine}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setShowEditModal(false);
            setPost(updated);
          }}
        />
      )}
    </article>
  );
}

// ============================================================================
// 이미지 캐러셀 (단순 좌우 슬라이드)
// ============================================================================

interface CarouselProps {
  images: Array<{ id: string; url: string; sort_order: number }>;
  currentIdx: number;
  onChange: (idx: number) => void;
}

function ImageCarousel({ images, currentIdx, onChange }: CarouselProps) {
  const goPrev = () => onChange((currentIdx - 1 + images.length) % images.length);
  const goNext = () => onChange((currentIdx + 1) % images.length);
  const single = images.length === 1;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        background: '#000',
        aspectRatio: '4 / 3',
        overflow: 'hidden',
      }}
    >
      <img
        src={images[currentIdx].url}
        alt={`이미지 ${currentIdx + 1}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {!single && (
        <>
          {/* 좌우 버튼 */}
          <button
            type="button"
            onClick={goPrev}
            aria-label="이전 이미지"
            style={{
              ...arrowStyle,
              left: 12,
            }}
          >
            <img src="/icons/arrow-back.svg" alt="" aria-hidden="true" width={24} height={24} style={{ display: 'block' }} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="다음 이미지"
            style={{
              ...arrowStyle,
              right: 12,
            }}
          >
            <img src="/icons/arrow-forward.svg" alt="" aria-hidden="true" width={24} height={24} style={{ display: 'block' }} />
          </button>

          {/* 인디케이터 */}
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 6,
            }}
          >
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(i)}
                aria-label={`이미지 ${i + 1}로 이동`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  padding: 0,
                  background: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// [2026-06-10] 갤러리 화살표: 64×64 검정 글래스 (흰 아이콘용, 반투명) 버튼 (상품 갤러리와 통일)
const arrowStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 64,
  height: 64,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(0, 0, 0, 0.4)',     // 검정 글래스 (흰 아이콘용, 반투명)
  backdropFilter: 'blur(12px)',                // glass 효과
  WebkitBackdropFilter: 'blur(12px)',          // Safari
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',  // 이미지 위 분리감
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};
