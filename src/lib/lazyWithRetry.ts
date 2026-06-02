// ============================================================================
// lazyWithRetry — React.lazy 래퍼 (배포로 사라진 청크 자동 복구)
//
// 문제(근본 원인):
//   코드 스플리팅 시 Vite 는 해시가 붙은 청크(예: PostsPage-Cpt_HPAA.js)를 생성한다.
//   재배포하면 해시가 바뀌어 옛 청크 파일은 서버에서 사라진다.
//   배포 직전에 페이지를 열어둔(또는 옛 index.html 을 캐시한) 브라우저가 지연 라우트로
//   이동하면 사라진 옛 청크를 요청 → "Failed to fetch dynamically imported module" 크래시.
//
// 해결:
//   동적 import 실패 시 sessionStorage 플래그로 가드하여 딱 1회만 location.reload().
//   최신 index.html(= 최신 청크 참조)을 다시 받아 자동 복구한다.
//   ※ 새로고침이 '최신' index.html 을 받으려면 index.html 이 no-cache 여야 한다
//     → public/_headers 에서 index.html=no-cache, /assets/*=immutable 로 설정(함께 배포).
//   이미 1회 새로고침했는데도 실패하면(진짜 오류) 무한 새로고침을 막고 에러를 전파한다.
// ============================================================================

import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'cnr-chunk-reloaded'; // 1회 새로고침 가드 (무한루프 방지)

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_FLAG); // 성공 → 다음 배포 대비 플래그 해제
      return mod;
    } catch (err) {
      // 아직 새로고침 안 했으면 → 1회 강제 새로고침으로 최신 청크 재요청
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        return new Promise<never>(() => {}); // reload 진행 중 — pending 유지(에러화면 깜빡임 방지)
      }
      throw err; // 새로고침 후에도 실패 → 진짜 오류이므로 전파
    }
  });
}
