// ============================================================================
// AuthGate — 인증 상태에 따라 children 또는 LoginScreen 표시
//
// 사용:
//   <AuthProvider>
//     <AuthGate>
//       <App />   {/* 로그인된 사용자만 여기 도달 */}
//     </AuthGate>
//   </AuthProvider>
// ============================================================================

import type { ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginScreen } from './LoginScreen';

interface Props {
  children: ReactNode;
}

export function AuthGate({ children }: Props) {
  const { currentUser, loading } = useCurrentUser();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: 14,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🌱</div>
          로그인 확인 중…
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
