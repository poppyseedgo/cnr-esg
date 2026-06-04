// ============================================================================
// main.tsx — 앱 진입점
//
// 변경 이력:
//   2026-06-02  GA4 초기화 추가 — render 직전 initGA() 1회 호출
//               (라우터 무관 사이드이펙트, 측정 ID 없으면 내부 no-op)
// ============================================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initGA } from '@/lib/analytics'; // ← [2026-06-02 추가] GA4 초기화 함수
import { initButtonPress } from '@/lib/buttonPress'; // ← [2026-06-04 추가] 전 버튼 누름 즉시반응

// 동적 import(코드 스플리팅 청크) 프리로드 실패 시 1회 자동 새로고침.
// 재배포로 옛 해시 청크가 사라진 탭을 최신 index.html 로 자동 복구한다.
// (lazyWithRetry 와 동일한 sessionStorage 가드를 공유 → 새로고침은 최대 1회)
window.addEventListener('vite:preloadError', (e) => {
  const KEY = 'cnr-chunk-reloaded';
  if (!sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, '1');
    e.preventDefault(); // Vite 기본 throw 억제 후 직접 새로고침
    window.location.reload();
  }
});

initGA(); // ← [2026-06-02 추가] GA4 1회 초기화 (측정 ID 미설정 시 자동 no-op)
initButtonPress(); // ← [2026-06-04 추가] 전 버튼 누름 즉시반응(usePressable 동등) 1회 등록

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('[cnr-esg] #root element를 찾을 수 없습니다.');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
