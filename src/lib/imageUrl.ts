// ============================================================================
// imageUrl — Supabase Storage 이미지 변환(리사이즈) URL 헬퍼
//
// 문제(근본 원인):
//   게시물 카드/상세가 저장된 "원본 풀해상도" 이미지를 그대로 다운로드한다.
//   130~180px 자리에 수천 px·수 MB 원본을 받으니 목록 로딩이 매우 느리다.
//
// 해결:
//   Supabase Storage 이미지 변환을 사용해 표시 크기에 맞는 썸네일만 받는다.
//   public object URL(`/storage/v1/object/public/...`)을
//   변환 엔드포인트(`/storage/v1/render/image/public/...?width=&quality=&resize=`)로
//   재작성한다. 이미 업로드된 원본도 "읽을 때" 리사이즈되므로 즉시 효과가 있다.
//
// 주의:
//   - Supabase 이미지 변환(Pro 플랜)이 활성화돼 있어야 한다.
//   - 비활성/실패 시를 대비해 <img onError>에서 원본 URL로 폴백한다(아래 컴포넌트들).
//   - Supabase 외 URL(절대경로/외부)은 그대로 반환.
// ============================================================================

const PUBLIC_MARKER = '/storage/v1/object/public/';
const RENDER_MARKER = '/storage/v1/render/image/public/';

/**
 * 표시 크기에 맞춘 변환 URL 반환.
 * @param url    저장된 public 이미지 URL
 * @param width  바운딩박스 한 변 px (정사각 N×N). 레티나 고려해 표시폭의 ~1.5~2배 권장.
 * @param quality JPEG 품질 0~100 (기본 70)
 *
 * 방식: N×N 정사각 바운딩박스 + resize=contain 으로 "원본 비율을 보존한 비례 축소"만 수행.
 *   (?width 만 주면 Supabase가 세로를 원본으로 고정해 이미지를 찌그러뜨리므로 금지 — 아래 본문 주석 참고.)
 *   박스 맞춤(cover)·크롭기준점(object-position)은 호출측 CSS가 담당 → 프레이밍이 원본과 일치.
 */
export function thumbUrl(
  url: string | null | undefined,
  width: number,
  quality = 70
): string | undefined {
  if (!url) return undefined;
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx === -1) return url; // Supabase public URL이 아니면 변환하지 않음
  const rendered = url.replace(PUBLIC_MARKER, RENDER_MARKER);
  const sep = rendered.includes('?') ? '&' : '?';
  // ── [2026-06-19 근본수정] width만 주면 안 되는 이유 ───────────────────────────
  //   Supabase 변환에 ?width=N 만 주면 "가로=N, 세로=원본"으로 처리되어 이미지가
  //   세로로 찌그러진다(실측: 정사각 1512²→640×1512, ar 1.00→0.42; 세로 730×1000→640×1000).
  //   이 왜곡 이미지가 다시 CSS object-fit:cover 박스에 들어가 '이중 크롭→과확대'가 됨.
  //   해결: N×N 정사각 바운딩박스 + resize=contain → 원본 '비율을 보존'한 채 비례 축소만
  //   수행(실측: 1512²→640², 730×1000→467×640, 1165×979→640×538 — 모두 원본 ar 유지).
  //   서버는 비례 축소만, 박스 맞춤(cover)·크롭기준점(object-position)은 CSS가 담당 →
  //   프레이밍이 '원본 그대로'가 되어 과확대가 사라진다. width = 바운딩박스 한 변(px).
  return `${rendered}${sep}width=${width}&height=${width}&resize=contain&quality=${quality}`;
}

/**
 * <img onError> 핸들러 생성기 — 변환 URL 실패 시 원본 URL로 1회 폴백.
 * (변환 비활성/오류여도 이미지가 깨지지 않도록 안전망)
 */
export function fallbackToOriginal(originalUrl: string | null | undefined) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (originalUrl && img.src !== originalUrl) {
      img.src = originalUrl; // 변환 실패 → 원본으로 교체 (원본도 실패하면 src 동일 → 재시도 안 함)
    }
  };
}
