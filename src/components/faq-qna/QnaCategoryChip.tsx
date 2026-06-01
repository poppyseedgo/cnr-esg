// ============================================================================
// QnaCategoryChip — Q&A 카테고리 칩 (Figma 1024:577)
//
// 변경 이력:
//   2026-06-01  Figma 1024:595 정밀 매핑 (14px)
//   2026-06-01  CSS 클래스로 마이그레이션 + 모바일 12px (faq-qna.css)
// ============================================================================

import type { EsgQnaCategory } from '@/types/esg';
import { ESG_QNA_CATEGORY_CHIP_LABELS } from '@/types/esg';
import './faq-qna.css';

interface Props {
  category: EsgQnaCategory;
}

export function QnaCategoryChip({ category }: Props) {
  return (
    <span className="faqqna-chip">
      {ESG_QNA_CATEGORY_CHIP_LABELS[category]}
    </span>
  );
}
