// ============================================================================
// RequireAuth — 로그인 필수 라우트 가드
//
// 사용:
//   <Route path="/mypage" element={<RequireAuth><MyPage /></RequireAuth>} />
//
// 동작:
//   - loading 중: LoadingScreen
//   - 비로그인: LoginScreen (현재 URL 기억하여 로그인 후 복귀 — Phase 1에서)
//   - 로그인: children 렌더
// ============================================================================

import type { ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginScreen } from '../LoginScreen';
import { LoadingScreen } from './LoadingScreen';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useCurrentUser();

  if (loading) return <LoadingScreen message="로그인 확인 중…" />;
  if (!currentUser) return <LoginScreen />;
  return <>{children}</>;
}
