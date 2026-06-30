// ============================================================================
// AdminPage — 어드민 레이아웃
// 자식 페이지: dashboard, posts, products, auctions, orders, settings
// ============================================================================

import { Suspense } from 'react'; // ← [코드 스플리팅] lazy 탭 경계
import { NavLink, Outlet } from 'react-router-dom';
import { LoadingScreen } from '@/components/routing/LoadingScreen'; // ← [코드 스플리팅] Suspense fallback

const adminTabs = [
  { to: '/admin/dashboard', label: '대시보드', icon: '📊' },
  { to: '/admin/orders', label: '주문/입금확인', icon: '💳' }, // ← [2026-07-01] 대시보드 다음(2번째)으로 이동
  { to: '/admin/settings', label: '이벤트 설정', icon: '⚙️' },
  { to: '/admin/auctions', label: '경매 관리', icon: '🔨' },
  { to: '/admin/bazaar-intake', label: '물품 접수', icon: '📦' }, // ← [추가 2026-06-08] 바자회 물품 접수/검수/게시
  { to: '/admin/presale', label: '선구매 관리', icon: '🎫' }, // ← [추가 2026-06-26] 선구매 자격/공개시각/비상토글
  { to: '/admin/products', label: '바자회 상품', icon: '🛍' },
  { to: '/admin/donations', label: '기부 관리', icon: '💚' },
  { to: '/admin/roster', label: '명단 관리', icon: '📋' }, // ← [추가 2026-06-16 버그#5] 통합 명단/CSV
  { to: '/admin/posts', label: '게시글 관리', icon: '📝' },
  { to: '/admin/qa', label: '상품 Q&A', icon: '❓' },
  { to: '/admin/faq', label: 'FAQ 관리', icon: '❔' },
  { to: '/admin/qna-event', label: 'Q&A 답변', icon: '💬' },
  { to: '/admin/bazaar-guide', label: '바자회 가이드', icon: '📋' },
  { to: '/admin/emails', label: '이메일 발송', icon: '📨' },
];

export function AdminPage() {
  return (
    <div style={{ maxWidth: 1024, margin: '0 auto', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h1 style={{ color: '#111', margin: 0 }}>🔧 어드민</h1>
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
              background: isActive ? '#111' : '#fff',
              color: isActive ? '#fff' : '#444',
              border: '1px solid',
              borderColor: isActive ? '#111' : '#ddd',
              fontSize: 16, // ← [2026-07-01] 13 → 16
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
      {/* ← [코드 스플리팅] lazy 탭 로딩 중 탭바 유지, 탭 내용만 fallback 표시 */}
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
