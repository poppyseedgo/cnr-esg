// ============================================================================
// DonationTreeGrid.tsx — 모금액 현황 나무/원 그리드 (메인 히어로)
//
// [변경 이력]
//   2026-06-23  최초 작성. Figma node 1698:1767 / 1698:1768 1:1 구현.
//   2026-06-23  [수정] 비활성 원: 흰색 → flat 회색 #F4F4F4. (구체/그라데이션 미사용)
//   2026-06-23  [식수 애니메이션] 다음 4가지 추가. 데이터 계약(current/goal) 불변.
//     (1) 등장(새싹) — 활성 나무가 줄기 밑동(transform-origin 50% 100%)에서 위로
//         돋아남. 최초 데이터 도착 시 70셀 채움 순서(행 우선)로 stagger 등장.
//     (2) 라이브 식수 — current 상승으로 활성 수가 늘면 "새로 늘어난 나무만" 등장.
//         이전에 심긴 나무는 재생하지 않음. 부모 변경 불필요(컴포넌트가 스스로 감지).
//         · 핵심: 활성 셀은 <g>로, 비활성 셀은 <circle>로 렌더 → 새로 활성화된 셀은
//           DOM 신규 마운트되어 CSS 등장 애니메이션이 1회만 자연 발화. 기존 나무는
//           마운트가 유지되어 재생 안 됨(부모 1초 카운트다운 리렌더에도 안전).
//         · stagger 인덱스(--i) = idx − prevActive(직전 활성 수). 최초엔 0..N, 이후
//           단건 식수는 0(지연 없이 즉시).
//     (3) idle '산들바람' — 심긴 나무가 밑동 기준 미세 scaleY + 좌우 sway 무한 반복.
//         대각선 위상차(--p = row+col)로 바람이 숲을 훑는 잔물결. 흙 링 없음(차분).
//     (4) idle 일시정지 — 그리드가 뷰포트 밖이거나 탭이 숨겨지면 sway 정지(CPU 절약).
//         + prefers-reduced-motion: 등장/idle 전부 off, 즉시 표시(접근성).
//
// [설계]
//   - 10열 × 7행 = 70셀 고정 그리드 (셀 피치 70px).
//   - 활성 셀 = 나무(초록 캐노피 #24EB49 + 검정 줄기), 비활성 셀 = flat 회색 #F4F4F4.
//   - 채움 순서: 행 우선(좌→우, 위→아래). 셀 인덱스 = row * 10 + col.
//   - 환산(비율형): activeCount = round(current / goal × 70), [0,70] clamp.
//   - 순수 SVG + 자체 <style>(esg-tg* 스코프). 외부 CSS/토큰/에셋 의존 없음.
//
// [데이터 계약]  ※ 변경 없음. props.current / props.goal 만으로 구동.
//
// [Figma 토큰]
//   캐노피  circle r=35  fill #24EB49
//   줄기    rect x=32 y=52 w=7 h=31  fill #000
//   비활성  circle r=35  fill #F4F4F4 (flat)
//   viewBox 0 0 720 503 (셀 70px, 좌우 inset 10)
// ============================================================================

import { useEffect, useRef, useState, type CSSProperties } from 'react'; // ← [추가] 등장/idle 제어

const COLS = 10;            // ← 열
const ROWS = 7;             // ← 행
const TOTAL_CELLS = COLS * ROWS; // ← 70셀 고정
const PITCH = 70;           // ← 셀 피치
const R = 35;               // ← 캐노피 반지름
const INSET_X = 10;         // ← 좌측 inset (720 컨테이너 - 10*70 = 20, 좌우 10씩)

const CANOPY = '#24EB49';   // ← 활성 나무 색 (Figma 추출)
const INACTIVE = '#F4F4F4'; // ← [2026-06-23] 비활성 원: flat 회색(그라데이션 제거)
const TRUNK = '#000000';    // ← 줄기 색

const ENTER_STAGGER_MS = 26; // ← [추가] 새싹 등장 셀 간 지연(행 우선 stagger)
const IDLE_PHASE_MS = 140;   // ← [추가] idle 대각선 위상차(셀당)

// 자체 스코프 CSS — esg-tg* 키프레임/클래스 (전역 충돌 회피)
const GRID_CSS = `
.esg-tg__tree { transform-box: fill-box; }
.esg-tg__sway { transform-box: fill-box; transform-origin: 50% 100%; }

/* 등장: 밑동에서 위로 돋는 새싹 + 가벼운 오버슈트 (transform-origin 50% 100%) */
@keyframes esgTgSprout {
  0%   { opacity: 0; transform: translateY(2px) scale(0); }
  60%  { opacity: 1; transform: translateY(0) scale(1.14); }
  100% { opacity: 1; transform: scale(1); }
}
.esg-tg__tree--enter {
  transform-origin: 50% 100%;
  animation: esgTgSprout 0.52s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(var(--i, 0) * ${ENTER_STAGGER_MS}ms);
}

/* idle 산들바람: 밑동 기준 미세 scaleY + 좌우 sway, 무한 반복 */
@keyframes esgTgBreeze {
  0%   { transform: scaleY(1) rotate(0deg); }
  25%  { transform: scaleY(1.016) rotate(0.8deg); }
  75%  { transform: scaleY(1.016) rotate(-0.8deg); }
  100% { transform: scaleY(1) rotate(0deg); }
}
.esg-tg__sway {
  animation: esgTgBreeze 4.2s ease-in-out infinite;
  animation-delay: calc(var(--p, 0) * -${IDLE_PHASE_MS}ms);
}

/* 뷰포트 밖/탭 숨김: idle 일시정지(자원 절약) */
.esg-tg.is-paused .esg-tg__sway { animation-play-state: paused; }

/* 접근성: 모션 최소화 — 등장/idle off, 즉시 표시 */
@media (prefers-reduced-motion: reduce) {
  .esg-tg__tree--enter { animation: none; opacity: 1; }
  .esg-tg__sway { animation: none; }
}
`;

/** 비율형 환산: round(달성÷목표×70), [0,70] clamp, 목표 0 가드 */
export function donationActiveTrees(current: number, goal: number): number {
  if (!goal || goal <= 0) return 0;                       // ← 목표 0/음수 가드
  const n = Math.round((current / goal) * TOTAL_CELLS);   // ← 비율형(반올림)
  return Math.max(0, Math.min(TOTAL_CELLS, n));           // ← clamp
}

// CSS 커스텀 프로퍼티(--i/--p)를 style 에 안전히 싣기 위한 캐스팅 헬퍼
const cssVars = (vars: Record<string, number>): CSSProperties => vars as CSSProperties; // ← [추가]

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

  // 직전 렌더의 활성 수 — 등장 stagger 기준(--i = idx − prevActive). 커밋 후 갱신.
  const prevActiveRef = useRef(0);                   // ← [추가]
  const prevActive = prevActiveRef.current;          // ← 이번 렌더 시점의 직전 값 캡처
  useEffect(() => { prevActiveRef.current = active; }, [active]); // ← [추가] 커밋 후 갱신

  // idle 일시정지: 뷰포트 밖 또는 탭 숨김
  const svgRef = useRef<SVGSVGElement | null>(null); // ← [추가] 관찰 대상
  const [paused, setPaused] = useState(false);       // ← [추가] sway 정지 상태
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return; // ← SSR/구형 가드
    const io = new IntersectionObserver(
      ([entry]) => setPaused(!entry.isIntersecting), // ← 화면 밖이면 정지
      { threshold: 0.05 },
    );
    io.observe(el);
    const onVis = () => { if (document.hidden) setPaused(true); }; // ← 탭 숨김도 정지
    document.addEventListener('visibilitychange', onVis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); }; // ← 정리
  }, []);

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
        // 활성 셀은 <g> 로 렌더 → 새로 활성화된 셀만 신규 마운트되어 등장 1회 발화.
        // 등장 클래스는 모든 활성 나무에 상시 부여(클래스 토글 없음 → 리렌더 안전).
        // --i = idx − prevActive : 최초 배치 0..N, 이후 단건 식수는 0(즉시).
        cells.push(
          <g
            key={idx}
            className="esg-tg__tree esg-tg__tree--enter"        // ← [추가] 등장 클래스 상시
            style={cssVars({ '--i': idx - prevActive })}        // ← [추가] 배치 상대 stagger
          >
            <g className="esg-tg__sway" style={cssVars({ '--p': row + col })}> {/* ← [추가] idle sway */}
              <circle cx={cx} cy={cy} r={R} fill={CANOPY} />
              <rect x={x + 32} y={y + 52} width={7} height={31} fill={TRUNK} />
            </g>
          </g>,
        );
      } else {
        cells.push(<circle key={idx} cx={cx} cy={cy} r={R} fill={INACTIVE} />);
      }
    }
  }

  return (
    <svg
      ref={svgRef}                                        // ← [추가] 뷰포트 관찰
      className={`esg-tg${paused ? ' is-paused' : ''}`}   // ← [추가] 정지 토글
      viewBox="0 0 720 503"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel ?? `모금 목표 대비 ${active} / ${TOTAL_CELLS} 그루 달성`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <style>{GRID_CSS}</style>
      {cells}
    </svg>
  );
}

export default DonationTreeGrid;
