// ============================================================================
// adminOrders.ts — 주문/입금 확인 어드민 API
//
// 함수:
//   - loadAllOrders(filters)             : 조건에 맞는 주문 + items 전량 조회
//   - loadOrdersForExport()              : 필터 무시, 전 유형×전 상태 전량 (CSV용)
//   - markOrderPaid(orderId, ...)        : mark_order_paid RPC 호출 (어드민)
//   - cancelOrderAdmin(orderId, reason)  : cancel_order RPC 호출 (어드민)
//   - updateAdminMemo(orderId, memo)     : admin_memo 직접 UPDATE (어드민 RLS)
//   - subscribeAllOrders(callback)       : Realtime
//
// 데이터 흐름:
//   - 어드민 RLS: esg_orders 전체 SELECT/UPDATE 가능 (esg_is_admin())
//   - mark_order_paid는 SECURITY DEFINER + 내부에서 esg_is_admin() 검증
//   - 입금자명 매칭: payer_name 부분일치 검색 가능 (어드민이 은행 앱과 대조)
//
// ── [2026-07-14] CSV 누락(잘림) 근본 수정 ────────────────────────────────────
//   [원인 1] loadAllOrders 가 `.limit(200)` 하드캡 → 200건 초과분은 애초에 로드되지
//            않았고, CSV는 화면 state 만 내보내므로 그대로 잘렸다.
//   [원인 2] limit 을 지워도 PostgREST 는 서버 기본 max-rows(보통 1000)로 응답을
//            자른다. → range() 페이지네이션으로 끝까지 읽어야 한다.
//   [원인 3] esg_order_items 를 `.in('order_id', [모든 id])` 한 방에 조회 →
//            (a) max-rows 로 items 가 잘려 품목수/총수량/품목CSV 가 누락되고
//            (b) id 수가 늘면 GET URL 길이 초과(414)로 조회 자체가 실패한다.
//            → id 를 100개씩 청크 + 청크마다 range 순회.
//   [원인 4] 상품명 검색 사전조회(esg_order_items)도 max-rows 로 잘렸고, 매칭 id 를
//            or(id.in.(...)) 로 URL 에 실어 대량이면 414. → 텍스트 매칭 쿼리와
//            상품명 매칭 쿼리를 분리 실행 후 클라이언트에서 병합.
//   ⇒ 이제 loadAllOrders 는 조건에 맞는 "모든" 주문 + "모든" 품목을 반환한다.
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
// 페이지네이션 헬퍼                                            // ← [2026-07-14]
// ============================================================================

/** 한 페이지 행 수 (서버 max-rows 와 무관하게 range 로 끝까지 순회) */
const PAGE_SIZE = 1000; // ← [2026-07-14]

/** `.in()` 에 넣을 UUID 개수 — GET URL 길이(414) 안전선 */
const IN_CHUNK = 100; // ← [2026-07-14]

/** 배열을 size 단위로 자름 */
function chunk<T>(arr: T[], size: number): T[][] { // ← [2026-07-14]
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * PostgREST 쿼리를 range() 로 끝까지 순회해 전 행 반환.        // ← [2026-07-14]
 * build 는 "매 페이지마다 새 빌더"를 만들어야 한다(빌더는 1회용).
 * build 안에서 정렬을 고정해야(안정 정렬) 페이지 경계 중복/누락이 없다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllPaged<T>(build: () => any): Promise<T[]> { // ← [2026-07-14]
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break; // 마지막 페이지
  }
  return out;
}

// ============================================================================
// 필터
// ============================================================================

export interface LoadAllOrdersFilters {
  /** 상태 필터 — 미지정/빈 배열이면 전체 */
  statuses?: EsgPaymentStatus[];
  /** 타입 필터 — undefined면 전체 */
  type?: EsgOrderType;
  /** 검색어 — 주문번호/이메일/이름/입금자명/상품명 부분일치 */
  search?: string;
  /** 정렬 — 'newest' (created_at DESC) | 'oldest' */
  sortOrder?: 'newest' | 'oldest';
  /** 상한(선택). 미지정 시 조건에 맞는 전 건. // ← [2026-07-14] 기본 200 하드캡 제거 */
  limit?: number;
}

/**
 * 조건에 맞는 주문 + items 전량 조회.
 * 어드민 RLS 통과해야 모든 row 노출. 일반 사용자는 본인 것만 (RLS).
 */
export async function loadAllOrders(
  filters: LoadAllOrdersFilters = {}
): Promise<OrderWithItems[]> {
  const s = filters.search?.trim() ?? '';

  // ── 1) 주문 조회 ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseQuery = (): any => { // ← [2026-07-14] 공통 필터 + 안정 정렬 빌더 팩토리
    let q = supabase.from('esg_orders').select('*');
    if (filters.statuses && filters.statuses.length > 0) {
      q = q.in('payment_status', filters.statuses);
    }
    if (filters.type) {
      q = q.eq('order_type', filters.type);
    }
    return q
      .order('created_at', { ascending: filters.sortOrder === 'oldest' })
      .order('id', { ascending: true }); // ← [2026-07-14] 타이브레이크(페이지 경계 안정)
  };

  let orders: EsgOrderRow[] = [];

  if (!s) {
    orders = filters.limit
      ? await (async () => {
          const { data, error } = await baseQuery().limit(filters.limit as number);
          if (error) throw error;
          return (data ?? []) as EsgOrderRow[];
        })()
      : await fetchAllPaged<EsgOrderRow>(baseQuery); // ← [2026-07-14] 전량 순회
  } else {
    // ── [2026-07-14] 검색: (A) 주문 텍스트 매칭 + (B) 상품명 매칭 을 분리 조회 후 병합
    const orParts = [
      `order_number.ilike.%${s}%`,
      `user_email.ilike.%${s}%`,
      `user_name_snapshot.ilike.%${s}%`,
      `payer_name.ilike.%${s}%`,
    ];
    const textMatched = await fetchAllPaged<EsgOrderRow>(() =>
      baseQuery().or(orParts.join(','))
    ); // ← [2026-07-14]

    const pItems = await fetchAllPaged<{ order_id: string }>(() =>
      supabase
        .from('esg_order_items')
        .select('order_id')
        .ilike('product_name_snapshot', `%${s}%`)
        .order('order_id', { ascending: true })
    ); // ← [2026-07-14] 사전조회도 전량 순회
    const productOrderIds = [...new Set(pItems.map((r) => r.order_id))];

    const byProduct: EsgOrderRow[] = [];
    for (const ids of chunk(productOrderIds, IN_CHUNK)) { // ← [2026-07-14] 청크 IN (414 방지)
      const rows = await fetchAllPaged<EsgOrderRow>(() => baseQuery().in('id', ids));
      byProduct.push(...rows);
    }

    const merged = new Map<string, EsgOrderRow>();
    for (const o of [...textMatched, ...byProduct]) merged.set(o.id, o);
    const dir = filters.sortOrder === 'oldest' ? 1 : -1;
    orders = [...merged.values()].sort((a, b) => {
      const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return d !== 0 ? d * dir : a.id.localeCompare(b.id);
    }); // ← [2026-07-14] 병합 후 재정렬

    if (filters.limit) orders = orders.slice(0, filters.limit);
  }

  if (orders.length === 0) return [];

  // ── 2) items 조회 (청크 IN + 청크별 전량 순회) ──────────────────────────
  const orderIds = orders.map((o) => o.id);
  const items: EsgOrderItemRow[] = [];
  for (const ids of chunk(orderIds, IN_CHUNK)) { // ← [2026-07-14]
    const rows = await fetchAllPaged<EsgOrderItemRow>(() =>
      supabase
        .from('esg_order_items')
        .select('*')
        .in('order_id', ids)
        .order('id', { ascending: true })
    );
    items.push(...rows);
  }

  const itemsByOrder = new Map<string, EsgOrderItemRow[]>();
  for (const item of items) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  }

  return orders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.id) ?? [],
  }));
}

/**
 * [2026-07-14] CSV 전용 진입점 — 화면 필터를 무시하고
 * 전 유형(바자회/경매/굿즈) × 전 상태(펀딩참여중/입금대기/결제완료/취소/만료/환불) 전량.
 */
export async function loadOrdersForExport(): Promise<OrderWithItems[]> { // ← [2026-07-14]
  return loadAllOrders({ sortOrder: 'newest' });
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
