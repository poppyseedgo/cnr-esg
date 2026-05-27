import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🌱</div>
      <h1 style={{ margin: '0 0 8px' }}>페이지를 찾을 수 없습니다</h1>
      <p style={{ color: '#888', marginBottom: 24 }}>요청하신 페이지가 존재하지 않습니다.</p>
      <Link
        to="/"
        style={{
          padding: '10px 20px',
          background: '#1a1a1a',
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
