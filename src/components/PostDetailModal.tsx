// ============================================================================
// CHANGELOG
//   2026-06-11 (b)
//     - [디자인] Figma 903:492 모달 세부 요소 정밀 반영:
//         · 모달 radius 20→24 (헤더 rounded-top 24)
//         · 헤더: 카테고리를 라임 칩(zero_waste rgba(170,255,32,.6)/#333 14 SemiBold)으로,
//           닫기 ✕문자 → close.svg 20px(32×32 버튼), 헤더 하단 보더 제거
//         · 제목 24/700 → 36/500 #111 line-height 1.5
//         · 작성자: gap 20, "·" 제거, 이름 14/Regular/#111, 날짜 12/#c2c7d1
//         · 본문 14/1.7/#222 → 16/1.6/#343a3f, 하단 24 + 0.5px(#f1f5f9) 구분선
//         · 좋아요: 알약 #ffefef/#ff2e2e, heart 24, 14px (미좋아요는 #f1f1f1/#111 outline)
//         · 수정 border #111 / 삭제 border #ff6868, radius 12, px16 py8, 14px
//         · 좋아요행 하단 0.5px 구분선 + 20px devider(0.5px) 후 댓글
//         · [신규] 모달 하단 62px 화이트 페이드 그라데이션(스크롤 어피던스, pointer-events none)
//   2026-06-11
//     - [근본수정] 이미지가 aspect-ratio 4/3 + object-fit:cover로 강제 크롭되어 원본
//         위아래가 잘리던 컴플레인 → 공통 PostImageGallery로 교체. 대표 이미지는
//         원본 비율(height:auto)로 표시하고, 여러 장이면 우측 70×70 고정 썸네일 열 제공.
//         기존 좌우 화살표/단일 카운터 캐러셀 블록 제거(썸네일 클릭 전환 + 카운터 유지).
//     - [디자인] Figma node 903:492("조회 모달_이미지 있을 때 760")에 맞춰 모달
//         maxWidth 720 → 760 (갤러리 콘텐츠 폭 720 = 대표640 + gap10 + 썸네일70 정합).
//   2026-06-08
//     - [버그수정] 좋아요 하트가 눌린 표시가 안 되던 문제: 이모지(❤️/🤍)는 OS/폰트별
//         형태 차이가 미미해 toggle이 안 보임 → 카드와 동일한 하트 SVG로 교체
//         (미좋아요 outline / 좋아요 heart_filled #FF2E2E). liked 상태로 채움 토글.
//   2026-06-04 (c)
//     - [근본수정] 모달을 createPortal로 document.body 직속 렌더.
//         원인: 페이지 래퍼(.route-fade)의 transform 애니메이션이 fixed 자손의
//         컨테이닝 블록이 되어, 백드롭(dim)이 뷰포트가 아닌 본문 컬럼만 덮고
//         헤더/우측이 노출되던 z-index·dim 영역 버그. body 직속 렌더로 조상
//         transform 영향 원천 차단(중첩 PostFormModal도 동일 처리).
//     - [디자인] 백드롭에 frosted blur(3px, -webkit 포함) 추가 — 홈 모달과 톤 통일.
//   2026-06-04
//     - [버그수정] 중첩된 수정모달(PostFormModal) 내부 클릭(이미지 X·＋·파일선택)이
//         백드롭으로 버블되어 상세모달이 닫히던 문제: 백드롭 onClick에
//         e.target===e.currentTarget 가드 추가(직접 클릭에만 닫힘).
//     - [버그수정] 모달이 닫힐 때 showEditModal 미초기화 → 재오픈 시 수정모달이
//         떠 있던 문제: open=false 시 showEditModal 초기화.
// ============================================================================
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
import { createPortal } from 'react-dom'; // ← [추가] 모달을 body 직속으로 렌더(조상 transform 영향 차단)
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { loadPost, deletePost, toggleLike, isLikedByMe, subscribePostsChanges } from '@/lib/posts';
import { loadAvatarMap } from '@/lib/profiles'; // ← [추가] 작성자 아바타 조회(SSOT)
import { UserChip } from '@/components/UserChip'; // ← [추가] 글쓴이 공통 컴포넌트
import { formatKSTFull } from '@/utils/time';
import { PostFormModal } from '@/components/PostFormModal';
import { CommentSection } from '@/components/CommentSection';
import { PostImageGallery } from '@/components/PostImageGallery'; // ← [추가] 원본비율+썸네일 공통 갤러리
import type { EsgPostWithImagesRow } from '@/types/esg';

interface PostDetailModalProps {
  postId: string;
  open: boolean;
  onClose: () => void;
  /** 삭제 후 호출 (목록 새로고침 등) */
  onDeleted?: () => void;
  /** 좋아요 토글 시 호출 — 목록 카드 하트(likedSet) 동기화용 */
  onLikeChanged?: (postId: string, liked: boolean) => void;
}

// 좋아요 하트 SVG (카드와 동일 에셋) — 미좋아요 outline(#111) / 좋아요 heart_filled(#FF2E2E + 흰 하이라이트) ← [2026-06-09] FF2E65 → FF2E2E
function DetailLikeIcon({ filled, size = 18 }: { filled: boolean; size?: number }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M29 11.5192C29 19.6681 16.0022 27 16.0022 27C16.0022 27 3 19.6681 3 11.5192C3 8.13259 5.5185 5 9.29192 5C12.7778 5 16.0022 7.32828 16.0022 10.7021C16.0022 7.31558 19.2353 5 22.7124 5C26.4859 5 29 8.14528 29 11.5192Z"
          fill="#FF2E2E"
          stroke="#FF2E2E"
          strokeWidth="2"
          strokeMiterlimit="10"
        />
        <circle cx="22.5" cy="11.5" r="2.5" fill="white" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M29 11.5192C29 19.6681 16.0022 27 16.0022 27C16.0022 27 3 19.6681 3 11.5192C3 8.13259 5.5185 5 9.29192 5C12.7778 5 16.0022 7.32828 16.0022 10.7021C16.0022 7.31558 19.2353 5 22.7124 5C26.4859 5 29 8.14528 29 11.5192Z"
        stroke="#111"
        strokeWidth="2"
        strokeMiterlimit="10"
      />
    </svg>
  );
}

// 카테고리 칩 스타일 — Figma 903:493 (zero_waste 라임 정확값) + 카테고리 identity(wise_life)
const CATEGORY_PILL: Record<string, { label: string; bg: string; color: string }> = {
  zero_waste: { label: '제로 웨이스트', bg: 'rgba(170, 255, 32, 0.6)', color: '#333' }, // ← Figma 정확값
  wise_life: { label: '슬기로운 사회생활', bg: '#33a457', color: '#fff' },                // ← PostListCard와 통일
};

export function PostDetailModal({ postId, open, onClose, onDeleted, onLikeChanged }: PostDetailModalProps) {
  const { currentUser, isAdmin } = useCurrentUser();
  const [post, setPost] = useState<EsgPostWithImagesRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // 모달이 열린 동안 이 글의 변경(좋아요 수·댓글 수)만 조용히 반영.
  // reload()는 imageIdx 리셋·아바타 재조회로 깜빡임이 생기므로 카운트만 제자리 갱신.
  useEffect(() => {
    if (!open || !postId) return;
    const cleanup = subscribePostsChanges(async () => {
      try {
        const p = await loadPost(postId);
        if (p && p.status !== 'deleted') {
          setPost((prev) =>
            prev ? { ...prev, like_count: p.like_count, comment_count: p.comment_count } : prev
          );
        }
      } catch {
        /* 조용히 무시 */
      }
    }, { postId });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

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

  // 모달이 닫히면 편집 상태 초기화 (닫힌 뒤 재오픈 시 수정모달이 떠 있던 버그 방지)
  useEffect(() => {
    if (!open) setShowEditModal(false); // ← [추가]
  }, [open]);

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
      const nowLiked = result === 'liked';
      setLiked(nowLiked);
      // 카운트 제자리 갱신 (reload는 imageIdx 리셋·깜빡임 유발 → 사용 안 함)
      setPost((prev) =>
        prev ? { ...prev, like_count: Math.max(0, (prev.like_count ?? 0) + (nowLiked ? 1 : -1)) } : prev
      );
      onLikeChanged?.(post.id, nowLiked); // ← [2026-06-08] 목록 카드 하트(likedSet) 즉시 동기화
    } catch (e) {
      console.error(e);
    } finally {
      setLikeLoading(false);
    }
  };

  const images = post?.images ?? [];

  return createPortal(
    <div
      className="anim-backdrop"
      onClick={(e) => {
        // 백드롭 자체를 직접 클릭한 경우에만 닫기.
        // (중첩된 PostFormModal 내부 클릭이 버블되어 닫히던 버그 방지)
        if (e.target === e.currentTarget) onClose(); // ← [수정] 가드 추가
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)', // ← [추가] frosted dim (홈 모달과 톤 통일)
        WebkitBackdropFilter: 'blur(3px)', // ← [추가] Safari/iPad 대응
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
        className="anim-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 24, // ← [2026-06-11] Figma 헤더 rounded-top 24 (20→24)
          width: '100%',
          maxWidth: 760, // ← [2026-06-11] Figma node 903:492 "조회 모달...760" 정합(720→760)
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          position: 'relative', // ← [2026-06-11] 하단 페이드 그라데이션 absolute 기준
        }}
      >
        {/* 헤더 — Figma 903:493 (px20 py16, 카테고리 라임 칩 + 닫기 아이콘, 하단 보더 없음) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px', // ← [2026-06-11] Figma py16 px20 (14→16)
            flexShrink: 0,
          }}
        >
          {/* 카테고리 칩 */}
          {(() => {
            const pill = post?.category ? CATEGORY_PILL[post.category] : undefined; // ← 카테고리별 칩
            return (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3px 10px',                    // ← Figma px10 py3
                  borderRadius: 100,                      // ← Figma rounded-[100px]
                  background: pill?.bg ?? '#f1f1f1',      // ← 카테고리 색(미상시 중립)
                  color: pill?.color ?? '#555',
                  fontSize: 14,                           // ← Figma 14px
                  fontWeight: 600,                        // ← Figma SemiBold
                  lineHeight: 1.5,
                  whiteSpace: 'nowrap',
                }}
              >
                {pill?.label ?? '게시글'}
              </div>
            );
          })()}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {post && (
              <Link
                to={`/posts/detail/${post.id}`}
                onClick={onClose}
                style={{
                  fontSize: 11,
                  color: '#c2c7d1', // ← [2026-06-11] 톤 다운(기능 유지: URL 공유용 전체보기)
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
                width: 32,           // ← Figma close icon 32×32
                height: 32,
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: '50%', // ← Figma rounded-full
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src="/icons/close.svg" alt="" aria-hidden="true" width={20} height={20} style={{ display: 'block' }} />{/* ← Figma 20px close 아이콘 */}
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
              {/* 제목 — Figma 1331:35 (36px / Medium / #111 / lh 1.5) */}
              <h2 style={{ fontSize: 36, margin: '0 0 16px', fontWeight: 500, color: '#111', lineHeight: 1.5 }}>
                {post.title}
              </h2>

              {/* 작성자 — Figma 1331:62 (gap 20, 구분점 없음) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,          // ← Figma gap-[20px] (작성자 ↔ 날짜)
                  marginBottom: 16, // ← Figma Frame1 gap-16
                }}
              >
                <UserChip
                  name={authorName}
                  avatarUrl={authorAvatar}
                  size={28}
                  isMe={isOwner}
                  anonymous={!!post?.is_anonymous}
                  colorSeed={post.is_anonymous ? post.id : undefined}
                  gap={4}            // ← Figma 아바타↔이름 gap-4
                  nameSize={14}      // ← Figma 14px (12→14)
                  nameWeight={400}   // ← Figma Regular
                  nameColor="#111"   // ← Figma #111
                />
                <span style={{ fontSize: 12, color: '#c2c7d1', whiteSpace: 'nowrap' }}>
                  {formatKSTFull(post.created_at)}
                </span>{/* ← Figma 날짜 12px #c2c7d1, "·" 제거 */}
              </div>

              {/* 이미지 — 원본 비율 유지 + 여러 장이면 썸네일 열(공통 컴포넌트) ← [2026-06-11] */}
              {images.length > 0 && <PostImageGallery images={images} />}

              {/* 본문 — Figma 903:512 (16px / Regular / #343a3f / lh 1.6) + 하단 0.5px 구분선 */}
              <div
                style={{
                  fontSize: 16,                     // ← Figma 16px (14→16)
                  lineHeight: 1.6,                  // ← Figma lh 1.6
                  color: '#343a3f',                 // ← Figma #343a3f
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  paddingBottom: 24,                // ← Figma pb-24
                  borderBottom: '1px solid #f1f5f9',// ← Figma 본문 하단 구분선
                  marginBottom: 0,
                }}
              >
                {post.content}
              </div>

              {/* 좋아요 + 수정/삭제 — Figma 903:513/514 (py16, 하단 0.5px 구분선) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingTop: 16,                      // ← Figma py-16
                  paddingBottom: 16,                   // ← Figma py-16
                  borderBottom: '0.5px solid #f1f5f9', // ← Figma border-b 0.5px #f1f5f9
                }}
              >
                <button
                  type="button"
                  onClick={handleLike}
                  disabled={likeLoading || !currentUser}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,                                  // ← Figma gap-4
                    padding: '8px 16px',                     // ← Figma px16 py8
                    background: liked ? '#ffefef' : '#f1f1f1', // ← Figma 좋아요 #ffefef / 미좋아요 중립
                    border: 'none',
                    borderRadius: 999,                       // ← Figma rounded-999
                    cursor: currentUser ? 'pointer' : 'not-allowed',
                    fontSize: 14,                            // ← Figma 14px
                    fontWeight: 400,                         // ← Figma Regular
                    lineHeight: 1.3,
                    color: liked ? '#ff2e2e' : '#111',       // ← Figma #ff2e2e / 미좋아요 #111
                  }}
                >
                  <DetailLikeIcon filled={liked} size={24} />{/* ← Figma heart 24px */}
                  좋아요 {post.like_count ?? 0}
                </button>

                {canEdit && (
                  <div style={{ display: 'flex', gap: 8 }}>{/* ← Figma gap-8 */}
                    <button
                      type="button"
                      onClick={() => setShowEditModal(true)}
                      style={{
                        padding: '8px 16px',          // ← Figma px16 py8
                        background: '#fff',
                        border: '1px solid #111',     // ← Figma border black
                        borderRadius: 12,             // ← Figma rounded-12
                        cursor: 'pointer',
                        fontSize: 14,                 // ← Figma 14px
                        lineHeight: 1.5,
                        color: '#111',                // ← Figma #111
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{
                        padding: '8px 16px',          // ← Figma px16 py8
                        background: '#fff',
                        border: '1px solid #ff6868',  // ← Figma border #ff6868
                        color: '#ff6868',             // ← Figma #ff6868
                        borderRadius: 12,             // ← Figma rounded-12
                        cursor: deleting ? 'not-allowed' : 'pointer',
                        fontSize: 14,                 // ← Figma 14px
                        lineHeight: 1.5,
                      }}
                    >
                      {deleting ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                )}
              </div>

              {/* devider — Figma 903:521 (h20 + 하단 0.5px 구분선) */}
              <div style={{ height: 20, borderBottom: '0.5px solid #f1f5f9', marginBottom: 16 }} />

              {/* 댓글 */}
              <CommentSection postId={post.id} />
            </div>
          )}
        </div>

        {/* 하단 페이드 그라데이션 — Figma 903:522 (62px, 투명→흰색, 스크롤 어피던스) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 62,                                                         // ← Figma 62px
            background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fff 100%)', // ← Figma 그라데이션
            pointerEvents: 'none',                                              // ← 하위 클릭 통과(입력 방해 X)
          }}
        />
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
    </div>,
    document.body
  );
}
