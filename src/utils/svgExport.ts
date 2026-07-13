// ============================================================================
// svgExport.ts — 데이터 → SVG 내보내기 유틸 (관리자 대시보드/주문 표를 SVG로 저장)
//
// 목적: 표/지표 데이터를 그대로 렌더한 SVG 파일로 다운로드(사이니지/인쇄/공유용).
//   · buildTableSvg  : 제목 + KPI + 단일 표
//   · buildReportSvg : 제목 + KPI + 여러 섹션(각 섹션 = 소제목 + 표)
//   · downloadSvg    : 문자열 SVG를 .svg 파일로 저장
//
// [2026-07-10] 신규 — 주문/입금 확인 · 대시보드 SVG 다운로드.
// ============================================================================

export function escapeXml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 폭(문자수) 초과 시 말줄임 (SVG는 자동 줄바꿈이 없어 오버플로 방지) */
function truncate(s: unknown, maxChars: number): string {
  const str = String(s ?? '');
  return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str;
}

export function downloadSvg(filename: string, svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type SvgAlign = 'left' | 'right' | 'center';
export interface SvgColumn {
  header: string;
  width: number;
  align?: SvgAlign;
}
export interface SvgSection {
  heading: string;
  columns: SvgColumn[];
  rows: Array<Array<string | number>>;
}
export interface SvgKpi {
  label: string;
  value: string;
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";
const PAD = 28;
const ROW_H = 30;
const HEAD_H = 36;
const GAP = 22; // 섹션 간 간격
const CHAR_W = 7.4; // 대략적 글자폭(말줄임 계산용)

// ── 내부: 한 섹션(소제목 + 표) 렌더. y 시작점 → { svg, nextY } ──────────────
function renderSection(sec: SvgSection, x: number, y: number, parts: string[]): number {
  const tableW = sec.columns.reduce((s, c) => s + c.width, 0);

  // 소제목 (빈 문자열이면 생략)
  if (sec.heading) {
    parts.push(
      `<text x="${x}" y="${y + 14}" font-family="${FONT}" font-size="14" font-weight="700" fill="#111">${escapeXml(sec.heading)}</text>`,
    );
    y += 26;
  }

  // 헤더 행
  parts.push(`<rect x="${x}" y="${y}" width="${tableW}" height="${HEAD_H}" rx="6" fill="#111"/>`);
  let cx = x;
  for (const col of sec.columns) {
    const align = col.align ?? 'left';
    const tx = align === 'right' ? cx + col.width - 10 : align === 'center' ? cx + col.width / 2 : cx + 10;
    const anchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
    parts.push(
      `<text x="${tx}" y="${y + HEAD_H / 2 + 4}" font-family="${FONT}" font-size="12" font-weight="700" fill="#fff" text-anchor="${anchor}">${escapeXml(col.header)}</text>`,
    );
    cx += col.width;
  }
  y += HEAD_H;

  // 데이터 행
  sec.rows.forEach((row, ri) => {
    if (ri % 2 === 1) {
      parts.push(`<rect x="${x}" y="${y}" width="${tableW}" height="${ROW_H}" fill="#f7f7f7"/>`);
    }
    let ccx = x;
    sec.columns.forEach((col, ci) => {
      const align = col.align ?? 'left';
      const tx = align === 'right' ? ccx + col.width - 10 : align === 'center' ? ccx + col.width / 2 : ccx + 10;
      const anchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
      const maxChars = Math.max(3, Math.floor((col.width - 16) / CHAR_W));
      const cell = truncate(row[ci] ?? '', maxChars);
      parts.push(
        `<text x="${tx}" y="${y + ROW_H / 2 + 4}" font-family="${FONT}" font-size="12" fill="#333" text-anchor="${anchor}">${escapeXml(cell)}</text>`,
      );
      ccx += col.width;
    });
    // 행 구분선
    parts.push(`<line x1="${x}" y1="${y + ROW_H}" x2="${x + tableW}" y2="${y + ROW_H}" stroke="#eee" stroke-width="1"/>`);
    y += ROW_H;
  });

  return y;
}

// ── KPI 박스 행 렌더 → nextY ─────────────────────────────────────────────────
function renderKpis(kpis: SvgKpi[], x: number, y: number, totalW: number, parts: string[]): number {
  if (kpis.length === 0) return y;
  const gap = 12;
  const boxW = (totalW - gap * (kpis.length - 1)) / kpis.length;
  const boxH = 56;
  kpis.forEach((k, i) => {
    const bx = x + i * (boxW + gap);
    parts.push(`<rect x="${bx}" y="${y}" width="${boxW}" height="${boxH}" rx="10" fill="#fff" stroke="#e5e5e5"/>`);
    parts.push(
      `<text x="${bx + 14}" y="${y + 22}" font-family="${FONT}" font-size="11" fill="#888">${escapeXml(k.label)}</text>`,
    );
    parts.push(
      `<text x="${bx + 14}" y="${y + 44}" font-family="${FONT}" font-size="18" font-weight="700" fill="#111">${escapeXml(k.value)}</text>`,
    );
  });
  return y + boxH + GAP;
}

/** 제목 + KPI + 여러 섹션(소제목 + 표)을 하나의 SVG로 조립 */
export function buildReportSvg(opts: {
  title: string;
  subtitle?: string;
  kpis?: SvgKpi[];
  sections: SvgSection[];
}): string {
  const { title, subtitle, kpis = [], sections } = opts;
  const contentW = Math.max(
    360,
    ...sections.map((s) => s.columns.reduce((a, c) => a + c.width, 0)),
  );
  const totalW = contentW + PAD * 2;

  const parts: string[] = [];
  let y = PAD;

  // 제목
  parts.push(
    `<text x="${PAD}" y="${y + 22}" font-family="${FONT}" font-size="20" font-weight="800" fill="#111">${escapeXml(title)}</text>`,
  );
  y += 30;
  if (subtitle) {
    parts.push(
      `<text x="${PAD}" y="${y + 12}" font-family="${FONT}" font-size="12" fill="#888">${escapeXml(subtitle)}</text>`,
    );
    y += 24;
  }
  y += 8;

  // KPI
  y = renderKpis(kpis, PAD, y, contentW, parts);

  // 섹션들
  sections.forEach((sec) => {
    y = renderSection(sec, PAD, y, parts);
    y += GAP;
  });

  const totalH = y + PAD - GAP;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">` +
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff"/>` +
    parts.join('') +
    `</svg>`
  );
}

/** 제목 + KPI + 단일 표 (buildReportSvg 단일 섹션 래퍼) */
export function buildTableSvg(opts: {
  title: string;
  subtitle?: string;
  kpis?: SvgKpi[];
  columns: SvgColumn[];
  rows: Array<Array<string | number>>;
}): string {
  return buildReportSvg({
    title: opts.title,
    subtitle: opts.subtitle,
    kpis: opts.kpis,
    sections: [{ heading: '', columns: opts.columns, rows: opts.rows }],
  });
}
