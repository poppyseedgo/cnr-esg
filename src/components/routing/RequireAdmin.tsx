// ============================================================================
// RequireAdmin — ADMIN role 필수 라우트 가드
//
// 동작:
//   - loading: LoadingScreen
//   - 비로그인: LoginScreen
//   - 로그인 but USER: "권한이 없습니다" 화면
//   - ADMIN: children 렌더
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginScreen } from '../LoginScreen';
import { LoadingScreen } from './LoadingScreen';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { currentUser, loading, isAdmin } = useCurrentUser();

  if (loading) return <LoadingScreen message="권한 확인 중…" />;
  if (!currentUser) return <LoginScreen />;

  if (!isAdmin) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 8 }}>🔒</div>
        <h2 style={{ margin: '0 0 8px' }}>관리자 전용 페이지입니다</h2>
        <p style={{ color: '#666', marginBottom: 24 }}>
          접근 권한이 없습니다. 권한 요청이 필요하면 IT팀에 문의하세요.
        </p>
        <Link
          to="/"
          style={{
            padding: '10px 20px',
            background: '#2F2F2F',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
