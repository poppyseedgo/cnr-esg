// ============================================================================
// AppLayout — 모든 페이지 공통 레이아웃
// React Router v6의 Outlet을 사용해 자식 라우트 렌더
// ============================================================================

import { Suspense } from 'react'; // ← [코드 스플리팅] lazy 페이지 로딩 경계
import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingScreen } from '@/components/routing/LoadingScreen'; // ← [코드 스플리팅] Suspense fallback
import { GlobalEventModal } from '@/components/home/GlobalEventModal';

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
          {/* ← [코드 스플리팅] lazy 페이지 로딩 중 헤더/푸터 유지, 본문만 fallback 표시 */}
          <Suspense fallback={<LoadingScreen />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <Footer />
      <ScrollRestoration />
      {/* ?modal=brand|bazaar|wise|zero 감지해 어디서든 모달 표시 */}
      <GlobalEventModal />
    </div>
  );
}
