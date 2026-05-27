// ============================================================================
// comments.ts — 댓글 관련 API
//
// 함수:
//   - loadComments(postId)          : 게시글의 댓글 목록 (익명 마스킹된 view 사용)
//   - createComment(user, input)    : 댓글 작성 (RLS: comments_enabled 체크)
//   - deleteComment(id)             : Soft delete (status='deleted')
//   - subscribeComments(postId, cb) : Realtime 구독 (cleanup 함수 반환)
//
// 설계:
//   - esg_comments_public view에서 익명 처리 (DB 레벨, 프론트가 신경 안 써도 됨)
//   - INSERT는 esg_comments(원본 테이블)에, SELECT는 view에서
//   - comments_enabled 설정 체크는 RLS에서 (프론트도 가드, 백엔드도 가드)
//   - Realtime 채널 이름 unique (StrictMode 이중 마운트 대응)
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgCommentInsert,
  EsgCommentPublicRow,
} from '@/types/esg';

// supabase-js 2.49 타입 추론 한계 우회 (posts.ts와 동일 — TODO #1 자동 생성 타입 도입 시 제거)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 조회
// ============================================================================

/** 게시글의 published 댓글 목록 (오래된 순) */
export async function loadComments(postId: string): Promise<EsgCommentPublicRow[]> {
  const { data, error } = await supabase
    .from('esg_comments_public')
    .select('*')
    .eq('post_id', postId)
    .eq('status', 'published')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EsgCommentPublicRow[];
}

// ============================================================================
// 작성 / 삭제
// ============================================================================

export interface CreateCommentInput {
  post_id: string;
  content: string;
  is_anonymous: boolean;
}

export interface CommentAuthor {
  id: string;
  email: string;
  name: string;
  dept: string | null;
}

/**
 * 댓글 작성.
 * - INSERT는 esg_comments(원본), SELECT는 esg_comments_public(익명 마스킹) 사용
 * - RLS가 comments_enabled=false면 차단 → 사용자에게 친절한 에러 메시지
 */
export async function createComment(
  user: CommentAuthor,
  input: CreateCommentInput
): Promise<EsgCommentPublicRow> {
  const insertRow: EsgCommentInsert = {
    post_id: input.post_id,
    user_id: user.id,
    user_email: user.email,
    user_name_snapshot: user.name,
    user_dept_snapshot: user.dept,
    is_anonymous: input.is_anonymous,
    content: input.content.trim(),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('esg_comments')
    .insert([insertRow])
    .select('id')
    .single();

  if (insertErr) {
    // RLS 차단 시 친절한 메시지로 변환
    if (insertErr.code === '42501' || /violates row-level security/i.test(insertErr.message ?? '')) {
      throw new Error('댓글 작성이 일시 중단되었습니다. (관리자 설정)');
    }
    throw insertErr;
  }

  // public view에서 다시 조회 (익명 마스킹된 형태)
  const { data: full, error: fetchErr } = await supabase
    .from('esg_comments_public')
    .select('*')
    .eq('id', inserted.id)
    .single();
  if (fetchErr) throw fetchErr;
  return full as EsgCommentPublicRow;
}

/**
 * Soft delete (status='deleted').
 * - 댓글이 '삭제된 댓글입니다' 등으로 보이거나 숨겨짐 (이 함수는 단순히 status 변경)
 * - RLS: 본인 또는 관리자만 가능
 */
export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_comments')
    .update({ status: 'deleted' })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================================
// Realtime 구독
// ============================================================================

/**
 * 특정 게시글의 댓글 변경 실시간 구독.
 * 채널 이름 unique + filter로 게시글 단위 구독 → 부하 최소화.
 * cleanup 함수 반환.
 */
export function subscribeComments(postId: string, callback: () => void): () => void {
  const channelName = `esg-comments-${postId.slice(0, 8)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'esg_comments',
        filter: `post_id=eq.${postId}`,
      },
      () => callback()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
