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

export function usePageTracking(): void {
  const location = useLocation(); // ← 현재 라우트 (Router 컨텍스트 필요)

  useEffect(() => {
    // pathname + search 포함 → ?id=123 등 쿼리까지 정확히 기록
    trackPageView(location.pathname + location.search); // ← 경로 변경마다 PV 전송
  }, [location.pathname, location.search]);
}
