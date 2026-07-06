// ============================================================================
// CustomLabelEditor — 커스텀 라벨 입력(관리자) : 텍스트 + 배경색/폰트색 컬러피커 + 미리보기
//
// · 상품 편집(ProductEditForm) / 경매 편집(AuctionEditForm) 공용.
// · 자유 HEX 컬러피커(<input type="color">). 텍스트가 비면 라벨 미표시(미리보기로 안내).
// · 값은 항상 문자열로 보관(빈 문자열 = 미지정). 색은 #rrggbb 형태.
// ============================================================================

import { CustomLabel } from '@/components/CustomLabel';

export interface CustomLabelValue {
  text: string;
  bg: string;    // #rrggbb (빈 문자열이면 기본색)
  color: string; // #rrggbb
}

export const DEFAULT_LABEL_BG = '#111111';
export const DEFAULT_LABEL_COLOR = '#ffffff';

interface CustomLabelEditorProps {
  value: CustomLabelValue;
  onChange: (v: CustomLabelValue) => void;
  disabled?: boolean;
}

export function CustomLabelEditor({ value, onChange, disabled }: CustomLabelEditorProps) {
  const set = (patch: Partial<CustomLabelValue>) => onChange({ ...value, ...patch });
  const hasText = value.text.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        type="text"
        value={value.text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="예: 특가, 한정 수량 (비우면 라벨 미표시)"
        disabled={disabled}
        style={{
          width: '100%', padding: '10px 12px', border: '1px solid #ddd',
          borderRadius: 6, fontSize: 16, boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={labelRow}>
          배경색
          <input
            type="color"
            value={normHex(value.bg, DEFAULT_LABEL_BG)}
            onChange={(e) => set({ bg: e.target.value })}
            disabled={disabled}
            style={colorInputStyle}
          />
          <span style={hexTextStyle}>{normHex(value.bg, DEFAULT_LABEL_BG)}</span>
        </label>
        <label style={labelRow}>
          폰트색
          <input
            type="color"
            value={normHex(value.color, DEFAULT_LABEL_COLOR)}
            onChange={(e) => set({ color: e.target.value })}
            disabled={disabled}
            style={colorInputStyle}
          />
          <span style={hexTextStyle}>{normHex(value.color, DEFAULT_LABEL_COLOR)}</span>
        </label>
      </div>

      {/* 미리보기 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#888' }}>
        미리보기:
        {hasText ? (
          <CustomLabel text={value.text} bg={value.bg} color={value.color} />
        ) : (
          <span style={{ color: '#bbb' }}>(텍스트를 입력하면 라벨이 표시됩니다)</span>
        )}
      </div>
    </div>
  );
}

// #rrggbb 형태가 아니면 기본색으로 폴백(컬러피커는 유효한 hex만 허용)
function normHex(v: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : fallback;
}

const labelRow: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#333' };
const colorInputStyle: React.CSSProperties = { width: 40, height: 28, padding: 0, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', background: 'none' };
const hexTextStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, color: '#666' };
