// ============================================================================
// SearchBar — 공용 검색 입력창 (🔍 아이콘 + 지우기 버튼)
//   <SearchBar value={q} onChange={setQ} placeholder="물품 이름 / 기증자 검색" />
//   제어형(controlled). 필터링은 호출부에서 matchesQuery 등으로 수행.
// ============================================================================

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: number | string;
}

export function SearchBar({ value, onChange, placeholder = '검색', disabled, width }: SearchBarProps) {
  return (
    <div style={{ position: 'relative', width: width ?? 260, maxWidth: '100%' }}>
      <span
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 13,
          color: '#999',
          pointerEvents: 'none',
        }}
      >
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: 36,
          padding: '0 30px',
          border: '1px solid #ddd',
          borderRadius: 8,
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
          background: disabled ? '#f5f5f5' : '#fff',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="검색어 지우기"
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 22,
            height: 22,
            border: 'none',
            borderRadius: '50%',
            background: '#f0f0f0',
            color: '#666',
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
