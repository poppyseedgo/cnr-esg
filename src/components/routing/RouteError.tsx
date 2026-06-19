// ============================================================================
// RouteError — 라우트 단위 에러 폴백 (React Router errorElement)
//
// 목적: lazy 청크 로딩 2회 실패, 렌더 중 throw 등으로 라우트가 깨질 때
//   화이트스크린/기본 에러덤프 대신 친절한 복구 UI(새로고침/홈)를 보여준다.
//   특히 모바일 불안정 네트워크에서 "오류나고 접속 안 됨"을 완화.
// ============================================================================

import { useRouteError, useNavigate } from 'react-router-dom';

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  // 진단용 로그 (사용자에겐 노출하지 않음)
  console.error('[RouteError]', error);

  const btn: React.CSSProperties = {
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid #ddd',
  };

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
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48 }}>⚠️</div>
      <h2 style={{ margin: 0, color: '#111' }}>화면을 불러오지 못했습니다</h2>
      <p style={{ color: '#666', margin: 0, lineHeight: 1.6 }}>
        네트워크 또는 일시적인 문제일 수 있어요.
        <br />
        새로고침하거나 잠시 후 다시 시도해 주세요.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ ...btn, background: '#111', color: '#fff', border: '1px solid #111' }}
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{ ...btn, background: '#fff', color: '#444' }}
        >
          홈으로
        </button>
      </div>
    </div>
  );
}
