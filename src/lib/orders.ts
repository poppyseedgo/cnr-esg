// ============================================================================
// orders.ts — 주문 관련 API
//
// 변경 이력:
//   2026-06-26  선구매 자격 확장(물품 기부자 OR 기부금 입금확인자) — 트리거 RAISE 코드
//               BAZAAR_PRESALE_NOT_ELIGIBLE 매핑 추가, 구 코드(BAZAAR_PRESALE_DONOR_ONLY)
//               메시지를 동일 문구로 통일(하위호환). RPC_ERROR_MESSAGES 외 로직 변경 없음.
//
// 함수:
//   - createBazaarOrder(items, opts)         : create_bazaar_order RPC 호출
//   - loadMyOrders(userId, opts?)            : 내 주문 목록 + 항목 JOIN
//   - loadOrderByNumber(orderNumber, userId) : 단일 주문 상세 (본인 또는 관리자)
//   - cancelOrder(orderId, reason?)          : cancel_order RPC (pending만 가능)
//   - subscribeMyOrders(userId, callback)    : Realtime
//
// 설계:
//   - 주문 조회는 esg_orders + esg_order_items JOIN
//   - 마이페이지 결제대기 / 결제완료 분기는 payment_status로
//   - RPC 에러는 친절한 한국어 메시지로 매핑
// ============================================================================

import { supabase as _supabase } from './supabase';
import { callRpc } from './supabase';
import { notifyCartChanged } from './cart';
import { trackPurchase } from './analytics'; // ← [2026-06-02 추가] GA4 구매 완료 추적
import type {
  CreateBazaarOrderInput,
  CreateBazaarOrderResult,
  EsgOrderRow,
  EsgOrderItemRow,
  EsgPaymentStatus,
} from '@/types/esg';

// supabase-js 2.49 타입 추론 한계 우회 (TODO #1)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/** 주문 + 항목 JOIN (UI용) */
export interface OrderWithItems extends EsgOrderRow {
  items: EsgOrderItemRow[];
}

// ============================================================================
// RPC 에러 메시지 매핑
// ============================================================================

const RPC_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: '로그인이 필요합니다.',
  EVENT_ARCHIVED: '이벤트가 종료되었습니다.',
  BAZAAR_NOT_STARTED: '아직 판매 기간이 아닙니다.',
  BAZAAR_ENDED: '바자회가 종료되었습니다.',
  BAZAAR_NOT_CONFIGURED: '바자회 설정이 없습니다. 관리자에게 문의하세요.',
  ACTIVITY_PERIODS_NOT_CONFIGURED: '활동 기간 설정이 없습니다. 관리자에게 문의하세요.',
  PURCHASE_DISABLED: '구매가 일시 중단되었습니다. (관리자 설정)',
  // ← [추가 2026-06-29] 운영시간 외 차단 (esg_assert_bazaar_within_hours 트리거 RAISE 코드와 1:1)
  BAZAAR_OUTSIDE_HOURS: '지금은 구매 운영시간이 아니에요. 운영시간(매일 07:00~21:00)에 다시 시도해 주세요.',
  // ← [수정 2026-06-26] 선구매 자격 확장: 물품 기부자 OR 기부금 입금확인자 (esg_assert_bazaar_purchasable 트리거 RAISE 코드와 1:1)
  BAZAAR_PRESALE_NOT_ELIGIBLE: '선구매 기간에는 물품 기부자 또는 기부금 입금 확인자만 구매할 수 있어요. 공개 판매일부터 누구나 구매할 수 있습니다.', // ← [추가 2026-06-26] 신 정책 코드
  // ← [하위호환 2026-06-26] 구 정책 코드(물품 기부자 한정). 트리거 교체 전 인서트 대비해 동일 메시지로 유지.
  BAZAAR_PRESALE_DONOR_ONLY: '선구매 기간에는 물품 기부자 또는 기부금 입금 확인자만 구매할 수 있어요. 공개 판매일부터 누구나 구매할 수 있습니다.', // ← [수정 2026-06-26] 메시지 통일
  EMPTY_ITEMS: '주문 항목이 없습니다.',
  USER_NOT_FOUND: '사용자 정보를 찾을 수 없습니다.',
};

/** RPC 에러 코드를 사용자 친화적 메시지로 변환 */
function humanizeRpcError(error: string | undefined): string {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  if (RPC_ERROR_MESSAGES[error]) return RPC_ERROR_MESSAGES[error];
  if (error.startsWith('PRODUCT_NOT_FOUND')) return '상품을 찾을 수 없습니다.';
  if (error.startsWith('PRODUCT_NOT_ON_SALE')) return '판매 중지된 상품이 포함되어 있습니다.';
  if (error.startsWith('INSUFFICIENT_STOCK')) return '일부 상품의 재고가 부족합니다. 장바구니에서 확인해주세요.';
  return error;
}

// ============================================================================
// 생성
// ============================================================================

/**
 * 바자회 주문 생성.
 * - RPC 내부에서 재고 선점(reserved_stock 증가) + 장바구니 클리어
 * - 성공 시: 주문 정보 반환
 * - 실패 시: 친절한 에러 메시지 throw
 */
export async function createBazaarOrder(
  items: CreateBazaarOrderInput['p_items'],
  opts: { memo?: string; clearCart?: boolean } = {}
): Promise<CreateBazaarOrderResult> {
  if (items.length === 0) throw new Error('주문 항목이 없습니다.');

  // ← [2026-06-29] 트리거 RAISE가 RPC에서 재포장되는 경우(result.error)와 그대로 throw되는 경우
  //    둘 다 친절 메시지로 변환 (운영시간/선판매 등 서버 차단 코드가 raw로 노출되지 않도록).
  let result: CreateBazaarOrderResult;
  try {
    result = (await callRpc('create_bazaar_order', {
      p_items: items,
      p_memo: opts.memo,
      p_clear_cart: opts.clearCart !== false,
    } as CreateBazaarOrderInput)) as CreateBazaarOrderResult;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(humanizeRpcError(raw)); // 알 수 없는 메시지는 그대로 반환되므로 안전
  }

  if (!result.success) {
    throw new Error(humanizeRpcError(result.error));
  }

  // RPC가 esg_cart_items DELETE 했으므로 헤더 카운트 즉시 갱신
  // (Realtime DELETE 이벤트는 안 오므로 명시 호출 필수)
  if (opts.clearCart !== false) {
    notifyCartChanged();
  }

  notifyOrdersChanged(); // ← [2026-06-25] 결제대기 알림바/네비 dot 즉시 반영(Realtime 왕복 대기 X)

  trackPurchase({
    orderNumber: result.order_number,   // ← [2026-06-02 추가] transaction_id
    totalAmount: result.total_amount,   // ← [2026-06-02 추가] value (총액)
    items,                              // ← [2026-06-02 추가] 주문 품목 [{product_id, quantity}]
  }); // ← [2026-06-02 추가] GA4 purchase (성공 시에만)

  return result;
}

// ============================================================================
// [2026-07-07] 굿즈 — 일반결제 주문 / 펀딩 참여·진행률
// ============================================================================

/** 일반결제 굿즈 주문(create_goods_order). 이벤트 게이트 없음. order_type='goods'. */
export async function createGoodsOrder(
  items: { product_id: string; quantity: number }[],
  opts: { memo?: string; clearCart?: boolean } = {},
): Promise<{ success: boolean; order_number: string; total_amount: number }> {
  if (items.length === 0) throw new Error('주문 항목이 없습니다.');
  const { data, error } = await supabase.rpc('create_goods_order', {
    p_items: items,
    p_memo: opts.memo ?? null,
    p_clear_cart: opts.clearCart !== false,
  });
  if (error) throw new Error(humanizeRpcError(error.message));
  const result = data as { success: boolean; error?: string; order_number: string; total_amount: number };
  if (!result?.success) throw new Error(humanizeRpcError(result?.error));

  if (opts.clearCart !== false) notifyCartChanged();
  notifyOrdersChanged();
  trackPurchase({ orderNumber: result.order_number, totalAmount: result.total_amount, items });
  return result;
}

/** 펀딩 참여(예약). 결제 아님. 성공 시 pledged 주문 생성. */
export async function createFundingPledge(
  productId: string,
  quantity: number,
): Promise<{ success: boolean; order_number: string; quantity: number; total_amount: number }> {
  const { data, error } = await supabase.rpc('create_funding_pledge', { p_product_id: productId, p_quantity: quantity });
  if (error) throw new Error(error.message ?? '펀딩 참여에 실패했습니다.');
  const res = data as { success: boolean; error?: string; order_number: string; quantity: number; total_amount: number };
  if (!res?.success) {
    const map: Record<string, string> = {
      NOT_AUTHENTICATED: '로그인이 필요합니다.',
      NOT_FUNDING: '펀딩 상품이 아닙니다.',
      NOT_ON_SALE: '현재 참여할 수 없는 상품입니다.',
      FUNDING_CLOSED: '이미 마감된 펀딩입니다.',
      DEADLINE_PASSED: '펀딩 마감일이 지났습니다.',
    };
    throw new Error(map[res?.error ?? ''] ?? res?.error ?? '펀딩 참여에 실패했습니다.');
  }
  notifyOrdersChanged();
  return res;
}

/** 펀딩 진행률(공개 집계). */
export async function loadFundingProgress(productId: string): Promise<{
  goal_type: 'amount' | 'quantity' | null;
  goal_amount: number | null; goal_quantity: number | null;
  pledged_amount: number; pledged_quantity: number; backers: number;
  deadline: string | null; funding_status: 'live' | 'succeeded' | 'failed';
} | null> {
  const { data, error } = await supabase.rpc('esg_funding_progress', { p_product_id: productId });
  if (error) throw error;
  const res = data as { success: boolean; [k: string]: unknown };
  if (!res?.success) return null;
  return res as never;
}

// ── [2026-07-08] 배치 진행률 — 리스트에서 여러 펀딩 상품을 1회 조회(폴링용) ──────
export interface FundingProgressLite {
  funding_status: 'live' | 'succeeded' | 'failed';
  pledged_amount: number;
  pledged_quantity: number;
  backers: number;
}
export async function loadFundingProgressBatch(
  productIds: string[]
): Promise<Record<string, FundingProgressLite>> {
  if (productIds.length === 0) return {};
  const { data, error } = await supabase.rpc('esg_funding_progress_batch', { p_product_ids: productIds });
  if (error) throw error;
  return (data ?? {}) as Record<string, FundingProgressLite>;
}

// ── [2026-07-08] 내 펀딩 참여 횟수 — 상세 상단 '1회 이상 참여 문구'용 ──────────
export async function loadMyFundingPledgeCount(productId: string): Promise<number> {
  const { data, error } = await supabase.rpc('esg_my_funding_pledge_count', { p_product_id: productId });
  if (error) throw error;
  return (data as number) ?? 0;
}

// ── [2026-07-08] 관리자: 펀딩 참여자 조회 + 참여 소프트 취소 ──────────────────
export interface FundingParticipant {
  order_id: string;
  order_number: string;
  user_id: string;
  user_name: string;
  user_email: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  created_at: string;
}
export async function loadFundingParticipants(productId: string): Promise<FundingParticipant[]> {
  const { data, error } = await supabase.rpc('esg_admin_funding_participants', { p_product_id: productId });
  if (error) throw error;
  return (data ?? []) as FundingParticipant[];
}
export async function adminCancelFundingPledge(orderId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('esg_admin_cancel_funding_pledge', { p_order_id: orderId, p_reason: reason });
  if (error) throw error;
}

export interface LoadMyOrdersOptions {
  /** 특정 상태만 필터링 (예: ['pending'] 결제대기만) */
  statuses?: EsgPaymentStatus[];
  /** 주문 타입 필터 (bazaar / auction / goods). 배열이면 여러 타입 동시(예: ['bazaar','goods']) */
  orderType?: 'bazaar' | 'auction' | 'goods' | ('bazaar' | 'auction' | 'goods')[]; // ← [2026-07-07] goods + 배열
  limit?: number;
}

/** 내 주문 목록 (최신순, 항목 JOIN) */
export async function loadMyOrders(
  userId: string,
  opts: LoadMyOrdersOptions = {}
): Promise<OrderWithItems[]> {
  const { statuses, orderType, limit = 50 } = opts;
  let query = supabase
    .from('esg_orders')
    .select('*, items:esg_order_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statuses && statuses.length > 0) {
    query = query.in('payment_status', statuses);
  }
  if (orderType) {
    if (Array.isArray(orderType)) query = query.in('order_type', orderType); // ← [2026-07-07] 다중(예: 바자회+굿즈)
    else query = query.eq('order_type', orderType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OrderWithItems[];
}

/** 주문번호로 단일 조회. RLS가 본인 또는 관리자만 SELECT 허용 */
export async function loadOrderByNumber(
  orderNumber: string
): Promise<OrderWithItems | null> {
  const { data, error } = await supabase
    .from('esg_orders')
    .select('*, items:esg_order_items(*)')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (error) throw error;
  return data as OrderWithItems | null;
}

// ── [2026-06-25] 주문 식별자 통합 조회 (order_number 또는 id) ────────────────
//   [버그수정·근본] 알림 트리거가 링크를 '/orders/{id}'(UUID)로 만들어, order_number
//   로만 조회하던 OrderDetailPage 가 "주문을 찾을 수 없습니다"로 깨졌다(앱 내부 네비는
//   모두 order_number 사용 → 트리거만 deviation). 페이지가 둘 다 해석하도록 통합:
//   UUID 형식이면 id 로, 아니면 order_number 로 조회 → 기존 깨진 알림 링크까지 즉시 복구.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadOrderByNumberOrId(
  param: string
): Promise<OrderWithItems | null> {
  const col = UUID_RE.test(param) ? 'id' : 'order_number'; // UUID → id, 그 외 → order_number
  const { data, error } = await supabase
    .from('esg_orders')
    .select('*, items:esg_order_items(*)')
    .eq(col, param)
    .maybeSingle();
  if (error) throw error;
  return data as OrderWithItems | null;
}

// ============================================================================
// 취소
// ============================================================================

/**
 * 주문 강제 취소 (어드민 전용).
 *
 * ⚠️ 정책: 사용자는 직접 주문을 취소할 수 없음.
 *   - 입금 기한(주문 후 15분, order_expire_minutes)까지 미입금 → cron(expire_pending_orders)이 자동 처리
 *   - 어드민 페이지에서만 수동 호출 (예: 특수 사유 환불, 잘못된 주문 정리 등)
 *
 * - cancel_order RPC가 reserved_stock 복원 + status='cancelled'
 */
export async function cancelOrder(orderId: string, reason?: string): Promise<void> {
  const result = await callRpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  if (!r.success) {
    throw new Error(humanizeRpcError(r.error));
  }
}

// ============================================================================
// Realtime
// ============================================================================

/** 내 주문 변경 실시간 구독 (입금 확인되면 즉시 반영 등) */
export function subscribeMyOrders(userId: string, callback: () => void): () => void {
  const channelName = `esg-orders-${userId.slice(0, 8)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'esg_orders',
        filter: `user_id=eq.${userId}`,
      },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ── [2026-06-25] 주문 변경 즉시 신호 (window event) ──────────────────────────
//   주문 생성 직후 Realtime INSERT 도달을 기다리지 않고 같은 탭에서 즉시 갱신.
//   (cart 의 notifyCartChanged 와 동일 패턴 — 결제대기 알림바/네비 dot 라이브 반영)
//   서버측 상태변경(입금확인/만료)은 subscribeMyOrders Realtime 이 담당.
const ORDERS_CHANGED_EVENT = 'esg:orders-changed';

export function notifyOrdersChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ORDERS_CHANGED_EVENT));
  }
}

export function onOrdersChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(ORDERS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ORDERS_CHANGED_EVENT, handler);
}

// ============================================================================
// 헬퍼
// ============================================================================

/** 결제 상태 한국어 라벨 */
export const PAYMENT_STATUS_LABELS: Record<EsgPaymentStatus, string> = {
  pending: '입금 대기',
  paid: '결제 완료',
  cancelled: '취소됨',
  refunded: '환불됨',
  expired: '기한 만료',
  pledged: '펀딩 참여중', // ← [2026-07-07] 예약(결제 전) — 마감 달성 시 입금 대기로 전환
};

/** 상태별 색상 (UI에서 일관성) */
export const PAYMENT_STATUS_COLORS: Record<EsgPaymentStatus, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  paid: { bg: '#dcfce7', color: '#166534' },
  cancelled: { bg: '#f0f0f0', color: '#666' },
  refunded: { bg: '#dbeafe', color: '#1e40af' },
  expired: { bg: '#fee2e2', color: '#991b1b' },
  pledged: { bg: '#ede9fe', color: '#6d28d9' }, // ← [2026-07-07] 펀딩 참여중(보라)
};

/** pending 주문의 남은 시간 (ms). 만료됐으면 0 이하 */
export function getOrderTimeLeft(expiresAt: string): number {
  return new Date(expiresAt).getTime() - Date.now();
}

/**
 * 남은 시간을 4단위 한글 형식으로 표시 (모든 카운트다운에서 통일 사용).
 *
 * 형식: "02일:05시:30분:15초"
 *   - 항상 4단위 모두 표시 (2자리 패딩)
 *   - 만료 시: "만료됨"
 */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '만료됨';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d)}일:${pad(h)}시:${pad(m)}분:${pad(s)}초`;
}

/**
 * 짧은 카운트다운 "MM:SS" (15분 결제 정책 — 입금 대기 카운트다운용).  // ← [2026-06-25]
 * 0 이하면 "00:00". 60분 이상이면 분이 2자리+로 자연 증가(예: "75:00").
 */
export function formatShortCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * UTC ISO 문자열을 KST 종료 일시로 표시.
 * 형식: "2026-06-02 (월) 17:42 종료"
 */
export function formatKstEndDate(utcIso: string): string {
  if (!utcIso) return '';
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const w = weekdays[kst.getUTCDay()];
  return `${y}-${m}-${day} (${w}) ${h}:${min} 종료`;
}
