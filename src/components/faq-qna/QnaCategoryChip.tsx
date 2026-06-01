// ============================================================================
// QnaCategoryChip — Q&A 카테고리 칩 (Figma 1024:576, border-black, radius 999)
//
// 토큰 (Figma 1024:576/577):
//   - border: 1px solid #111
//   - radius: 999px
//   - padding: 4px 16px
//   - font: 14px Pretendard Regular, color #111, line-height 1.5
//
// 라벨: 칩에는 약어(ESG_QNA_CATEGORY_CHIP_LABELS) — 슬사생 어워드 등.
//
// 변경 이력:
//   2026-06-01  최초 작성 (Figma 933:102 기준 16px)
//   2026-06-01  Figma 1024:595 정밀 매핑 — 폰트 14px로 정정
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
        fontSize: 14,            // ← Figma 1024:577 정확값 (이전 16 → 14)
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
