// ============================================================================
// Pagination — 페이지네이션 (Figma 1003:379)
//
// 토큰:
//   - 우측 정렬, gap 24, padding-y 24
//   - 숫자: 20px Pretendard Medium line 1.5
//   - 현재 페이지 color #111, 나머지 #e3e9f5
//
// 동작:
//   - 페이지 클릭 → onPageChange(newPage) 호출
//   - 총 페이지가 1 이하면 렌더 안 함
//
// 향후 확장: 이전/다음 버튼 (현재 Figma에는 없어 — 숫자만)
// ============================================================================

interface Props {
  currentPage: number;       // 1부터
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  // 페이지 번호 배열 생성 (단순: 1 ~ totalPages 전부 표시)
  // 향후 페이지 많아지면 윈도우(현재±2) + 생략(...) 표시 도입
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);

  return (
    <nav
      aria-label="페이지 이동"
      style={{
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '24px 0',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {pages.map((page) => {
        const isCurrent = page === currentPage;
        return (
          <button
            key={page}
            type="button"
            onClick={() => !isCurrent && onPageChange(page)}
            aria-current={isCurrent ? 'page' : undefined}
            disabled={isCurrent}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: isCurrent ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              fontSize: 20,
              lineHeight: 1.5,
              color: isCurrent ? '#111' : '#e3e9f5',
              transition: 'color 0.15s',
            }}
          >
            {page}
          </button>
        );
      })}
    </nav>
  );
}
