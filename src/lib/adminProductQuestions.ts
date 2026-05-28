// ============================================================================
// adminProductQuestions.ts — 어드민용 Q&A 통합 관리 API
//
// 사용처: /admin/qa 페이지
// 기능:
//   - 모든 상품 질문 통합 조회 (필터 + 페이지네이션)
//   - 상품명 일괄 조회 (N+1 회피)
//
// 권한: esg_is_admin() RLS가 차단 (어드민만 모든 질문 조회 가능)
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgProductQuestionRow } from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface AdminQAFilter {
  /** 페이지네이션: 이 시각 이전 (created_at) */
  before?: string;
  /** 페이지당 개수 (기본 30) */
  limit?: number;
  /** 상태 필터 (기본 'all') */
  status?: 'all' | 'open' | 'answered' | 'hidden';
  /** 상품 타입 필터 (기본 'all') */
  productType?: 'all' | 'bazaar' | 'auction';
  /** 본문/작성자명 검색 */
  searchQuery?: string;
}

/**
 * 어드민용 — 모든 상품 질문 조회.
 *
 * RLS: esg_is_admin()이 true일 때만 모든 질문 노출 (일반 사용자는 본인 + 공개만).
 */
export async function loadAllQuestions(
  filter: AdminQAFilter = {},
): Promise<EsgProductQuestionRow[]> {
  const { before, limit = 30, status = 'all', productType = 'all', searchQuery } = filter;

  let query = supabase
    .from('esg_product_questions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);
  if (status !== 'all') query = query.eq('status', status);
  if (productType !== 'all') query = query.eq('product_type', productType);

  if (searchQuery?.trim()) {
    const q = searchQuery.trim();
    // body 또는 user_name_snapshot에서 LIKE 검색
    query = query.or(`body.ilike.%${q}%,user_name_snapshot.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgProductQuestionRow[];
}

/**
 * 미답변 질문 개수 (사이드바 배지용 등).
 */
export async function getOpenQuestionCount(): Promise<number> {
  const { count, error } = await supabase
    .from('esg_product_questions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  if (error) {
    console.error('[adminProductQuestions] count error:', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * 상품 ID 목록 → 이름 매핑 일괄 조회 (N+1 회피).
 *
 * @returns key 형식: `${type}:${id}` → name
 */
export async function loadProductNames(
  items: Array<{ type: 'bazaar' | 'auction'; id: string }>,
): Promise<Record<string, string>> {
  const bazaarIds = [...new Set(items.filter((x) => x.type === 'bazaar').map((x) => x.id))];
  const auctionIds = [...new Set(items.filter((x) => x.type === 'auction').map((x) => x.id))];

  const result: Record<string, string> = {};

  if (bazaarIds.length > 0) {
    const { data, error } = await supabase
      .from('esg_products')
      .select('id, name')
      .in('id', bazaarIds);
    if (!error && data) {
      for (const row of data as Array<{ id: string; name: string }>) {
        result[`bazaar:${row.id}`] = row.name;
      }
    }
  }

  if (auctionIds.length > 0) {
    const { data, error } = await supabase
      .from('esg_auctions')
      .select('id, product_name')
      .in('id', auctionIds);
    if (!error && data) {
      for (const row of data as Array<{ id: string; product_name: string }>) {
        result[`auction:${row.id}`] = row.product_name;
      }
    }
  }

  return result;
}

/**
 * 질문 상태 변경 (어드민).
 *   - hidden: 숨김 처리 (사용자 노출 안 됨)
 *   - open: 복원
 */
export async function updateQuestionStatus(
  id: string,
  status: 'open' | 'answered' | 'hidden',
): Promise<void> {
  const { error } = await supabase
    .from('esg_product_questions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Realtime 구독 (전체).
 */
export function subscribeAllQuestions(callback: () => void): () => void {
  const ch = `esg-admin-qa-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(ch)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_product_questions' },
      () => callback(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_product_question_answers' },
      () => callback(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
