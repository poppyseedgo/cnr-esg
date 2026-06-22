// ============================================================================
// TagInput — 상품 태그 입력(워드프레스식)
//
// 동작:
//   - 타이핑 → 기존 태그 자동완성 드롭다운(부분일치, 이미 선택된 건 제외)
//   - Enter / 콤마 → 일치하는 기존 태그 추가, 없으면 새 태그 즉시 생성(upsertTag)
//   - 드롭다운의 "+ 새 태그 만들기" 클릭으로도 생성
//   - 칩 ×, 빈 입력에서 Backspace → 마지막 칩 제거
//
// 사용:
//   <TagInput value={tags} onChange={setTags} disabled={busy} />
//
// 변경 이력:
//   2026-06-22  최초 작성 — 태그 시스템(기능 ②)
// ============================================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { listAllTags, upsertTag } from '@/lib/tags';
import type { EsgTagRow } from '@/types/esg';

interface TagInputProps {
  value: EsgTagRow[];
  onChange: (tags: EsgTagRow[]) => void;
  disabled?: boolean;
}

export function TagInput({ value, onChange, disabled }: TagInputProps) {
  const [allTags, setAllTags] = useState<EsgTagRow[]>([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 전체 태그 로드(자동완성용)
  useEffect(() => {
    listAllTags().then(setAllTags).catch(() => {/* 자동완성 실패는 조용히 무시(직접 입력 가능) */});
  }, []);

  const selectedIds = useMemo(() => new Set(value.map((t) => t.id)), [value]);
  const q = input.trim().toLowerCase();

  // 입력 기반 후보(선택된 건 제외, 이름 부분일치, 최대 8개)
  const candidates = useMemo(() => {
    if (!q) return [];
    return allTags
      .filter((t) => !selectedIds.has(t.id) && t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [q, allTags, selectedIds]);

  // 입력값과 정확히 같은 이름이 이미 존재(전체/선택)하는가 → "새로 만들기" 노출 여부
  const exactExists = useMemo(
    () => allTags.some((t) => t.name.toLowerCase() === q) || value.some((t) => t.name.toLowerCase() === q),
    [allTags, value, q]
  );

  const addTag = (tag: EsgTagRow) => {
    if (selectedIds.has(tag.id)) return;
    onChange([...value, tag]);
    setInput('');
    setOpen(false);
  };

  const createAndAdd = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const tag = await upsertTag(trimmed); // 있으면 기존 반환, 없으면 생성
      setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      if (!value.some((t) => t.id === tag.id)) onChange([...value, tag]);
      setInput('');
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '태그 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  const removeTag = (id: string) => onChange(value.filter((t) => t.id !== id));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const name = input.trim();
      if (!name) return;
      const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) addTag(existing);
      else void createAndAdd(name);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1].id); // 빈 입력 + Backspace → 마지막 칩 제거
    }
  };

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {/* 선택된 칩 + 입력창 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '6px 8px',
          border: '1px solid #ddd',
          borderRadius: 6,
          minHeight: 40,
          alignItems: 'center',
          background: disabled ? '#f5f5f5' : '#fff',
        }}
      >
        {value.map((t) => (
          <span
            key={t.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: '#eef2ff',
              color: '#3730a3',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            #{t.name}
            <button
              type="button"
              onClick={() => removeTag(t.id)}
              disabled={disabled}
              aria-label={`${t.name} 태그 제거`}
              style={{ border: 'none', background: 'none', cursor: disabled ? 'not-allowed' : 'pointer', color: '#3730a3', fontSize: 14, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled || creating}
          placeholder={value.length ? '' : '태그 입력 후 Enter (예: 빈티지, 친환경)'}
          style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', fontSize: 13, padding: '4px', background: 'transparent' }}
        />
      </div>

      {/* 자동완성 드롭다운 */}
      {open && q && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 20,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {candidates.map((t) => (
            <button key={t.id} type="button" onClick={() => addTag(t)} style={dropItem}>
              #{t.name}
            </button>
          ))}
          {!exactExists && (
            <button type="button" onClick={() => void createAndAdd(input)} disabled={creating} style={{ ...dropItem, color: '#0369a1', fontWeight: 600 }}>
              + "{input.trim()}" 새 태그 만들기
            </button>
          )}
          {candidates.length === 0 && exactExists && (
            <div style={{ ...dropItem, color: '#999', cursor: 'default' }}>이미 추가된 태그입니다</div>
          )}
        </div>
      )}
    </div>
  );
}

const dropItem: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: '#333',
};
