// ============================================================================
// adminOrders.ts — 주문/입금 확인 어드민 API
//
// 함수:
//   - loadAllOrders(filters)             : 전체 주문 + items 일괄 조회 (사용자 필터 없음)
//   - markOrderPaid(orderId, ...)        : mark_order_paid RPC 호출 (어드민)
//   - cancelOrderAdmin(orderId, reason)  : cancel_order RPC 호출 (어드민)
//   - updateAdminMemo(orderId, memo)     : admin_memo 직접 UPDATE (어드민 RLS)
//   - subscribeAllOrders(callback)       : Realtime
//
// 데이터 흐름:
//   - 어드민 RLS: esg_orders 전체 SELECT/UPDATE 가능 (esg_is_admin())
//   - mark_order_paid는 SECURITY DEFINER + 내부에서 esg_is_admin() 검증
//   - 입금자명 매칭: payer_name 부분일치 검색 가능 (어드민이 은행 앱과 대조)
// ============================================================================

import { supabase as _supabase } from './supabase';
import { callRpc } from './supabase';
import type {
  EsgOrderRow,
  EsgOrderItemRow,
  EsgPaymentStatus,
  EsgOrderType,
} from '@/types/esg';
import type { OrderWithItems } from './orders';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 필터
// ============================================================================

export interface LoadAllOrdersFilters {
  /** 상태 필터 — 빈 배열이면 전체 */
  statuses?: EsgPaymentStatus[];
  /** 타입 필터 — undefined면 전체 */
  type?: EsgOrderType;
  /** 검색어 — 주문번호/이메일/이름/입금자명/상품명 부분일치 */
  search?: string;
  /** 정렬 — 'newest' (created_at DESC) | 'oldest' */
  sortOrder?: 'newest' | 'oldest';
  limit?: number;
}

/**
 * 전체 주문 + items 일괄 조회.
 *
 * 어드민 RLS 통과해야 모든 row 노출. 일반 사용자는 본인 것만 (RLS).
 */
export async function loadAllOrders(
  filters: LoadAllOrdersFilters = {}
): Promise<OrderWithItems[]> {
  // 1) 주문 조회 (필터 적용)
  let query = supabase
    .from('esg_orders')
    .select('*')
    .limit(filters.limit ?? 200);

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('payment_status', filters.statuses);
  }
  if (filters.type) {
    query = query.eq('order_type', filters.type);
  }
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim();

    // ── [2026-07-01] 상품명 검색 추가 ──────────────────────────────────────
    //  product_name_snapshot 은 esg_order_items(다른 테이블)에 있으므로,
    //  먼저 매칭되는 order_id 집합을 구한 뒤 주문 쿼리의 or() 에 id.in 으로 합친다.
    const { data: pItems, error: pErr } = await supabase
      .from('esg_order_items')
      .select('order_id')
      .ilike('product_name_snapshot', `%${s}%`);
    if (pErr) throw pErr;
    const productOrderIds = [
      ...new Set(((pItems ?? []) as Array<{ order_id: string }>).map((r) => r.order_id)),
    ];

    // PostgREST or() 문법: 필드.연산자.값
    const orParts = [
      `order_number.ilike.%${s}%`,
      `user_email.ilike.%${s}%`,
      `user_name_snapshot.ilike.%${s}%`,
      `payer_name.ilike.%${s}%`,
    ];
    if (productOrderIds.length > 0) {
      orParts.push(`id.in.(${productOrderIds.join(',')})`); // ← [2026-07-01] 상품명 매칭 주문
    }
    query = query.or(orParts.join(','));
  }
  query = query.order('created_at', { ascending: filters.sortOrder === 'oldest' });

  const { data: ordersData, error: ordersErr } = await query;
  if (ordersErr) throw ordersErr;
  const orders = (ordersData ?? []) as EsgOrderRow[];

  if (orders.length === 0) return [];

  // 2) items 일괄 조회 (IN 절, N+1 방지)
  const orderIds = orders.map((o) => o.id);
  const { data: itemsData, error: itemsErr } = await supabase
    .from('esg_order_items')
    .select('*')
    .in('order_id', orderIds);
  if (itemsErr) throw itemsErr;

  const itemsByOrder = new Map<string, EsgOrderItemRow[]>();
  for (const item of (itemsData ?? []) as EsgOrderItemRow[]) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  }

  return orders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.id) ?? [],
  }));
}

// ============================================================================
// 입금 확인
// ============================================================================

export interface MarkOrderPaidInput {
  orderId: string;
  /** 실제 입금자명 (사용자 입력 payer_name과 다를 수 있음) */
  payerName?: string;
  /** 어드민 메모 (선택) */
  adminMemo?: string;
}

/** 입금 확인 — mark_order_paid RPC 호출 */
export async function markOrderPaid(input: MarkOrderPaidInput): Promise<void> {
  const result = await callRpc('mark_order_paid', {
    p_order_id: input.orderId,
    p_payer_name: input.payerName ?? undefined,
    p_admin_memo: input.adminMemo ?? undefined,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  if (!r.success) {
    throw new Error(humanizeOrderError(r));
  }
}

// ============================================================================
// 강제 취소
// ============================================================================

/** 어드민 강제 취소 — cancel_order RPC 호출 */
export async function cancelOrderAdmin(orderId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error('취소 사유는 필수입니다.');
  }
  const result = await callRpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  if (!r.success) {
    throw new Error(humanizeOrderError(r));
  }
}

// ============================================================================
// [2026-06-23] 잘못된 입금확인 복구 (paid 주문 전용 — 매출 원복)
// ============================================================================

/**
 * 입금 확인 취소 — paid → pending (admin_revert_order_payment RPC).
 * 바자회 재고를 mark_paid 역연산으로 복원하고, 주문을 '결제 대기'로 되돌림.
 * 매출(paid 합계)에서 자동 제외됨. 사유는 선택(어드민 메모에 기록).
 */
export async function revertOrderPayment(orderId: string, reason?: string): Promise<void> {
  const result = await callRpc('admin_revert_order_payment', {
    p_order_id: orderId,
    p_reason: reason?.trim() || undefined,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  if (!r.success) {
    throw new Error(humanizeOrderError(r));
  }
}

/**
 * 주문 취소(입금 후) — paid → cancelled (admin_cancel_paid_order RPC).
 * 바자회 판매분 재고를 복원하고, 주문을 '취소'로 전환. 매출에서 자동 제외됨.
 * 취소 사유 필수.
 */
export async function cancelPaidOrder(orderId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error('취소 사유는 필수입니다.');
  }
  const result = await callRpc('admin_cancel_paid_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  if (!r.success) {
    throw new Error(humanizeOrderError(r));
  }
}

// ============================================================================
// 어드민 메모 수정 (RPC 없이 직접 UPDATE — 어드민 RLS 통과)
// ============================================================================

export async function updateAdminMemo(orderId: string, memo: string): Promise<void> {
  const { error } = await supabase
    .from('esg_orders')
    .update({ admin_memo: memo || null, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

// ============================================================================
// [2026-07-10] 물품 수령완료 토글 (RPC 없이 직접 UPDATE — 어드민 RLS 통과)
//   received=true → received_at=now(), false → NULL. 결제 상태와 독립.
// ============================================================================

export async function setOrderReceived(orderId: string, received: boolean): Promise<void> {
  const { error } = await supabase
    .from('esg_orders')
    .update({
      received_at: received ? new Date().toISOString() : null, // ← [2026-07-10]
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  if (error) throw error;
}

// ============================================================================
// Realtime
// ============================================================================

export function subscribeAllOrders(callback: () => void): () => void {
  const channelName = `esg-admin-orders-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_orders' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// 에러 메시지 한국어화
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function humanizeOrderError(r: any): string {
  switch (r.error) {
    case 'NOT_ADMIN':
      return '관리자 권한이 필요합니다.';
    case 'ORDER_NOT_FOUND':
      return '주문을 찾을 수 없습니다.';
    case 'ORDER_NOT_PENDING':
      return `결제 대기 상태가 아닙니다 (현재: ${r.status}).`;
    case 'ORDER_NOT_PAID':
      return `결제 완료 상태가 아닙니다 (현재: ${r.status}). 이미 취소/대기 상태일 수 있어요.`;
    case 'REASON_REQUIRED':
      return '취소 사유는 필수입니다.';
    case 'NOT_AUTHORIZED':
      return '취소 권한이 없습니다.';
    case 'ORDER_ALREADY_FINAL':
      return '이미 완료/취소된 주문은 처리할 수 없습니다.';
    default:
      return r.error ?? '주문 처리 실패';
  }
}
