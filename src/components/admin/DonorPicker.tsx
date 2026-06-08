// ============================================================================
// DonorPicker — 기증자(임직원) 검색·선택 (SPACE 참석자 검색과 동일 패턴)
//
// 동작:
//   - 이름 입력 → 디바운스(250ms) → esg_profile_public 부분일치 검색 → 드롭다운
//   - 항목 선택 → 아바타+이름+부서 칩으로 고정, donor_id/이름/부서 스냅샷 부모로 전달
//   - 단일 선택(기증자는 1명). 다시 검색하려면 칩의 ✕ 로 해제
//
// 외부(비임직원) 기증자:
//   - "직접 입력" 토글을 켜면 이름/부서를 수동 입력 (donor_id=null + 스냅샷).
//   - ※ 요구사항은 '임직원 검색'이 기본. 외부 기증자 허용이 불필요하면 이 토글은 제거 가능.
//     (기획 확인 후 결정)
//
// 사용:
//   <DonorPicker value={donor} onChange={setDonor} disabled={saving} />
//   value: { id: string|null, name: string, dept: string|null, avatar_url: string|null } | null
// ============================================================================

import { useEffect, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);          // 외부 기증자 직접 입력 모드
  const [manualName, setManualName] = useState('');
  const [manualDept, setManualDept] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // 디바운스 검색
  useEffect(() => {
    if (manual) return;
    const q = term.trim();
    if (q.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchDonorProfiles(q);
        setResults(list);
        setOpen(true);
      } catch (e) {
        console.error('[DonorPicker] search', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [term, manual]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const select = (p: DonorProfile) => {
    onChange({ id: p.id, name: p.name, dept: p.dept, avatar_url: p.avatar_url });
    setTerm('');
    setResults([]);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setTerm('');
    setManualName('');
    setManualDept('');
  };

  const applyManual = () => {
    const n = manualName.trim();
    if (!n) return;
    onChange({ id: null, name: n, dept: manualDept.trim() || null, avatar_url: null });
  };

  // 선택 완료 상태
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <button type="button" onClick={clear} style={clearBtnStyle} aria-label="기증자 해제">
            ✕ 변경
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {!manual ? (
        <>
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="임직원 이름 검색 (예: 고현정)"
            disabled={disabled}
            style={inputStyle}
          />
          {open && (
            <div style={dropdownStyle}>
              {searching ? (
                <div style={dropItemMuted}>검색 중…</div>
              ) : results.length === 0 ? (
                <div style={dropItemMuted}>검색 결과가 없습니다.</div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => select(p)}
                    style={dropItemBtn}
                  >
                    <Avatar name={p.name} avatarUrl={p.avatar_url} size={28} />
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{p.name}</span>
                      {p.dept && <span style={{ fontSize: 11, color: '#888' }}>{p.dept}</span>}
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
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  zIndex: 30,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  maxHeight: 260,
  overflowY: 'auto',
  padding: 4,
};

const dropItemBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '8px 8px',
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'left',
};

const dropItemMuted: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 12,
  color: '#999',
};

const clearBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  color: '#555',
  whiteSpace: 'nowrap',
};

const linkBtnStyle: React.CSSProperties = {
  marginTop: 6,
  background: 'none',
  border: 'none',
  color: '#0ea5e9',
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};

const applyBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#0ea5e9',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
