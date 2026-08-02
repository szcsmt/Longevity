'use client';

/* Interactive kinetic dot field. A grid of soft gold dots rests at home
   positions; the cursor repels nearby dots, which then spring back and settle.
   Canvas + rAF, DPR-aware, resize-aware, and static under reduced-motion. */

import { useEffect, useRef } from 'react';

interface Dot { hx: number; hy: number; x: number; y: number; vx: number; vy: number; r: number; a: number }

export function KineticField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const host = canvas.parentElement;
    if (!ctx || !host) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mouse = { x: -9999, y: -9999 };
    let W = 0, H = 0, raf = 0;
    let dots: Dot[] = [];

    // Arrow functions (defined after the guard) so the non-null narrowing of
    // `canvas`/`ctx`/`host` flows into them — unlike hoisted `function` decls.
    const build = () => {
      const rect = host.getBoundingClientRect();
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gap = 44;
      dots = [];
      for (let y = gap / 2; y < H; y += gap) {
        for (let x = gap / 2; x < W; x += gap) {
          const hx = x + (Math.random() - 0.5) * 12;
          const hy = y + (Math.random() - 0.5) * 12;
          dots.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, r: 0.9 + Math.random() * 1.4, a: 0.14 + Math.random() * 0.18 });
        }
      }
    };

    const paint = (animate: boolean) => {
      ctx.clearRect(0, 0, W, H);
      const R = 140, R2 = R * R;
      for (const d of dots) {
        if (animate) {
          const dx = d.x - mouse.x, dy = d.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 0.01) {
            const dist = Math.sqrt(d2);
            const f = (R - dist) / R;
            const push = f * f * 4.4;
            d.vx += (dx / dist) * push;
            d.vy += (dy / dist) * push;
          }
          d.vx += (d.hx - d.x) * 0.02;
          d.vy += (d.hy - d.y) * 0.02;
          d.vx *= 0.87; d.vy *= 0.87;
          d.x += d.vx; d.y += d.vy;
        }
        const speed = Math.min(1, Math.hypot(d.vx, d.vy) / 5);
        const g = (v: number) => Math.min(255, Math.round(v + speed * 45));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r + speed * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${g(201)},${g(169)},${g(110)},${Math.min(0.9, d.a + speed * 0.5)})`;
        ctx.fill();
      }
    };

    const loop = () => { paint(true); raf = requestAnimationFrame(loop); };

    build();
    if (reduce) paint(false);
    else raf = requestAnimationFrame(loop);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    const onResize = () => build();

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} className="kinetic-canvas" aria-hidden />;
}
