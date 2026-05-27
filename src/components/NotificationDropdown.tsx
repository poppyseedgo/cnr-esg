// ============================================================================
// NotificationDropdown — 헤더 종 클릭 시 드롭다운
//
// 사양:
//   - 최근 20개 알림
//   - 미읽 = 좌측 라임 도트 + 진한 배경
//   - 클릭 → link 이동 + markAsRead
//   - "모두 읽음" / "전체 보기" 액션
//   - 외부 클릭 시 닫기 (호출 측에서 처리)
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loadMyNotifications,
  markAsRead,
  markAllAsRead,
  onNotificationChanged,
  formatRelativeTime,
} from '@/lib/notifications';
import type { EsgNotificationRow } from '@/types/esg';

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
  /** dark/light/green variant 텍스트 컬러 (외부에서 받지 않으면 light 모드) */
  forceLight?: boolean;
}

export function NotificationDropdown({ open, onClose }: NotificationDropdownProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<EsgNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const rows = await loadMyNotifications({ limit: 20 });
      setItems(rows);
    } catch (e) {
      console.error('[NotificationDropdown] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void refresh();
    const cleanup = onNotificationChanged(refresh);
    return cleanup;
  }, [open]);

  if (!open) return null;

  const handleItemClick = async (n: EsgNotificationRow) => {
    // 클릭 시 read 처리 + 이동
    if (!n.is_read) {
      void markAsRead(n.id).catch(console.error);
    }
    onClose();
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markAllAsRead();
      void refresh();
    } catch (e) {
      console.error(e);
      alert('읽음 처리에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 32,
        right: -8,
        width: 360,
        maxHeight: 480,
        background: '#fff',
        border: '1px solid #eee',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#222',
        fontFamily: "'Pretendard', sans-serif",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>알림</h3>
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={busy || items.every((n) => n.is_read)}
          style={{
            border: 'none',
            background: 'transparent',
            color: busy || items.every((n) => n.is_read) ? '#bbb' : '#0ea5e9',
            fontSize: 12,
            cursor: busy ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          모두 읽음
        </button>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#999' }}>
            불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>🔔</div>
            <div style={{ fontSize: 13, color: '#888' }}>새 알림이 없습니다</div>
          </div>
        ) : (
          items.map((n) => (
            <NotificationItem key={n.id} item={n} onClick={() => handleItemClick(n)} />
          ))
        )}
      </div>

      {/* 푸터 */}
      <button
        type="button"
        onClick={() => {
          onClose();
          navigate('/notifications');
        }}
        style={{
          padding: '12px',
          border: 'none',
          borderTop: '1px solid #f0f0f0',
          background: '#fafafa',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          color: '#222',
        }}
      >
        전체 알림 보기
      </button>
    </div>
  );
}

// ============================================================================
// 알림 아이템
// ============================================================================

function NotificationItem({
  item,
  onClick,
}: {
  item: EsgNotificationRow;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        padding: '12px 16px',
        border: 'none',
        borderBottom: '1px solid #f5f5f5',
        background: item.is_read ? '#fff' : '#f0fdf4',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        fontFamily: 'inherit',
      }}
    >
      {/* 미읽 도트 */}
      <div style={{ width: 8, paddingTop: 6, flexShrink: 0 }}>
        {!item.is_read && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6DED73' }} />
        )}
      </div>

      {/* 아이콘 */}
      <div style={{ fontSize: 18, flexShrink: 0, paddingTop: 2 }}>{item.icon ?? '🔔'}</div>

      {/* 텍스트 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: item.is_read ? 500 : 700,
            color: '#222',
            marginBottom: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.title}
        </div>
        {item.body && (
          <div
            style={{
              fontSize: 12,
              color: '#666',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {item.body}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#999' }}>{formatRelativeTime(item.created_at)}</div>
      </div>
    </button>
  );
}
