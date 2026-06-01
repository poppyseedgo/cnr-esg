// ============================================================================
// faq.ts — esg_faq CRUD API
//
// 함수:
//   - loadFaqs(opts?)            : 목록 조회 (sort_order ASC, created_at DESC fallback)
//   - createFaq(input)           : 신규 등록 (어드민만 RLS 통과)
//   - updateFaq(id, patch)       : 수정 (어드민만)
//   - deleteFaq(id)              : 삭제 (어드민만)
//   - reorderFaqs(ids)           : 정렬 일괄 변경 (어드민만)
//   - subscribeFaq(callback)     : Realtime 구독 (cleanup 함수 반환)
//
// RLS:
//   - SELECT: is_published=true는 누구나 / 어드민은 전부
//   - INSERT/UPDATE/DELETE: 어드민만 (esg_is_admin())
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgFaqRow } from '@/types/esg';

// supabase-js 2.49 .insert/.update 추론 한계 우회 (다른 lib 동일 패턴)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 조회
// ============================================================================

export interface LoadFaqsOptions {
  /** 미게시 항목 포함 여부 (어드민용). 기본 false → is_published=true만 */
  includeUnpublished?: boolean;
}

/**
 * FAQ 목록 조회.
 * 정렬: sort_order ASC, created_at DESC (같은 순서면 최신순)
 */
export async function loadFaqs(opts: LoadFaqsOptions = {}): Promise<EsgFaqRow[]> {
  let query = supabase
    .from('esg_faq')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (!opts.includeUnpublished) {
    query = query.eq('is_published', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgFaqRow[];
}

/** 단일 FAQ 조회 (어드민 편집용) */
export async function loadFaq(id: string): Promise<EsgFaqRow | null> {
  const { data, error } = await supabase
    .from('esg_faq')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as EsgFaqRow | null;
}

// ============================================================================
// 변경 (어드민 RLS)
// ============================================================================

export interface CreateFaqInput {
  question: string;
  answer: string;
  sort_order?: number;
  is_published?: boolean;
}

export async function createFaq(input: CreateFaqInput): Promise<EsgFaqRow> {
  // created_by는 RLS의 auth.uid()로 자동 설정 가능하지만, 명시적으로 세팅
  const { data: { user } } = await _supabase.auth.getUser();
  const insertData = {
    question: input.question,
    answer: input.answer,
    sort_order: input.sort_order ?? 0,
    is_published: input.is_published ?? true,
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from('esg_faq')
    .insert(insertData)
    .select('*')
    .single();

  if (error) throw error;
  return data as EsgFaqRow;
}

export interface UpdateFaqInput {
  question?: string;
  answer?: string;
  sort_order?: number;
  is_published?: boolean;
}

export async function updateFaq(id: string, patch: UpdateFaqInput): Promise<EsgFaqRow> {
  const { data, error } = await supabase
    .from('esg_faq')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as EsgFaqRow;
}

export async function deleteFaq(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_faq')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * FAQ 순서 일괄 변경.
 * ids 배열의 순서대로 sort_order 0, 1, 2, ... 로 업데이트.
 * 어드민 드래그앤드롭 정렬용.
 */
export async function reorderFaqs(ids: string[]): Promise<void> {
  // 병렬 UPDATE (각 row별)
  // 대량 처리 시 RPC가 더 효율적이나 FAQ는 최대 수십 개 → 단순 처리로 충분
  const tasks = ids.map((id, idx) =>
    supabase.from('esg_faq').update({ sort_order: idx }).eq('id', id)
  );
  const results = await Promise.all(tasks);
  const firstError = results.find((r: { error: unknown }) => r.error);
  if (firstError?.error) throw firstError.error;
}

// ============================================================================
// Realtime
// ============================================================================

/**
 * esg_faq 변경 구독. 어드민이 수정/추가/삭제 시 사용자 화면 즉시 갱신용.
 * 모든 변경(INSERT/UPDATE/DELETE)에 callback 호출 → 클라에서 reload.
 */
export function subscribeFaq(callback: () => void): () => void {
  const channelName = `esg-faq-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'esg_faq' },
      () => callback()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
