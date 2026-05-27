// ============================================================================
// AdminPage — 어드민 레이아웃
// 자식 페이지: dashboard, posts, products, auctions, orders, settings
// ============================================================================

import { NavLink, Outlet } from 'react-router-dom';

const adminTabs = [
  { to: '/admin/dashboard', label: '대시보드', icon: '📊' },
  { to: '/admin/settings', label: '이벤트 설정', icon: '⚙️' },
  { to: '/admin/auctions', label: '경매 관리', icon: '🔨' },
  { to: '/admin/products', label: '바자회 상품', icon: '🛍' },
  { to: '/admin/orders', label: '주문/입금확인', icon: '💳' },
  { to: '/admin/donations', label: '기부 관리', icon: '💚' },
  { to: '/admin/posts', label: '게시글 관리', icon: '📝' },
  { to: '/admin/emails', label: '이메일 발송', icon: '📨' },
];

export function AdminPage() {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h1 style={{ color: '#0ea5e9', margin: 0 }}>🔧 어드민</h1>
        <span
          style={{
            padding: '4px 10px',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          관리자 전용
        </span>
      </div>
      <p style={{ color: '#666', marginTop: 4 }}>
        설정 변경은 사용자에게 즉시 반영됩니다. 신중하게 작업해주세요.
      </p>

      <nav
        style={{
          display: 'flex',
          gap: 6,
          margin: '24px 0',
          flexWrap: 'wrap',
          borderBottom: '1px solid #eee',
          paddingBottom: 12,
        }}
      >
        {adminTabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({
              padding: '8px 14px',
              borderRadius: 6,
              textDecoration: 'none',
              background: isActive ? '#0ea5e9' : '#fff',
              color: isActive ? '#fff' : '#444',
              border: '1px solid',
              borderColor: isActive ? '#0ea5e9' : '#ddd',
              fontSize: 13,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            })}
          >
            <span>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
