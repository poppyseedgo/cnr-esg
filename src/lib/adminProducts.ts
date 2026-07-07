// ============================================================================
// adminProducts.ts — 바자회 상품 어드민 API
//
// 함수:
//   - createProduct(input)        : 새 상품 등록 (어드민만 RLS 통과)
//   - updateProduct(id, patch)    : 상품 수정
//   - deleteProduct(id)           : 상품 하드삭제 (정책 ㉠ 가드)
//   - hideProduct(id)             : 상품 숨김 (소프트삭제 = status='hidden')
//   - unhideProduct(id)           : 숨김 해제 (가용재고>0 → on_sale, else sold_out)
//   - reorderProducts(orderedIds) : 어드민 드래그 재정렬 (sort_order 1..N 일괄, reorder_products RPC)
//   - loadAllProducts()           : 모든 상품 (hidden 포함)
//
// [삭제 정책 ㉠] (2026-06-17 고지님 결정)
//   - 완료(paid) 주문 또는 Q&A가 있는 상품 → 하드삭제 금지, "숨김"만 허용.
//   - DB BEFORE DELETE 트리거(20260617_001)가 최종 강제. lib은 친화 메시지용 사전 점검.
//   - 진행 중(pending) 주문(reserved_stock>0)도 차단 → 숨김 유도.
//
// 동시성:
//   - reserved_stock은 create_bazaar_order RPC가 관리 → 어드민이 직접 변경 안 함
//   - stock 변경 시 reserved_stock > stock인 상황 주의 (어드민 책임)
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgProductRow, EsgProductStatus, EsgProductSection } from '@/types/esg'; // ← [2026-07-07] section

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
  section?: EsgProductSection; // ← [2026-07-07] 'bazaar'(기본) | 'goods'
  // ── [2026-07-07] 펀딩(All-or-Nothing) ──
  purchase_type?: import('@/types/esg').EsgPurchaseType;                 // 'normal'(기본) | 'funding'
  funding_goal_type?: import('@/types/esg').EsgFundingGoalType | null;   // 'amount' | 'quantity'
  funding_goal_amount?: number | null;
  funding_goal_quantity?: number | null;
  funding_deadline?: string | null;                                     // ISO
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
    | 'is_pinned'     // ← [2026-06-17] 상품 고정
    | 'is_new'        // ← [2026-06-09]
    | 'sale_price'    // ← [2026-06-09]
    | 'label_text'    // ← [2026-07-06] 커스텀 라벨
    | 'label_bg'      // ← [2026-07-06]
    | 'label_color'   // ← [2026-07-06]
    | 'purchase_type'         // ← [2026-07-07] 펀딩
    | 'funding_goal_type'     // ← [2026-07-07]
    | 'funding_goal_amount'   // ← [2026-07-07]
    | 'funding_goal_quantity' // ← [2026-07-07]
    | 'funding_deadline'      // ← [2026-07-07]
  >
>;

/** 모든 상품 조회 (어드민 - hidden 포함). section 지정 시 해당 섹션만(미지정=전체, 하위호환) */
export async function loadAllProducts(section?: EsgProductSection): Promise<EsgProductRow[]> { // ← [2026-07-07] section 필터
  let query = supabase
    .from('esg_products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (section) query = query.eq('section', section); // ← [2026-07-07] 굿즈/바자회 분리 (미지정 시 기존과 동일)
  const { data, error } = await query;
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

  // ← [2026-07-07] 펀딩 정규화: normal 이면 모든 펀딩필드 NULL. funding 이면 목표유형에 따라 한쪽만 채움.
  const isFunding = input.purchase_type === 'funding';
  const goalType = isFunding ? (input.funding_goal_type ?? 'quantity') : null;
  const fundingCols = isFunding
    ? {
        purchase_type: 'funding',
        funding_goal_type: goalType,
        funding_goal_amount: goalType === 'amount' ? (input.funding_goal_amount ?? null) : null,
        funding_goal_quantity: goalType === 'quantity' ? (input.funding_goal_quantity ?? null) : null,
        funding_deadline: input.funding_deadline ?? null,
        funding_status: 'live', // 등록 즉시 진행중
      }
    : {
        purchase_type: 'normal',
        funding_goal_type: null, funding_goal_amount: null, funding_goal_quantity: null,
        funding_deadline: null, funding_status: null,
      };

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
        section: input.section ?? 'bazaar', // ← [2026-07-07] 섹션(미지정=바자회, 기존과 동일)
        ...fundingCols,                  // ← [2026-07-07] 펀딩 필드
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
 * 상품 하드삭제 — 정책 ㉠ 가드.
 *
 * 차단 조건 (하나라도 해당하면 throw → 숨김 유도):
 *   1) reserved_stock > 0           : 진행 중(pending) 주문 존재
 *   2) 완료(paid) 주문 항목 존재     : 판매 이력 보존 필요
 *   3) Q&A 존재                      : 문의 이력 보존 필요
 * 모두 0이면 물리 DELETE. (DB BEFORE DELETE 트리거가 최종 강제 — 여기선 친화 메시지용 사전 점검)
 *
 * 참고: FK는 cart_items=CASCADE / order_items=SET NULL / bazaar_intake=SET NULL.
 *       흔적 없는 상품 삭제 시 정상 연쇄 처리됨.
 */
export async function deleteProduct(id: string): Promise<void> {
  // 1) 진행 중(pending) 주문 — reserved_stock                          // ← [정책㉠] 기존 가드 유지
  const { data: product, error: fetchErr } = await supabase
    .from('esg_products')
    .select('reserved_stock, name')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;
  if ((product?.reserved_stock ?? 0) > 0) {                              // ← null 안전 비교
    throw new Error(
      `진행 중인 주문이 ${product.reserved_stock}개 있습니다. 삭제 대신 "숨김"으로 변경하세요.`
    );
  }

  // 2) 완료(paid) 주문 항목 존재 여부                                   // ← [정책㉠ 신규] 완료 주문 차단
  const { count: paidCount, error: paidErr } = await supabase
    .from('esg_order_items')
    .select('id, esg_orders!inner(payment_status)', { count: 'exact', head: true })
    .eq('product_id', id)
    .eq('esg_orders.payment_status', 'paid');
  if (paidErr) throw paidErr;
  if ((paidCount ?? 0) > 0) {
    throw new Error(
      `완료된 주문이 ${paidCount}건 있어 삭제할 수 없습니다. 판매 이력 보존을 위해 "숨김"으로 변경하세요.`
    );
  }

  // 3) 상품 Q&A 존재 여부                                              // ← [정책㉠ 신규] Q&A 차단
  const { count: qnaCount, error: qnaErr } = await supabase
    .from('esg_product_questions')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);
  if (qnaErr) throw qnaErr;
  if ((qnaCount ?? 0) > 0) {
    throw new Error(
      `등록된 Q&A가 ${qnaCount}건 있어 삭제할 수 없습니다. 문의 이력 보존을 위해 "숨김"으로 변경하세요.`
    );
  }

  // 흔적 없음 → 하드 삭제 (트리거 백스톱 통과)                          // ← 기존 동작
  const { error } = await supabase.from('esg_products').delete().eq('id', id);
  if (error) throw error;
}

/**
 * 상품 숨김 (소프트삭제 = status='hidden'). 정책 ㉠의 권장 경로.
 * 사용자 화면(목록/상세)에서 비노출되지만 주문/Q&A 이력은 그대로 보존.
 */
export async function hideProduct(id: string): Promise<void> {            // ← [정책㉠ 신규] 숨김 API
  const { error } = await supabase
    .from('esg_products')
    .update({ status: 'hidden', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * 숨김 해제 — 가용재고(stock-reserved_stock)에 따라 on_sale / sold_out 복귀.
 */
export async function unhideProduct(id: string): Promise<void> {          // ← [정책㉠ 신규] 숨김 해제 API
  const { data, error: fErr } = await supabase
    .from('esg_products')
    .select('stock, reserved_stock')
    .eq('id', id)
    .single();
  if (fErr) throw fErr;
  const available = (data?.stock ?? 0) - (data?.reserved_stock ?? 0);     // ← 가용재고 산출
  const status: EsgProductStatus = available > 0 ? 'on_sale' : 'sold_out';
  const { error } = await supabase
    .from('esg_products')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * 어드민 전체 리스트 드래그 재정렬.                                       // ← [2026-06-17 신규]
 * 받은 id 순서대로 sort_order = 1..N 일괄 재할당 (reorder_products RPC, 관리자만, 원자적).
 * 고정과 무관하게 전체 물품 대상. (고정 그룹 내부 순서도 이 sort_order로 결정됨)
 */
export async function reorderProducts(orderedIds: string[], section?: EsgProductSection): Promise<void> { // ← [2026-07-07] section
  // ← [2026-07-07] 굿즈는 섹션 격리 RPC(바자회 sort_order 무간섭). 바자회/미지정은 기존 RPC 그대로(무손상).
  if (section === 'goods') {
    const { error } = await supabase.rpc('reorder_products_in_section', { p_ids: orderedIds, p_section: 'goods' });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.rpc('reorder_products', { p_ids: orderedIds });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error ?? '재정렬에 실패했습니다.');
}

// ============================================================================
// [2026-07-07] 펀딩(Funding) — 관리자 마감확정 / 진행률
// ============================================================================

/** 펀딩 마감 수동 확정(관리자). 달성→참여자 주문 pending 전환, 미달→cancelled. 멱등. */
export async function finalizeFunding(productId: string): Promise<{
  met?: boolean; status?: string; goal?: number; achieved?: number; affected_orders?: number; already?: boolean;
}> {
  const { data, error } = await supabase.rpc('finalize_funding', { p_product_id: productId });
  if (error) throw new Error(error.message ?? '펀딩 확정에 실패했습니다.');
  const res = data as { success: boolean; error?: string; [k: string]: unknown };
  if (!res?.success) {
    if (res?.error === 'FORBIDDEN') throw new Error('관리자만 확정할 수 있습니다.');
    if (res?.error === 'DEADLINE_NOT_REACHED') throw new Error('아직 마감일이 지나지 않았습니다.');
    if (res?.error === 'NOT_FUNDING') throw new Error('펀딩 상품이 아닙니다.');
    throw new Error(res?.error ?? '펀딩 확정에 실패했습니다.');
  }
  return res as { met?: boolean; status?: string; goal?: number; achieved?: number; affected_orders?: number; already?: boolean };
}

/** 펀딩 진행률 조회(공개 집계) — 진행/달성 금액·수량·참여자 수. */
export async function loadFundingProgress(productId: string): Promise<{
  goal_type: 'amount' | 'quantity' | null;
  goal_amount: number | null;
  goal_quantity: number | null;
  pledged_amount: number;
  pledged_quantity: number;
  backers: number;
  deadline: string | null;
  funding_status: 'live' | 'succeeded' | 'failed';
} | null> {
  const { data, error } = await supabase.rpc('esg_funding_progress', { p_product_id: productId });
  if (error) throw error;
  const res = data as { success: boolean; [k: string]: unknown };
  if (!res?.success) return null;
  return res as never;
}
