// ============================================================================
// DonationProgressBar.tsx — 모금 진행바 (메인 히어로, 나무 그리드 하단)
//
// [변경 이력]
//   2026-06-23  최초 작성. Figma node 1698:1859 / 1698:1860 1:1 구현.
//
// [설계]
//   - 상단 라벨 "현재 달성 금액 {current}" (좌, 검정 14px)
//   - 바: 검정 트랙(h32, pill) + 달성 초록(#26ff4e) 좌측부터 비율 채움
//   - 바 우측 안쪽 "목표금액 {goal}" (흰 14px)
//   - 인라인 스타일만 사용 → 스타일 시스템 무관 드롭인, 폰트는 앱(Pretendard) 상속.
//
// [데이터 계약]
//   props.current : 현재 달성 금액(원)
//   props.goal    : 목표 금액(원)
//
// [Figma 토큰]
//   트랙 #000 h=32 / 달성 #26FF4E / 라벨 14px line-height 1.1 / 컨테이너 max-w 697
// ============================================================================

const TRACK = '#000000';     // ← 트랙(목표) 색
const ACHIEVED = '#26FF4E';  // ← 달성 색 (Figma 진행바 추출)

export interface DonationProgressBarProps {
  /** 현재 달성 금액(원) */
  current: number;
  /** 목표 금액(원) */
  goal: number;
}

export function DonationProgressBar({ current, goal }: DonationProgressBarProps) {
  const ratio = goal && goal > 0 ? Math.max(0, Math.min(1, current / goal)) : 0; // ← 0~1 clamp
  const pct = `${(ratio * 100).toFixed(2)}%`; // ← 달성 너비

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        width: '100%',
        maxWidth: 697,
      }}
    >
      {/* 상단 라벨 */}
      <span
        style={{
          fontSize: 14,
          lineHeight: 1.1,
          color: '#000',
          fontWeight: 400,
          textTransform: 'uppercase',
        }}
      >
        현재 달성 금액 {current.toLocaleString('ko-KR')}
      </span>

      {/* 바 */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 32,
          borderRadius: 999,
          background: TRACK,
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(current, goal)}
      >
        {/* 달성 채움 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: pct,
            background: ACHIEVED,
            borderRadius: 999,
          }}
        />
        {/* 목표 라벨 (바 우측 안쪽) */}
        <span
          style={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 14,
            lineHeight: 1.1,
            color: '#fff',
            fontWeight: 400,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          목표금액 {goal.toLocaleString('ko-KR')}
        </span>
      </div>
    </div>
  );
}

export default DonationProgressBar;
