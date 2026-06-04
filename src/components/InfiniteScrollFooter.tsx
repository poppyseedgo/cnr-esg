// ============================================================================
// InfiniteScrollFooter — 무한 스크롤 목록 하단 공용 UI
//   - sentinel: 바닥 감지 요소(훅의 sentinelRef 연결)
//   - loadingMore: 다음 페이지 로딩 표시
//   - error: 추가 로드 실패 시 재시도 안내
// 게시판/바자회/경매가 동일하게 사용.
// ============================================================================

interface Props {
  sentinelRef: (node: HTMLElement | null) => void;
  loadingMore: boolean;
  error: string | null;
  onRetry: () => void;
}

export function InfiniteScrollFooter({ sentinelRef, loadingMore, error, onRetry }: Props) {
  return (
    <>
      {/* 바닥 감지(보이면 다음 페이지 로드) */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {loadingMore && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#999', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {error && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#c0392b', fontSize: 13 }}>
          더 불러오지 못했어요.{' '}
          <button
            type="button"
            onClick={onRetry}
            style={{
              background: 'none',
              border: 'none',
              color: '#1a73e8',
              cursor: 'pointer',
              fontSize: 13,
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            새로고침
          </button>
        </div>
      )}
    </>
  );
}
