// ============================================================================
// PostsPage — 게시판 허브 (3개 카테고리)
//
// 기능:
//   - 카테고리 탭 (활성 상태 표시 + 시상 표시)
//   - 카테고리별 게시글 카드 그리드
//   - 작성 버튼 (로그인 + 카테고리 active + posts_enabled 시에만)
//   - 작성 모달
//   - Realtime 갱신 (다른 사람이 글 쓰면 자동 반영)
//
// 카테고리 선택 안 됐을 때는 안내 화면.
// ============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, NavLink, useSearchParams } from 'react-router-dom';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'; // ← [2026-06-04] 무한 스크롤
import { loadPosts, subscribePostsChanges, loadMyLikes, toggleLike } from '@/lib/posts';
import { loadAvatarMap } from '@/lib/profiles'; // ← [추가] 작성자 아바타 일괄 조회(SSOT)
import { PostListCard } from '@/components/PostListCard'; // ← [추가] Figma 기반 리스트 카드
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter'; // ← [2026-06-04] 무한 스크롤 하단 UI
import { PostFormModal } from '@/components/PostFormModal';
import { PostDetailModal } from '@/components/PostDetailModal';
import { ActivityGate } from '@/components/ActivityGate';
import { signInWithMicrosoft } from '@/lib/auth';
import type { EventModalKey } from '@/components/home/eventModalContent'; // ← [2026-06-05] 가이드 모달 키
import type {
  EsgActivityKey,
  EsgPostCategory,
  EsgPostWithImagesRow,
} from '@/types/esg';

interface CategoryMeta {
  key: EsgPostCategory;
  activityKey: EsgActivityKey;
  slug: string;
  label: string;
  emoji: string;
  /** Figma 헤더용 짧은 라벨(탭/타이틀/가이드 공통 어간) — 예: '제로 웨이스트' */
  tab: string;
  /** 가이드 버튼이 여는 행사안내 모달 키(포스터와 동일) */
  modalKey: EventModalKey;
}

const CATEGORIES: CategoryMeta[] = [
  { key: 'zero_waste', activityKey: 'zero_waste', slug: 'zero-waste', label: '제로 웨이스트 어워드', emoji: '♻️', tab: '제로 웨이스트', modalKey: 'zero' },
  { key: 'wise_life', activityKey: 'wise_life', slug: 'wise-life', label: '슬기로운 사회 생활 어워드', emoji: '🤝', tab: '슬기로운 사회생활', modalKey: 'wise' },
];

// ============================================================================
// 무한 스크롤 페이지 크기 — 2·3·4열 그리드에 깔끔히 맞는 12개씩 로드
// ============================================================================
const POSTS_PAGE_SIZE = 12;

export function PostsPage() {
  const { category: slug } = useParams();
  const current = CATEGORIES.find((c) => c.slug === slug);

  return (
    <div>
      {/* 선택된 카테고리 콘텐츠 (헤더=타이틀/탭/카운트/가이드/글쓰기는 CategoryContent 내부) */}
      {current ? (
        <ActivityGate activityKey={current.activityKey}>
          <CategoryContent meta={current} />
        </ActivityGate>
      ) : (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            color: '#999',
            marginTop: 24,
          }}
        >
          위 탭에서 카테고리를 선택해주세요.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 카테고리 콘텐츠 (목록 + 상태 안내 + 작성 버튼)
// ============================================================================

function CategoryContent({ meta }: { meta: CategoryMeta }) {
  const { getActivity, settings } = useEventPhase();
  const { currentUser, isAdmin } = useCurrentUser();
  const { status } = getActivity(meta.activityKey);

  // 무한 스크롤 — 카테고리별 12개씩 누적 로드 (created_at desc)
  const fetchPage = useCallback(
    (offset: number, limit: number) => loadPosts(meta.key, { offset, limit }),
    [meta.key]
  );
  const {
    items: posts,
    initialLoading,
    loadingMore,
    error,
    sentinelRef,
    reload,
    refresh,
    setItems,
  } = useInfiniteScroll<EsgPostWithImagesRow>(fetchPage, {
    pageSize: POSTS_PAGE_SIZE,
    deps: [meta.key],
  });

  const [avatarMap, setAvatarMap] = useState<Map<string, string | null>>(new Map()); // 작성자 user_id→avatar_url
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set()); // 내가 좋아요 누른 post id
  const [showForm, setShowForm] = useState(false);
  /** 모달로 열 게시글 ID (게시글 카드 클릭 시 set) */
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // 작성 가능 여부 (프론트 가드)
  const isAdminBypass = isAdmin;
  const canCreate = useMemo(() => {
    if (!currentUser) return false;
    if (isAdminBypass) return true;
    if (status !== 'active') return false;
    if (settings.posts_enabled === false) return false;
    return true;
  }, [currentUser, status, settings.posts_enabled, isAdminBypass]);

  // 로드된 게시글의 아바타 + 내 좋아요 동기화.
  // 게시글 "ID 집합"이 바뀔 때만 재조회 → 좋아요 토글(like_count만 변경) 시 재조회 안 함(깜빡임 방지).
  const idsKey = posts.map((p) => p.id).join(',');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const map = await loadAvatarMap(posts.map((p) => p.user_id)); // N+1 아님
        if (!cancelled) setAvatarMap(map);
        if (currentUser) {
          const liked = await loadMyLikes(posts.map((p) => p.id), currentUser.id);
          if (!cancelled) setLikedSet(liked);
        } else if (!cancelled) {
          setLikedSet(new Set());
        }
      } catch (e) {
        console.error('[PostsPage] meta(avatar/like) load error:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, currentUser]);

  // Realtime — 누가 글 쓰거나 지우면 조용히 제자리 갱신(깜빡임 없음)
  useEffect(() => {
    const cleanup = subscribePostsChanges(() => {
      refresh();
    });
    return cleanup;
  }, [refresh]);

  // 리스트에서 좋아요 토글 (낙관적 업데이트 → 실패 시 reload 복구)
  const handleToggleLike = useCallback(
    async (postId: string) => {
      if (!currentUser) {
        signInWithMicrosoft().catch(console.error); // 비로그인 → 로그인 유도
        return;
      }
      const wasLiked = likedSet.has(postId);
      setLikedSet((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, like_count: Math.max(0, p.like_count + (wasLiked ? -1 : 1)) }
            : p
        )
      );
      try {
        await toggleLike(postId, { id: currentUser.id, email: currentUser.email });
      } catch (e) {
        console.error('[PostsPage] toggleLike error:', e);
        refresh(); // 서버 상태로 조용히 복구
      }
    },
    [currentUser, likedSet, setItems, refresh]
  );

  // 가이드 버튼 → 포스터와 동일한 행사안내 모달 오픈 (?modal=zero|wise, GlobalEventModal이 렌더)
  const [, setSearchParams] = useSearchParams();
  const handleGuide = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('modal', meta.modalKey);
        return next;
      },
      { replace: false } // history push → 뒤로가기로 닫힘
    );
  }, [setSearchParams, meta.modalKey]);

  // 글쓰기 버튼 → 비로그인 로그인 유도 / 작성가능 폼 / 그 외 안내
  const handleWriteClick = useCallback(() => {
    if (!currentUser) {
      signInWithMicrosoft().catch(console.error);
      return;
    }
    if (canCreate) {
      setShowForm(true);
      return;
    }
    alert(
      settings.posts_enabled === false
        ? '현재 게시글 작성이 일시 중지되었습니다.'
        : '지금은 글을 작성할 수 있는 기간이 아닙니다.'
    );
  }, [currentUser, canCreate, settings.posts_enabled]);

  return (
    <div>
      {/* Figma 헤더: 타이틀 + 탭 + (카운트 / 가이드·글쓰기) */}
      <PostsHeader meta={meta} count={posts.length} onGuide={handleGuide} onWrite={handleWriteClick} />

      {/* 목록 */}
      {initialLoading ? (
        <PostsSkeleton />
      ) : error && posts.length === 0 ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : posts.length === 0 ? (
        <EmptyState canCreate={canCreate} onCreate={() => setShowForm(true)} />
      ) : (
        <>
          <PostGrid
            posts={posts}
            avatarMap={avatarMap}
            currentUserId={currentUser?.id ?? null}
            isAdmin={isAdmin}
            likedSet={likedSet}
            onToggleLike={handleToggleLike}
            onPostClick={(id) => setSelectedPostId(id)}
          />
          {/* 무한 스크롤: 바닥 감지 sentinel + 로딩/에러 */}
          <InfiniteScrollFooter
            sentinelRef={sentinelRef}
            loadingMore={loadingMore}
            error={posts.length > 0 ? error : null}
            onRetry={reload}
          />
        </>
      )}

      {/* 게시글 상세 모달 */}
      <PostDetailModal
        postId={selectedPostId ?? ''}
        open={!!selectedPostId}
        onClose={() => setSelectedPostId(null)}
        onDeleted={() => {
          setSelectedPostId(null);
          refresh();
        }}
      />

      {/* 작성 모달 */}
      {showForm && currentUser && (
        <PostFormModal
          category={meta.key}
          currentUser={currentUser}
          isAdminBypass={isAdminBypass && status !== 'active'}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh(); // 새 글이 최상단(created_at desc)에 조용히 반영
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 보조 컴포넌트
// ============================================================================

// ============================================================================
// 게시판 헤더 (Figma node 1194:384 / 1194:455 정밀 반영)
//   구조: 흰 컨테이너 > [타이틀 row | 탭 row | 카운트·액션 row], 각 row padding 20
//   - 타이틀: Pretendard Regular 36 / lh 1.25 / #000  ("{카테고리} 어워드")
//   - 탭(pill): px20 py12 radius999 border#000, 활성=검정배경+흰글씨 / Medium 16 lh1.2
//   - 카운트: Medium 14 lh1.2 #000 (좌) / 액션: gap12 (우)
//   - 버튼: px24 py16 radius16 border#000, 가이드=흰배경/글쓰기=검정배경 / Medium 18 lh1.2
//   가이드 버튼 → 포스터와 동일한 행사안내 모달(?modal=zero|wise)
// ============================================================================

function PostsHeader({
  meta,
  count,
  onGuide,
  onWrite,
}: {
  meta: CategoryMeta;
  count: number;
  onGuide: () => void;
  onWrite: () => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      {/* 타이틀 row */}
      <div style={{ padding: 20 }}>
        <h1
          style={{
            margin: 0,
            fontWeight: 400,
            fontSize: 'clamp(26px, 4.5vw, 36px)',
            lineHeight: 1.25,
            color: '#000',
          }}
        >
          {meta.tab} 어워드
        </h1>
      </div>

      {/* 탭 row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => {
          const active = c.key === meta.key;
          return (
            <NavLink
              key={c.key}
              to={`/posts/${c.slug}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 20px',
                borderRadius: 999,
                border: '1px solid #000',
                background: active ? '#000' : '#fff',
                color: active ? '#fff' : '#000',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: 16,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              {c.tab} 어워드
            </NavLink>
          );
        })}
      </div>

      {/* 카운트 / 액션 row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 20,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <p style={{ margin: 0, fontWeight: 500, fontSize: 14, lineHeight: 1.2, color: '#000' }}>
          총 {count}개의 게시글
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onGuide}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 24px',
              borderRadius: 16,
              border: '1px solid #000',
              background: '#fff', // ← [2026-06-05] 가이드 배경 화이트
              color: '#000',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 16, // ← [2026-06-05] 18 → 16
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            {meta.tab} 가이드
          </button>
          <button
            type="button"
            onClick={onWrite}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 24px',
              borderRadius: 16,
              border: 'none', // ← [2026-06-05] Figma 1197:52 테두리 없음
              background: '#99f75d', // ← [2026-06-05] 라임 그린
              color: '#000', // ← [2026-06-05] 검정 글자
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 16, // ← [2026-06-05] 18 → 16
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            글 쓰기
          </button>
        </div>
      </div>
    </div>
  );
}

function PostGrid({
  posts,
  avatarMap,
  currentUserId,
  isAdmin,
  likedSet,
  onToggleLike,
  onPostClick,
}: {
  posts: EsgPostWithImagesRow[];
  avatarMap: Map<string, string | null>; // ← [추가] user_id→avatar_url
  currentUserId: string | null;
  isAdmin: boolean;
  likedSet: Set<string>; // ← [추가]
  onToggleLike: (postId: string) => void; // ← [추가]
  onPostClick: (id: string) => void;
}) {
  return (
    <div
      className="post-grid"
      style={{ display: 'grid', gap: 16 }}
    >
      {posts.map((p) => (
        <PostListCard
          key={p.id}
          post={p}
          avatarUrl={p.user_id ? avatarMap.get(p.user_id) ?? null : null}
          isMine={!!currentUserId && p.user_id === currentUserId}
          isAdmin={isAdmin}
          liked={likedSet.has(p.id)}
          likeCount={p.like_count}
          onToggleLike={onToggleLike}
          onClick={() => onPostClick(p.id)}
        />
      ))}
    </div>
  );
}

// 무한 스크롤 하단 로딩 표시
function PostsSkeleton() {
  return (
    <div
      className="post-grid"
      style={{ display: 'grid', gap: 16 }}
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="post-card"
          style={{
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #eee',
            overflow: 'hidden',
          }}
        >
          <div style={{ aspectRatio: '16 / 9', background: '#f5f5f5' }} />
          <div style={{ padding: 16 }}>
            <div style={{ height: 14, background: '#f0f0f0', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 14, background: '#f0f0f0', borderRadius: 4, width: '70%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 48,
        textAlign: 'center',
        border: '1px dashed #ddd',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📭</div>
      <h3 style={{ margin: '0 0 8px' }}>아직 게시글이 없어요</h3>
      <p style={{ color: '#888', marginBottom: 24 }}>
        첫 번째 게시글을 작성해보세요.
      </p>
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          style={{
            padding: '10px 20px',
            background: '#1a1a1a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ✏️ 글 쓰기
        </button>
      )}
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        background: '#fee2e2',
        color: '#991b1b',
        padding: 16,
        borderRadius: 8,
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 8 }}>⚠️ {message}</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '6px 14px',
          background: '#fff',
          border: '1px solid #fecaca',
          color: '#991b1b',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
