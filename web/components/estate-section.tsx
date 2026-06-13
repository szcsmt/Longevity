'use client';

import { useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* ─── Layout grid ───────────────────────────────────────────────────────
   3×3 grid around a center image.
   All positions/sizes are % of the sticky container (100vw × 100vh).
   2px gap between cells (0.2% ≈ 2px at 1000px wide).

   [ TL  ][ TC────────── ][ TR  ]
   [ ML  ][ CENTER       ][ MR  ]
   [ BL  ][ BC────────── ][ BR  ]
──────────────────────────────── */
const CENTER = '/images/sanaila.jpg';

export function EstateSection() {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const centerRef  = useRef<HTMLDivElement>(null);
  const textRef    = useRef<HTMLDivElement>(null);
  const labelRef   = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let ticking = false;

    // rAF-throttled: runs the layout read + style writes at most once per
    // frame, regardless of how many scroll events fire. Keeps the zoom smooth.
    function update() {
      ticking = false;
      const el = scrollRef.current;
      if (!el) return;
      const rect     = el.getBoundingClientRect();
      const scrolled = -rect.top;
      const maxScroll = el.offsetHeight - window.innerHeight;
      if (maxScroll <= 0) return;

      const raw = Math.min(1, Math.max(0, scrolled / maxScroll));

      // Smoothstep — feels natural, not mechanical
      const p = raw * raw * (3 - 2 * raw);

      // Center image: scale 1 → ~1.84 (fills the viewport)
      if (centerRef.current) {
        centerRef.current.style.transform = `scale(${1 + p * 0.84})`;
      }

      // Text overlay: fades in after p > 0.70
      if (textRef.current) {
        textRef.current.style.opacity = Math.max(0, (p - 0.70) * 3.33).toFixed(3);
      }

      // Label: fades out quickly
      if (labelRef.current) {
        labelRef.current.style.opacity = Math.max(0, 1 - p * 4).toFixed(3);
      }
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    update(); // sync on mount
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={scrollRef} className="lr-tall-350" style={{ position: 'relative', height: '350vh' }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        overflow: 'hidden',
        background: 'transparent',
      }}>

        {/* ── Center image (zooms to fill) ── */}
        <div
          ref={centerRef}
          style={{
            position: 'absolute',
            left: '16%', top: '17%',
            width: '68%', height: '66%',
            overflow: 'hidden',
            borderRadius: 'clamp(10px,1.2vw,18px)',
            transformOrigin: 'center center',
            willChange: 'transform',
            zIndex: 2,
            boxShadow: '0 50px 120px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(201,169,110,0.18)',
          }}
        >
          <img
            src={CENTER}
            alt="The Estate"
            loading="lazy"
            decoding="async"
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
              filter: 'brightness(0.80) saturate(1.05)',
            }}
          />
        </div>

        {/* ── Atmospheric vignette over the filling image ── */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 70% at 50% 48%, transparent 40%, rgba(6,14,8,0.55) 100%)',
        }} />

        {/* ── Section label (top-left, fades on scroll) ── */}
        <span
          ref={labelRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 'clamp(20px,3vw,36px)',
            left: 'clamp(20px,3vw,40px)',
            fontFamily: ffs, fontSize: 9, fontWeight: 300,
            letterSpacing: '0.30em', textTransform: 'uppercase',
            color: 'var(--gold)', opacity: 0.45,
            zIndex: 10, willChange: 'opacity',
            pointerEvents: 'none',
          }}
        >The Estate</span>

        {/* ── Text overlay (reveals as center fills screen) ── */}
        <div
          ref={textRef}
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            opacity: 0, willChange: 'opacity',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <span style={{
            display: 'block',
            fontFamily: ffs, fontSize: 9, fontWeight: 300,
            letterSpacing: '0.32em', textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: 'clamp(14px,2vw,24px)',
          }}>The Estate</span>

          <h2 style={{
            fontFamily: ff, fontWeight: 400,
            fontSize: 'clamp(38px,5.8vw,80px)',
            lineHeight: 1.12, letterSpacing: '0.01em',
            color: 'var(--w90)', margin: '0 0 20px',
            textShadow: '0 2px 48px rgba(6,14,8,0.90), 0 0 70px rgba(201,169,110,0.20)',
          }}>
            Where the jungle<br />meets the sea.
          </h2>

          <p style={{
            fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
            fontSize: 'clamp(13px,1.3vw,17px)',
            color: 'rgba(255,252,248,0.42)',
            letterSpacing: '0.01em',
            textShadow: '0 1px 16px rgba(6,14,8,0.8)',
          }}>Koh Samui &nbsp;·&nbsp; Private Estate &nbsp;·&nbsp; 12 hectares</p>
        </div>

      </div>
    </div>
  );
}
