// ============================================================================
// DonationTreeGrid.tsx — 모금액 현황 나무/원 그리드 (메인 히어로)
//
// [변경 이력]
//   2026-06-23  최초 작성. Figma node 1698:1767 / 1698:1768 1:1 구현.
//   2026-06-23  [수정] 비활성 원: 흰색 → 회색 구체(radial-gradient). Figma 배경 변경 반영.
//
// [설계]
//   - 10열 × 7행 = 70셀 고정 그리드 (셀 피치 70px).
//   - 활성 셀 = 나무(초록 캐노피 #24EB49 + 검정 줄기), 비활성 셀 = 회색 구체.
//   - 채움 순서: 행 우선(좌→우, 위→아래). 셀 인덱스 = row * 10 + col.
//   - 환산(비율형): activeCount = round(current / goal × 70), [0,70] clamp.
//   - 순수 SVG. Tailwind/디자인토큰/외부 에셋 의존 없음 → 어떤 스타일 시스템에도 드롭인.
//
// [데이터 계약]  ※ 숫자 하드코딩 금지. 아래 props 로만 주입.
//   props.current : 현재 달성 금액(원). esg_donation_stats 총 모금액과 연결 예정.
//   props.goal    : 목표 금액(원). esg_settings 단일 소스와 연결 예정.
//
// [Figma 토큰]
//   캐노피  circle r=35  fill #24EB49
//   줄기    rect x=32 y=52 w=7 h=31  fill #000
//   비활성  circle r=35  회색 구체(radial #F3F3F3→#DCDCDC)
//   viewBox 0 0 720 503 (셀 70px, 좌우 inset 10)
// ============================================================================

const COLS = 10;            // ← 열
const ROWS = 7;             // ← 행
const TOTAL_CELLS = COLS * ROWS; // ← 70셀 고정
const PITCH = 70;           // ← 셀 피치
const R = 35;               // ← 캐노피 반지름
const INSET_X = 10;         // ← 좌측 inset (720 컨테이너 - 10*70 = 20, 좌우 10씩)

const CANOPY = '#24EB49';                 // ← 활성 나무 색 (Figma 추출)
const INACTIVE = 'url(#esgInactiveSphere)'; // ← [2026-06-23] 비활성 회색 구체(그라데이션)
const TRUNK = '#000000';    // ← 줄기 색

/** 비율형 환산: round(달성÷목표×70), [0,70] clamp, 목표 0 가드 */
export function donationActiveTrees(current: number, goal: number): number {
  if (!goal || goal <= 0) return 0;                       // ← 목표 0/음수 가드
  const n = Math.round((current / goal) * TOTAL_CELLS);   // ← 비율형(반올림)
  return Math.max(0, Math.min(TOTAL_CELLS, n));           // ← clamp
}

export interface DonationTreeGridProps {
  /** 현재 달성 금액(원) */
  current: number;
  /** 목표 금액(원) */
  goal: number;
  /** 접근성 라벨 (선택) */
  ariaLabel?: string;
}

export function DonationTreeGrid({ current, goal, ariaLabel }: DonationTreeGridProps) {
  const active = donationActiveTrees(current, goal); // ← 활성 나무 수

  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;          // ← 행 우선 인덱스
      const x = INSET_X + col * PITCH;
      const y = row * PITCH;
      const cx = x + R;
      const cy = y + R;
      const isTree = idx < active;           // ← 채움 순서(좌→우, 위→아래)

      if (isTree) {
        cells.push(
          <g key={idx}>
            <circle cx={cx} cy={cy} r={R} fill={CANOPY} />
            <rect x={x + 32} y={y + 52} width={7} height={31} fill={TRUNK} />
          </g>,
        );
      } else {
        cells.push(<circle key={idx} cx={cx} cy={cy} r={R} fill={INACTIVE} />);
      }
    }
  }

  return (
    <svg
      viewBox="0 0 720 503"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel ?? `모금 목표 대비 ${active} / ${TOTAL_CELLS} 그루 달성`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* 비활성 회색 구체: 좌상단 하이라이트 → 가장자리 진한 회색 */}
        <radialGradient id="esgInactiveSphere" cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#F3F3F3" />
          <stop offset="100%" stopColor="#DCDCDC" />
        </radialGradient>
      </defs>
      {cells}
    </svg>
  );
}

export default DonationTreeGrid;
