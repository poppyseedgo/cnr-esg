// ============================================================================
// CustomLabel — 커스텀 라벨 배지 (리스트 카드/상세 페이지 공용)
//
// · 관리자가 지정한 텍스트 + 배경색(bg) + 폰트색(color)으로 배지를 표시.
// · text 가 비어있으면(NULL/공백) 아무것도 렌더하지 않음 → 텍스트 유무 = on/off.
// · 색이 비어있으면 기본값(검정 배경/흰 글씨)으로 폴백.
// · Figma 배지 스펙 준수: px8 py4, 14px, line-height 1.3.
// ============================================================================

interface CustomLabelProps {
  text: string | null | undefined;
  bg: string | null | undefined;
  color: string | null | undefined;
  /** 위치/크기 등 오버라이드(예: 오버레이 배치). */
  style?: React.CSSProperties;
}

export function CustomLabel({ text, bg, color, style }: CustomLabelProps) {
  const t = (text ?? '').trim();
  if (!t) return null; // 텍스트 없으면 미표시
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 8px',
        fontSize: 14,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        background: (bg ?? '').trim() || '#111',
        color: (color ?? '').trim() || '#fff',
        ...style,
      }}
    >
      {t}
    </span>
  );
}
