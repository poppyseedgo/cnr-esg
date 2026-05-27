// ============================================================================
// adminPosts.ts — 게시글 관리 어드민 API
//
// 핵심:
//   - esg_posts 원본 테이블을 직접 SELECT (어드민 RLS 통과)
//     → 익명 게시글도 user_name_snapshot 직접 노출 (어드민 특권)
//     → hidden/deleted 게시글도 조회 가능
//   - status 변경으로 숨김/복원 (UPDATE)
//   - 진짜 DELETE는 권장하지 않음 (soft delete = status='deleted')
//
// 함수:
//   - loadAllPostsAdmin(filters)      : 전체 게시글 (모든 status, 익명 본명 포함)
//   - hidePost(postId)                : status='hidden'
//   - unhidePost(postId)              : status='published' 복원
//   - softDeletePost(postId)          : status='deleted' (soft)
//   - subscribePostsAdmin(callback)   : Realtime
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgPostRow,
  EsgPostStatus,
  EsgPostCategory,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 필터
// ============================================================================

export interface LoadAllPostsAdminFilters {
  /** 상태 필터 — 빈 배열이면 전체 */
  statuses?: EsgPostStatus[];
  /** 카테고리 필터 */
  category?: EsgPostCategory;
  /** 익명만 / 실명만 / 전체 */
  anonymousFilter?: 'anonymous_only' | 'named_only' | 'all';
  /** 검색어 — 제목/본문/실명/이메일/부서 부분일치 */
  search?: string;
  /** 정렬 */
  sortOrder?: 'newest' | 'oldest';
  limit?: number;
}

/**
 * 어드민용 전체 게시글 조회.
 *
 * 핵심: esg_posts 원본 테이블 직접 SELECT.
 *   - 어드민 RLS 통과 → 익명도 user_name_snapshot 노출
 *   - hidden/deleted 모두 조회 가능
 */
export async function loadAllPostsAdmin(
  filters: LoadAllPostsAdminFilters = {}
): Promise<EsgPostRow[]> {
  let query = supabase.from('esg_posts').select('*').limit(filters.limit ?? 200);

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.anonymousFilter === 'anonymous_only') {
    query = query.eq('is_anonymous', true);
  } else if (filters.anonymousFilter === 'named_only') {
    query = query.eq('is_anonymous', false);
  }
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim();
    query = query.or(
      `title.ilike.%${s}%,content.ilike.%${s}%,user_name_snapshot.ilike.%${s}%,user_email.ilike.%${s}%,user_dept_snapshot.ilike.%${s}%`
    );
  }
  query = query.order('created_at', { ascending: filters.sortOrder === 'oldest' });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgPostRow[];
}

// ============================================================================
// 액션
// ============================================================================

/** 게시글 숨김 처리 (사용자에게 안 보임, 어드민은 볼 수 있음) */
export async function hidePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('esg_posts')
    .update({ status: 'hidden', updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
}

/** 숨김 복원 → status='published' */
export async function unhidePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('esg_posts')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
}

/**
 * 게시글 soft delete → status='deleted'.
 *
 * 진짜 DELETE 안 함:
 *   - 추후 audit 필요 시 데이터 보존
 *   - 댓글/좋아요 외래키 무결성 유지
 */
export async function softDeletePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('esg_posts')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
}

// ============================================================================
// Realtime
// ============================================================================

export function subscribePostsAdmin(callback: () => void): () => void {
  const channelName = `esg-admin-posts-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_posts' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
