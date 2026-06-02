// ============================================================================
// cart.ts — 장바구니 API
//
// 함수:
//   - loadMyCart(user)                     : 내 장바구니 + 상품 JOIN
//   - addToCart(user, productId, qty)      : 추가 (이미 있으면 quantity += qty)
//   - updateCartQuantity(itemId, quantity) : 수량 변경
//   - removeFromCart(itemId)               : 1개 항목 삭제
//   - clearMyCart(userId)                  : 전체 비우기
//   - getCartCount(userId)                 : 카운트만 (헤더 뱃지용)
//   - subscribeMyCart(userId, callback)    : Realtime
//
// 설계:
//   - 장바구니에 같은 상품 추가 시 quantity 증가 (별도 행 X)
//   - JOIN: esg_cart_items + esg_products → 가격/재고/이름 한 번에
//   - RLS: 본인 장바구니만 (user_id=auth.uid())
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgCartItemRow, EsgProductRow } from '@/types/esg';
import { trackAddToCart } from './analytics'; // ← [2026-06-02 추가] GA4 장바구니 담기 추적

// supabase-js 2.49 타입 추론 한계 우회 (TODO #1)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/** 장바구니 + 상품 정보 JOIN된 형태 (UI에서 사용) */
export interface CartItemWithProduct extends EsgCartItemRow {
  product: EsgProductRow;
}

// ============================================================================
// 조회
// ============================================================================

/** 내 장바구니 (상품 JOIN) — 추가된 순서 역순 (최근 추가가 위) */
export async function loadMyCart(userId: string): Promise<CartItemWithProduct[]> {
  const { data, error } = await supabase
    .from('esg_cart_items')
    .select('*, product:esg_products(*)')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) throw error;
  // product가 null인 항목(상품이 hidden된 경우 등) 필터링
  return ((data ?? []) as CartItemWithProduct[]).filter((item) => item.product);
}

/** 장바구니 아이템 수 (헤더 뱃지용 — 종류 수, 수량 합계 아님) */
export async function getCartCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('esg_cart_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

// ============================================================================
// 변경
// ============================================================================

/**
 * 장바구니에 추가.
 * - 같은 product가 이미 있으면 quantity 합산 (별도 행 안 만듦)
 * - 없으면 새 INSERT
 */
export async function addToCart(
  user: { id: string; email: string },
  productId: string,
  quantity: number
): Promise<void> {
  if (quantity < 1) throw new Error('수량은 1 이상이어야 합니다.');

  // 기존 항목 확인
  const { data: existing, error: checkErr } = await supabase
    .from('esg_cart_items')
    .select('id, quantity')
    .eq('user_id', user.id)
    .eq('product_id', productId)
    .maybeSingle();
  if (checkErr) throw checkErr;

  if (existing) {
    const { error } = await supabase
      .from('esg_cart_items')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('esg_cart_items').insert([
      {
        user_id: user.id,
        user_email: user.email,
        product_id: productId,
        quantity,
      },
    ]);
    if (error) throw error;
  }
  trackAddToCart(productId, quantity); // ← [2026-06-02 추가] GA4 add_to_cart (성공 시에만)
  notifyCartChanged(); // ← 같은 탭 즉시 갱신
}

/** 수량 변경 (1 이상이어야 함, 0이면 removeFromCart 사용) */
export async function updateCartQuantity(itemId: string, quantity: number): Promise<void> {
  if (quantity < 1) throw new Error('수량은 1 이상이어야 합니다. (0이면 삭제를 호출하세요)');
  const { error } = await supabase
    .from('esg_cart_items')
    .update({ quantity })
    .eq('id', itemId);
  if (error) throw error;
  notifyCartChanged(); // ← 같은 탭 즉시 갱신
}

/** 항목 삭제 */
export async function removeFromCart(itemId: string): Promise<void> {
  const { error } = await supabase.from('esg_cart_items').delete().eq('id', itemId);
  if (error) throw error;
  notifyCartChanged(); // ← 같은 탭 즉시 갱신
}

/** 장바구니 전체 비우기 */
export async function clearMyCart(userId: string): Promise<void> {
  const { error } = await supabase.from('esg_cart_items').delete().eq('user_id', userId);
  if (error) throw error;
  notifyCartChanged(); // ← 같은 탭 즉시 갱신
}

// ============================================================================
// 계산 헬퍼
// ============================================================================

/** 장바구니 총액 계산 */
export function calcCartTotal(items: CartItemWithProduct[]): {
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
} {
  let totalQuantity = 0;
  let totalAmount = 0;
  for (const item of items) {
    totalQuantity += item.quantity;
    totalAmount += item.product.price * item.quantity;
  }
  return {
    itemCount: items.length,
    totalQuantity,
    totalAmount,
  };
}

// ============================================================================
// Realtime 구독 + 즉시 신호
// ============================================================================

/**
 * 카트 변경 즉시 신호 (window event)
 *
 * Realtime DELETE 이벤트는 Supabase 제약상 즉시 도달이 보장 안 됨.
 * 게다가 postgres_changes의 filter는 DELETE에서 user_id를 못 비교함
 * (row가 이미 사라져서). 그래서 같은 탭에서의 즉시 갱신은 window event로 보장.
 *
 * 사용:
 *   - cart 변경하는 함수에서: notifyCartChanged()
 *   - 헤더에서: window.addEventListener('esg:cart-changed', ...)
 */
const CART_CHANGED_EVENT = 'esg:cart-changed';

export function notifyCartChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
  }
}

export function onCartChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(CART_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CART_CHANGED_EVENT, handler);
}

/**
 * 내 장바구니 변경 구독 (다른 탭/세션에서의 변경 동기화)
 *
 * ⚠️ filter 제거: Supabase Realtime의 postgres_changes는 DELETE 이벤트에서
 * filter 컬럼(`user_id`) 매칭이 작동하지 않음 (row가 이미 사라진 상태라 비교 불가).
 * → filter 없이 모든 cart_items 변경을 구독하되, RLS가 본인 row만 노출하므로
 *   다른 사용자 변경 이벤트는 어차피 보안 통과 못 함.
 * → 클라이언트 측에서 callback 실행 시 본인 데이터만 다시 조회하므로 안전.
 */
export function subscribeMyCart(userId: string, callback: () => void): () => void {
  const channelName = `esg-cart-${userId.slice(0, 8)}-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'esg_cart_items',
        // filter 제거 - DELETE 이벤트 받기 위해
      },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
