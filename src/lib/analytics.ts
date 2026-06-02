/**
 * analytics.ts — Google Analytics 4 (GA4) 연동 모듈
 * ────────────────────────────────────────────
 * [변경 이력]
 * 2026-06-02  최초 작성 — GA4 gtag 동적 로드 + SPA page_view 수동 추적
 * ────────────────────────────────────────────
 * [설계 요약]
 * - 측정 ID는 환경변수 VITE_GA_MEASUREMENT_ID 에서만 읽음 (코드 하드코딩 금지)
 * - 측정 ID가 없으면(로컬 개발 등) GA를 초기화하지 않음 → 개발 트래픽 오염 방지
 * - gtag 스크립트를 런타임에 동적 삽입 → index.html 수정 불필요, 설정 일원화
 * - SPA이므로 자동 page_view(send_page_view)를 끄고, 라우트 변경마다 수동 전송
 */

// import.meta.env 타입 우회 (vite-env.d.ts 수정 없이 빌드 에러 방지)
const env = import.meta.env as unknown as { VITE_GA_MEASUREMENT_ID?: string };
const MEASUREMENT_ID = env.VITE_GA_MEASUREMENT_ID;

// GA 활성화 여부 — 측정 ID가 존재할 때만 true
export const isGAEnabled: boolean = Boolean(MEASUREMENT_ID);

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let initialized = false; // 중복 초기화 방지 플래그

/** GA4 초기화 — 앱 시작 시 1회만 호출 */
export function initGA(): void {
  if (initialized) return;       // 이미 초기화됨 → 무시
  if (!MEASUREMENT_ID) return;   // 측정 ID 없으면 no-op (로컬/미설정 환경)

  // 1) gtag 스크립트 동적 삽입
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  // 2) dataLayer / gtag 부트스트랩
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());

  // 3) config — 자동 page_view 끄고 SPA에서 수동 전송하도록 설정
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

  initialized = true;
}

/** 페이지뷰 수동 전송 — 라우트 변경마다 호출 */
export function trackPageView(path: string): void {
  if (!isGAEnabled || !window.gtag) return; // 비활성 또는 미초기화 시 무시
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** 커스텀 이벤트 전송 (예: add_to_cart, place_bid, donate 등 — 추후 확장용) */
export function trackEvent(
  name: string,
  params: Record<string, unknown> = {}
): void {
  if (!isGAEnabled || !window.gtag) return; // 비활성 또는 미초기화 시 무시
  window.gtag('event', name, params);
}
