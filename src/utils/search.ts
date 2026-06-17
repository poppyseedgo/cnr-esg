// ============================================================================
// search.ts — 공용 검색 매칭 유틸 (클라이언트 인메모리 필터용)
//   matchesQuery('박대우 골프', row.name, row.donor) 처럼 사용.
//   - 공백으로 토큰 분리 → 모든 토큰이 (합쳐진) 필드들 안에 있으면 매치(AND).
//   - 대소문자 무시, 앞뒤 공백 무시. 빈 검색어는 항상 true(전체 표시).
// ============================================================================

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  const hay = fields.map((f) => (f ?? '').toLowerCase()).join(' \u0001 ');
  return q.split(/\s+/).every((tok) => hay.includes(tok));
}
