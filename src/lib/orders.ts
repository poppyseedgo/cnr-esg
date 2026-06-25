// ============================================================================
// orders.ts — 주문 관련 API
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
  // ← [2026-06-25] 선판매 기간 비기부자 차단 (esg_assert_bazaar_purchasable 트리거의 RAISE 코드와 1:1)
  BAZAAR_PRESALE_DONOR_ONLY: '물품 기부자 선판매 기간입니다. 일반 구매는 공개일부터 가능합니다.',
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

  const result = (await callRpc('create_bazaar_order', {
    p_items: items,
    p_memo: opts.memo,
    p_clear_cart: opts.clearCart !== false,
  } as CreateBazaarOrderInput)) as CreateBazaarOrderResult;

  if (!result.success) {
    throw new Error(humanizeRpcError(result.error));
  }

  // RPC가 esg_cart_items DELETE 했으므로 헤더 카운트 즉시 갱신
  // (Realtime DELETE 이벤트는 안 오므로 명시 호출 필수)
  if (opts.clearCart !== false) {
    notifyCartChanged();
  }

  trackPurchase({
    orderNumber: result.order_number,   // ← [2026-06-02 추가] transaction_id
    totalAmount: result.total_amount,   // ← [2026-06-02 추가] value (총액)
    items,                              // ← [2026-06-02 추가] 주문 품목 [{product_id, quantity}]
  }); // ← [2026-06-02 추가] GA4 purchase (성공 시에만)

  return result;
}

// ============================================================================
// 조회
// ============================================================================

export interface LoadMyOrdersOptions {
  /** 특정 상태만 필터링 (예: ['pending'] 결제대기만) */
  statuses?: EsgPaymentStatus[];
  /** 주문 타입 필터 (bazaar / auction) */
  orderType?: 'bazaar' | 'auction';
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
    query = query.eq('order_type', orderType);
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

// ============================================================================
// 취소
// ============================================================================

/**
 * 주문 강제 취소 (어드민 전용).
 *
 * ⚠️ 정책: 사용자는 직접 주문을 취소할 수 없음.
 *   - 입금 기한(주문 당일 23:59 KST)까지 미입금 → cron(expire_pending_orders)이 자동 처리
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
};

/** 상태별 색상 (UI에서 일관성) */
export const PAYMENT_STATUS_COLORS: Record<EsgPaymentStatus, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  paid: { bg: '#dcfce7', color: '#166534' },
  cancelled: { bg: '#f0f0f0', color: '#666' },
  refunded: { bg: '#dbeafe', color: '#1e40af' },
  expired: { bg: '#fee2e2', color: '#991b1b' },
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
