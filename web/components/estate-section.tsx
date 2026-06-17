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
interface Cell { src: string; l: string; t: string; w: string; h: string; dx: number; dy: number; }

const OUTER: Cell[] = [
  { src:'/images/villa-I.jpg',    l:'0%',    t:'0%',    w:'20%',   h:'21%',  dx:-1, dy:-1 }, // TL
  { src:'/images/xy.webp',        l:'20.2%', t:'0%',    w:'59.6%', h:'21%',  dx: 0, dy:-1 }, // TC
  { src:'/images/villa-II.jpg',   l:'80%',   t:'0%',    w:'20%',   h:'21%',  dx: 1, dy:-1 }, // TR
  { src:'/images/proof-2.jpg',    l:'0%',    t:'21.2%', w:'20%',   h:'57.6%',dx:-1, dy: 0 }, // ML
  { src:'/images/proof-3.jpg',    l:'80%',   t:'21.2%', w:'20%',   h:'57.6%',dx: 1, dy: 0 }, // MR
  { src:'/images/villa-III.jpg',  l:'0%',    t:'79%',   w:'20%',   h:'21%',  dx:-1, dy: 1 }, // BL
  { src:'/images/features-bg.jpg',l:'20.2%', t:'79%',   w:'59.6%', h:'21%',  dx: 0, dy: 1 }, // BC
  { src:'/images/proof-4.jpg',    l:'80%',   t:'79%',   w:'20%',   h:'21%',  dx: 1, dy: 1 }, // BR
];

const CENTER = '/images/sanaila.jpg';

export function EstateSection() {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const centerRef  = useRef<HTMLDivElement>(null);
  const outerRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const textRef    = useRef<HTMLDivElement>(null);
  const labelRef   = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // On phones/tablets the 8 outer images are hidden (CSS) and only the
    // full-bleed centre image gently zooms — one composited layer, so it stays
    // perfectly smooth instead of compositing 9 large layers per frame.
    const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

    let ticking = false;
    let active  = true;
    let secTop  = 0;   // section's document-relative top (cached)
    let maxScroll = 0; // cached — never read layout on the scroll path

    // Measure layout ONCE per change (mount / resize / re-entry), never per frame.
    function measure() {
      const rect = el!.getBoundingClientRect();
      secTop = rect.top + window.scrollY;
      maxScroll = el!.offsetHeight - window.innerHeight;
    }

    // Per frame: only reads window.scrollY (cheap) + GPU-composited writes.
    function update() {
      ticking = false;
      if (maxScroll <= 0) return;
      const raw = Math.min(1, Math.max(0, (window.scrollY - secTop) / maxScroll));

      // Smoothstep — feels natural, not mechanical
      const p = raw * raw * (3 - 2 * raw);

      if (centerRef.current) {
        centerRef.current.style.transform = `scale(${1 + p * (isMobile ? 0.28 : 0.84)})`;
      }
      if (!isMobile) {
        const outerOp = Math.max(0, 1 - p * 1.65).toFixed(3);
        outerRefs.current.forEach((div, i) => {
          if (!div) return;
          const { dx, dy } = OUTER[i];
          div.style.transform = `translate3d(${dx * p * 34}vw, ${dy * p * 34}vh, 0)`;
          div.style.opacity   = outerOp;
        });
      }
      if (textRef.current) {
        textRef.current.style.opacity = Math.max(0, (p - 0.70) * 3.33).toFixed(3);
      }
      if (labelRef.current) {
        labelRef.current.style.opacity = Math.max(0, 1 - p * 4).toFixed(3);
      }
    }

    function tick() { if (active && !ticking) { ticking = true; requestAnimationFrame(update); } }
    function onResize() { measure(); tick(); }

    // Only animate while the section is near the viewport.
    const io = new IntersectionObserver(([e]) => {
      active = e.isIntersecting;
      if (active) { measure(); tick(); }
    }, { rootMargin: '200px 0px' });
    io.observe(el);

    measure();
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    update(); // sync on mount

    return () => {
      window.removeEventListener('scroll', tick);
      window.removeEventListener('resize', onResize);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={scrollRef} className="lr-tall-350" style={{ position: 'relative', height: '350vh' }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        overflow: 'hidden',
        background: 'transparent',
      }}>

        {/* ── Outer images (hidden on phones — see CSS — for a light, smooth zoom) ── */}
        {OUTER.map((cell, i) => (
          <div
            key={i}
            className="lr-estate-outer"
            ref={el => { outerRefs.current[i] = el; }}
            style={{
              position: 'absolute',
              left: cell.l, top: cell.t,
              width: cell.w, height: cell.h,
              overflow: 'hidden',
              willChange: 'transform, opacity',
            }}
          >
            <img
              src={cell.src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', display: 'block',
                filter: 'brightness(0.68) saturate(0.88)',
              }}
            />
          </div>
        ))}

        {/* ── Center image (zooms to fill; goes full-bleed on phones) ── */}
        <div
          ref={centerRef}
          className="lr-estate-center"
          style={{
            position: 'absolute',
            left: '20.2%', top: '21.2%',
            width: '59.6%', height: '57.6%',
            overflow: 'hidden',
            transformOrigin: 'center center',
            willChange: 'transform',
            zIndex: 2,
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
          }}>Koh Samui &nbsp;·&nbsp; Private Estate &nbsp;·&nbsp; 8 rai</p>
        </div>

      </div>
    </div>
  );
}
