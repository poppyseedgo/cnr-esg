// ============================================================================
// adminWishlist.ts — 바자회 상품 "찜한 사람" 어드민 조회 API
//
// [변경 이력]
//   2026-06-25  최초 작성. 상품별 찜 명단/찜 수 조회(어드민 전용).
//
// [설계 — 근본 구조]
//   esg_wishlists RLS 는 본인 row 만 노출하므로 일반 SELECT 로는 타인의 찜을 못 본다.
//   → 서버의 SECURITY DEFINER RPC 2종(esg_is_admin() 가드 내장)을 호출한다.
//     · esg_product_wishlist_counts()         : 전체 상품 찜 수 일괄(페이지 진입 1회 → N+1 방지)
//     · esg_product_wishlist_users(p_product_id): 특정 상품 찜 명단(클릭 시 1회)
//   권한 검증은 전적으로 서버 함수가 수행(클라가 RPC를 직접 호출해도 NOT_ADMIN 차단).
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgWishlistUser } from '@/types/esg'; // ← 찜 명단 행 타입

// supabase-js 2.49 타입 추론 한계 우회 — 프로젝트 공통 컨벤션(wishlist.ts 등과 동일)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/**
 * 특정 상품을 찜한 사용자 명단(최신 찜 순).
 * @param productId esg_products.id
 * @throws RPC 에러(비관리자 호출 시 서버가 'NOT_ADMIN' 예외 → error 로 전달됨)
 */
export async function loadProductWishlistUsers(productId: string): Promise<EsgWishlistUser[]> {
  const { data, error } = await supabase.rpc('esg_product_wishlist_users', {
    p_product_id: productId,
  });
  if (error) throw error;
  return (data ?? []) as EsgWishlistUser[];
}

/**
 * 전체 상품 찜 수 집계. product_id → 찜 수 Map 으로 반환(카드 배지용).
 * 상품 관리 페이지 진입 시 1회 호출(각 카드가 Map 에서 O(1) 조회 → N+1 없음).
 */
export async function loadWishlistCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('esg_product_wishlist_counts');
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { product_id: string; wishlist_count: number }[]) {
    // RPC bigint → JS number(찜 수는 수백 단위라 안전 범위)
    map.set(row.product_id, Number(row.wishlist_count));
  }
  return map;
}
