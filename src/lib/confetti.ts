// ============================================================================
// confetti — 의존성 없는 경량 컨페티 (canvas). [2026-07-08]
//   레퍼런스: 원형+직사각형 조각이 가볍게 터져 흩날리다 떨어지는 효과.
//   색: 브랜드 초록 2종(#8FFF73 · #46FF68). 가볍고(≈100입자) 빠르고(≈1.4s) 부드럽게.
//   외부 라이브러리 불필요 → 설치/빌드 리스크 0.
// ============================================================================

const COLORS = ['#8FFF73', '#46FF68'];

export function burstConfetti(durationMs = 2400): void {
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

  // shape 0 = 직사각형(회전), 1 = 원형 — 섞어서 사용
  type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string; shape: 0 | 1 };
  const parts: P[] = [];
  const N = 100;                              // 가벼운 입자 수
  const ox = innerWidth / 2, oy = innerHeight * 0.46; // 중앙에서 터짐
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;    // 360° 방사
    const speed = 7 + Math.random() * 11;     // 화면 전체로 빠르게 퍼짐
    const up = -3 - Math.random() * 3;        // 살짝 위로 띄운 뒤 낙하 → 자연스러운 아치
    const isRect = Math.random() < 0.5;
    const sz = 5 + Math.random() * 5;
    parts.push({
      x: ox, y: oy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed + up,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      w: isRect ? sz * (0.5 + Math.random() * 0.5) : sz,
      h: isRect ? sz * (1.4 + Math.random()) : sz, // 직사각형은 세로로 길쭉
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: isRect ? 0 : 1,
    });
  }

  const start = performance.now();
  const gravity = 0.16, drag = 0.99;
  let raf = 0;
  const tick = (now: number) => {
    const t = now - start;
    const fade = t < durationMs * 0.62 ? 1 : Math.max(0, 1 - (t - durationMs * 0.62) / (durationMs * 0.38)); // 뒤 45%에서 페이드
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vx *= drag; p.vy = p.vy * drag + gravity;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      else { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (t < durationMs) raf = requestAnimationFrame(tick);
    else { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.remove(); }
  };
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(tick);
}
