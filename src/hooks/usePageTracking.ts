// ============================================================================
// usePageTracking.ts — SPA 라우트 변경 페이지뷰 추적 훅
//
// 변경 이력:
//   2026-06-02  최초 작성
//
// 설계 요약:
//   - react-router 의 location 변경을 감지해 GA4 page_view 를 전송
//   - 반드시 Router 컨텍스트 내부(AppLayout)에서 호출할 것
//     (App() 함수는 RouterProvider 바깥 → 여기서 호출 시 useLocation 에러)
// ============================================================================
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/analytics'; // ← GA page_view 전송 함수
import { trackVisit } from '@/lib/visits'; // ← [2026-07-14] 자체 방문 로그(어드민 집계용) — GA와 병행

export function usePageTracking(): void {
  const location = useLocation(); // ← 현재 라우트 (Router 컨텍스트 필요)

  useEffect(() => {
    // pathname + search 포함 → ?id=123 등 쿼리까지 정확히 기록
    const path = location.pathname + location.search;
    trackPageView(path); // ← 경로 변경마다 GA PV 전송
    trackVisit(path);    // ← [2026-07-14] 자체 방문 로그(esg_page_views) 기록. 실패해도 무시
  }, [location.pathname, location.search]);
}
