export function LoadingScreen({ message = '로딩 중…' }: { message?: string }) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        fontSize: 14,
        gap: 8,
      }}
    >
      <div style={{ fontSize: 32 }}>🌱</div>
      <div>{message}</div>
    </div>
  );
}
