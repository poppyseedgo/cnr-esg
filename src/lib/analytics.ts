// ============================================================================
// analytics.ts — Google Analytics 4 (GA4) 연동 모듈
//
// 변경 이력:
//   2026-06-02  최초 작성 — GA4 gtag 동적 로드 + SPA page_view 수동 추적
//
// 설계 요약:
//   - 측정 ID는 환경변수 VITE_GA_MEASUREMENT_ID 에서만 읽음 (코드 하드코딩 금지)
//   - 측정 ID가 없으면(로컬 개발 등) GA를 초기화하지 않음 → 개발 트래픽 오염 방지
//   - gtag 스크립트를 런타임에 동적 삽입 → index.html 수정 불필요, 설정 일원화
//   - data router(createBrowserRouter) SPA 이므로 자동 page_view 를 끄고(send_page_view:false)
//     라우트 변경마다 usePageTracking 훅에서 수동 전송
// ============================================================================

// 측정 ID — vite-env.d.ts 에 VITE_GA_MEASUREMENT_ID 타입 선언됨
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID; // ← GA4 측정 ID (운영 환경변수)

// GA 활성화 여부 — 측정 ID가 존재할 때만 true (로컬은 미설정 → false)
export const isGAEnabled: boolean = Boolean(MEASUREMENT_ID); // ← 활성 여부 플래그

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let initialized = false; // ← 중복 초기화 방지 (StrictMode 이중 마운트 방어)

// GA4 초기화 — 앱 시작 시 1회만 호출 (main.tsx)
export function initGA(): void {
  if (initialized) return;       // ← 이미 초기화됨 → 무시
  if (!MEASUREMENT_ID) return;   // ← 측정 ID 없으면 no-op (로컬/미설정 환경)

  // 1) gtag 스크립트 동적 삽입
  const script = document.createElement('script'); // ← gtag.js 로더 태그 생성
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`; // ← 측정 ID 주입
  document.head.appendChild(script);

  // 2) dataLayer / gtag 부트스트랩
  window.dataLayer = window.dataLayer || []; // ← GA 데이터 큐 초기화
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments); // ← arguments 그대로 큐 적재 (GA 표준 패턴)
  };
  window.gtag('js', new Date()); // ← 세션 시작 시각 기록

  // 3) config — 자동 page_view 끄고 SPA 에서 수동 전송하도록 설정
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false }); // ← 자동 PV off (SPA 수동 추적)

  initialized = true; // ← 초기화 완료 표시
}

// 페이지뷰 수동 전송 — 라우트 변경마다 호출 (usePageTracking)
export function trackPageView(path: string): void {
  if (!isGAEnabled || !window.gtag) return; // ← 비활성/미초기화 시 무시
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

// 커스텀 이벤트 전송 (예: add_to_cart, place_bid, donate — 추후 확장용)
export function trackEvent(
  name: string,
  params: Record<string, unknown> = {}
): void {
  if (!isGAEnabled || !window.gtag) return; // ← 비활성/미초기화 시 무시
  window.gtag('event', name, params);
}
