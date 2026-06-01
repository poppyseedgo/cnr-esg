// ============================================================================
// QnaCategoryChip — Q&A 카테고리 칩 (Figma: border-black, radius 999)
//
// 토큰 (Figma 933:102):
//   - border: 1px solid #111
//   - radius: 999px (완전 둥근 모서리)
//   - padding: 4px 16px
//   - font: 16px Pretendard Regular, color #111, line-height 1.5
//
// 라벨: 칩에는 약어(ESG_QNA_CATEGORY_CHIP_LABELS) — 슬사생 어워드 등.
// ============================================================================

import type { EsgQnaCategory } from '@/types/esg';
import { ESG_QNA_CATEGORY_CHIP_LABELS } from '@/types/esg';

interface Props {
  category: EsgQnaCategory;
}

export function QnaCategoryChip({ category }: Props) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid #111',
        borderRadius: 999,
        padding: '4px 16px',
        fontFamily: 'var(--font-sans)',
        fontWeight: 400,
        fontSize: 16,
        lineHeight: 1.5,
        color: '#111',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {ESG_QNA_CATEGORY_CHIP_LABELS[category]}
    </span>
  );
}
