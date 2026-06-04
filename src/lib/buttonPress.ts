// ============================================================================
// buttonPress — 모든 <button>에 '눌림 즉시 반응' 부여 (C&R Space usePressable 동등)
//
// 배경:
//   터치에서 CSS :active 는 브라우저가 '탭 vs 스크롤'을 판단한 뒤 발동되어
//   체감상 한 박자 느리다. pointerdown 은 손이 닿는 즉시 발생하므로
//   가장 빠른 피드백을 준다. (Space에서 채택한 onPointerDown 방식)
//
// 동작:
//   - document 한 곳에 위임 리스너 등록 → 버튼마다 핸들러 불필요(전 버튼 자동).
//   - pointerdown: 가장 가까운 button에 .is-pressed 추가(비활성 제외).
//   - pointerup / pointercancel: 남아있는 .is-pressed 전부 제거(stuck 방지).
//   - 실제 스케일 모션은 index.css 의 `button.is-pressed { transform: scale(0.97) }`.
//
// 주의: 마우스/터치/스타일러스 모두 PointerEvent로 통합 처리.
// ============================================================================

const PRESSED = 'is-pressed';

function clearAll() {
  document.querySelectorAll<HTMLButtonElement>('button.' + PRESSED).forEach((b) => {
    b.classList.remove(PRESSED);
  });
}

/** 앱 진입점에서 1회 호출 (main.tsx) */
export function initButtonPress(): void {
  if (typeof document === 'undefined') return;

  const onDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest('button');
    if (btn && !btn.disabled) btn.classList.add(PRESSED);
  };

  // 떼는 위치가 버튼 밖이어도 안전하게 전부 해제
  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerup', clearAll, { passive: true });
  document.addEventListener('pointercancel', clearAll, { passive: true });
}
