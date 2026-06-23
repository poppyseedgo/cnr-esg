// ============================================================================
// DonationProgressBar.tsx — 모금 진행바 (메인 히어로, 나무 그리드 하단)
//
// [변경 이력]
//   2026-06-23  최초 작성. Figma node 1698:1859 / 1698:1860 1:1 구현.
//   2026-06-23  [수정] (1) 모서리 둥글기 제거(Figma=각진 사각). // ← border-radius 삭제
//                      (2) 달성(초록) 영역에 흐르는 듯한 shimmer 효과 추가(일렁임).
//
// [설계]
//   - 상단 라벨 "현재 달성 금액 {current}" (좌, 검정 14px)
//   - 바: 검정 트랙(h32, 각진) + 달성 초록(#26ff4e) 좌측부터 비율 채움 + shimmer
//   - 바 우측 안쪽 "목표금액 {goal}" (흰 14px)
//   - prefers-reduced-motion: 애니메이션 정지(접근성)
//
// [데이터 계약]  props.current / props.goal (원)
// [Figma 토큰]  트랙 #000 h=32 / 달성 #26FF4E / 라벨 14px / max-w 697 / radius 0
// ============================================================================

const TRACK = '#000000';     // ← 트랙(목표) 색
const ACHIEVED = '#26FF4E';  // ← 달성 색 (Figma 진행바 추출)

// 달성 영역 shimmer(일렁임) — 흐르는 sheen + 접근성(reduced-motion) 정지
const BAR_CSS = `
.donbar__fill {
  background: linear-gradient(100deg,
    ${ACHIEVED} 0%, #7DFFA0 42%, #B6FFC9 50%, #7DFFA0 58%, ${ACHIEVED} 100%);
  background-size: 220% 100%;
  animation: esgBarShimmer 2.4s linear infinite;
}
@keyframes esgBarShimmer {
  0%   { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .donbar__fill { animation: none; background: ${ACHIEVED}; }
}
`;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 697 }}>
      <style>{BAR_CSS}</style>

      {/* 상단 라벨 */}
      <span style={{ fontSize: 14, lineHeight: 1.1, color: '#000', fontWeight: 400, textTransform: 'uppercase' }}>
        현재 달성 금액 {current.toLocaleString('ko-KR')}
      </span>

      {/* 바 (각진 사각 — border-radius 없음) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 32,
          background: TRACK,        // ← 각진 트랙 (radius 0)
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(current, goal)}
      >
        {/* 달성 채움 (shimmer) */}
        <div
          className="donbar__fill"   // ← 일렁이는 sheen (BAR_CSS)
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct }}
        />
        {/* 목표 라벨 (바 우측 안쪽) */}
        <span
          style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            fontSize: 14, lineHeight: 1.1, color: '#fff', fontWeight: 400,
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}
        >
          목표금액 {goal.toLocaleString('ko-KR')}
        </span>
      </div>
    </div>
  );
}

export default DonationProgressBar;
