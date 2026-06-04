// ============================================================================
// profiles.ts — 공개 프로필(아바타 포함) 일괄 조회 SSOT
//
// 배경:
//   아바타는 Azure AD 동기화로 Supabase Storage(avatars 버킷)에 저장되고,
//   public URL이 profiles.avatar_url에 기록된다. (C&R Space와 동일 파이프라인,
//   profiles 테이블·avatars 버킷 모두 두 프로젝트가 공유)
//   다른 사용자 정보는 RLS 우회 view인 esg_profile_public 으로만 조회한다.
//
// 게시글/댓글/입찰 등 "여러 작성자"를 한 화면에 그릴 때, 작성자 user_id 목록을
// 모아 이 함수로 1쿼리(IN 절) 일괄 조회한다 → N+1 없음.
//
// 익명 마스킹:
//   각 public view(esg_comments_public 등)는 익명일 때 user_id를 NULL로 내린다.
//   따라서 null/undefined는 여기서 자동 제외되어 아바타가 절대 유출되지 않는다.
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgProfilePublicRow } from '@/types/esg';

// supabase-js 2.49 타입 추론 한계 우회 (다른 lib와 동일 패턴). select는 런타임 동일.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/** 화면 표시에 필요한 공개 프로필 필드 (아바타 포함) */
export type PublicProfile = Pick<
  EsgProfilePublicRow,
  'id' | 'name' | 'dept' | 'avatar_url'
>;

/**
 * user_id 목록 → 공개 프로필 Map (key=user_id).
 * - null/undefined/중복은 자동 제거 (익명은 view에서 user_id가 null이라 자연 제외)
 * - 대상이 없으면 빈 Map 반환 (쿼리 안 함)
 * - IN 절 1쿼리 = N+1 아님
 */
export async function loadPublicProfiles(
  userIds: Array<string | null | undefined>
): Promise<Map<string, PublicProfile>> {
  const ids = Array.from(
    new Set(userIds.filter((id): id is string => !!id))
  );

  const map = new Map<string, PublicProfile>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from('esg_profile_public')
    .select('id, name, dept, avatar_url')
    .in('id', ids);
  if (error) throw error;

  for (const p of (data ?? []) as PublicProfile[]) {
    map.set(p.id, p);
  }
  return map;
}

/**
 * user_id 목록 → 아바타 URL Map (key=user_id, value=avatar_url|null).
 * 이름/부서는 view에 이미 들어있고 아바타만 필요한 화면(댓글 등)용 경량 버전.
 */
export async function loadAvatarMap(
  userIds: Array<string | null | undefined>
): Promise<Map<string, string | null>> {
  const profiles = await loadPublicProfiles(userIds);
  const map = new Map<string, string | null>();
  for (const [id, p] of profiles) {
    map.set(id, p.avatar_url);
  }
  return map;
}
