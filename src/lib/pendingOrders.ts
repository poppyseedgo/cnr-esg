// ============================================================================
// pendingOrders.ts — 내 "결제 대기(pending) 바자회 주문" 세션 스토어
//
// [변경 이력]
//   2026-06-25  최초 작성. 상단 결제대기 알림바 + My Account 네비 dot 구동용.
//
// [설계 — 근본 구조]
//   상단 알림바(PendingOrderBar)와 사이드바 dot(EsgSideNav/SecondarySidebar)이
//   "내가 결제 대기 중인 주문이 있는가 / 가장 이른 만료시각은?"을 공유한다.
//   · 소비처가 여러 곳이지만 Realtime 구독은 ref-count 로 단 1회만 유지(중복 채널 방지).
//   · 데이터: loadMyOrders(uid, {statuses:['pending'], orderType:'bazaar'}) 의 expires_at[].
//   · 갱신: subscribeMyOrders Realtime(주문 생성/입금확인/만료 시) → reload.
//   · 카운트다운 0 통과(만료) 표시는 소비처가 useNowTick(시간)으로 처리 → 여기선 시간 미관여.
//     (cron/자가치유가 status=expired 로 바꾸면 Realtime 으로 목록에서 빠짐)
// ============================================================================

import { loadMyOrders, subscribeMyOrders } from './orders';

const PENDING_CHANGED_EVENT = 'esg:pending-orders-changed';

let expiries: string[] = [];               // pending 바자회 주문들의 expires_at(ISO)
let currentUserId: string | null = null;
let refCount = 0;
let stopRealtime: (() => void) | null = null;

function emit(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PENDING_CHANGED_EVENT));
  }
}

async function reload(): Promise<void> {
  const uid = currentUserId;
  if (!uid) { expiries = []; emit(); return; }
  try {
    const orders = await loadMyOrders(uid, { statuses: ['pending'], orderType: 'bazaar' });
    expiries = orders.map((o) => o.expires_at).filter(Boolean) as string[];
  } catch (e) {
    console.error('[pendingOrders] reload error:', e);
    expiries = []; // 실패=없음 처리(알림바/도트 미표시, 안전)
  }
  emit();
}

/**
 * 결제대기 동기화 시작(ref-count). 같은 userId 면 첫 호출만 Realtime 구독을 세팅하고
 * 이후 호출은 참조수만 증가 → 소비처가 여러 개여도 채널은 1개. 반환=중지(참조수 감소).
 */
export function startPendingOrdersSync(userId: string | null): () => void {
  if (userId !== currentUserId) {
    // 유저 변경(로그인/로그아웃) → 기존 구독 정리 후 재설정
    if (stopRealtime) { stopRealtime(); stopRealtime = null; }
    currentUserId = userId;
    expiries = [];
    if (userId) {
      void reload();
      stopRealtime = subscribeMyOrders(userId, () => { void reload(); });
    } else {
      emit();
    }
  }
  refCount += 1;

  return () => {
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      if (stopRealtime) { stopRealtime(); stopRealtime = null; }
      currentUserId = null;
      expiries = [];
    }
  };
}

/** pending 바자회 주문들의 만료시각(ISO) 목록(동기). 리로드 전까지 동일 참조 유지. */
export function getPendingExpiries(): string[] {
  return expiries;
}

/** useSyncExternalStore 구독(window 이벤트). 반환=구독 해제. */
export function subscribePendingOrders(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PENDING_CHANGED_EVENT, cb);
  return () => window.removeEventListener(PENDING_CHANGED_EVENT, cb);
}
