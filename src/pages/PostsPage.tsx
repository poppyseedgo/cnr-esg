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

import { useEffect, useMemo, useState, useCallback, createContext, useContext } from 'react';
import { useNavigate, useParams, NavLink } from 'react-router-dom';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { loadPosts, subscribePostsChanges } from '@/lib/posts';
import { formatKSTDate, formatKSTFull } from '@/utils/time';
import { PostFormModal } from '@/components/PostFormModal';
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
// 카테고리별 게시글 캐시 (탭 전환 시 깜빡임 방지)
//
// 전략:
//   - 부모 PostsPage에서 Map으로 보관 → 탭 전환해도 캐시 유지
//   - CategoryContent는 캐시 있으면 즉시 표시 + 백그라운드 refresh
//   - 첫 로드 (캐시 미존재)일 때만 skeleton 표시
// ============================================================================

type PostsCache = Map<EsgPostCategory, EsgPostWithImagesRow[]>;

interface PostsCacheContextValue {
  cache: PostsCache;
  setCacheFor: (key: EsgPostCategory, posts: EsgPostWithImagesRow[]) => void;
}

const PostsCacheContext = createContext<PostsCacheContextValue | null>(null);

function usePostsCache() {
  const ctx = useContext(PostsCacheContext);
  if (!ctx) throw new Error('PostsCacheContext not provided');
  return ctx;
}

export function PostsPage() {
  const { category: slug } = useParams();
  const current = CATEGORIES.find((c) => c.slug === slug);

  // 카테고리별 캐시 (탭 전환 시 깜빡임 방지)
  const [cache, setCache] = useState<PostsCache>(() => new Map());
  const setCacheFor = useCallback(
    (key: EsgPostCategory, posts: EsgPostWithImagesRow[]) => {
      setCache((prev) => {
        const next = new Map(prev);
        next.set(key, posts);
        return next;
      });
    },
    []
  );

  const cacheValue = useMemo<PostsCacheContextValue>(
    () => ({ cache, setCacheFor }),
    [cache, setCacheFor]
  );

  return (
    <PostsCacheContext.Provider value={cacheValue}>
      <div>
        <h1 style={{ margin: '0 0 8px' }}>📝 ESG 어워드 게시판</h1>
        <p style={{ color: '#666', marginTop: 0 }}>카테고리별로 참여 기간이 다릅니다.</p>

        {/* 카테고리 탭 */}
        <CategoryTabs />

        {/* 선택된 카테고리 콘텐츠 */}
        {current ? (
          <CategoryContent meta={current} />
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
    </PostsCacheContext.Provider>
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
  const { cache, setCacheFor } = usePostsCache();

  // 캐시에서 즉시 표시할 데이터 (탭 전환 시 깜빡임 없음)
  const cached = cache.get(meta.key);
  const posts = cached ?? [];

  // 첫 로드 (캐시 없음)일 때만 skeleton 표시
  // 캐시 있으면 즉시 화면 노출 + 백그라운드 refresh
  const [firstLoading, setFirstLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // 작성 가능 여부 (프론트 가드)
  // - 어드민은 기간/posts_enabled와 무관하게 항상 작성 가능
  // - 일반 사용자: 로그인 + 카테고리 active + posts_enabled !== false
  const isAdminBypass = isAdmin;
  const canCreate = useMemo(() => {
    if (!currentUser) return false;
    if (isAdminBypass) return true;
    if (status !== 'active') return false;
    if (settings.posts_enabled === false) return false;
    return true;
  }, [currentUser, status, settings.posts_enabled, isAdminBypass]);

  // 목록 로드 (캐시 갱신)
  const reload = useCallback(async () => {
    try {
      setError(null);
      const list = await loadPosts(meta.key, { limit: 50 });
      setCacheFor(meta.key, list);
    } catch (e) {
      console.error('[PostsPage] load error:', e);
      setError(e instanceof Error ? e.message : '게시글을 불러오지 못했습니다.');
    } finally {
      setFirstLoading(false);
    }
  }, [meta.key, setCacheFor]);

  // 탭 전환 시: 캐시 있으면 백그라운드 refresh, 없으면 skeleton 표시 후 로드
  useEffect(() => {
    if (!cache.has(meta.key)) {
      setFirstLoading(true);
    } else {
      setFirstLoading(false);
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.key]);

  // Realtime — 누가 글 쓰면 자동 갱신 (캐시도 자동 갱신)
  useEffect(() => {
    const cleanup = subscribePostsChanges(() => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.key]);

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
      {firstLoading ? (
        <PostsSkeleton />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : posts.length === 0 ? (
        <EmptyState canCreate={canCreate} onCreate={() => setShowForm(true)} />
      ) : (
        <PostGrid posts={posts} currentUserId={currentUser?.id ?? null} isAdmin={isAdmin} />
      )}

      {/* 작성 모달 */}
      {showForm && currentUser && (
        <PostFormModal
          category={meta.key}
          currentUser={currentUser}
          isAdminBypass={isAdminBypass && status !== 'active'}
          onClose={() => setShowForm(false)}
          onSaved={(post) => {
            setShowForm(false);
            // 새 글이 상단에 보이도록 즉시 prepend (Realtime 갱신 전 빠른 반영)
            // 캐시 직접 갱신 (다른 카테고리 탭으로 갔다 와도 유지)
            setCacheFor(meta.key, [post, ...posts.filter((p) => p.id !== post.id)]);
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
  currentUserId,
  isAdmin,
}: {
  posts: EsgPostWithImagesRow[];
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      }}
    >
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          isMine={!!currentUserId && p.user_id === currentUserId}
          isAdmin={isAdmin}
          onClick={() => navigate(`/posts/detail/${p.id}`)}
        />
      ))}
    </div>
  );
}

function PostCard({
  post,
  isMine,
  isAdmin,
  onClick,
}: {
  post: EsgPostWithImagesRow;
  isMine: boolean;
  isAdmin: boolean;
  onClick: () => void;
}) {
  // 본인 게시글이거나 관리자면 익명이어도 실명 정보를 활용
  // (다만 카드 표시는 view의 user_name 사용 - 익명이면 '익명')
  const showName = isMine ? '본인' : post.user_name;
  const showDept = post.is_anonymous && !isMine && !isAdmin ? null : post.user_dept;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: '#fff',
        borderRadius: 12,
        padding: 0,
        border: '1px solid #eee',
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
    >
      {/* 썸네일 */}
      {post.cover_image_url ? (
        <div
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            background: '#f5f5f5',
            backgroundImage: `url(${post.cover_image_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            background: 'linear-gradient(135deg, #e0f2fe, #ddd6fe)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
            opacity: 0.4,
          }}
        >
          📝
        </div>
      )}

      {/* 본문 */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {post.title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: '#666',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {post.content}
        </p>
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 8,
            borderTop: '1px solid #f5f5f5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: '#999',
          }}
        >
          <span>
            {showName}
            {showDept && <span style={{ marginLeft: 4 }}>· {showDept}</span>}
            {isMine && post.is_anonymous && (
              <span style={{ marginLeft: 4, color: '#0ea5e9' }}>(익명)</span>
            )}
          </span>
          <span>
            ♥ {post.like_count} · 💬 {post.comment_count}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#bbb' }}>
          {formatKSTFull(post.created_at)}
        </div>
      </div>
    </button>
  );
}

function PostsSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      }}
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
          <div style={{ aspectRatio: '4 / 3', background: '#f5f5f5' }} />
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
