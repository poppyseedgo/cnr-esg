// ============================================================================
// AdminPosts — 게시글 관리 어드민 페이지
//
// 어드민 특권:
//   - 익명 게시글의 실제 작성자 본명/부서/이메일 노출
//   - hidden/deleted 게시글도 조회 가능
//   - 부적절한 게시글 숨김 처리 → 사용자에게 안 보임
//
// 운영 흐름:
//   1. 사용자 신고 또는 모니터링 중 부적절 게시글 발견
//   2. 필터/검색으로 해당 게시글 찾기
//   3. (익명이면) 본명 확인 → 누가 작성했는지 파악
//   4. 🙈 숨김 처리 → 사용자 화면에서 즉시 사라짐
//   5. 필요 시 작성자에게 별도 안내
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAllPostsAdmin,
  hidePost,
  unhidePost,
  softDeletePost,
  subscribePostsAdmin,
  type LoadAllPostsAdminFilters,
} from '@/lib/adminPosts';
import type { EsgPostRow, EsgPostStatus, EsgPostCategory } from '@/types/esg';

const CATEGORY_LABELS: Record<EsgPostCategory, string> = {
  zero_waste: '♻️ 제로 웨이스트',
  wise_life: '🌍 슬기로운 사회생활',
};

const STATUS_LABELS: Record<EsgPostStatus, string> = {
  published: '게시 중',
  hidden: '숨김',
  deleted: '삭제됨',
};

const STATUS_COLORS: Record<EsgPostStatus, { bg: string; color: string }> = {
  published: { bg: '#dcfce7', color: '#166534' },
  hidden: { bg: '#fef3c7', color: '#92400e' },
  deleted: { bg: '#f0f0f0', color: '#666' },
};

export function AdminPosts() {
  const [posts, setPosts] = useState<EsgPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<EsgPostStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<EsgPostCategory | 'all'>('all');
  const [anonymousFilter, setAnonymousFilter] = useState<'all' | 'anonymous_only' | 'named_only'>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // 디바운스
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo<LoadAllPostsAdminFilters>(
    () => ({
      statuses: statusFilter === 'all' ? undefined : [statusFilter],
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      anonymousFilter,
      search: searchDebounced || undefined,
      sortOrder: 'newest',
    }),
    [statusFilter, categoryFilter, anonymousFilter, searchDebounced]
  );

  const reload = async () => {
    try {
      setError(null);
      const data = await loadAllPostsAdmin(filters);
      setPosts(data);
    } catch (e) {
      console.error('[AdminPosts]', e);
      setError(e instanceof Error ? e.message : '게시글을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter, anonymousFilter, searchDebounced]);

  useEffect(() => {
    const cleanup = subscribePostsAdmin(() => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // 통계 (현재 필터 결과 기준)
  const publishedCount = posts.filter((p) => p.status === 'published').length;
  const hiddenCount = posts.filter((p) => p.status === 'hidden').length;
  const anonymousCount = posts.filter((p) => p.is_anonymous).length;

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>📝 게시글 관리</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        익명 게시글의 작성자를 확인할 수 있습니다. 부적절한 게시글은 숨김 처리하세요.
      </p>

      <div
        style={{
          padding: 12,
          background: '#fef2f2',
          color: '#991b1b',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.6,
          marginBottom: 16,
        }}
      >
        🔒 <strong>보안 안내</strong>: 익명 게시자의 실제 정보는 어드민만 볼 수 있습니다.
        취급에 주의하시고, 필요한 경우 외에는 본명을 외부에 공유하지 마세요.
      </div>

      {/* 필터 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="상태">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EsgPostStatus | 'all')}
              style={inputStyle}
            >
              <option value="all">전체</option>
              <option value="published">게시 중</option>
              <option value="hidden">숨김</option>
              <option value="deleted">삭제됨</option>
            </select>
          </Field>
          <Field label="카테고리">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as EsgPostCategory | 'all')}
              style={inputStyle}
            >
              <option value="all">전체</option>
              <option value="zero_waste">♻️ 제로 웨이스트</option>
              <option value="wise_life">🌍 슬기로운 사회생활</option>
            </select>
          </Field>
          <Field label="작성자 유형">
            <select
              value={anonymousFilter}
              onChange={(e) =>
                setAnonymousFilter(e.target.value as 'all' | 'anonymous_only' | 'named_only')
              }
              style={inputStyle}
            >
              <option value="all">전체</option>
              <option value="anonymous_only">🕶 익명만</option>
              <option value="named_only">실명만</option>
            </select>
          </Field>
          <Field label="검색 (제목/본문/이름/이메일)">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="예: 텀블러, 홍길동"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {/* 요약 */}
      {!loading && posts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <SummaryChip label="결과 수" value={`${posts.length}건`} />
          <SummaryChip label="게시 중" value={`${publishedCount}건`} color="#166534" bg="#dcfce7" />
          {hiddenCount > 0 && (
            <SummaryChip label="숨김" value={`${hiddenCount}건`} color="#92400e" bg="#fef3c7" />
          )}
          {anonymousCount > 0 && (
            <SummaryChip
              label="🕶 익명"
              value={`${anonymousCount}건`}
              color="#0c4a6e"
              bg="#f0f9ff"
            />
          )}
        </div>
      )}

      {error && (
        <div
          style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12 }}
        >
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : posts.length === 0 ? (
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
          <p style={{ margin: 0, color: '#888' }}>조건에 맞는 게시글이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map((p) => (
            <PostAdminCard key={p.id} post={p} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개별 게시글 카드
// ============================================================================

function PostAdminCard({ post, onChange }: { post: EsgPostRow; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showAuthor, setShowAuthor] = useState(false); // 익명일 때 본명 펼침 토글
  const statusColor = STATUS_COLORS[post.status];

  const handleHide = async () => {
    if (!confirm(`"${truncate(post.title, 50)}" 게시글을 숨김 처리하시겠습니까?\n\n사용자 화면에서 즉시 사라집니다.`)) return;
    setBusy(true);
    try {
      await hidePost(post.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '숨김 처리 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleUnhide = async () => {
    if (!confirm(`"${truncate(post.title, 50)}" 게시글을 복원하시겠습니까?`)) return;
    setBusy(true);
    try {
      await unhidePost(post.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '복원 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleSoftDelete = async () => {
    if (
      !confirm(
        `"${truncate(post.title, 50)}" 게시글을 삭제 처리합니다.\n\n` +
          `완전 삭제가 아닌 'deleted' 상태로 보관됩니다 (감사 추적용).\n계속하시겠습니까?`
      )
    )
      return;
    setBusy(true);
    try {
      await softDeletePost(post.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        opacity: post.status === 'deleted' ? 0.6 : 1,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '3px 10px',
            background: statusColor.bg,
            color: statusColor.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {STATUS_LABELS[post.status]}
        </span>
        <span
          style={{
            padding: '3px 8px',
            background: '#f5f5f5',
            color: '#666',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {CATEGORY_LABELS[post.category]}
        </span>
        {post.is_anonymous && (
          <span
            style={{
              padding: '3px 8px',
              background: '#f0f9ff',
              color: '#0c4a6e',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            🕶 익명
          </span>
        )}
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>
          {fmtKstShort(post.created_at)}
        </span>
      </div>

      {/* 본문: 좌측 썸네일 + 우측 정보 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {post.cover_image_url && (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              background: `url(${post.cover_image_url}) center / cover`,
              flexShrink: 0,
              border: '1px solid #eee',
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            to={`/posts/${post.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#222',
              textDecoration: 'none',
              display: 'block',
              marginBottom: 4,
            }}
          >
            {post.title} ↗
          </Link>
          <div
            style={{
              fontSize: 12,
              color: '#666',
              marginBottom: 6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.5,
            }}
          >
            {post.content}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            ❤️ {post.like_count} · 💬 {post.comment_count}
          </div>
        </div>
      </div>

      {/* 작성자 정보 (어드민 특권 - 익명도 노출) */}
      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: post.is_anonymous ? '#fef2f2' : '#f9fafb',
          borderRadius: 6,
          fontSize: 12,
          border: post.is_anonymous ? '1px solid #fecaca' : '1px solid #eee',
        }}
      >
        {post.is_anonymous ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <strong style={{ color: '#991b1b' }}>🔒 실제 작성자 (어드민 전용)</strong>
              <button
                type="button"
                onClick={() => setShowAuthor((v) => !v)}
                style={{
                  marginLeft: 'auto',
                  padding: '2px 8px',
                  background: '#fff',
                  border: '1px solid #fecaca',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 11,
                  color: '#991b1b',
                }}
              >
                {showAuthor ? '🙈 숨기기' : '👁 본명 확인'}
              </button>
            </div>
            {showAuthor ? (
              <div style={{ color: '#222', lineHeight: 1.6 }}>
                <strong>{post.user_name_snapshot}</strong>
                {post.user_dept_snapshot && (
                  <span style={{ color: '#666' }}> · {post.user_dept_snapshot}</span>
                )}
                <div style={{ color: '#666', fontSize: 11 }}>{post.user_email}</div>
              </div>
            ) : (
              <div style={{ color: '#888', fontSize: 11 }}>
                클릭 시 작성자 본명, 부서, 이메일이 표시됩니다.
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#444', lineHeight: 1.6 }}>
            <span style={{ color: '#888' }}>작성자: </span>
            <strong>{post.user_name_snapshot}</strong>
            {post.user_dept_snapshot && (
              <span style={{ color: '#666' }}> · {post.user_dept_snapshot}</span>
            )}
            <div style={{ color: '#888', fontSize: 11 }}>{post.user_email}</div>
          </div>
        )}
      </div>

      {/* 액션 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {post.status === 'published' && (
          <>
            <button
              type="button"
              onClick={handleHide}
              disabled={busy}
              style={actionBtn('warning', busy)}
            >
              🙈 숨김 처리
            </button>
            <button
              type="button"
              onClick={handleSoftDelete}
              disabled={busy}
              style={actionBtn('danger', busy)}
            >
              🗑 삭제
            </button>
          </>
        )}
        {post.status === 'hidden' && (
          <>
            <button
              type="button"
              onClick={handleUnhide}
              disabled={busy}
              style={actionBtn('success', busy)}
            >
              👁 복원
            </button>
            <button
              type="button"
              onClick={handleSoftDelete}
              disabled={busy}
              style={actionBtn('danger', busy)}
            >
              🗑 삭제
            </button>
          </>
        )}
        {post.status === 'deleted' && (
          <button
            type="button"
            onClick={handleUnhide}
            disabled={busy}
            style={actionBtn('success', busy)}
          >
            👁 복원 (게시 상태로)
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 공통 UI
// ============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 13,
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function SummaryChip({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: string;
  color?: string;
  bg?: string;
}) {
  return (
    <div
      style={{
        padding: '6px 12px',
        background: bg ?? '#f5f5f5',
        color: color ?? '#444',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}: </span>
      <strong>{value}</strong>
    </div>
  );
}

const actionBtn = (
  variant: 'success' | 'warning' | 'danger',
  disabled: boolean
): React.CSSProperties => {
  const colors = {
    success: { border: '#10b981', color: '#10b981' },
    warning: { border: '#f59e0b', color: '#92400e' },
    danger: { border: '#fecaca', color: '#dc2626' },
  };
  return {
    padding: '8px 14px',
    background: '#fff',
    border: `1px solid ${colors[variant].border}`,
    color: colors[variant].color,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    fontWeight: 600,
  };
};

function fmtKstShort(utcIso: string): string {
  if (!utcIso) return '-';
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function truncate(s: string, len: number): string {
  return s.length > len ? `${s.slice(0, len)}…` : s;
}
