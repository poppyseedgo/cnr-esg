// ============================================================================
// NotificationsPage — /notifications
//
// 사양:
//   - 전체 알림 무한 스크롤 (20개씩)
//   - 필터: 전체 / 미읽음 / 타입별
//   - 일괄: 모두 읽음 / 모두 삭제 (확인)
//   - 클릭 → link 이동 + markAsRead
//   - 실시간 구독 (새 알림 즉시 반영)
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  loadMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAll,
  subscribeMyNotifications,
  onNotificationChanged,
  formatRelativeTime,
} from '@/lib/notifications';
import type { EsgNotificationRow, EsgNotificationType } from '@/types/esg';

const TYPE_FILTERS: Array<{ value: 'all' | 'unread' | EsgNotificationType; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'unread', label: '미읽음만' },
  { value: 'bazaar_order_paid', label: '바자회' },
  { value: 'auction_won', label: '경매 낙찰' },
  { value: 'auction_outbid', label: '입찰 추월' },
  { value: 'donation_paid', label: '기부' },
  { value: 'post_hidden', label: '게시글' },
];

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();

  const [items, setItems] = useState<EsgNotificationRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | EsgNotificationType>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadingMoreRef = useRef(false);

  const load = async (reset: boolean) => {
    if (reset) {
      setLoading(true);
    } else {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      const before = reset ? undefined : items[items.length - 1]?.created_at;
      const rows = await loadMyNotifications({
        limit: PAGE_SIZE,
        before,
        unreadOnly: filter === 'unread',
        type:
          filter !== 'all' && filter !== 'unread'
            ? (filter as EsgNotificationType)
            : undefined,
      });
      setItems((prev) => (reset ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      console.error('[NotificationsPage] load error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  // 필터 변경 시 reset
  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // 실시간 구독
  useEffect(() => {
    if (!currentUser) return;
    const refresh = () => void load(true);
    const cleanupRT = subscribeMyNotifications(currentUser.id, refresh);
    const cleanupEv = onNotificationChanged(refresh);
    return () => {
      cleanupRT();
      cleanupEv();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 무한 스크롤
  useEffect(() => {
    const onScroll = () => {
      if (loadingMore || !hasMore || loading) return;
      const near = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
      if (near) void load(false);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, loading, items]);

  const handleItemClick = async (n: EsgNotificationRow) => {
    if (!n.is_read) void markAsRead(n.id).catch(console.error);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markAllAsRead();
      void load(true);
    } catch (e) {
      console.error(e);
      alert('읽음 처리에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    if (busy) return;
    if (!confirm('모든 알림을 삭제하시겠습니까?')) return;
    setBusy(true);
    try {
      await deleteAll();
      setItems([]);
    } catch (e) {
      console.error(e);
      alert('삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOne = async (id: string) => {
    if (busy) return;
    try {
      await deleteNotification(id);
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.error(e);
      alert('삭제에 실패했습니다.');
    }
  };

  if (!currentUser) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>알림</h1>
        <p style={{ color: '#666' }}>알림을 확인하려면 로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>🔔 알림</h1>

      {/* 필터 + 액션 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 100,
                fontSize: 12,
                border: '1px solid',
                borderColor: filter === f.value ? '#222' : '#ddd',
                background: filter === f.value ? '#222' : '#fff',
                color: filter === f.value ? '#fff' : '#444',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={busy || items.every((n) => n.is_read)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: '#fff',
              color: '#444',
              fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            모두 읽음
          </button>
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={busy || items.length === 0}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #fee2e2',
              background: '#fff',
              color: '#dc2626',
              fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            모두 삭제
          </button>
        </div>
      </div>

      {/* 본문 */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : items.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            border: '1px dashed #ddd',
          }}
        >
          <div style={{ fontSize: 40, opacity: 0.4, marginBottom: 12 }}>🔔</div>
          <p style={{ margin: 0, color: '#888' }}>알림이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((n) => (
            <NotificationCard
              key={n.id}
              item={n}
              onClick={() => handleItemClick(n)}
              onDelete={() => handleDeleteOne(n.id)}
            />
          ))}
          {loadingMore && (
            <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 12 }}>
              불러오는 중…
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: '#bbb', fontSize: 11 }}>
              마지막 알림입니다
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 알림 카드
// ============================================================================

function NotificationCard({
  item,
  onClick,
  onDelete,
}: {
  item: EsgNotificationRow;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        background: item.is_read ? '#fff' : '#f0fdf4',
        border: '1px solid',
        borderColor: item.is_read ? '#eee' : '#bbf7d0',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          padding: '14px 16px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          fontFamily: 'inherit',
        }}
      >
        <div style={{ width: 8, paddingTop: 6, flexShrink: 0 }}>
          {!item.is_read && (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6DED73' }} />
          )}
        </div>
        <div style={{ fontSize: 22, flexShrink: 0, paddingTop: 2 }}>{item.icon ?? '🔔'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: item.is_read ? 500 : 700,
              color: '#222',
              marginBottom: 4,
            }}
          >
            {item.title}
          </div>
          {item.body && (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
              {item.body}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#999' }}>{formatRelativeTime(item.created_at)}</div>
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="알림 삭제"
        style={{
          width: 36,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: '#bbb',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
