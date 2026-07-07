// ============================================================================
// DonationProgressBar.tsx — 모금 진행바 (메인 히어로, 나무 그리드 하단)
//
// [변경 이력]
//   2026-06-23  최초 작성. Figma node 1698:1859 / 1698:1860 1:1 구현.
//   2026-06-23  [수정] (1) 모서리 둥글기 제거(Figma=각진 사각). // ← border-radius 삭제
//   2026-06-23  [수정] 달성 색 #26FF4E → #0CFF39 (shimmer 톤도 동반 조정).
//                      (2) 달성(초록) 영역에 흐르는 듯한 shimmer 효과 추가(일렁임).
//   2026-06-23  [수정] 상단 라벨을 바 좌측 끝에 광학적으로 flush 정렬.
//                      폰트 글리프 좌측 베어링(약 0.1em)만큼 텍스트가 안쪽에서
//                      시작하던 틈을 marginLeft:-0.1em 으로 보정(em → 배율 무관).
//
// [설계]
//   - 상단 라벨 "현재 달성 금액 {current}" (좌, 검정 14px)
//   - 바: 검정 트랙(h32, 각진) + 달성 초록(#26ff4e) 좌측부터 비율 채움 + shimmer
//   - 바 우측 안쪽 "목표금액 {goal}" (흰 14px)
//   - prefers-reduced-motion: 애니메이션 정지(접근성)
//
// [데이터 계약]  props.current / props.goal (원)
// [Figma 토큰]  트랙 #000 h=32 / 달성 #0CFF39 / 라벨 14px / max-w 697 / radius 0
// ============================================================================

const TRACK = '#000000';     // ← 트랙(목표) 색
const ACHIEVED = '#0CFF39';  // ← 달성 색 (Figma 진행바 추출)
const FADE = 56;             // ← [2026-07-08] 채움 오른쪽 끝 페이드(글로우) 거리(px)

// 달성 영역 shimmer(일렁임) + 오른쪽 끝 그라데이션 페이드(초록→검정 글로우)
const BAR_CSS = `
.donbar__fill {
  background: linear-gradient(100deg,
    ${ACHIEVED} 0%, #63FF85 42%, #B0FFC2 50%, #63FF85 58%, ${ACHIEVED} 100%);
  background-size: 220% 100%;
  animation: esgBarShimmer 2.4s linear infinite;
  /* ← [2026-07-08] 채움 우측 끝 ${FADE}px 를 투명으로 → 검정 트랙 위에서 초록이 부드럽게 페이드 */
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - ${FADE}px), transparent 100%);
          mask-image: linear-gradient(to right, #000 calc(100% - ${FADE}px), transparent 100%);
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

      {/* 상단 라벨 — 바 좌측 끝에 광학적 flush (글리프 좌측 베어링 보정) */}
      <span style={{
        fontSize: 14, lineHeight: 1.1, color: '#000', fontWeight: 400, textTransform: 'uppercase',
        marginLeft: '-0.1em', // ← [2026-06-23] 글자 좌측 베어링만큼 당겨 바 좌측에 딱 붙임
      }}>
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
        {/* 달성 채움 (shimmer + 우측 끝 페이드). 폭 = 비율 + FADE → 마스크가 끝 FADE를 페이드하므로 solid=비율 */}
        <div
          className="donbar__fill"   // ← 일렁이는 sheen + 페이드 (BAR_CSS)
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: ratio > 0 ? `calc(${pct} + ${FADE}px)` : 0 }}
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
