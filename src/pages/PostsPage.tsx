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
import { useParams, NavLink } from 'react-router-dom';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'; // ← [2026-06-04] 무한 스크롤
import { loadPosts, subscribePostsChanges, loadMyLikes, toggleLike } from '@/lib/posts';
import { loadAvatarMap } from '@/lib/profiles'; // ← [추가] 작성자 아바타 일괄 조회(SSOT)
import { PostListCard } from '@/components/PostListCard'; // ← [추가] Figma 기반 리스트 카드
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter'; // ← [2026-06-04] 무한 스크롤 하단 UI
import { formatKSTDate } from '@/utils/time';
import { PostFormModal } from '@/components/PostFormModal';
import { PostDetailModal } from '@/components/PostDetailModal';
import { ActivityGate } from '@/components/ActivityGate';
import { signInWithMicrosoft } from '@/lib/auth';
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
}

const CATEGORIES: CategoryMeta[] = [
  { key: 'zero_waste', activityKey: 'zero_waste', slug: 'zero-waste', label: '제로 웨이스트 어워드', emoji: '♻️' },
  { key: 'wise_life', activityKey: 'wise_life', slug: 'wise-life', label: '슬기로운 사회 생활 어워드', emoji: '🤝' },
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
      <h1 style={{ margin: '0 0 8px' }}>📝 ESG 어워드 게시판</h1>
      <p style={{ color: '#666', marginTop: 0 }}>카테고리별로 참여 기간이 다릅니다.</p>

      {/* 카테고리 탭 */}
      <CategoryTabs />

      {/* 선택된 카테고리 콘텐츠 */}
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
// 카테고리 탭
// ============================================================================

function CategoryTabs() {
  const { getActivity } = useEventPhase();
  return (
    <div style={{ display: 'flex', gap: 8, margin: '24px 0', flexWrap: 'wrap' }}>
      {CATEGORIES.map((c) => {
        const info = getActivity(c.activityKey);
        return (
          <NavLink
            key={c.key}
            to={`/posts/${c.slug}`}
            style={({ isActive }) => ({
              padding: '8px 14px',
              borderRadius: 20,
              background: isActive ? '#1a1a1a' : '#fff',
              color: isActive ? '#fff' : '#444',
              textDecoration: 'none',
              border: '1px solid',
              borderColor: isActive ? '#1a1a1a' : '#ddd',
              fontSize: 13,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            })}
          >
            {c.emoji} {c.label}
            {info.status === 'active' && (
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#10b981' }} />
            )}
            {info.status === 'closed' && (
              <span style={{ color: '#888', fontSize: 11 }}>· 종료</span>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

// ============================================================================
// 카테고리 콘텐츠 (목록 + 상태 안내 + 작성 버튼)
// ============================================================================

function CategoryContent({ meta }: { meta: CategoryMeta }) {
  const { getActivity, settings } = useEventPhase();
  const { currentUser, isAdmin } = useCurrentUser();
  const { period, status } = getActivity(meta.activityKey);

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

  // Realtime — 누가 글 쓰거나 지우면 처음부터 다시 로드
  useEffect(() => {
    const cleanup = subscribePostsChanges(() => {
      reload();
    });
    return cleanup;
  }, [reload]);

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
        reload(); // 서버 상태로 복구
      }
    },
    [currentUser, likedSet, setItems, reload]
  );

  return (
    <div>
      {/* 상태 안내 */}
      {period && (
        <StatusBanner
          status={status}
          period={period}
          postsEnabled={settings.posts_enabled !== false}
        />
      )}

      {/* 작성 버튼 / 로그인 안내 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '16px 0',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, color: '#666' }}>
          총 {posts.length}개의 게시글
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              padding: '8px 16px',
              background: isAdminBypass && status !== 'active' ? '#0ea5e9' : '#1a1a1a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {isAdminBypass && status !== 'active' ? '🔧 ADMIN · 글 쓰기' : '✏️ 글 쓰기'}
          </button>
        ) : (
          !currentUser && status === 'active' && (
            <button
              type="button"
              onClick={() => signInWithMicrosoft().catch(console.error)}
              style={{
                padding: '8px 16px',
                background: '#fff',
                color: '#444',
                border: '1px solid #ddd',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🔑 로그인하고 글쓰기
            </button>
          )
        )}
      </div>

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
          void reload();
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
            reload(); // 처음부터 다시 로드 → 새 글이 최상단(created_at desc)에 노출
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 보조 컴포넌트
// ============================================================================

function StatusBanner({
  status,
  period,
  postsEnabled,
}: {
  status: 'before' | 'active' | 'closed';
  period: { starts_at_utc: string; ends_at_utc: string; awards_date_kst?: string; note?: string };
  postsEnabled: boolean;
}) {
  const bg = !postsEnabled
    ? '#fee2e2'
    : status === 'active'
    ? '#dcfce7'
    : status === 'before'
    ? '#fef3c7'
    : '#f0f0f0';
  const color = !postsEnabled
    ? '#991b1b'
    : status === 'active'
    ? '#166534'
    : status === 'before'
    ? '#92400e'
    : '#666';

  return (
    <div
      style={{
        padding: 16,
        background: bg,
        color,
        borderRadius: 8,
        marginBottom: 0,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {!postsEnabled ? (
        <>🚫 <strong>게시글 작성이 일시 중단되었습니다</strong> (어드민 설정)</>
      ) : (
        <>
          {status === 'active' && (
            <>✅ <strong>참여 진행 중</strong> · {formatKSTDate(period.ends_at_utc)}까지</>
          )}
          {status === 'before' && (
            <>⏳ {formatKSTDate(period.starts_at_utc)}부터 참여 가능</>
          )}
          {status === 'closed' && (
            <>
              🏁 참여 기간이 종료되었습니다
              {period.awards_date_kst && <> · 🏆 {period.awards_date_kst} 시상</>}
            </>
          )}
          {period.note && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{period.note}</div>
          )}
        </>
      )}
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
