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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';

    const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    const reduce   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const frames: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null);
    let poster: HTMLImageElement | null = null;
    let drawn = -1;            // index of frame currently painted
    let targetFrame = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

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
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width  = Math.round(canvas!.clientWidth  * dpr);
      canvas!.height = Math.round(canvas!.clientHeight * dpr);
      ctx!.imageSmoothingQuality = 'high';
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
        frames[i] = img;
        if (Math.abs(i - targetFrame) <= 1 || drawn === -1) render(targetFrame, true);
        loadOne();
      };
      img.onerror = loadOne;
      img.src = framePath(i);
    }
    for (let k = 0; k < CONCURRENCY; k++) loadOne();

    // ── rAF-throttled scroll → frame index + overlay states ──
    let ticking = false;
    function update() {
      ticking = false;
      const maxScroll = scroller!.offsetHeight - window.innerHeight;
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

        {/* Side editorial box (desktop) */}
        <div className="hero-sidebox" style={{
          position:'absolute', left:'clamp(24px,5vw,72px)', bottom:'clamp(120px,18vh,200px)',
          zIndex:10, maxWidth:280, display:'flex', gap:18,
          opacity: titleVisible ? 1 : 0,
          transform: titleVisible ? 'translateX(0)' : 'translateX(-16px)',
          transition:'opacity 1.6s cubic-bezier(0.22,1,0.36,1) 0.6s, transform 1.6s cubic-bezier(0.22,1,0.36,1) 0.6s',
        }}>
          <span aria-hidden="true" style={{ width:1, alignSelf:'stretch', background:'linear-gradient(to bottom, var(--gold), transparent)', flexShrink:0 }} />
          <div>
            <span style={{
              display:'block', fontFamily:'var(--font-raleway), sans-serif',
              fontSize:8, fontWeight:300, letterSpacing:'0.26em', textTransform:'uppercase',
              color:'var(--gold)', opacity:0.8, marginBottom:12,
            }}>Bophut · Koh Samui</span>
            <p style={{
              margin:0, fontFamily:'var(--font-playfair), serif', fontStyle:'italic',
              fontSize:'clamp(14px,1.2vw,17px)', lineHeight:1.65,
              color:'rgba(255,252,248,0.78)', textShadow:'0 1px 16px rgba(6,14,8,0.8)',
            }}>Where the jungle meets the sea — a private sanctuary built for a longer, better life.</p>
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
          <a href="#discover" style={{
            display:'inline-flex', alignItems:'center', gap:16,
            padding:'18px 56px', borderRadius:100,
            border:'1px solid var(--gold-40)',
            background:'rgba(255,255,255,0.04)',
            backdropFilter:'blur(14px) saturate(1.4)',
            textDecoration:'none', cursor:'pointer', whiteSpace:'nowrap',
          }}>
            <span style={{
              fontFamily:'var(--font-raleway), sans-serif',
              fontSize:10, fontWeight:300,
              letterSpacing:'0.20em', textTransform:'uppercase',
              color:'var(--w90)',
            }}>Step Inside</span>
            <span aria-hidden="true" style={{ display:'flex', alignItems:'center', opacity:0.65 }}>
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M1 5h16M11 1l6 4-6 4" stroke="rgba(255,252,248,0.88)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </a>
        </div>

        {/* Scroll cue */}
        <div aria-hidden="true" style={{
          position:'absolute', bottom:40, left:'50%',
          transform:'translateX(-50%)',
          zIndex:10,
          display:'flex', flexDirection:'column', alignItems:'center', gap:8,
          pointerEvents:'none',
          opacity: cueHidden ? 0 : 1,
          animation: cueHidden ? 'none' : 'fadeIn 1.4s ease 1s forwards',
          transition:'opacity 0.6s ease',
        }}>
          <div style={{
            width:1, height:36,
            background:'linear-gradient(to bottom, var(--gold), transparent)',
            animation:'scPulse 2.6s ease-in-out 1.8s infinite',
          }} />
          <span style={{
            fontFamily:'var(--font-raleway), sans-serif',
            fontSize:8, fontWeight:300,
            letterSpacing:'0.22em', textTransform:'uppercase',
            color:'rgba(201,169,110,0.48)',
          }}>Scroll</span>
        </div>

      </div>
    </div>
  );
}
