// ============================================================================
// 로그인 화면 (placeholder)
//
// 디자인은 Phase 6에서 피그마 기반으로 교체.
// 현재는 기능 검증용 최소 UI.
// ============================================================================

import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function LoginScreen() {
  const { signInWithMicrosoft, authError } = useCurrentUser();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithMicrosoft();
      // 페이지가 Azure OAuth로 리다이렉트되므로 이후 코드는 실행 안 됨
    } catch (e) {
      console.error(e);
      setError('로그인을 시작할 수 없습니다. 잠시 후 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#fafafa',
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: '100%',
          background: '#fff',
          padding: 32,
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 8 }}>🌱</div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          C&R 29주년 ESG 이벤트
        </h1>
        <p style={{ color: '#666', marginTop: 8, marginBottom: 0, fontSize: 14 }}>
          2026. 06. 30 — 07. 10
        </p>

        <button
          type="button"
          onClick={handleLogin}
          disabled={submitting}
          style={{
            marginTop: 32,
            width: '100%',
            padding: '12px 20px',
            background: '#2F2F2F',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: submitting ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          {/* Microsoft 공식 로고 4색 사각형 */}
          <svg width="18" height="18" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
            <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
          </svg>
          {submitting ? '이동 중…' : 'Microsoft 계정으로 로그인'}
        </button>

        {(authError || error) && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: '#fee',
              border: '1px solid #fcc',
              borderRadius: 8,
              color: '#c00',
              fontSize: 13,
              textAlign: 'left',
              lineHeight: 1.5,
            }}
          >
            {authError || error}
          </div>
        )}

        <p
          style={{
            marginTop: 32,
            marginBottom: 0,
            fontSize: 12,
            color: '#999',
            lineHeight: 1.6,
          }}
        >
          C&amp;R Research 임직원 전용입니다.
          <br />
          회사 이메일(@cnrres.com) 계정으로 로그인하세요.
        </p>
      </div>
    </div>
  );
}
