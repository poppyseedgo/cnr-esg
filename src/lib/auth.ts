// ============================================================================
// 인증 (Supabase Auth + Azure OAuth Provider)
//
// 흐름:
//   1. signInWithMicrosoft() 호출 → Azure OAuth 페이지로 이동
//   2. Supabase가 콜백 처리 (https://[ref].supabase.co/auth/v1/callback)
//   3. 토큰 fragment(#access_token=...)로 origin에 리다이렉트
//   4. supabase client의 detectSessionInUrl이 자동 세션 추출
//   5. onAuthStateChange가 SIGNED_IN 이벤트 발생
//
// 도메인 정책: @cnrres.com만 허용 (사내 직원만)
// 활성화 정책: profiles.is_active=true만 로그인 허용
// 도메인 하드코딩 0: redirectTo는 window.location.origin (동적)
// ============================================================================

import { supabase } from './supabase';
import type { CurrentUser, ProfileRow } from '@/types/esg';

/** 사내 이메일 도메인 (대소문자 무관 매칭) */
export const ALLOWED_EMAIL_DOMAIN = '@cnrres.com';

// ============================================================================
// 로그인 / 로그아웃
// ============================================================================

/**
 * Microsoft (Azure AD) 로그인 트리거.
 * - Supabase Auth가 'azure' provider로 OAuth 흐름 처리
 * - 콜백 URL은 window.location.origin (도메인 미정 환경 대응)
 * - 추가 scope: email/openid/profile/offline_access
 */
export async function signInWithMicrosoft(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      // ⚠️ 도메인 하드코딩 0 — 어느 도메인에서 실행해도 그 origin으로 돌아옴
      redirectTo: window.location.origin,
      scopes: 'email openid profile offline_access',
    },
  });
  if (error) {
    console.error('[auth] signInWithMicrosoft failed:', error);
    throw error;
  }
}

/** 로그아웃 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[auth] signOut failed:', error);
    throw error;
  }
}

// ============================================================================
// 세션 → CurrentUser 변환 (2단계)
//
// 1단계: sessionToTemporaryUser — DB 조회 전 즉시 렌더용 (빠름, 부정확)
// 2단계: fetchProfile — DB profiles JOIN 후 정확한 정보 (느림, 정확)
//
// AuthProvider가 이 2단계를 순차 실행 → currentUser 갱신
// ============================================================================

/**
 * Session.user 정보로 빠르게 CurrentUser 임시 생성.
 * DB profiles 조회 전 즉시 렌더용. role은 임시 'USER', is_active=true 가정.
 * 정확한 정보는 fetchProfile()로 보강.
 */
export function sessionToTemporaryUser(sessionUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): CurrentUser {
  const meta = (sessionUser.user_metadata ?? {}) as Record<string, unknown>;
  const email = (sessionUser.email ?? '').toLowerCase();
  const name =
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    (email.split('@')[0] ?? '사용자');
  const dept =
    (meta.department as string | undefined) ||
    ((meta.custom_claims as Record<string, unknown> | undefined)?.department as
      | string
      | undefined) ||
    null;
  const avatarUrl =
    (meta.avatar_url as string | undefined) ||
    (meta.picture as string | undefined) ||
    null;

  return {
    id: sessionUser.id,
    email,
    name,
    dept,
    role: 'USER', // 임시값, fetchProfile에서 정확한 값으로 교체
    is_active: true,
    avatar_url: avatarUrl,
  };
}

/**
 * DB profiles 테이블에서 정확한 사용자 정보 조회.
 * 첫 로그인 시 handle_sso_new_user 트리거가 profiles row 자동 생성.
 *
 * 검증 + 거부:
 *   - 이메일 도메인 @cnrres.com 아니면 → null (호출자가 강제 로그아웃)
 *   - is_active=false 면 → null (퇴사자 차단)
 */
export async function fetchProfile(userId: string): Promise<CurrentUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, dept, role, is_active, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[auth] fetchProfile error:', error);
    // 네트워크/쿼리 오류는 throw → 호출측(applySession)이 재시도·구분.
    // (여기서 null을 반환하면 "미허용 계정"으로 오인돼 강제 로그아웃됨 — 모바일 접속 불가 원인)
    throw error;
  }
  if (!data) {
    console.warn('[auth] profile not found for user:', userId);
    return null;
  }

  const profile = data as ProfileRow;
  const email = (profile.email || '').toLowerCase();

  // 도메인 검증
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    console.warn('[auth] email domain not allowed:', email);
    return null;
  }

  // 활성 사용자 검증 (퇴사자 차단)
  if (!profile.is_active) {
    console.warn('[auth] user is inactive:', email);
    return null;
  }

  return {
    id: profile.id,
    email,
    name: profile.name,
    dept: profile.dept,
    role: profile.role,
    is_active: profile.is_active,
    avatar_url: profile.avatar_url,
  };
}
