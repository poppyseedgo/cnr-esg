/**
 * usePageTracking.ts — SPA 라우트 변경 페이지뷰 추적 훅
 * ────────────────────────────────────────────
 * [변경 이력]
 * 2026-06-02  최초 작성
 * ────────────────────────────────────────────
 * react-router 의 location 변경을 감지해 GA4 page_view 를 전송한다.
 * 반드시 <BrowserRouter> 내부의 컴포넌트(예: App)에서 1회 호출할 것.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../lib/analytics'; // 경로 별칭(@) 쓰면 '@/lib/analytics'

export function usePageTracking(): void {
  const location = useLocation();

  useEffect(() => {
    // pathname + search 까지 포함해 정확한 경로를 기록 (?id=123 등 쿼리 포함)
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
}
