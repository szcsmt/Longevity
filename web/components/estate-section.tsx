'use client';

import { useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* The Estate — a single full-bleed jungle image. As you scroll it zooms in
   (you step closer) and the headline fades up. No collage, no clutter. */
const IMAGE   = '/images/sanaila.jpg';
const IMAGE_M = '/images/sanaila-m.webp';   // 1440px — far lighter texture to scale on phones

export function EstateSection() {
  const t = useT();
  const scrollRef   = useRef<HTMLDivElement>(null);
  const imgRef      = useRef<HTMLDivElement>(null);
  const textRef     = useRef<HTMLDivElement>(null);
  const labelRef    = useRef<HTMLSpanElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let rafId = 0;
    let looping = false;
    let lastY = -1;
    let idle = 0;
    let active  = true;
    let secTop  = 0;       // section's document-relative top (cached)
    let maxScroll = 0;     // cached — never read layout on the scroll path
    let zoomFactor = 0.85; // how far the image pushes in (cached per width)

    function measure() {
      const rect = el!.getBoundingClientRect();
      secTop = rect.top + window.scrollY;
      maxScroll = el!.offsetHeight - window.innerHeight;
      // On a wide laptop a 2× zoom crops so hard the frame is all leaves. Keep the
      // push gentle on big screens, stronger on phones where the crop reads fine.
      const w = window.innerWidth;
      zoomFactor = w >= 1024 ? 0.4 : w >= 700 ? 0.6 : 0.85;
    }

    function update() {
      if (maxScroll <= 0) return;
      const raw = Math.min(1, Math.max(0, (window.scrollY - secTop) / maxScroll));
      // easeOut — responds immediately as you scroll (no slow lingering start).
      const p = raw * (2 - raw);

      if (imgRef.current) {
        // "Step into the jungle" push, but scaled to the screen so wide laptops
        // don't over-crop. translateZ(0) keeps it on its own GPU layer.
        imgRef.current.style.transform = `translateZ(0) scale(${1 + p * zoomFactor})`;
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

    // Continuous rAF loop while the section is active and the page is moving.
    // Sampling scrollY every frame keeps the zoom locked to the compositor's scroll
    // position — on phones (esp. iOS momentum scroll) the `scroll` event arrives late
    // and batched, so an event-driven update visibly trails the finger. The loop
    // self-stops after a few idle frames so it never spins when nothing moves.
    function loop() {
      const y = window.scrollY;
      if (y === lastY) idle++; else { idle = 0; lastY = y; }
      update();
      if (active && idle < 10) { rafId = requestAnimationFrame(loop); }
      else looping = false;
    }
    function kick() {
      if (!looping && active) { looping = true; idle = 0; lastY = -1; rafId = requestAnimationFrame(loop); }
    }
    function onResize() { measure(); kick(); }

    // Promote the animated layers to the GPU only while the section is in play.
    // Keeping `will-change` on a full-screen image permanently holds a big layer in
    // GPU memory and adds page-wide compositing pressure on phones.
    function setLayers(on: boolean) {
      if (imgRef.current)      imgRef.current.style.willChange      = on ? 'transform' : 'auto';
      if (vignetteRef.current) vignetteRef.current.style.willChange = on ? 'opacity'   : 'auto';
      if (textRef.current)     textRef.current.style.willChange     = on ? 'opacity'   : 'auto';
      if (labelRef.current)    labelRef.current.style.willChange    = on ? 'opacity'   : 'auto';
    }

    // Only animate while the section is near the viewport.
    const io = new IntersectionObserver(([e]) => {
      active = e.isIntersecting;
      setLayers(active);
      if (active) { measure(); kick(); }
    }, { rootMargin: '200px 0px' });
    io.observe(el);

    measure();
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    update(); // sync on mount

    return () => {
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', onResize);
      io.disconnect();
      cancelAnimationFrame(rafId);
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
          {/* No CSS filter here: a brightness/saturate filter on a layer that scales
              every scroll frame forces the mobile GPU to re-run the shader over the
              full-screen image. The darkening is a static scrim below instead.
              srcSet hands phones the lighter 1440px texture (reliable everywhere —
              unlike <picture display:contents>, which misrenders on older iOS).
              eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={IMAGE}
            srcSet={`${IMAGE_M} 1440w, ${IMAGE} 1920w`}
            sizes="100vw"
            alt="The Estate"
            loading="eager"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        {/* Static darkening scrim (replaces the old brightness filter — a flat layer
            costs nothing per frame, unlike a filter on the scaling image). */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          background: 'rgba(6,14,8,0.20)',
        }} />

        {/* ── Atmospheric vignette — darkens as you push deeper (jungle closes in) ── */}
        <div ref={vignetteRef} aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
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
        >{t('estate.label')}</span>

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
          }}>{t('estate.label')}</span>

          <h2 style={{
            fontFamily: ff, fontWeight: 400,
            fontSize: 'clamp(38px,5.8vw,80px)',
            lineHeight: 1.12, letterSpacing: '0.01em',
            color: 'var(--w90)', margin: '0 0 20px',
            textShadow: '0 2px 48px rgba(6,14,8,0.90), 0 0 70px rgba(201,169,110,0.20)',
          }}>
            {t('estate.headline')}
          </h2>

          <p style={{
            fontFamily: ff, fontWeight: 400, fontStyle: 'normal',
            fontSize: 'clamp(13px,1.3vw,17px)',
            color: 'rgba(255,252,248,0.42)',
            letterSpacing: '0.01em',
            textShadow: '0 1px 16px rgba(6,14,8,0.8)',
          }}>{t('estate.sub')}</p>
        </div>

      </div>
    </div>
  );
}
