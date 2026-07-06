// ============================================================================
// StickyPanel — "sticky-until-bottom"(양방향 고정) 패널
//
// [목적]
//   좌측 콘텐츠(예: 긴 이미지)가 아래로 스크롤되는 동안, 우측 패널이 화면에 고정돼
//   있다가, 패널 끝(바닥)에 도달하면 스크롤과 함께 자연스럽게 내려가는 거동.
//   순수 CSS position:sticky 는 '패널이 뷰포트보다 길 때' 바닥이 잘려 부자연스럽다.
//   → 스크롤 방향에 따라 top-고정 ↔ bottom-고정을 전환해(뷰포트보다 긴 패널까지) 완전 대응.
//
// [알고리즘 — 근본]
//   문서 좌표(document)에서 패널 상단 위치(innerTopDoc)를 아래 창에 clamp:
//     topTarget    = scrollY + offsetTop                    (top 고정 목표)
//     bottomTarget = scrollY + viewportH - offsetBottom - H (bottom 고정 목표, 패널 길면 top보다 위)
//   · 패널이 뷰포트에 들어오면(짧으면): 항상 top 고정.
//   · 길면: 직전 innerTopDoc 를 [bottomTarget, topTarget] 로 clamp →
//           내리는 중엔 바닥 고정, 올리는 중엔 상단 고정, 중간은 자유 스크롤.
//   결과 translateY 는 [0, outerH - innerH] 로 clamp(컨테이너 밖으로 못 나감).
//
// [성능/정합]
//   · scroll/resize 는 requestAnimationFrame 로 1프레임 1회만 계산.
//   · ResizeObserver 로 패널/컨테이너 높이 변화(입찰내역 로드 등) 즉시 재계산.
//   · 모바일(<1024px)은 단일 컬럼이므로 고정 비활성(transform 제거).
// ============================================================================

import { useEffect, useRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';

interface StickyPanelProps {
  children: ReactNode;
  /** 상단 고정 여백(px). 기본 24 */
  offsetTop?: number;
  /** 하단 고정 여백(px). 기본 24 */
  offsetBottom?: number;
  /** 이 폭 미만이면 고정 비활성(모바일). 기본 1024 */
  disableBelow?: number;
  className?: string;
  style?: CSSProperties;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export function StickyPanel({
  children,
  offsetTop = 24,
  offsetBottom = 24,
  disableBelow = 1024,
  className,
  style,
}: StickyPanelProps) {
  const outerRef = useRef<HTMLDivElement>(null); // 그리드 셀(컨테이너 높이 = 좌측 높이만큼 stretch)
  const innerRef = useRef<HTMLDivElement>(null); // 실제 이동(translateY)하는 패널

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let translate = 0;
    let ticking = false;

    const disabled = () => window.matchMedia(`(max-width: ${disableBelow - 1}px)`).matches;

    const compute = () => {
      ticking = false;

      // 모바일: 고정 비활성(자연 흐름)
      if (disabled()) {
        if (translate !== 0) { translate = 0; inner.style.transform = ''; }
        return;
      }

      const vh = window.innerHeight;
      const innerH = inner.offsetHeight;
      const outerH = outer.offsetHeight;
      const maxTranslate = outerH - innerH;

      // 패널이 컨테이너와 같거나 더 크면 이동 여지 없음
      if (maxTranslate <= 0) {
        if (translate !== 0) { translate = 0; inner.style.transform = ''; }
        return;
      }

      const scrollY = window.scrollY;
      const outerTopDoc = outer.getBoundingClientRect().top + scrollY; // 컨테이너의 문서상 top(스크롤 무관 고정)
      const topTarget = scrollY + offsetTop;

      let target: number;
      if (innerH <= vh - offsetTop) {
        // 뷰포트에 들어옴 → 항상 top 고정
        target = topTarget;
      } else {
        // 뷰포트보다 김 → 방향에 따라 top/bottom 고정(중간 자유 스크롤)
        const bottomTarget = scrollY + vh - offsetBottom - innerH; // topTarget 보다 작음(위)
        const prevInnerTopDoc = outerTopDoc + translate;           // 직전 문서상 패널 top
        target = clamp(prevInnerTopDoc, bottomTarget, topTarget);
      }

      const next = clamp(target - outerTopDoc, 0, maxTranslate);
      if (next !== translate) {
        translate = next;
        inner.style.transform = next ? `translateY(${next}px)` : '';
      }
    };

    const onScrollOrResize = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(compute);
      }
    };

    compute();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    // 콘텐츠/컨테이너 높이 변화(입찰내역 로드, 이미지 로드 등) 재계산
    const ro = new ResizeObserver(onScrollOrResize);
    ro.observe(inner);
    ro.observe(outer);

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      ro.disconnect();
    };
  }, [offsetTop, offsetBottom, disableBelow]);

  return (
    <div ref={outerRef} className={className} style={style}>
      <div ref={innerRef} style={{ willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
}
