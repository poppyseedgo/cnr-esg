// ============================================================================
// API 호출 래퍼
//
// 원칙:
//   - 모든 DB/RPC 호출은 이 모듈을 통해서 (직접 supabase 호출 최소화)
//   - 에러는 throw로 일관 처리
//   - 페이지네이션이 필요한 쿼리는 자동 처리 (1000-row 제한 우회)
//
// Phase 0-2B 범위:
//   - 설정값 로드 (esg_settings)
//   - 모금 통계 (esg_donation_stats view)
//
// Phase 1+ 에서 추가:
//   - 게시글/댓글/좋아요 (esg_posts, esg_comments, esg_post_likes)
//   - 상품/장바구니/주문 (esg_products, esg_cart_items, esg_orders)
//   - 경매/입찰 (esg_auctions, esg_auction_bids)
//   - 찜 (esg_wishlists)
// ============================================================================

import { supabase } from './supabase';
import type {
  EsgSettingsRow,
  EsgSettingsKey,
  EsgSettingsValueMap,
  EsgDonationStatsRow,
} from '@/types/esg';

// ============================================================================
// 설정값 (esg_settings)
// ============================================================================

/**
 * esg_settings 전체 로드 → key → value 맵.
 * 앱 시작 시 1회 호출하여 메모리 캐시 권장.
 */
export async function loadAllSettings(): Promise<Partial<EsgSettingsValueMap>> {
  const { data, error } = await supabase.from('esg_settings').select('*');
  if (error) {
    console.error('[api] loadAllSettings error:', error);
    throw error;
  }

  const map: Record<string, unknown> = {};
  (data as EsgSettingsRow[] | null)?.forEach((row) => {
    map[row.key] = row.value;
  });
  return map as Partial<EsgSettingsValueMap>;
}

/** 특정 설정값 하나만 조회 (실시간 갱신용) */
export async function loadSetting<K extends EsgSettingsKey>(
  key: K
): Promise<EsgSettingsValueMap[K] | null> {
  const { data, error } = await supabase
    .from('esg_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.error('[api] loadSetting error:', error);
    throw error;
  }
  // Supabase 타입 추론 우회 (esg_settings.Update 정의 때문에 never로 잘못 추론됨)
  const row = data as { value: unknown } | null;
  return (row?.value as EsgSettingsValueMap[K] | undefined) ?? null;
}

// ============================================================================
// 모금 통계 (esg_donation_stats view)
//
// view는 paid 주문 합산을 실시간 계산하므로 항상 최신값.
// Realtime 구독으로 자동 갱신 가능 (esg_orders 변경 시).
// ============================================================================

export async function loadDonationStats(): Promise<EsgDonationStatsRow> {
  const { data, error } = await supabase
    .from('esg_donation_stats')
    .select('*')
    .single();
  if (error) {
    console.error('[api] loadDonationStats error:', error);
    throw error;
  }
  return data as EsgDonationStatsRow;
}
