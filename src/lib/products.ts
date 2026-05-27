// ============================================================================
// products.ts — 바자회 상품 API
//
// 함수:
//   - loadProducts(opts?)              : 상품 목록 (on_sale 또는 sold_out)
//   - loadProduct(id)                  : 단일 상품
//   - subscribeProducts(callback)      : Realtime (재고 변경 실시간 반영)
//   - getAvailableStock(product)       : 가용 재고 계산 (stock - reserved_stock)
//
// 설계:
//   - status='on_sale'만 일반 노출 (hidden은 어드민만, sold_out은 회색 처리)
//   - 재고는 stock(전체) - reserved_stock(주문 선점) = available_stock
//   - Realtime 채널 unique
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgProductRow, EsgProductStatus } from '@/types/esg';

// supabase-js 2.49 타입 추론 한계 우회 (TODO #1: 자동 생성 타입 도입 시 제거)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface LoadProductsOptions {
  /** 'all'이면 hidden 제외하고 on_sale + sold_out, 'on_sale_only'면 on_sale만 */
  scope?: 'all' | 'on_sale_only';
}

/** 상품 목록 (정렬: sort_order ASC, 그 다음 created_at) */
export async function loadProducts(opts: LoadProductsOptions = {}): Promise<EsgProductRow[]> {
  const { scope = 'all' } = opts;
  const statuses: EsgProductStatus[] = scope === 'on_sale_only' ? ['on_sale'] : ['on_sale', 'sold_out'];

  const { data, error } = await supabase
    .from('esg_products')
    .select('*')
    .in('status', statuses)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EsgProductRow[];
}

/** 단일 상품 조회 (hidden 포함 — 본인이 직접 URL로 들어왔을 때를 위해 RLS가 차단) */
export async function loadProduct(id: string): Promise<EsgProductRow | null> {
  const { data, error } = await supabase
    .from('esg_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as EsgProductRow | null;
}

// ============================================================================
// 헬퍼
// ============================================================================

/**
 * 가용 재고 = 전체 재고 - 주문 선점.
 * 0 이하면 0 반환 (음수 가드).
 */
export function getAvailableStock(product: Pick<EsgProductRow, 'stock' | 'reserved_stock'>): number {
  return Math.max(0, product.stock - product.reserved_stock);
}

/** 품절 여부 (status 또는 available_stock 기준) */
export function isSoldOut(product: EsgProductRow): boolean {
  return product.status === 'sold_out' || getAvailableStock(product) <= 0;
}

// ============================================================================
// Realtime 구독
// ============================================================================

/**
 * 상품 변경 실시간 구독 (재고 변경 / 상태 변경 즉시 반영).
 * 채널 이름 unique. cleanup 함수 반환.
 */
export function subscribeProducts(callback: () => void): () => void {
  const channelName = `esg-products-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_products' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
