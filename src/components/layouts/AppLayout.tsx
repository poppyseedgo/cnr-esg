// ============================================================================
// AppLayout — 모든 페이지 공통 레이아웃
// React Router v6의 Outlet을 사용해 자식 라우트 렌더
//
// 변경 이력:
//   2026-06-02  GA4 SPA 페이지뷰 추적 추가 — usePageTracking() 호출
//   2026-06-23  [구조 변경] 상단 Header → 좌측 세로 EsgSideNav 로 교체.
//               · 데스크톱(≥1024): .app-shell 가로 배치 [사이드바 346 sticky | main]
//               · 모바일(<1024):   .app-shell 세로 배치 [상단바 | main] (EsgSideNav가 분기)
//               · Footer 는 .app-shell 밖 → 전폭 유지(Figma: footer 1920 풀폭)
//               · 풀블리드는 --sidebar-w(0/346) 보정으로 콘텐츠 영역 기준 (container-type
//                 미사용 → in-place fixed 모달 영향 0). index.css .app-shell 규칙 동반.
// ============================================================================

import { Suspense } from 'react'; // ← [코드 스플리팅] lazy 페이지 로딩 경계
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { EsgSideNav } from './EsgSideNav'; // ← [2026-06-23] 상단 Header 대체(좌측 사이드바)
import { Footer } from './Footer';
import { LoadingScreen } from '@/components/routing/LoadingScreen'; // ← [코드 스플리팅] Suspense fallback
import { GlobalEventModal } from '@/components/home/GlobalEventModal';
import { usePageTracking } from '@/hooks/usePageTracking'; // ← [2026-06-02 추가] GA4 라우트 추적 훅

export function AppLayout() {
  usePageTracking(); // ← [2026-06-02 추가] 라우트 변경마다 GA4 page_view 전송
  const location = useLocation();
  // 섹션(최상위 경로 세그먼트) 단위 전환 모션 키. 같은 섹션 내 탭/카테고리 전환은
  // 리마운트하지 않아 캐시·상태 유지(예: /posts/zero_waste ↔ /posts/wise_life).
  const sectionKey = location.pathname.split('/')[1] || 'home';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#fafafa',
        overflowX: 'clip', // ← [풀블리드] 가로 스크롤 방지. clip은 스크롤 컨테이너를 안 만들어 sticky 영향 없음
      }}
    >
      {/* ← [2026-06-23] 사이드바 + 본문. .app-shell: 모바일 세로 / 데스크톱(≥1024) 가로 (index.css) */}
      <div className="app-shell">
        {/* 데스크톱=좌측 고정 사이드바 / 모바일=상단바+드로어 (EsgSideNav 내부 분기) */}
        <EsgSideNav />

        <main className="app-main" style={{ flex: 1, minWidth: 0, padding: '0 20px' }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', padding: '24px 0 320px' }}>
            {/* ← [코드 스플리팅] lazy 페이지 로딩 중 사이드바/푸터 유지, 본문만 fallback */}
            <Suspense fallback={<LoadingScreen />}>
              {/* 섹션 전환 시 가벼운 진입 모션 (route-fade) */}
              <div key={sectionKey} className="route-fade">
                <Outlet />
              </div>
            </Suspense>
          </div>
        </main>
      </div>

      {/* ← [2026-06-23] Footer는 .app-shell 밖 → 사이드바 폭과 무관하게 전폭(Figma 1920) */}
      <Footer />
      <ScrollRestoration />
      {/* ?modal=brand|bazaar|wise|zero 감지해 어디서든 모달 표시 */}
      <GlobalEventModal />
    </div>
  );
}
