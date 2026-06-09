// ============================================================================
// useHeaderHidden — 스크롤 방향 감지 헤더(headroom) 훅
//   2026-06-09  신규
//
// 동작:
//   - 아래로 스크롤 → hidden=true  (헤더 숨김)
//   - 위로 스크롤   → hidden=false (헤더 표시)
//   - 페이지 최상단 근처(topOffset 이내) → 항상 표시
//   - disabled=true(예: 모바일 메뉴 열림) → 항상 표시
//
// 성능: requestAnimationFrame 쓰로틀 + passive 리스너로 스크롤 jank 방지.
// 스크롤 컨테이너는 window (AppLayout 외곽 div는 overflowX:clip 이라 스크롤 컨테이너 아님).
//
// 사용:
//   const hidden = useHeaderHidden({ disabled: mobileOpen });
//   <header style={{ transform: hidden ? 'translateY(-100%)' : 'none', transition: 'transform .28s ease' }} />
// ============================================================================

import { useEffect, useRef, useState } from 'react';

interface UseHeaderHiddenOptions {
  /** 이 픽셀 이상 움직여야 방향에 반응(미세 흔들림 무시). 기본 8 */
  threshold?: number;
  /** 이 스크롤 위치(px)보다 위(상단 근처)에선 항상 표시. 기본 80 */
  topOffset?: number;
  /** true면 항상 표시(예: 모바일 메뉴/드롭다운 열림). 기본 false */
  disabled?: boolean;
}

export function useHeaderHidden({
  threshold = 8,
  topOffset = 80,
  disabled = false,
}: UseHeaderHiddenOptions = {}): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);        // 마지막으로 "확정"한 스크롤 위치(미세 흔들림 누적 방지)
  const ticking = useRef(false);  // rAF 중복 예약 방지

  useEffect(() => {
    lastY.current = window.scrollY; // 스크롤 복원 등으로 중간 위치에서 로드된 경우 대비

    const update = () => {
      ticking.current = false;
      const y = window.scrollY;
      const delta = y - lastY.current;

      // 1) 상단 근처: 무조건 표시
      if (y <= topOffset) {
        setHidden(false);
        lastY.current = y;
        return;
      }
      // 2) 미세 스크롤: 무시(lastY 유지 → 누적되어 threshold 넘으면 반응)
      if (Math.abs(delta) < threshold) return;
      // 3) 아래로(delta>0) → 숨김 / 위로 → 표시
      setHidden(delta > 0);
      lastY.current = y;
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, topOffset]);

  // disabled(메뉴 열림 등)면 내부 상태와 무관하게 항상 표시
  return disabled ? false : hidden;
}
