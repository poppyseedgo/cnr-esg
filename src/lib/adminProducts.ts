// ============================================================================
// adminProducts.ts — 바자회 상품 어드민 API
//
// 함수:
//   - createProduct(input)        : 새 상품 등록 (어드민만 RLS 통과)
//   - updateProduct(id, patch)    : 상품 수정
//   - deleteProduct(id)           : 상품 삭제
//                                   ※ reserved_stock > 0 또는 주문이 있으면 status='hidden' 권장
//   - loadAllProducts()           : 모든 상품 (hidden 포함)
//
// 동시성:
//   - reserved_stock은 create_bazaar_order RPC가 관리 → 어드민이 직접 변경 안 함
//   - stock 변경 시 reserved_stock > stock인 상황 주의 (어드민 책임)
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgProductRow, EsgProductStatus } from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface CreateProductInput {
  name: string;
  description?: string | null;
  price: number;
  stock: number;
  thumbnail_url?: string | null;
  detail_images?: string[];
  status?: EsgProductStatus;
  sort_order?: number;
  is_new?: boolean;            // ← [2026-06-09] "새 상품" 라벨
  sale_price?: number | null;  // ← [2026-06-09] 세일가(NULL=세일 아님)
}

export type UpdateProductPatch = Partial<
  Pick<
    EsgProductRow,
    | 'name'
    | 'description'
    | 'price'
    | 'stock'
    | 'thumbnail_url'
    | 'detail_images'
    | 'status'
    | 'sort_order'
    | 'is_new'        // ← [2026-06-09]
    | 'sale_price'    // ← [2026-06-09]
  >
>;

/** 모든 상품 조회 (어드민 - hidden 포함) */
export async function loadAllProducts(): Promise<EsgProductRow[]> {
  const { data, error } = await supabase
    .from('esg_products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EsgProductRow[];
}

/** 새 상품 등록. id 반환 */
export async function createProduct(input: CreateProductInput): Promise<EsgProductRow> {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('상품명을 입력해주세요.');
  }
  if (input.price < 0) throw new Error('가격은 0 이상이어야 합니다.');
  if (input.stock < 0) throw new Error('재고는 0 이상이어야 합니다.');
  // ← [2026-06-09] 세일가 검증: 0 이상 & 정상가 미만(=실제 할인)일 때만 의미. 그 외엔 NULL로 저장.
  const saleClean =
    input.sale_price != null && input.sale_price >= 0 && input.sale_price < input.price
      ? input.sale_price
      : null;

  const { data, error } = await supabase
    .from('esg_products')
    .insert([
      {
        name: input.name.trim(),
        description: input.description ?? null,
        price: input.price,
        stock: input.stock,
        thumbnail_url: input.thumbnail_url ?? null,
        detail_images: input.detail_images ?? [],
        status: input.status ?? 'on_sale',
        sort_order: input.sort_order ?? 0,
        is_new: input.is_new ?? false,   // ← [2026-06-09]
        sale_price: saleClean,           // ← [2026-06-09]
      },
    ])
    .select('*')
    .single();
  if (error) throw error;
  return data as EsgProductRow;
}

/** 상품 수정 */
export async function updateProduct(id: string, patch: UpdateProductPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  // 가벼운 검증
  if (patch.price !== undefined && patch.price < 0) throw new Error('가격은 0 이상이어야 합니다.');
  if (patch.stock !== undefined && patch.stock < 0) throw new Error('재고는 0 이상이어야 합니다.');
  // ← [2026-06-09] 세일가: 음수 금지. (정상가 미만 여부는 폼에서 실시간 강제)
  if (patch.sale_price !== undefined && patch.sale_price !== null && patch.sale_price < 0) {
    throw new Error('세일가는 0 이상이어야 합니다.');
  }

  const { error } = await supabase
    .from('esg_products')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * 상품 삭제.
 *
 * 주의:
 *   - reserved_stock > 0 이면 진행 중 주문 존재 → 삭제 대신 status='hidden' 권장
 *   - 이미 결제 완료된 주문이 있어도 외래키(esg_order_items.product_id)가 SET NULL이라 DB는 허용
 *     단, 사용자 마이페이지에서 product_name_snapshot으로만 표시되므로 영향 없음
 */
export async function deleteProduct(id: string): Promise<void> {
  // 진행 중 주문 체크
  const { data: product, error: fetchErr } = await supabase
    .from('esg_products')
    .select('reserved_stock, name')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  if (product?.reserved_stock > 0) {
    throw new Error(
      `진행 중인 주문이 ${product.reserved_stock}개 있습니다. 삭제 대신 "숨김(hidden)" 상태로 변경하세요.`
    );
  }

  const { error } = await supabase.from('esg_products').delete().eq('id', id);
  if (error) throw error;
}
