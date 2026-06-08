// ============================================================================
// DonorPicker — 기증자(임직원) 검색·선택 (SPACE 참석자 검색과 동일 패턴)
//
// 동작:
//   - 이름 입력 → 디바운스(250ms) → esg_profile_public 부분일치 검색 → 인라인 결과 리스트
//   - 항목 탭 → 아바타+이름+부서 칩으로 고정, donor_id/이름/부서 스냅샷 부모로 전달
//   - 단일 선택. 다시 검색하려면 칩의 "변경"으로 해제
//
// 모바일 클릭 안정화 (핵심):
//   iOS Safari 는 소프트 키보드가 열린 상태에서 입력창 밖을 처음 탭하면 그 탭을
//   '키보드 닫기' 제스처로 흡수해 click 이 발생하지 않는다(→ 첫 탭이 먹힘).
//   onMouseDown preventDefault 는 합성 마우스이벤트라 이를 막지 못한다.
//   → 그래서 선택을 실제 포인터이벤트(pointerup)에서 처리하고, 이동거리로
//     '탭 vs 스크롤'을 구분한다. pointerup 은 손을 떼는 즉시(키보드 닫힘과 무관)
//     발생하므로 첫 탭에 바로 선택된다. (마우스/펜도 PointerEvent 로 동일 처리)
//   - 키보드 접근성(Enter)용으로 onClick 폴백도 유지(리스트가 선택 즉시 사라져 중복 없음).
//
// 변경 이력:
//   2026-06-08  최초(떠있는 드롭다운+document mousedown)
//   2026-06-08  인라인 결과 리스트로 전환
//   2026-06-08  [모바일 클릭수정] 선택을 pointerup(탭 가드)로 처리 — iOS 첫 탭 흡수 해결
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

const TAP_MOVE_THRESHOLD = 12; // px — 이보다 많이 움직이면 스크롤로 간주(선택 안 함)

export function DonorPicker({ value, onChange, disabled }: DonorPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<DonorProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);          // 외부 기증자 직접 입력 모드
  const [manualName, setManualName] = useState('');
  const [manualDept, setManualDept] = useState('');

  // 탭 판정용: pointerdown 시작 좌표/대상 id 기록
  const pressRef = useRef<{ id: string; x: number; y: number } | null>(null);

  // 디바운스 검색 (인라인 결과)
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

  // ── 포인터 기반 선택 (탭 vs 스크롤 구분) ───────────────────────────────
  const onItemPointerDown = (p: DonorProfile, e: React.PointerEvent) => {
    pressRef.current = { id: p.id, x: e.clientX, y: e.clientY };
  };
  const onItemPointerUp = (p: DonorProfile, e: React.PointerEvent) => {
    const start = pressRef.current;
    pressRef.current = null;
    if (!start || start.id !== p.id) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > TAP_MOVE_THRESHOLD) return; // 스크롤 → 선택 취소
    e.preventDefault();
    select(p);
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
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0c4a6e' }}>{value.name}</span>
          {value.dept && <span style={{ fontSize: 13, color: '#0369a1' }}>· {value.dept}</span>}
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
            <div style={resultsBox} role="listbox">
              {searching ? (
                <div style={resultMuted}>검색 중…</div>
              ) : results.length === 0 ? (
                <div style={resultMuted}>검색 결과가 없습니다.</div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    // 선택은 pointerup(탭 가드)에서. onClick 은 키보드/폴백.
                    onPointerDown={(e) => onItemPointerDown(p, e)}
                    onPointerUp={(e) => onItemPointerUp(p, e)}
                    onClick={() => select(p)}
                    style={resultItem}
                  >
                    <Avatar name={p.name} avatarUrl={p.avatar_url} size={32} />
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#222' }}>{p.name}</span>
                      {p.dept && <span style={{ fontSize: 13, color: '#888' }}>{p.dept}</span>}
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
  // 결과 항목을 탭할 때 브라우저 기본 제스처(스크롤/줌)와의 충돌 최소화
  touchAction: 'pan-y',
  padding: 4,
};

const resultItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 52,          // 터치 타깃 충분히 크게
  padding: '10px',
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
  padding: '8px 14px',
  minHeight: 40,
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  color: '#555',
  whiteSpace: 'nowrap',
};

const linkBtnStyle: React.CSSProperties = {
  marginTop: 8,
  minHeight: 40,
  background: 'none',
  border: 'none',
  color: '#0ea5e9',
  fontSize: 14,
  cursor: 'pointer',
  padding: '6px 0',
  textAlign: 'left',
};

const applyBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  minHeight: 44,
  background: '#0ea5e9',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};
