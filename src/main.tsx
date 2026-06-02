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

initGA(); // ← [2026-06-02 추가] GA4 1회 초기화 (측정 ID 미설정 시 자동 no-op)

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('[cnr-esg] #root element를 찾을 수 없습니다.');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
