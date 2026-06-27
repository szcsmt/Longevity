'use client';

import { useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* The Estate — a single full-bleed jungle image. As you scroll it zooms in
   (you step closer) and the headline fades up. No collage, no clutter. */
const IMAGE = '/images/sanaila.jpg';

export function EstateSection() {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const imgRef      = useRef<HTMLDivElement>(null);
  const textRef     = useRef<HTMLDivElement>(null);
  const labelRef    = useRef<HTMLSpanElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let ticking = false;
    let active  = true;
    let secTop  = 0;     // section's document-relative top (cached)
    let maxScroll = 0;   // cached — never read layout on the scroll path

    function measure() {
      const rect = el!.getBoundingClientRect();
      secTop = rect.top + window.scrollY;
      maxScroll = el!.offsetHeight - window.innerHeight;
    }

    function update() {
      ticking = false;
      if (maxScroll <= 0) return;
      const raw = Math.min(1, Math.max(0, (window.scrollY - secTop) / maxScroll));
      // easeOut — responds immediately as you scroll (no slow lingering start).
      const p = raw * (2 - raw);

      if (imgRef.current) {
        // Strong "step into the jungle" push: zoom deep (to 2.0×) so it feels like
        // you walk into the scene. translateZ(0) keeps it on its own GPU layer.
        imgRef.current.style.transform = `translateZ(0) scale(${1 + p * 1.0})`;
      }
      if (vignetteRef.current) {
        // Edges darken as you go deeper → the jungle closes in around you.
        vignetteRef.current.style.opacity = (0.4 + p * 0.6).toFixed(3);
      }
      if (textRef.current) {
        textRef.current.style.opacity = Math.max(0, (p - 0.5) * 2.6).toFixed(3);
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
    <div ref={scrollRef} id="discover" className="lr-tall-350" style={{ position: 'relative', height: '350vh' }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        overflow: 'hidden',
        background: 'transparent',
      }}>

        {/* ── Full-bleed jungle image (zooms in on scroll) ── */}
        <div
          ref={imgRef}
          style={{
            position: 'absolute', inset: 0,
            overflow: 'hidden',
            transformOrigin: 'center center',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            zIndex: 1,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={IMAGE}
            alt="The Estate"
            loading="eager"
            decoding="async"
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
              transform: 'translateZ(0)',
              filter: 'brightness(0.80) saturate(1.05)',
            }}
          />
        </div>

        {/* ── Atmospheric vignette — darkens as you push deeper (jungle closes in) ── */}
        <div ref={vignetteRef} aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          opacity: 0.4, willChange: 'opacity',
          background: 'radial-gradient(ellipse 78% 66% at 50% 46%, transparent 26%, rgba(6,14,8,0.92) 100%)',
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

        {/* ── Text overlay (reveals as you zoom in) ── */}
        <div
          ref={textRef}
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            opacity: 0, willChange: 'opacity',
            pointerEvents: 'none',
            textAlign: 'center',
            padding: '0 clamp(24px,6vw,40px)',
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
