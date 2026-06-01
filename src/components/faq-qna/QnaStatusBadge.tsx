// ============================================================================
// QnaStatusBadge — Q&A 답변 상태 배지
//
// 변경 이력:
//   2026-06-01  최초 작성
//   2026-06-01  CSS 클래스로 마이그레이션 (faq-qna.css)
// ============================================================================

import type { EsgQnaQuestionStatus } from '@/types/esg';
import './faq-qna.css';

interface Props {
  status: EsgQnaQuestionStatus;
}

export function QnaStatusBadge({ status }: Props) {
  if (status === 'hidden') return null;
  const cls = status === 'pending' ? 'faqqna-badge--pending' : 'faqqna-badge--answered';
  const label = status === 'pending' ? '답변 대기 중' : '답변 완료';
  return <span className={`faqqna-badge ${cls}`}>{label}</span>;
}
