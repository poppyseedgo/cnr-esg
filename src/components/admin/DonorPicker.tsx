// ============================================================================
// DonorPicker — 기증자(임직원) 검색·선택 (SPACE 참석자 검색과 동일 패턴)
//
// 동작:
//   - 이름 입력 → 디바운스(250ms) → esg_profile_public 부분일치 검색 → 인라인 결과 리스트
//   - 항목 탭 → 아바타+이름+부서 칩으로 고정, donor_id/이름/부서 스냅샷 부모로 전달
//   - 단일 선택(기증자는 1명). 다시 검색하려면 칩의 "변경"으로 해제
//
// 외부(비임직원) 기증자:
//   - "직접 입력" 토글을 켜면 이름/부서를 수동 입력 (donor_id=null + 스냅샷).
//   - ※ 요구사항은 '임직원 검색'이 기본. 외부 기증자 허용이 불필요하면 이 토글은 제거 가능.
//
// 변경 이력:
//   2026-06-08  최초 작성 — 떠 있는 드롭다운 + document mousedown 바깥클릭 방식
//   2026-06-08  [모바일 버그수정] 떠 있는 드롭다운/mousedown 감지 제거 → 인라인 결과 리스트.
//               터치에서 키보드 dismiss·blur·ghost-click 레이스로 선택이 안 되던 문제 해결.
//               결과 항목: onMouseDown preventDefault(포커스 유지)+onClick 선택, 터치타깃 48px.
//
// 사용:
//   <DonorPicker value={donor} onChange={setDonor} disabled={saving} />
// ============================================================================

import { useEffect, useState } from 'react';
import { searchDonorProfiles, type DonorProfile } from '@/lib/bazaarIntake';
import { Avatar } from '@/components/Avatar';

export interface DonorValue {
  id: string | null;        // 임직원이면 profiles.id, 외부면 null
  name: string;
  dept: string | null;
  avatar_url: string | null;
}

interface DonorPickerProps {
  value: DonorValue | null;
  onChange: (v: DonorValue | null) => void;
  disabled?: boolean;
}

export function DonorPicker({ value, onChange, disabled }: DonorPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<DonorProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);          // 외부 기증자 직접 입력 모드
  const [manualName, setManualName] = useState('');
  const [manualDept, setManualDept] = useState('');

  // 디바운스 검색 (인라인 결과 — 떠 있는 드롭다운/바깥클릭 감지 없음 → 터치 안전)
  useEffect(() => {
    if (manual) return;
    const q = term.trim();
    if (q.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchDonorProfiles(q);
        setResults(list);
      } catch (e) {
        console.error('[DonorPicker] search', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [term, manual]);

  const select = (p: DonorProfile) => {
    onChange({ id: p.id, name: p.name, dept: p.dept, avatar_url: p.avatar_url });
    setTerm('');
    setResults([]);
  };

  const clear = () => {
    onChange(null);
    setTerm('');
    setResults([]);
    setManual(false);
    setManualName('');
    setManualDept('');
  };

  const applyManual = () => {
    const n = manualName.trim();
    if (!n) return;
    onChange({ id: null, name: n, dept: manualDept.trim() || null, avatar_url: null });
  };

  // ── 선택 완료 상태 (칩) ────────────────────────────────────────────────
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 999,
          }}
        >
          <Avatar name={value.name} avatarUrl={value.avatar_url} size={24} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0c4a6e' }}>{value.name}</span>
          {value.dept && <span style={{ fontSize: 12, color: '#0369a1' }}>· {value.dept}</span>}
          {value.id === null && (
            <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
              외부
            </span>
          )}
        </span>
        {!disabled && (
          <button type="button" onClick={clear} style={clearBtnStyle} aria-label="기증자 변경">
            ✕ 변경
          </button>
        )}
      </div>
    );
  }

  // ── 검색/입력 상태 ────────────────────────────────────────────────────
  const showResults = !manual && term.trim().length > 0;

  return (
    <div>
      {!manual ? (
        <>
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="임직원 이름 검색 (예: 고현정)"
            disabled={disabled}
            autoComplete="off"
            style={inputStyle}
          />

          {showResults && (
            <div style={resultsBox}>
              {searching ? (
                <div style={resultMuted}>검색 중…</div>
              ) : results.length === 0 ? (
                <div style={resultMuted}>검색 결과가 없습니다.</div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    // onMouseDown preventDefault: 입력 포커스 유지 → 모바일 blur/ghost-click 방지
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(p)}
                    style={resultItem}
                  >
                    <Avatar name={p.name} avatarUrl={p.avatar_url} size={32} />
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>{p.name}</span>
                      {p.dept && <span style={{ fontSize: 12, color: '#888' }}>{p.dept}</span>}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          <button type="button" onClick={() => setManual(true)} disabled={disabled} style={linkBtnStyle}>
            임직원이 아닌가요? 직접 입력
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="기증자 이름"
              disabled={disabled}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              type="text"
              value={manualDept}
              onChange={(e) => setManualDept(e.target.value)}
              placeholder="소속(선택)"
              disabled={disabled}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={applyManual} disabled={disabled || !manualName.trim()} style={applyBtnStyle}>
              적용
            </button>
            <button type="button" onClick={() => setManual(false)} disabled={disabled} style={linkBtnStyle}>
              ← 임직원 검색으로
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 스타일
// ============================================================================
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 16,            // 모바일 자동 줌 방지(16px 미만이면 iOS가 확대)
  boxSizing: 'border-box',
};

const resultsBox: React.CSSProperties = {
  marginTop: 6,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  maxHeight: 280,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: 4,
};

const resultItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 48,          // 터치 타깃 충분히 크게
  padding: '8px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'left',
};

const resultMuted: React.CSSProperties = {
  padding: '12px 10px',
  fontSize: 13,
  color: '#999',
};

const clearBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  minHeight: 36,
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  color: '#555',
  whiteSpace: 'nowrap',
};

const linkBtnStyle: React.CSSProperties = {
  marginTop: 8,
  background: 'none',
  border: 'none',
  color: '#0ea5e9',
  fontSize: 13,
  cursor: 'pointer',
  padding: '4px 0',
  textAlign: 'left',
};

const applyBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: '#0ea5e9',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};
