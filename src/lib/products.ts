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
  limit?: number;  // ← [2026-06-04] 무한 스크롤 페이징
  offset?: number; // ← [2026-06-04]
  search?: string; // ← [2026-06-17] 상품 이름 검색(서버사이드 ilike, %·_ 는 리터럴)
  tagId?: string;  // ← [2026-06-22] 단일 태그 필터(inner join)
  tagIds?: string[]; // ← [2026-06-23] 다중 태그 AND 필터(레거시: 모두 가진 교집합)
  /**
   * [2026-06-24] 패싯(다중선택) 필터. 그룹 = 축(카테고리/브랜드).
   *  · 그룹 '내' 여러 태그 = OR (식품 OR 여성의류)
   *  · 그룹 '간' = AND ((식품 OR 여성의류) AND (브랜드A OR 브랜드B))
   *  예: tagGroups=[[catId1,catId2],[brandId1]]  → RPC esg_product_ids_with_tag_groups
   */
  tagGroups?: string[][];
  sort?: 'reg' | 'price_desc' | 'price_asc'; // ← [2026-06-24] 정렬: 등록순(기본) / 높은가격 / 낮은가격
}

/** 상품 목록 (정렬: 고정(is_pinned) 먼저 → sort_order ASC → created_at) */
export async function loadProducts(opts: LoadProductsOptions = {}): Promise<EsgProductRow[]> {
  const { scope = 'all', limit, offset = 0, search, tagId, tagIds, tagGroups, sort = 'reg' } = opts;   // ← [2026-06-24] tagGroups(패싯)
  const statuses: EsgProductStatus[] = scope === 'on_sale_only' ? ['on_sale'] : ['on_sale', 'sold_out'];

  // ── [2026-06-24] 태그 필터 정규화 → '그룹' 배열로 통일 ──────────────────────
  //  · tagGroups(패싯) 우선: [[cat…],[brand…]] 형태. 그룹 내 OR, 그룹 간 AND.
  //  · 레거시 tagIds(모두 가진 AND)/단일 tagId 는 단일 그룹으로 흡수해 호환 유지.
  const groups: string[][] = (tagGroups && tagGroups.some((g) => g.length > 0))
    ? tagGroups.filter((g) => g.length > 0)
    : (tagIds && tagIds.length > 0) ? [tagIds] : (tagId ? [[tagId]] : []);
  const flat = groups.flat();

  // 태그 2개 이상(다중선택/다축) → 그룹 RPC로 매칭 상품 id 집합 산출(.in('id', …))
  //  RPC 계약: p_groups jsonb = 태그 그룹 배열, '그룹 내 OR + 그룹 간 AND' 교집합 반환.
  let matchIds: string[] | null = null;
  if (flat.length >= 2) {
    const { data: m, error: mErr } = await supabase.rpc('esg_product_ids_with_tag_groups', { p_groups: groups });
    if (mErr) throw mErr;
    matchIds = ((m ?? []) as Array<{ product_id: string }>).map((r) => r.product_id);
    if (matchIds.length === 0) return []; // 매칭 없음 → 빈 결과
  }

  // 태그 정확히 1개면 기존 inner join(효율적), 그 외엔 일반 select + .in('id', …)
  const singleTagId = flat.length === 1 ? flat[0] : null;
  const selectCols = singleTagId ? '*, esg_product_tags!inner(tag_id)' : '*';

  let query = supabase
    .from('esg_products')
    .select(selectCols)
    .in('status', statuses);

  // ── [2026-06-24] 정렬 분기 ─────────────────────────────────────────────
  //  · reg(기본): 고정 먼저 → sort_order → created_at (기존 동작 보존)
  //  · price_desc/asc: 가격 우선 정렬(고정 무시), created_at 으로 동순위 타이브레이크
  if (sort === 'price_desc') {
    query = query.order('price', { ascending: false }).order('created_at', { ascending: false });
  } else if (sort === 'price_asc') {
    query = query.order('price', { ascending: true }).order('created_at', { ascending: false });
  } else {
    query = query
      .order('is_pinned', { ascending: false })  // ← [2026-06-17] 고정 상품 맨 앞
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
  }

  if (singleTagId) {
    query = query.eq('esg_product_tags.tag_id', singleTagId);   // ← [2026-06-22] 해당 태그만
  }
  if (matchIds) {
    query = query.in('id', matchIds);   // ← [2026-06-23] 다중 태그 교집합
  }

  const q = (search ?? '').trim();
  if (q) {
    const safe = q.replace(/[\\%_]/g, '\\$&'); // %, _ 는 와일드카드 아닌 리터럴로 처리
    query = query.ilike('name', `%${safe}%`); // ← [2026-06-17] 이름 부분일치
  }

  if (typeof limit === 'number') query = query.range(offset, offset + limit - 1); // ← [2026-06-04] 페이징

  const { data, error } = await query;
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
// 세일가 / "새 상품" — 표시·결제 공용 SSOT (2026-06-09)
//   ※ 카드·상세·장바구니·결제 합계 모두 이 함수들을 사용 (서버 RPC와 동일 규칙).
//   ※ 세일 판정 규칙(서버 create_bazaar_order 와 1:1): sale_price != null && sale_price < price
// ============================================================================

type SaleFields = Pick<EsgProductRow, 'price' | 'sale_price'>;

/** 유효 세일가. 세일 중이 아니면 null (sale_price가 정상가 이상이면 세일 아님) */
export function getEffectiveSalePrice(p: SaleFields): number | null {
  if (p.sale_price != null && p.sale_price < p.price) return p.sale_price;
  return null;
}

/** 세일 중 여부 */
export function isOnSale(p: SaleFields): boolean {
  return getEffectiveSalePrice(p) !== null;
}

/** 실제 결제/표시 단가 = 세일 중이면 세일가, 아니면 정상가 */
export function getDisplayPrice(p: SaleFields): number {
  return getEffectiveSalePrice(p) ?? p.price;
}

/**
 * 원가 대비 할인율(%). 세일 아니면 null.
 * 할인율 = round((정상가 − 세일가) / 정상가 × 100). price=0 가드.
 */
export function getDiscountPercent(p: SaleFields): number | null {
  const sale = getEffectiveSalePrice(p);
  if (sale === null || p.price <= 0) return null;
  return Math.round(((p.price - sale) / p.price) * 100);
}

/** "새 상품" 라벨 여부 (수동 플래그) */
export function isNewProduct(p: Pick<EsgProductRow, 'is_new'>): boolean {
  return p.is_new === true;
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
