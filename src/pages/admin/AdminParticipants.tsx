// ============================================================================
// AdminParticipants — 참여자 명단(역할별 관리)                  // ← [2026-07-14]
//
// 요구: 참여자 리스트를 참여 종류별로 나눠 관리.
//   게시판(작성/댓글/좋아요) · 경매(구매/입찰/참여) · 바자회(구매/물품기부)
//   · 기부금 · 굿즈(펀딩 전원, 미입금 포함)
//
// 구조:
//   좌측 카테고리→역할 네비, 우측 선택 역할의 명단 테이블 + 검색 + CSV.
//   데이터는 esg_participant_roster() 1회 로드 후 role 로 필터(재조회 없음).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadParticipantRoster,
  buildAllParticipants,
  ROLE_CATEGORIES,
  ROLE_LABEL,
  type RosterEntry,
  type ParticipantRole,
} from '@/lib/adminParticipants';
import { downloadCsv, todayStampKst } from '@/utils/csv';

function fmtKst(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
const fmtDate = (iso: string) => fmtKst(iso).slice(0, 10);

export function AdminParticipants() {
  const [all, setAll] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ParticipantRole>('all'); // ← [2026-07-14] 기본 전체
  const [search, setSearch] = useState('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAll(await loadParticipantRoster());
    } catch (e) {
      setError(e instanceof Error ? e.message : '명단을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 역할별 카운트(네비 뱃지)
  const countByRole = useMemo(() => {
    const m = new Map<ParticipantRole, number>();
    for (const e of all) m.set(e.role, (m.get(e.role) ?? 0) + 1);
    return m;
  }, [all]);

  // ← [2026-07-14] 전체(중복 제거) 명단 — roster 를 사람 단위로 합성
  const allPeople = useMemo(() => buildAllParticipants(all), [all]);
  const isAll = role === 'all';

  // 현재 역할이 주문/기부(입금 개념 있음)인지
  const hasPaidConcept = useMemo(
    () => ['auction_buyer', 'bazaar_buyer', 'money_donor', 'goods_backer', 'auction_participant'].includes(role),
    [role]
  );

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all
      .filter((e) => e.role === role)
      .filter((e) => (unpaidOnly && hasPaidConcept ? !e.isPaid : true))
      .filter((e) => !s || e.name.toLowerCase().includes(s) || (e.dept ?? '').toLowerCase().includes(s));
  }, [all, role, search, unpaidOnly, hasPaidConcept]);

  // ← [2026-07-14] 전체 명단(검색 필터 적용)
  const allList = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allPeople.filter(
      (p) => !s || p.name.toLowerCase().includes(s) || (p.dept ?? '').toLowerCase().includes(s)
    );
  }, [allPeople, search]);

  const paidCount = useMemo(
    () => (hasPaidConcept ? all.filter((e) => e.role === role && e.isPaid).length : 0),
    [all, role, hasPaidConcept]
  );

  const roleSlug = (r: ParticipantRole) => ROLE_LABEL[r].replace(/[·\s]+/g, '_');

  const exportCsv = () => {
    if (isAll) {
      if (allList.length === 0) return;
      downloadCsv(
        `참여자_전체_${todayStampKst()}.csv`,
        ['이름', '부서', '참여종류', '총활동수', '입금(주문/기부)', '최초참여', '최근참여'],
        allList.map((p) => [
          p.name, p.dept ?? '', p.categories.join('/'),
          p.totalActivity, p.isPaidAny ? '있음' : '', fmtDate(p.firstAt), fmtDate(p.lastAt),
        ])
      );
      return;
    }
    if (list.length === 0) return;
    const cols = ['이름', '부서', '활동수', '최초참여', '최근참여'];
    if (hasPaidConcept) cols.splice(2, 0, '입금여부');
    downloadCsv(
      `참여자_${roleSlug(role)}_${todayStampKst()}.csv`,
      cols,
      list.map((e) => {
        const base = [e.name, e.dept ?? ''];
        const tail = [e.activityCount, fmtDate(e.firstAt), fmtDate(e.lastAt)];
        return hasPaidConcept ? [...base, e.isPaid ? '입금완료' : '미입금', ...tail] : [...base, ...tail];
      })
    );
  };

  const exportNamesCsv = () => {
    const names = isAll ? allList.map((p) => [p.name]) : list.map((e) => [e.name]);
    if (names.length === 0) return;
    downloadCsv(
      `참여자명단_${isAll ? '전체' : roleSlug(role)}_이름만_${todayStampKst()}.csv`,
      ['이름'],
      names
    );
  };

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, color: '#111', borderBottom: '1px solid #f3f4f6' };
  const btn: React.CSSProperties = { padding: '8px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#333', whiteSpace: 'nowrap' };

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>👥 참여자 명단 (종류별)</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        참여 종류별로 참여자를 확인·내보내기 합니다. 구매/기부는 입금 전(펀딩 참여중·입금 대기)도 참여자로 포함되며, 취소·만료·환불은 제외됩니다.
      </p>

      {error && (
        <div style={{ padding: 14, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 좌측 네비 */}
        <nav style={{ flex: '0 0 220px', minWidth: 200 }}>
          {ROLE_CATEGORIES.map((cat) => (
            <div key={cat.category} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 6px 4px' }}>
                {cat.category}
              </div>
              {cat.roles.map((r) => {
                const active = r.role === role;
                return (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => { setRole(r.role); setUnpaidOnly(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%', gap: 8,
                      padding: '8px 10px', marginBottom: 2, borderRadius: 8, cursor: 'pointer',
                      border: '1px solid ' + (active ? '#111' : 'transparent'),
                      background: active ? '#111' : 'transparent',
                      color: active ? '#fff' : '#333', fontSize: 13, fontWeight: active ? 700 : 500,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {r.label}
                      {r.hint && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>({r.hint})</span>}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, opacity: active ? 0.9 : 0.5 }}>
                      {r.role === 'all' ? allPeople.length : (countByRole.get(r.role) ?? 0)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 우측 명단 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>{ROLE_LABEL[role]}</strong>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {isAll ? (
                <>{allList.length}명 (중복 제거)</>
              ) : (
                <>
                  {list.length}명
                  {hasPaidConcept && <> · 입금완료 {paidCount}명 · 미입금 {(countByRole.get(role) ?? 0) - paidCount}명</>}
                </>
              )}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {!isAll && hasPaidConcept && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', cursor: 'pointer' }}>
                  <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
                  미입금만
                </label>
              )}
              <input
                type="text"
                placeholder="이름·부서 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, width: 160 }}
              />
              <button type="button" onClick={exportNamesCsv} style={btn} disabled={(isAll ? allList.length : list.length) === 0}>⬇ CSV (이름만)</button>
              <button type="button" onClick={exportCsv} style={btn} disabled={(isAll ? allList.length : list.length) === 0}>⬇ CSV (상세)</button>
              <button type="button" onClick={() => void load()} style={btn}>↻</button>
            </div>
          </div>

          {loading ? (
            <p style={{ fontSize: 13, color: '#888' }}>불러오는 중…</p>
          ) : isAll ? (
            /* ← [2026-07-14] 전체(중복 제거) 명단 — 참여 종류를 칩으로 요약 */
            allList.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888' }}>참여자가 없습니다.</p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 40 }}>#</th>
                      <th style={th}>이름</th>
                      <th style={th}>부서</th>
                      <th style={th}>참여 종류</th>
                      <th style={{ ...th, textAlign: 'right' }}>총 활동수</th>
                      <th style={th}>최초참여</th>
                      <th style={th}>최근참여</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allList.map((p, i) => (
                      <tr key={p.key}>
                        <td style={{ ...td, color: '#9ca3af' }}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                        <td style={{ ...td, color: '#6b7280' }}>{p.dept ?? '-'}</td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                            {p.categories.map((c) => (
                              <span
                                key={c}
                                style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f3f4f6', color: '#374151' }}
                              >
                                {c}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{p.totalActivity}</td>
                        <td style={{ ...td, color: '#6b7280' }}>{fmtDate(p.firstAt)}</td>
                        <td style={{ ...td, color: '#6b7280' }}>{fmtDate(p.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : list.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>해당 종류의 참여자가 없습니다.</p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 40 }}>#</th>
                    <th style={th}>이름</th>
                    <th style={th}>부서</th>
                    {hasPaidConcept && <th style={th}>입금</th>}
                    <th style={{ ...th, textAlign: 'right' }}>활동수</th>
                    <th style={th}>최초참여</th>
                    <th style={th}>최근참여</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e, i) => (
                    <tr key={e.key}>
                      <td style={{ ...td, color: '#9ca3af' }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{e.name}</td>
                      <td style={{ ...td, color: '#6b7280' }}>{e.dept ?? '-'}</td>
                      {hasPaidConcept && (
                        <td style={td}>
                          <span
                            style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                              background: e.isPaid ? '#dcfce7' : '#fef3c7',
                              color: e.isPaid ? '#166534' : '#92400e',
                            }}
                          >
                            {e.isPaid ? '입금완료' : '미입금'}
                          </span>
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'right' }}>{e.activityCount}</td>
                      <td style={{ ...td, color: '#6b7280' }}>{fmtDate(e.firstAt)}</td>
                      <td style={{ ...td, color: '#6b7280' }}>{fmtDate(e.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
