// ============================================================================
// AppLayout — 모든 페이지 공통 레이아웃
// React Router v6의 Outlet을 사용해 자식 라우트 렌더
// ============================================================================

import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';

export function AppLayout() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#fafafa',
        overflowX: 'clip', // ← [풀블리드] 100vw 그리드의 가로 스크롤 방지. clip은 스크롤 컨테이너를 안 만들어 sticky 헤더 영향 없음 (hidden 금지)
      }}
    >
      <Header />
      <main style={{ flex: 1, padding: '0 20px' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '24px 0' }}>
          <Outlet />
        </div>
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
