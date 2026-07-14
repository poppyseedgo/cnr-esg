// ============================================================================
// visits.ts — 자체 방문 로그 전송                                // ← [2026-07-14]
//
// GA4(analytics.ts)와 병행. GA는 마케팅 표준 리포트, 이건 어드민에서 직접 조회하는
// 사내 집계용(기간 지정·CSV·보존기간 무제한).
//
// 설계:
//   - 방문자 식별: localStorage의 무작위 세션 ID(esg_vid). 개인정보 아님(비식별 난수).
//     로그인 사용자는 서버(RPC)가 auth.uid()를 채운다 → 클라이언트 위조 불가.
//   - 실패해도 UX를 막지 않는다(fire-and-forget, 에러는 조용히 무시).
//   - 같은 경로 중복 폭주 방지: 동일 path 1.5초 이내 재전송 차단(StrictMode 이중 마운트 방어).
// ============================================================================

import { callRpc } from './supabase';

const VID_KEY = 'esg_vid';

/** 비식별 방문자 ID (localStorage 영속). 차단 환경이면 메모리 fallback. */
let memoryVid: string | null = null;

function getVisitorId(): string {
  const gen = () =>
    (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
  try {
    let v = localStorage.getItem(VID_KEY);
    if (!v) {
      v = gen();
      localStorage.setItem(VID_KEY, v);
    }
    return v;
  } catch {
    if (!memoryVid) memoryVid = gen(); // 프라이빗 모드 등 localStorage 차단
    return memoryVid;
  }
}

let lastPath = '';
let lastAt = 0;

/** 방문 1건 기록 (라우트 진입 시). 실패는 무시. */
export function trackVisit(path: string): void {
  const now = Date.now();
  if (path === lastPath && now - lastAt < 1500) return; // 중복 방어
  lastPath = path;
  lastAt = now;

  void callRpc('esg_track_page_view', {
    p_session_id: getVisitorId(),
    p_path: path.slice(0, 512),
    p_referrer: document.referrer ? document.referrer.slice(0, 512) : null,
  }).catch(() => undefined); // 조용히 실패 — 추적 실패가 UX를 막지 않는다
}
