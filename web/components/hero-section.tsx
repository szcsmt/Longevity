'use client';

import { useEffect, useRef, useState } from 'react';

const FRAME_COUNT = 73;
const POSTER = '/hero/poster.webp';
const framePath = (i: number) => `/hero/f-${String(i + 1).padStart(3, '0')}.webp`;

export function HeroSection() {
  const scrollEl  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [titleVisible, setTitleVisible] = useState(false);
  const [ctaVisible,   setCtaVisible]   = useState(false);
  const [cueHidden,    setCueHidden]    = useState(false);

  useEffect(() => {
    const canvas  = canvasRef.current;
    const scroller = scrollEl.current;
    if (!canvas || !scroller) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'low';

    const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    const reduce   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const frames: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null);
    let poster: HTMLImageElement | null = null;
    let drawn = -1;            // index of frame currently painted
    let targetFrame = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let maxScroll = 0;         // cached in resize() — avoids layout reads on scroll

    // cover-fit a source image onto the full canvas
    function paint(img: HTMLImageElement) {
      const cw = canvas!.width, ch = canvas!.height;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      if (!iw || !ih) return;
      const s = Math.max(cw / iw, ch / ih);
      const w = iw * s, h = ih * s;
      ctx!.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    }

    function nearest(idx: number): HTMLImageElement | null {
      if (frames[idx]) return frames[idx];
      for (let d = 1; d < FRAME_COUNT; d++) {
        if (idx - d >= 0 && frames[idx - d]) return frames[idx - d];
        if (idx + d < FRAME_COUNT && frames[idx + d]) return frames[idx + d];
      }
      return poster;
    }

    function render(frame: number, force = false) {
      const idx = Math.max(0, Math.min(FRAME_COUNT - 1, frame));
      if (idx === drawn && !force) return;
      const img = nearest(idx);
      if (img) { paint(img); drawn = frames[idx] ? idx : -1; }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width  = Math.round(canvas!.clientWidth  * dpr);
      canvas!.height = Math.round(canvas!.clientHeight * dpr);
      ctx!.imageSmoothingQuality = 'low';
      maxScroll = scroller!.offsetHeight - window.innerHeight;
      render(targetFrame, true);
    }

    // ── Poster first → instant paint ──
    const p = new Image();
    p.decoding = 'async';
    p.onload = () => { poster = p; if (drawn === -1) render(targetFrame, true); };
    p.src = POSTER;

    resize();

    // ── Mobile / reduced-motion: static poster, no scrub, no sequence load ──
    if (isMobile || reduce) {
      setTitleVisible(true);
      setCtaVisible(true);
      window.addEventListener('resize', resize, { passive: true });
      return () => window.removeEventListener('resize', resize);
    }

    // ── Desktop: concurrency-limited progressive frame load ──
    let next = 0;
    const CONCURRENCY = 8;
    function loadOne() {
      if (next >= FRAME_COUNT) return;
      const i = next++;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        // Pre-decode off the scroll path so scrubbing never decodes on the main thread.
        const store = () => {
          frames[i] = img;
          if (Math.abs(i - targetFrame) <= 1 || drawn === -1) render(targetFrame, true);
          loadOne();
        };
        if (img.decode) img.decode().then(store).catch(store);
        else store();
      };
      img.onerror = loadOne;
      img.src = framePath(i);
    }
    for (let k = 0; k < CONCURRENCY; k++) loadOne();

    // ── rAF-throttled scroll → frame index + overlay states ──
    let ticking = false;
    function update() {
      ticking = false;
      const prog = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      targetFrame = Math.round(prog * (FRAME_COUNT - 1));
      render(targetFrame);
      if (window.scrollY > 30) setCueHidden(true);
      if (prog >= 0.12) setTitleVisible(true);
      if (prog >= 0.25) setCtaVisible(true);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div ref={scrollEl} className="hero-scroll" style={{ position: 'relative' }}>
      <div className="hero-sticky" style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', willChange: 'transform' }}>

        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, background: 'var(--bg)' }}
        />

        <div aria-hidden="true" style={{
          position:'absolute', inset:0, zIndex:1,
          background:'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.58) 100%)'
        }} />
        <div aria-hidden="true" style={{
          position:'absolute', inset:0, zIndex:2, pointerEvents:'none',
          background:'radial-gradient(ellipse 90% 80% at 50% 46%, transparent 24%, rgba(0,0,0,0.44) 100%)'
        }} />

        {/* Soft gold glow behind the title */}
        <div aria-hidden="true" style={{
          position:'absolute', bottom:'58%', left:'50%',
          width:'min(680px,82vw)', height:'min(420px,48vh)',
          transform:'translate(-50%,40%)',
          zIndex:3, pointerEvents:'none',
          background:'radial-gradient(ellipse at center, rgba(201,169,110,0.16) 0%, transparent 68%)',
          filter:'blur(36px)',
          opacity: titleVisible ? 1 : 0,
          transition:'opacity 2.6s cubic-bezier(0.06,1,0.18,1)',
        }} />

        {/* Title */}
        <div
          aria-label="Longevity Resort"
          style={{
            position:'absolute', bottom:'62%', left:'50%',
            transform:'translateX(-50%)',
            zIndex:10, textAlign:'center', whiteSpace:'nowrap',
            perspective:'1100px', perspectiveOrigin:'50% 100%'
          }}
        >
          <div style={{ overflow:'hidden', paddingBottom:6, marginBottom:-4, lineHeight:1 }}>
            <span style={{
              display:'block',
              fontFamily:'var(--font-playfair), serif',
              fontWeight:400,
              fontSize:'clamp(40px, 7.8vw, 116px)',
              letterSpacing:'0.08em',
              textTransform:'uppercase',
              color:'var(--w90)',
              opacity: titleVisible ? 1 : 0,
              transform: titleVisible ? 'rotateX(0deg) translateY(0)' : 'rotateX(56deg) translateY(90px)',
              transition: titleVisible ? 'opacity 2.8s cubic-bezier(0.06,1,0.18,1), transform 2.8s cubic-bezier(0.06,1,0.18,1)' : 'none',
            }}>Longevity</span>
          </div>

          <span aria-hidden="true" style={{
            display:'block', height:1,
            background:'linear-gradient(90deg, transparent, var(--gold), transparent)',
            margin:'12px auto',
            width: titleVisible ? 'min(180px,36vw)' : 0,
            opacity: titleVisible ? 1 : 0,
            transition: titleVisible ? 'width 1.1s cubic-bezier(0.22,1,0.36,1) 1.3s, opacity 1.1s ease 1.3s' : 'none',
          }} />

          <div style={{ overflow:'hidden', paddingBottom:6, marginBottom:-4, lineHeight:1 }}>
            <span style={{
              display:'block',
              fontFamily:'var(--font-playfair), serif',
              fontWeight:400,
              fontSize:'clamp(24px, 4.4vw, 64px)',
              letterSpacing:'0.32em',
              textTransform:'uppercase',
              color:'var(--w90)',
              opacity: titleVisible ? 1 : 0,
              transform: titleVisible ? 'rotateX(0deg) translateY(0)' : 'rotateX(56deg) translateY(90px)',
              transition: titleVisible ? 'opacity 2.8s cubic-bezier(0.06,1,0.18,1) 0.28s, transform 2.8s cubic-bezier(0.06,1,0.18,1) 0.28s' : 'none',
            }}>Resort</span>
          </div>
        </div>

        {/* CTA */}
        <div style={{
          position:'absolute', bottom:52, left:'50%',
          transform:'translateX(-50%)',
          zIndex:10,
          opacity: ctaVisible ? 1 : 0,
          transition:'opacity 1.2s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <a href="#villas" style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center', gap:14,
            padding:'18px 52px', borderRadius:100,
            border:'1px solid rgba(201,169,110,0.6)',
            background:'rgba(6,14,8,0.42)',
            backdropFilter:'blur(8px)',
            textDecoration:'none', cursor:'pointer', whiteSpace:'nowrap',
            color:'var(--w90)',
            boxShadow:'0 0 30px -6px var(--gold-glow)',
            transition:'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
          }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.borderColor = 'var(--gold)'; b.style.color = 'var(--bg)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(6,14,8,0.22)'; b.style.borderColor = 'rgba(201,169,110,0.6)'; b.style.color = 'var(--w90)'; }}
          >
            <span style={{
              fontFamily:'var(--font-raleway), sans-serif',
              fontSize:10, fontWeight:300,
              letterSpacing:'0.20em', textTransform:'uppercase',
              color:'inherit',
            }}>Step Inside</span>
            <span aria-hidden="true" style={{ display:'flex', alignItems:'center' }}>
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M1 5h16M11 1l6 4-6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </a>
        </div>

        {/* Scroll cue */}
        <div aria-hidden="true" style={{
          position:'absolute', bottom:'clamp(26px,4vh,44px)', left:'50%',
          transform:'translateX(-50%)',
          zIndex:10,
          display:'flex', flexDirection:'column', alignItems:'center', gap:14,
          pointerEvents:'none',
          opacity: cueHidden ? 0 : 1,
          animation: cueHidden ? 'none' : 'fadeIn 1.6s ease 0.9s both',
          transition:'opacity 0.6s ease',
        }}>
          <span style={{
            fontFamily:'var(--font-raleway), sans-serif',
            fontSize:'clamp(9px,1vw,11px)', fontWeight:300,
            letterSpacing:'0.34em', textTransform:'uppercase',
            color:'var(--w90)', opacity:0.9,
            textShadow:'0 1px 14px rgba(6,14,8,0.85)',
          }}>Scroll to explore</span>

          {/* Glowing mouse with an animated dot */}
          <div style={{
            width:28, height:46, borderRadius:16,
            border:'1.5px solid rgba(201,169,110,0.9)',
            position:'relative',
            boxShadow:'0 0 26px -4px rgba(201,169,110,0.6)',
          }}>
            <span style={{
              position:'absolute', top:9, left:'50%',
              width:4, height:9, borderRadius:3,
              background:'var(--gold)',
              transform:'translateX(-50%)',
              boxShadow:'0 0 10px rgba(201,169,110,0.9)',
              animation:'scrollDot 1.8s cubic-bezier(0.5,0,0.2,1) infinite',
            }} />
          </div>

          {/* Bouncing chevron */}
          <svg width="22" height="10" viewBox="0 0 22 10" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation:'scrollBounce 1.8s ease-in-out infinite', marginTop:-4 }}>
            <path d="M2 2l9 6 9-6" />
          </svg>
        </div>

      </div>
    </div>
  );
}
