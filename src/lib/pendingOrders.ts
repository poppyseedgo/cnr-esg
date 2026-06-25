// ============================================================================
// pendingOrders.ts — 내 "결제 대기(pending) 바자회 주문" 세션 스토어
//
// [변경 이력]
//   2026-06-25  최초 작성. 상단 결제대기 알림바 + My Account 네비 dot 구동용.
//   2026-06-25  [버그수정·근본] 만료/완료 시 dot 미소멸 문제 해결.
//     · 시간 필터를 "스토어"가 직접 보유: rawExpiries(DB) → activeExpiries(미만료분).
//       만료 순간을 setTimeout 으로 재평가(초당 틱 없이) → 바·dot이 동일 "활성" 데이터를
//       공유 → dot 도 만료 즉시 사라짐(바와 기준 일치).
//     · 탭 포커스 복귀(visibilitychange) 시 reload → 입금확인(paid) 등 서버측 변경을
//       Realtime 누락 상황에서도 재조정(완료 시 dot 소멸 보장).
//
// [설계 — 근본 구조]
//   상단 알림바(PendingOrderBar)와 사이드바 dot(EsgSideNav/SecondarySidebar)이
//   "지금 활성(미만료)인 결제대기 주문 목록"을 공유한다(getPendingExpiries = 활성분).
//   · 소비처가 여럿이어도 Realtime/타이머는 ref-count 로 단 1세트만 유지.
//   · 갱신 경로: ① onOrdersChanged 즉시 신호(주문 생성) ② subscribeMyOrders Realtime
//     (입금확인/만료) ③ 만료 타이머(시간 경과) ④ visibilitychange(포커스 복귀).
// ============================================================================

import { loadMyOrders, subscribeMyOrders, onOrdersChanged } from './orders';

const PENDING_CHANGED_EVENT = 'esg:pending-orders-changed';

let rawExpiries: string[] = [];            // DB 의 pending 바자회 주문 만료시각(ISO) 원본
let activeExpiries: string[] = [];         // 그중 미만료(now 기준)분 — getSnapshot 반환(참조 안정)
let currentUserId: string | null = null;
let refCount = 0;
let stopRealtime: (() => void) | null = null;
let stopSignal: (() => void) | null = null;
let stopVisibility: (() => void) | null = null; // ← [2026-06-25] 포커스 복귀 재조정 해제
let expiryTimer: ReturnType<typeof setTimeout> | null = null; // ← [2026-06-25] 다음 만료 재평가 타이머

function emit(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PENDING_CHANGED_EVENT));
  }
}

/** 활성분 동등성 비교용 서명(순서 무관). useSyncExternalStore 무한루프 방지(참조 안정). */
function sig(arr: string[]): string {
  return [...arr].sort().join('|');
}

/** rawExpiries → 미만료분(activeExpiries) 재계산. 변경 시에만 참조 교체 + emit. 이후 타이머 재설정. */
function recomputeActive(): void {
  const now = Date.now();
  const next = rawExpiries.filter((e) => {
    const ms = new Date(e).getTime();
    return Number.isFinite(ms) && ms > now;
  });
  if (sig(next) !== sig(activeExpiries)) {
    activeExpiries = next; // 새 참조 → 소비처 re-render
    emit();
  }
  scheduleNextExpiry();
}

/** 가장 이른 만료시각에 맞춰 1회 타이머 예약 → 그 순간 recomputeActive(해당 건 제거). */
function scheduleNextExpiry(): void {
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const futureMs = activeExpiries
    .map((e) => new Date(e).getTime())
    .filter((ms) => Number.isFinite(ms) && ms > now);
  if (futureMs.length === 0) return;
  const soonest = Math.min(...futureMs);
  const delay = Math.max(0, soonest - now) + 250; // 경계 직후 안전 마진
  expiryTimer = setTimeout(() => { recomputeActive(); }, delay);
}

async function reload(): Promise<void> {
  const uid = currentUserId;
  if (!uid) { rawExpiries = []; recomputeActive(); return; }
  try {
    const orders = await loadMyOrders(uid, { statuses: ['pending'], orderType: 'bazaar' });
    rawExpiries = orders.map((o) => o.expires_at).filter(Boolean) as string[];
  } catch (e) {
    console.error('[pendingOrders] reload error:', e);
    rawExpiries = []; // 실패=없음 처리(알림바/도트 미표시, 안전)
  }
  recomputeActive(); // 활성분 재계산 + (변경 시)emit + 타이머 재설정
}

/**
 * 결제대기 동기화 시작(ref-count). 같은 userId 면 첫 호출만 구독/타이머 세팅하고
 * 이후 호출은 참조수만 증가 → 소비처가 여러 개여도 1세트. 반환=중지(참조수 감소).
 */
export function startPendingOrdersSync(userId: string | null): () => void {
  if (userId !== currentUserId) {
    // 유저 변경(로그인/로그아웃) → 기존 구독/타이머 정리 후 재설정
    if (stopRealtime) { stopRealtime(); stopRealtime = null; }
    if (stopSignal) { stopSignal(); stopSignal = null; }
    if (stopVisibility) { stopVisibility(); stopVisibility = null; }
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
    currentUserId = userId;
    rawExpiries = [];
    activeExpiries = [];
    if (userId) {
      void reload();
      stopRealtime = subscribeMyOrders(userId, () => { void reload(); }); // 서버측 입금확인/만료
      stopSignal = onOrdersChanged(() => { void reload(); });             // 주문 생성 즉시 신호(라이브)
      // 포커스 복귀 시 재조정(Realtime 누락 대비 — 입금완료/만료 반영 보장)
      if (typeof document !== 'undefined') {
        const onVis = () => { if (document.visibilityState === 'visible') void reload(); };
        document.addEventListener('visibilitychange', onVis);
        stopVisibility = () => document.removeEventListener('visibilitychange', onVis);
      }
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
      if (stopSignal) { stopSignal(); stopSignal = null; }
      if (stopVisibility) { stopVisibility(); stopVisibility = null; }
      if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
      currentUserId = null;
      rawExpiries = [];
      activeExpiries = [];
    }
  };
}

/** 지금 활성(미만료)인 결제대기 주문 만료시각(ISO) 목록. 만료/완료분은 제외됨. 참조 안정. */
export function getPendingExpiries(): string[] {
  return activeExpiries;
}

/** useSyncExternalStore 구독(window 이벤트). 반환=구독 해제. */
export function subscribePendingOrders(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PENDING_CHANGED_EVENT, cb);
  return () => window.removeEventListener(PENDING_CHANGED_EVENT, cb);
}
