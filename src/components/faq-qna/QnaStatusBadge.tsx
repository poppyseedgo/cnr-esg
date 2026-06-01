// ============================================================================
// QnaStatusBadge — Q&A 답변 상태 배지
//
// 상태:
//   - pending : "답변 대기 중" bg #e3e9f5 (연회청색)
//   - answered: "답변 완료"   bg #d4f6ff (연하늘색)
//   - hidden  : 표시 안 함 (어드민용 별도 라벨 필요 시 옵션)
//
// 토큰 (Figma 933:102 / 1003:379):
//   - radius 8, padding 4px 8px, font 12px Pretendard Regular, color black, line 1.5
// ============================================================================

import type { EsgQnaQuestionStatus } from '@/types/esg';

interface Props {
  status: EsgQnaQuestionStatus;
}

const STATUS_CONFIG: Record<EsgQnaQuestionStatus, { bg: string; label: string } | null> = {
  pending: { bg: '#e3e9f5', label: '답변 대기 중' },
  answered: { bg: '#d4f6ff', label: '답변 완료' },
  hidden: null, // 일반 사용자에게는 표시 안 됨 (RLS로 차단). 어드민에서만 별도 처리.
};

export function QnaStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: config.bg,
        borderRadius: 8,
        padding: '4px 8px',
        fontFamily: 'var(--font-sans)',
        fontWeight: 400,
        fontSize: 12,
        lineHeight: 1.5,
        color: '#000',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {config.label}
    </span>
  );
}
