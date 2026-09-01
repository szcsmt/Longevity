'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';

const FRAME_COUNT = 73;
/* Two cuts of the same scroll-scrub render. The landscape original, and a portrait
   slice of it for phones: cover-fitting a 1916-wide frame onto an upright phone
   shows only its centre ~470px, so the rest is bytes downloaded to be thrown away.
   Same pixels on screen, 39% of the weight. */
const SRC    = { dir: '/hero',   w: 1916, h: 1010 };
const MOBILE = { dir: '/hero-m', w:  700, h: 1010 };
const framePath = (dir: string, i: number) => `${dir}/f-${String(i + 1).padStart(3, '0')}.webp`;

export function HeroSection() {
  const t = useT();
  const scrollEl  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [titleVisible, setTitleVisible] = useState(false);
  const [ctaVisible,   setCtaVisible]   = useState(false);
  const [cueHidden,    setCueHidden]    = useState(false);

  const goTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  useEffect(() => {
    // Start at the top so the title/button/cue reveal *with* the scroll instead of
    // appearing pre-revealed when the browser restores a previous scroll position.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!window.location.hash) window.scrollTo(0, 0);

    const scroller = scrollEl.current;
    if (!scroller) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

    // ── Canvas image-sequence scrub — runs on phones too. Unlike a scrubbed
    //    <video> (which doesn't seek-render reliably on iOS), the canvas animates
    //    on every device. dprCap is kept lower on touch so the scroll stays smooth. ──
    const canvas  = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Pick the frame set from the viewport shape, not the device label: an upright
    // phone needs a narrow slice, so it gets the pre-cropped one. Held sideways it
    // needs the full width, and the landscape set is used instead.
    const vpAR  = window.innerWidth / window.innerHeight;
    const needs = vpAR >= SRC.w / SRC.h ? SRC.w : SRC.h * vpAR;   // source px across the viewport
    const src   = coarse && needs <= MOBILE.w ? MOBILE : SRC;

    const frames: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null);
    let poster: HTMLImageElement | null = null;
    let drawn = -1;            // index of frame currently painted (-1 = canvas needs repaint)
    let targetFrame = 0;
    let maxScroll = 0;         // cached — avoids layout reads on scroll
    let lastW = 0;             // last canvas width we sized to (for the height-only resize guard)
    let looping = false, lastY = -1, idle = 0, rafId = 0;   // continuous-rAF scrub loop
    // The overlay reveals are latched here rather than pushed at React on every
    // frame. Re-setting a state to the value it already holds still costs a trip
    // through the dispatcher 60 times a second, right on the scroll path.
    let cueOff = false, titleOn = false, ctaOn = false;

    // Cover-fit the source onto the canvas bitmap. resize() sizes that bitmap to the
    // very pixels the source actually holds for this viewport, so in the common case
    // this is a 1:1 blit — the cheapest path drawImage has, and what keeps the scrub
    // smooth. Scaling up to the real screen size is left to the compositor, which
    // does it on the GPU for free and no worse than the canvas would.
    function paint(img: HTMLImageElement) {
      const cw = canvas!.width, ch = canvas!.height;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      if (!iw || !ih || !cw || !ch) return;
      const ar = cw / ch;
      let sw = iw, sh = ih;
      if (iw / ih > ar) sw = ih * ar; else sh = iw / ar;
      ctx!.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, cw, ch);
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

    // Map the current scroll position to a frame + reveal the overlays.
    // Defensive: if the canvas isn't measured yet (maxScroll <= 0) we just
    // paint the first frame and wait — we never get stuck on a blank canvas.
    function update() {
      if (maxScroll <= 0) { render(0); return; }
      const prog = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      targetFrame = Math.round(prog * (FRAME_COUNT - 1));
      render(targetFrame);
      if (!cueOff && window.scrollY > 30) { cueOff = true; setCueHidden(true); }
      if (!titleOn && prog >= (coarse ? 0.03 : 0.12)) { titleOn = true; setTitleVisible(true); }
      const cta = prog >= (coarse ? 0.06 : 0.25) && prog < 0.78;      // fades out near the end → FAB takes over
      if (cta !== ctaOn) { ctaOn = cta; setCtaVisible(cta); }
    }

    function resize() {
      const cw = canvas!.clientWidth, ch = canvas!.clientHeight;
      if (!cw || !ch) return;     // not laid out yet — the ResizeObserver will re-fire
      const widthChanged = cw !== lastW;

      // The bitmap is the smaller of what the source holds and what the screen can
      // show. Never more: every extra pixel is paid on every scrub frame, and the
      // source has no further detail to give. It always carries the box's aspect
      // ratio, so CSS only ever scales it — never stretches it, not even when the
      // mobile URL bar changes the height mid-scroll.
      const dpr   = Math.min(window.devicePixelRatio || 1, 2);
      const boxAR = cw / ch;
      const crop  = boxAR >= src.w / src.h ? src.w : src.h * boxAR;
      const bw    = Math.max(2, Math.round(Math.min(crop, cw * dpr)));
      const bh    = Math.max(2, Math.round(bw / boxAR));
      if (canvas!.width !== bw || canvas!.height !== bh) {
        canvas!.width  = bw;
        canvas!.height = bh;
        ctx!.imageSmoothingQuality = bw < crop ? 'medium' : 'low';
        drawn = -1;               // setting canvas.width cleared it — force a repaint
      }

      // Only re-measure the scroll→frame mapping on a real WIDTH change. Recomputing
      // maxScroll on every URL-bar height change is what used to snap the frame.
      if (widthChanged || maxScroll <= 0) {
        lastW = cw;
        maxScroll = scroller!.offsetHeight - window.innerHeight;
      }
      update();                   // re-apply the current scroll position
    }

    // Continuous rAF loop instead of a scroll-event handler: on phones the `scroll`
    // event lags behind iOS momentum scrolling, so the scrubbed frame trailed the
    // finger (the "not smooth on phone" feel). Reading scrollY every frame locks the
    // sequence to the real scroll position. It self-stops a few idle frames after the
    // page stops moving, and never runs once the hero is scrolled away.
    function frame() {
      const y = window.scrollY;
      if (y === lastY) idle++; else { idle = 0; lastY = y; }
      update();
      const nearHero = maxScroll <= 0 || y <= maxScroll + window.innerHeight;
      if (nearHero && idle < 10) rafId = requestAnimationFrame(frame);
      else looping = false;
    }
    function kick() { if (!looping) { looping = true; idle = 0; lastY = -1; rafId = requestAnimationFrame(frame); } }

    // ── Poster first → instant paint ──
    const p = new Image();
    p.decoding = 'async';
    p.onload = () => { poster = p; if (drawn === -1) render(targetFrame, true); };
    p.src = `${src.dir}/poster.webp`;

    resize();   // synchronous first attempt (may be skipped if not laid out yet)

    // ── Robust sizing: a ResizeObserver re-runs resize() the moment the canvas
    //    actually gets its box (fixes the intermittent "blank hero" race) and on
    //    every viewport change — replacing the brittle one-shot measurement. ──
    let detachSizer: () => void;
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
      detachSizer = () => ro.disconnect();
    } else {
      window.addEventListener('resize', resize, { passive: true });
      detachSizer = () => window.removeEventListener('resize', resize);
    }

    // ── Reduced-motion only: static poster, no scrub, no sequence load ──
    if (reduce) {
      titleOn = ctaOn = true;
      /* eslint-disable-next-line react-hooks/set-state-in-effect --
         prefers-reduced-motion is a browser capability, and the server has no
         browser to ask. This is the branch where the whole scroll animation is
         skipped, so the extra render costs one static poster frame — and the
         alternative, threading a media query through render, would mean the
         first paint guessing at an accessibility setting. */
      setTitleVisible(true);
      setCtaVisible(true);
      return () => detachSizer();
    }

    // ── Concurrency-limited progressive frame load ──
    // The full sequence is ~8MB (~3MB for the phone cut). The poster paints instantly, so we hold the
    // frame load until the browser is idle (first paint, fonts and nav done) and
    // run it 4-wide instead of 8 — otherwise it saturates the connection and the
    // whole page feels slow to load. Until a frame arrives, the scrub falls back
    // to the nearest loaded frame / poster, so this is invisible to the user.
    let next = 0;
    const CONCURRENCY = 4;
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
      img.src = framePath(src.dir, i);
    }
    const startLoad = () => { for (let k = 0; k < CONCURRENCY; k++) loadOne(); };
    const hasRIC = typeof window.requestIdleCallback === 'function';
    const idleHandle: number = hasRIC
      ? window.requestIdleCallback(startLoad, { timeout: 1500 })
      : window.setTimeout(startLoad, 400);

    window.addEventListener('scroll', kick, { passive: true });
    update();   // immediate first sync
    kick();     // keep it locked to the scroll while the hero is in view

    return () => {
      window.removeEventListener('scroll', kick);
      cancelAnimationFrame(rafId);
      detachSizer();
      if (hasRIC) window.cancelIdleCallback(idleHandle); else clearTimeout(idleHandle);
    };
  }, []);

  return (
    <div ref={scrollEl} id="hero" className="hero-scroll" style={{ position: 'relative' }}>
      <div className="hero-sticky" style={{ position: 'sticky', top: 0, overflow: 'hidden', willChange: 'transform' }}>

        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="hero-canvas"
        />


        <div aria-hidden="true" style={{
          position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
          background:'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.58) 100%)'
        }} />
        <div aria-hidden="true" style={{
          position:'absolute', inset:0, zIndex:2, pointerEvents:'none',
          background:'radial-gradient(ellipse 90% 80% at 50% 46%, transparent 24%, rgba(0,0,0,0.44) 100%)'
        }} />

        {/* Soft gold glow behind the title */}
        <div aria-hidden="true" style={{
          position:'absolute', bottom:'64%', left:'50%',
          width:'min(560px,72vw)', height:'min(340px,40vh)',
          transform:'translate(-50%,40%)',
          zIndex:3, pointerEvents:'none',
          background:'radial-gradient(ellipse at center, rgba(201,169,110,0.11) 0%, transparent 68%)',
          filter:'blur(36px)',
          // Its own layer: the 36px blur is then rasterised once, instead of being
          // re-blurred every time the canvas underneath it paints a new frame.
          willChange:'opacity',
          opacity: titleVisible ? 1 : 0,
          transition:'opacity 2.6s cubic-bezier(0.06,1,0.18,1)',
        }} />

        {/* Title */}
        <div
          aria-label="Longevity Resort"
          style={{
            position:'absolute', bottom:'68%', left:'50%',
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
              fontSize:'clamp(34px, 6vw, 88px)',
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
              fontSize:'clamp(19px, 3.4vw, 50px)',
              letterSpacing:'0.32em',
              textTransform:'uppercase',
              color:'var(--w90)',
              opacity: titleVisible ? 1 : 0,
              transform: titleVisible ? 'rotateX(0deg) translateY(0)' : 'rotateX(56deg) translateY(90px)',
              transition: titleVisible ? 'opacity 2.8s cubic-bezier(0.06,1,0.18,1) 0.28s, transform 2.8s cubic-bezier(0.06,1,0.18,1) 0.28s' : 'none',
            }}>Resort</span>
          </div>
        </div>

        {/* CTA — Explore + Enter the Estate */}
        <div className="hero-cta" style={{
          position:'absolute', left:'50%',
          transform:'translateX(-50%)',
          zIndex:10,
          display:'flex', alignItems:'center', justifyContent:'center',
          gap:'clamp(10px,1.4vw,16px)', flexWrap:'wrap',
          width:'max-content', maxWidth:'92vw',
          opacity: ctaVisible ? 1 : 0,
          transition:'opacity 1.2s cubic-bezier(0.22,1,0.36,1)',
        }}>
          {/* Explore — secondary → "A home that pays you back" */}
          <a href="#returns" onClick={e => goTo(e, 'returns')} style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center', gap:11,
            padding:'15px clamp(22px,3vw,34px)', borderRadius:100,
            border:'1px solid rgba(228,217,195,0.5)',
            background:'rgba(6,14,8,0.34)',
            textDecoration:'none', cursor:'pointer', whiteSpace:'nowrap',
            color:'var(--w90)',
            transition:'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
          }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--w90)'; b.style.borderColor = 'var(--w90)'; b.style.color = 'var(--bg)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(6,14,8,0.34)'; b.style.borderColor = 'rgba(228,217,195,0.5)'; b.style.color = 'var(--w90)'; }}
          >
            <span style={{ fontFamily:'var(--font-raleway), sans-serif', fontSize:10, fontWeight:300, letterSpacing:'0.20em', textTransform:'uppercase', color:'inherit' }}>{t('hero.explore')}</span>
          </a>

          {/* Enter the Estate — primary, solid gold → The Villas */}
          <a href="#villas" onClick={e => goTo(e, 'villas')} style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center', gap:12,
            padding:'15px clamp(24px,3.4vw,38px)', borderRadius:100,
            border:'1px solid rgba(244,228,194,0.6)',
            background:'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold) 58%, #B8975D 100%)',
            textDecoration:'none', cursor:'pointer', whiteSpace:'nowrap',
            color:'#0A1A0D',
            boxShadow:'0 10px 34px -12px rgba(0,0,0,0.6), 0 0 30px -6px var(--gold-glow)',
            transition:'filter 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1)',
          }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.filter = 'brightness(1.08)'; b.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.filter = 'none'; b.style.transform = 'translateY(0)'; }}
          >
            <span style={{ fontFamily:'var(--font-raleway), sans-serif', fontSize:10, fontWeight:500, letterSpacing:'0.20em', textTransform:'uppercase', color:'inherit' }}>{t('hero.enter')}</span>
            <span aria-hidden="true" style={{ display:'flex', alignItems:'center' }}>
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M1 5h16M11 1l6 4-6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </a>
        </div>

        {/* Scroll cue */}
        <div aria-hidden="true" className="hero-cue" style={{
          position:'absolute', left:'50%',
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
          }}>{t('hero.scroll')}</span>

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
