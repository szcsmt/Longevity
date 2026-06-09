'use client';

import { useEffect, useRef, useState } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const slides = [
  { lines: ['Alarm at 6.'],                                                 variant: 'normal' as const },
  { lines: ['7 AM. Traffic.'],                                              variant: 'normal' as const },
  { lines: ['Grey sky.', 'Grey mood.'],                                     variant: 'normal' as const },
  { lines: ['Stress.'],                                                     variant: 'normal' as const },
  { lines: ['Repeat.'],                                                     variant: 'gold'   as const },
];

export function ProblemSection() {
  const introRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pivotRef    = useRef<HTMLDivElement>(null);
  const prevActive  = useRef(0);
  const [active,  setActive]  = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [introIn, setIntroIn] = useState(false);
  const [pivotIn, setPivotIn] = useState(false);

  useEffect(() => {
    const el = introRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setIntroIn(true); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = pivotRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setPivotIn(true); obs.disconnect(); }
    }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let ticking = false;
    function update() {
      ticking = false;
      const el = containerRef.current;
      if (!el) return;
      const rect      = el.getBoundingClientRect();
      const scrolled  = -rect.top;
      const scrollable = el.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const p    = Math.min(1, Math.max(0, scrolled / scrollable));
      const next = Math.min(slides.length - 1, Math.floor(p * slides.length));
      if (next !== prevActive.current) {
        prevActive.current = next;
        setActive(next);
        setAnimKey(k => k + 1);
      }
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const slide = slides[active];

  return (
    <>
      <style>{`
        @keyframes prob-line-in {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .prob-line { animation: prob-line-in 0.85s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes prob-intro-up {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pivot-in {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Intro frame ── */}
      <div
        id="discover"
        ref={introRef}
        style={{
          background: 'transparent',
          padding: 'clamp(120px,14vw,180px) clamp(24px,8vw,120px) clamp(48px,5vw,64px)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Ghost watermark */}
        <span aria-hidden="true" style={{
          position: 'absolute', right: '-2vw', bottom: '-4%',
          fontFamily: ff, fontWeight: 700,
          fontSize: 'clamp(160px,28vw,360px)',
          color: 'rgba(228,217,195,0.022)',
          lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
          letterSpacing: '-0.04em',
        }}>City</span>

        {/* Label */}
        <span style={{
          display: 'block',
          fontFamily: ffs, fontSize: 9, fontWeight: 300,
          letterSpacing: '0.30em', textTransform: 'uppercase',
          color: 'var(--gold)', opacity: introIn ? 0.65 : 0,
          marginBottom: 'clamp(20px,3vw,32px)',
          animation: introIn ? 'prob-intro-up 0.9s cubic-bezier(0.16,1,0.3,1) 0.1s both' : 'none',
        }}>The Problem</span>

        {/* Main heading — explicitly frames what's coming */}
        <h2 style={{
          fontFamily: ff, fontWeight: 400,
          fontSize: 'clamp(38px,5.8vw,84px)',
          lineHeight: 1.12, letterSpacing: '0.01em',
          color: 'var(--cream)',
          margin: '0 0 clamp(22px,3vw,36px)',
          maxWidth: 820,
          opacity: introIn ? 1 : 0,
          animation: introIn ? 'prob-intro-up 1s cubic-bezier(0.16,1,0.3,1) 0.22s both' : 'none',
        }}>
          Does your morning look like this?
        </h2>

      </div>

      {/* ── Cinematic scroll zone ── */}
      <div ref={containerRef} className="lr-tall-problem" style={{ position: 'relative', height: `${slides.length * 100}vh` }}>
        <div style={{
          position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
          background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>

          {/* Glow behind the gold pivot slide */}
          <div aria-hidden="true" style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 'min(720px,80vw)', height: 'min(420px,52vh)',
            transform: 'translate(-50%,-50%)',
            background: 'radial-gradient(ellipse at center, var(--gold-glow) 0%, transparent 70%)',
            filter: 'blur(50px)', pointerEvents: 'none',
            opacity: slide.variant === 'gold' ? 1 : 0,
            transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1)',
          }} />

          {/* Counter */}
          <span style={{
            position: 'absolute', top: 'clamp(24px,4vw,48px)', right: 'clamp(24px,5vw,64px)',
            fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em',
            color: 'rgba(228,217,195,0.18)',
          }}>0{active + 1} / 0{slides.length}</span>

          {/* Context anchor — always visible in slide zone */}
          <span style={{
            position: 'absolute',
            bottom: 'clamp(52px,7vh,72px)',
            left: 'clamp(24px,5vw,64px)',
            fontFamily: ffs, fontSize: 7, fontWeight: 300,
            letterSpacing: '0.24em', textTransform: 'uppercase',
            color: 'rgba(201,169,110,0.30)',
          }}>City life · Every morning</span>

          {/* Slide text */}
          <div
            key={animKey}
            style={{
              textAlign: 'center',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center',
              gap: slide.variant === 'gold' ? 'clamp(4px,0.8vw,10px)' : 'clamp(6px,1.2vw,16px)',
              padding: '0 clamp(24px,8vw,120px)',
              maxWidth: 900,
            }}
          >
            {slide.lines.map((line, i) => (
              <span
                key={i}
                className="prob-line"
                style={{
                  display: 'block',
                  fontFamily: ff, fontWeight: 400,
                  fontStyle: 'normal',
                  fontSize: 'clamp(52px,8vw,108px)',
                  lineHeight: slide.variant === 'gold' ? 1.1 : 1.2,
                  letterSpacing: slide.variant === 'gold' ? '0.03em' : '0.01em',
                  color: slide.variant === 'gold' ? 'var(--gold)' : 'var(--cream)',
                  animationDelay: `${i * 160}ms`,
                }}
              >{line}</span>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'rgba(228,217,195,0.06)' }}>
            <div style={{
              height: '100%',
              width: `${((active + 1) / slides.length) * 100}%`,
              background: 'linear-gradient(to right, transparent, var(--gold-bright))',
              boxShadow: '0 0 12px var(--gold-glow)',
              transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>

          {/* Dots */}
          <div style={{
            position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            {slides.map((_, i) => (
              <span key={i} aria-hidden="true" style={{
                display: 'block',
                width: i === active ? 22 : 5, height: 5, borderRadius: 3,
                background: i === active ? 'var(--gold)' : 'rgba(201,169,110,0.20)',
                transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1), background 0.3s',
              }} />
            ))}
          </div>

        </div>
      </div>

    </>
  );
}
