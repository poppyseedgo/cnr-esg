// ============================================================================
// adminEmails.ts — 이메일 outbox 어드민 API
//
// 함수:
//   - loadEmails(filters)            : outbox 조회 (필터/검색)
//   - retryEmail(id)                 : failed/dead → pending (재시도)
//   - retryAllFailed()               : 모든 failed → pending (일괄)
//   - deleteEmail(id)                : outbox 삭제 (보통 sent 정리용)
//   - subscribeEmails(callback)      : Realtime
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgEmailOutboxRow,
  EsgEmailStatus,
  EsgEmailTemplateKey,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 필터
// ============================================================================

export interface LoadEmailsFilters {
  /** 상태 필터 — 빈 배열이면 전체 */
  statuses?: EsgEmailStatus[];
  /** 템플릿 종류 필터 */
  templateKey?: EsgEmailTemplateKey;
  /** 검색어 — 수신자 이메일/이름/제목 부분일치 */
  search?: string;
  /** 정렬 */
  sortOrder?: 'newest' | 'oldest';
  limit?: number;
}

/** outbox 조회 */
export async function loadEmails(filters: LoadEmailsFilters = {}): Promise<EsgEmailOutboxRow[]> {
  let query = supabase.from('esg_email_outbox').select('*').limit(filters.limit ?? 200);

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }
  if (filters.templateKey) {
    query = query.eq('template_key', filters.templateKey);
  }
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim();
    query = query.or(`to_email.ilike.%${s}%,to_name.ilike.%${s}%,subject.ilike.%${s}%`);
  }
  query = query.order('created_at', { ascending: filters.sortOrder === 'oldest' });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgEmailOutboxRow[];
}

// ============================================================================
// 액션
// ============================================================================

/**
 * 재시도 — failed/dead → pending.
 * retry_count는 0으로 리셋 (어드민이 명시적으로 다시 시작)
 */
export async function retryEmail(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_email_outbox')
    .update({
      status: 'pending',
      retry_count: 0,
      next_retry_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', id)
    .in('status', ['failed', 'dead']);
  if (error) throw error;
}

/**
 * 모든 failed/dead 일괄 재시도.
 * 반환: 영향받은 row 수
 */
export async function retryAllFailed(): Promise<number> {
  const { data, error } = await supabase
    .from('esg_email_outbox')
    .update({
      status: 'pending',
      retry_count: 0,
      next_retry_at: new Date().toISOString(),
      last_error: null,
    })
    .in('status', ['failed', 'dead'])
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** outbox 삭제 (보통 sent 정리용) */
export async function deleteEmail(id: string): Promise<void> {
  const { error } = await supabase.from('esg_email_outbox').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================================
// Realtime
// ============================================================================

export function subscribeEmails(callback: () => void): () => void {
  const channelName = `esg-admin-emails-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_email_outbox' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
