// ============================================================================
// csv.ts — CSV 내보내기 유틸 (명단/리포트 공용)
//
// 설계:
//   - RFC 4180 이스케이프: 값에 , " 개행이 있으면 "..."로 감싸고 "는 ""로 치환.
//   - Excel 한글 깨짐 방지: UTF-8 BOM(\uFEFF) 선두 삽입.
//   - 브라우저 다운로드: Blob + a[download] (외부 의존 0).
//
// 변경 이력:
//   2026-06-16  최초 작성 — 명단 관리(AdminRoster) CSV 내보내기
// ============================================================================

export type CsvCell = string | number | null | undefined;

/** 헤더 + 행 → CSV 문자열 (CRLF 구분) */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const esc = (v: CsvCell): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const row of rows) lines.push(row.map(esc).join(','));
  return lines.join('\r\n');
}

/** CSV 파일 다운로드 (Excel 호환 BOM 포함) */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  const csv = toCsv(headers, rows);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 'YYYYMMDD' (KST) — 파일명용 */
export function todayStampKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(
    kst.getUTCDate()
  ).padStart(2, '0')}`;
}
