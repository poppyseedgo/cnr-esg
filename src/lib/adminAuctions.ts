// ============================================================================
// adminAuctions.ts — 어드민용 경매 관리 API
//
// 함수:
//   - createAuction(input)                 : 새 경매 등록
//   - updateAuction(id, patch)             : 경매 필드 수정 (호가 단위, 종료 시각, 이름, 설명, 이미지 등)
//   - cancelAuctionAdmin(id, reason)       : 경매 강제 취소 (status='cancelled')
//   - finalizeAuctionAdmin(id)             : 경매 강제 종료 (낙찰 처리)
//
// 어드민 RLS:
//   - esg_auctions.UPDATE는 esg_is_admin()만 통과
//   - finalize_auction RPC는 SECURITY DEFINER로 권한 우회
//
// 주의:
//   - finalize는 ends_at 이후만 가능 (RPC 검증)
//   - 강제 종료 원할 시 ends_at을 now()로 먼저 변경 후 finalize 호출
// ============================================================================

import { supabase as _supabase } from './supabase';
import { callRpc } from './supabase';
import type { EsgAuctionRow, EsgAuctionStatus } from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/** 새 경매 등록 입력 */
export interface CreateAuctionInput {
  product_name: string;
  description?: string | null;
  thumbnail_url?: string | null;
  detail_images?: string[];
  start_price: number;
  bid_unit: number;
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  status?: EsgAuctionStatus; // 기본 'scheduled'
  sort_order?: number;
  is_new?: boolean;          // ← [2026-06-09] "새 상품" 라벨
}

/** 어드민이 수정 가능한 경매 필드 */
export type AuctionPatch = Partial<
  Pick<
    EsgAuctionRow,
    | 'product_name'
    | 'description'
    | 'thumbnail_url'
    | 'detail_images'
    | 'start_price'
    | 'bid_unit'
    | 'starts_at'
    | 'ends_at'
    | 'status'
    | 'sort_order'
    | 'is_new'        // ← [2026-06-09]
  >
>;

/** 새 경매 등록. id 반환 */
export async function createAuction(input: CreateAuctionInput): Promise<EsgAuctionRow> {
  if (!input.product_name || input.product_name.trim().length === 0) {
    throw new Error('상품명을 입력해주세요.');
  }
  if (input.start_price < 0) throw new Error('시작가는 0 이상이어야 합니다.');
  if (input.bid_unit < 100) throw new Error('호가 단위는 100원 이상이어야 합니다.');
  if (new Date(input.ends_at) <= new Date(input.starts_at)) {
    throw new Error('종료 시각은 시작 시각보다 뒤여야 합니다.');
  }

  const { data, error } = await supabase
    .from('esg_auctions')
    .insert([
      {
        product_name: input.product_name.trim(),
        description: input.description ?? null,
        thumbnail_url: input.thumbnail_url ?? null,
        detail_images: input.detail_images ?? [],
        start_price: input.start_price,
        bid_unit: input.bid_unit,
        current_price: input.start_price, // 시작가 = 초기 현재가
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        status: input.status ?? 'scheduled',
        sort_order: input.sort_order ?? 0,
        is_new: input.is_new ?? false,   // ← [2026-06-09]
      },
    ])
    .select('*')
    .single();
  if (error) throw error;
  return data as EsgAuctionRow;
}

/**
 * 경매 필드 수정.
 *
 * - 진행 중(active) 경매의 호가 단위 변경은 권장하지 않음 (UI에서 확인 다이얼로그)
 * - 현재가/최고 입찰자는 어드민이 직접 수정 안 함 (RPC 통해서만)
 */
export async function updateAuction(id: string, patch: AuctionPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from('esg_auctions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** 경매 강제 취소 */
export async function cancelAuctionAdmin(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('esg_auctions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['scheduled', 'active']);
  if (error) throw error;
  void reason; // 추후 audit_log
}

/** 경매 영구 삭제 — 상태/입찰 무관(서버 RPC가 접수대장 연결 해제 후 삭제). // ← [2026-06-23] */
export async function deleteAuctionAdmin(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('esg_delete_auction', { p_auction_id: id });
  if (error) throw new Error(error.message ?? '삭제 실패');
  const res = data as { success: boolean; error?: string };
  if (!res?.success) {
    if (res?.error === 'NOT_ADMIN') throw new Error('관리자만 삭제할 수 있습니다.');
    if (res?.error === 'AUCTION_NOT_FOUND') throw new Error('경매를 찾을 수 없습니다.');
    throw new Error(res?.error ?? '삭제 실패');
  }
}

/** 경매 강제 종료 (낙찰 처리) */
export async function finalizeAuctionAdmin(id: string): Promise<{
  hasWinner: boolean;
  orderNumber?: string;
  finalPrice?: number;
}> {
  const { error: upErr } = await supabase
    .from('esg_auctions')
    .update({
      ends_at: new Date(Date.now() - 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (upErr) throw upErr;

  const result = await callRpc('finalize_auction', { p_auction_id: id });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  if (!r.success) {
    throw new Error(r.error ?? 'finalize_auction failed');
  }
  return {
    hasWinner: !!r.has_winner,
    orderNumber: r.order_number,
    finalPrice: r.winner_final_price,
  };
}
