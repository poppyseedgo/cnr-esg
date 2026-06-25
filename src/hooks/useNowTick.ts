// ============================================================================
// useNowTick.ts — 전역 공유 1초 틱(현재 epoch ms)
//
// [변경 이력]
//   2026-06-25  최초 작성. "입금 대기 중" 카운트다운(상품 카드 N개) 구동용.
//
// [설계 — 근본 구조]
//   카드마다 setInterval 을 두면 N개의 타이머가 생긴다.
//   모듈 레벨 단일 인터벌 + useSyncExternalStore 로 N개 컴포넌트가 "하나의 틱"을 공유.
//   구독자가 0이면 인터벌을 정리(ref-count) → 누수 없음.
//   getSnapshot 은 now(ms) 원시값 → React 가 값 비교로 변화 감지(안정).
// ============================================================================

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let nowMs = Date.now();

function tick(): void {
  nowMs = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (timer === null) {
    nowMs = Date.now();            // 첫 구독 시점 즉시 동기화
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** 1초마다 갱신되는 현재 epoch(ms). 단일 인터벌을 모든 사용처가 공유. */
export function useNowTick(): number {
  return useSyncExternalStore(subscribe, () => nowMs, () => nowMs);
}
