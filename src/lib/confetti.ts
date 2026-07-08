// ============================================================================
// confetti — 의존성 없는 경량 컨페티 (canvas). [2026-07-08]
//   burstConfetti(): 화면 전체에 컨페티 1회 발사 후 자동 정리.
//   외부 라이브러리(canvas-confetti) 불필요 → 설치/빌드 리스크 0.
// ============================================================================

const COLORS = ['#0f7b3f', '#46ff68', '#a6ff6d', '#0cff39', '#ffd700', '#ffffff'];

export function burstConfetti(durationMs = 1600): void {
  if (typeof document === 'undefined') return;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return; // 접근성: 모션 최소화 설정 존중

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1100;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  resize();

  type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; shape: number };
  const parts: P[] = [];
  const cx = innerWidth / 2;
  // 좌하단·우하단·중앙 상단에서 뿜기
  const spawn = (n: number, ox: number, oy: number, spread: number, up: number) => {
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * spread - Math.PI / 2 + up;
      const sp = 6 + Math.random() * 9;
      parts.push({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        size: 5 + Math.random() * 6, color: COLORS[(Math.random() * COLORS.length) | 0],
        shape: (Math.random() * 2) | 0,
      });
    }
  };
  spawn(90, cx, innerHeight * 0.42, 1.4, 0);
  spawn(50, 0, innerHeight, 0.9, 0.5);
  spawn(50, innerWidth, innerHeight, 0.9, -0.5);

  const start = performance.now();
  const gravity = 0.22, drag = 0.992;
  let raf = 0;
  const tick = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += gravity; p.vx *= drag; p.vy *= drag;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const alpha = Math.max(0, 1 - Math.max(0, t - durationMs * 0.6) / (durationMs * 0.4));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (t < durationMs) raf = requestAnimationFrame(tick);
    else { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.remove(); }
  };
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(tick);
}
