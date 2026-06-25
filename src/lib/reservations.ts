// ============================================================================
// reservations.ts — 상품 "활성 예약(입금 대기 중)" 상태 세션 스토어
//
// [변경 이력]
//   2026-06-25  최초 작성. 15분 결제 정책 — 상품별 입금 대기 카운트다운 구동.
//
// [설계 — 근본 구조]
//   esg_orders 는 RLS(본인 주문만)라 공개로 "이 상품이 예약됐는지" 알 수 없다.
//   → 서버 SECURITY DEFINER 함수 esg_product_reservation_status() 가
//     구매자 식별정보 없이 (product_id, reserved_qty, reserved_until)만 노출.
//   본 스토어는 그 결과를 Map 으로 1회 로드·캐시하고 window 이벤트로 구독 동기화
//   (wishlist.ts 와 동일 패턴: 카드 N개가 동일 스냅샷 공유, fetch 1회).
//
//   · reserved_until 은 "가장 이른 활성 예약 만료시각"(ISO UTC).
//   · 서버가 expires_at > now() 만 반환 → 만료 예약은 애초에 빠짐(낙관 표시와 일치).
//   · 갱신 트리거: 상품 Realtime(reserved_stock 변동) 시 페이지가 reload 호출.
//   · 카운트다운 0 통과는 useNowTick(시간) 으로 처리(여기서 재조회 불필요).
// ============================================================================

import { supabase as _supabase } from './supabase';

// supabase-js 2.49 타입 추론 한계 우회(프로젝트 공통 컨벤션)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

const RESERVATIONS_CHANGED_EVENT = 'esg:reservations-changed';

/** 상품 한 건의 활성 예약 정보. until=가장 이른 만료시각(ISO UTC). */
export interface ReservationInfo {
  qty: number;
  until: string;
}

let cache: Map<string, ReservationInfo> = new Map(); // product_id → 활성 예약
let inflight: Promise<void> | null = null;            // 동시 호출 1회 fetch 공유

function emit(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RESERVATIONS_CHANGED_EVENT));
  }
}

/**
 * 활성 예약 현황 전체 로드(공개 RPC). 성공/실패 모두 스냅샷 갱신 후 emit.
 * 동시 호출은 1회 fetch 를 공유. 페이지 진입/상품 Realtime 시 호출.
 */
export async function loadReservationStatus(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.rpc('esg_product_reservation_status');
    if (error) {
      console.error('[reservations] load error:', error);
      cache = new Map(); emit(); return; // 실패=빈 맵(예약 미표시, 안전)
    }
    const next = new Map<string, ReservationInfo>();
    for (const r of (data ?? []) as Array<{ product_id: string; reserved_qty: number; reserved_until: string }>) {
      next.set(r.product_id, { qty: Number(r.reserved_qty), until: r.reserved_until });
    }
    cache = next;
    emit();
  })();
  try { await inflight; } finally { inflight = null; }
}

/** 특정 상품의 활성 예약(동기). 없으면 null. 동일 참조 유지(리로드 전까지 안정). */
export function getReservation(productId: string): ReservationInfo | null {
  return cache.get(productId) ?? null;
}

/** useSyncExternalStore 구독(window 이벤트). 반환=구독 해제. */
export function subscribeReservations(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(RESERVATIONS_CHANGED_EVENT, cb);
  return () => window.removeEventListener(RESERVATIONS_CHANGED_EVENT, cb);
}
