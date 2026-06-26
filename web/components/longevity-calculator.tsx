'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* Each factor is something a Longevity home is built to improve. The lower the
   visitor rates their life today, the more an environment built for longevity
   could give back. Illustrative only — framed clearly, never as medical advice. */
const FACTORS = [
  { label: 'Your sleep',         lo: 'Restless',  hi: 'Deep' },
  { label: 'The air you breathe', lo: 'City',     hi: 'Pure' },
  { label: 'Your daily calm',    lo: 'Stressed',  hi: 'Serene' },
  { label: 'Daily movement',     lo: 'Sedentary', hi: 'Active' },
  { label: 'Time in nature',     lo: 'Rare',      hi: 'Every day' },
];

const PER_POINT = 0.28;                       // points → illustrative "healthy years"
const MAX_YEARS = FACTORS.length * 10 * PER_POINT; // all factors at worst
const calc = (vals: number[]) => Math.round(vals.reduce((s, v) => s + (10 - v), 0) * PER_POINT);

export function LongevityCalculator() {
  const sectionRef = useRef<HTMLElement>(null);
  const [vals, setVals] = useState<number[]>([4, 4, 4, 4, 4]);
  const [display, setDisplay] = useState(0);
  const revealed = useRef(false);

  const valsRef = useRef(vals);
  useEffect(() => { valsRef.current = vals; }, [vals]);

  const onSlide = (i: number, v: number) => {
    setVals(prev => {
      const next = prev.slice();
      next[i] = v;
      setDisplay(calc(next));   // instant feedback while dragging
      return next;
    });
  };

  // Count-up the number the first time the section scrolls into view (the "wow").
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || revealed.current) return;
      revealed.current = true;
      const to = calc(valsRef.current), start = performance.now(), dur = 1000;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        setDisplay(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Ring fill
  const R = 92, C = 2 * Math.PI * R;
  const frac = Math.min(1, display / MAX_YEARS);

  const scrollReserve = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('reserve');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section id="longevity" ref={sectionRef} style={{
      background: 'transparent', position: 'relative', isolation: 'isolate', overflow: 'hidden',
      padding: 'clamp(80px,10vw,140px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(201,169,110,0.06)',
    }}>
      <style>{`
        .lc-range { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 4px; outline: none; cursor: pointer; }
        .lc-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: var(--gold); border: 2px solid var(--gold-bright); box-shadow: 0 0 16px -2px var(--gold-glow), 0 4px 10px -3px rgba(0,0,0,0.6); cursor: grab; transition: transform 0.18s; }
        .lc-range::-webkit-slider-thumb:active { transform: scale(1.15); cursor: grabbing; }
        .lc-range::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: var(--gold); border: 2px solid var(--gold-bright); box-shadow: 0 0 16px -2px var(--gold-glow); cursor: grab; }
        .lc-ring-fill { transition: stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1); }
        @media (max-width: 900px) { .lc-grid { grid-template-columns: 1fr !important; } .lc-result { order: -1; } }
      `}</style>

      <div className="section-glow" aria-hidden="true" style={{ top: '6%', left: '-6%', width: 'min(520px,55vw)', height: 'min(520px,55vw)' }} />

      <span style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(20px,2.5vw,30px)' }}>
        Longevity Calculator
      </span>
      <h2 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(32px,5vw,72px)', lineHeight: 1.06, letterSpacing: '-0.015em', color: 'var(--cream)', margin: '0 0 clamp(16px,2vw,22px)', maxWidth: '15em' }}>
        How many healthy years<br /><em className="gold-text" style={{ fontStyle: 'italic' }}>could you reclaim?</em>
      </h2>
      <p style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(14px,1.4vw,18px)', lineHeight: 1.8, color: 'var(--cr40)', margin: '0 0 clamp(44px,5vw,64px)', maxWidth: 560 }}>
        Most homes quietly take from you. Move each slider to reflect your life today, and see what an environment built for longevity could give back.
      </p>

      <div className="lc-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 'clamp(36px,5vw,80px)', alignItems: 'center' }}>

        {/* Sliders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(22px,3vw,32px)' }}>
          {FACTORS.map((f, i) => {
            const pct = vals[i] * 10;
            return (
              <div key={f.label}>
                <span style={{ display: 'block', fontFamily: ff, fontSize: 'clamp(16px,1.7vw,21px)', color: 'var(--cream)', marginBottom: 14 }}>{f.label}</span>
                <input
                  className="lc-range" type="range" min={0} max={10} step={1} value={vals[i]}
                  onChange={e => onSlide(i, Number(e.target.value))}
                  aria-label={f.label}
                  style={{ background: `linear-gradient(90deg, var(--gold) ${pct}%, rgba(201,169,110,0.18) ${pct}%)` }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
                  <span style={{ fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cr40)' }}>{f.lo}</span>
                  <span style={{ fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cr40)' }}>{f.hi}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Result */}
        <div className="lc-result glass-card" style={{ padding: 'clamp(32px,4vw,48px)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 'min(240px,64vw)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 220 220" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(201,169,110,0.14)" strokeWidth="6" />
              <circle className="lc-ring-fill" cx="110" cy="110" r={R} fill="none" stroke="var(--gold)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ filter: 'drop-shadow(0 0 10px var(--gold-glow))' }} />
            </svg>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span className="gold-text" style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(56px,8vw,88px)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                +{Math.round(display)}
              </span>
              <span style={{ fontFamily: ffs, fontSize: 'clamp(9px,1vw,11px)', fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--cr70)', marginTop: 6 }}>
                Healthy years
              </span>
            </div>
          </div>

          <p style={{ fontFamily: ff, fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.7, color: 'var(--cr70)', margin: 'clamp(22px,3vw,30px) 0 clamp(20px,2.5vw,26px)', maxWidth: 320 }}>
            That is what a home tuned to your biology could give back, every single day.
          </p>

          <a href="#reserve" onClick={scrollReserve}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(201,169,110,0.12)'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.6)'; }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 11,
              fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase',
              color: 'var(--gold)', background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.6)',
              borderRadius: 100, padding: '16px 30px', textDecoration: 'none', cursor: 'pointer',
              boxShadow: '0 0 24px -12px var(--gold-glow)',
              transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
            }}>
            Claim your years <ArrowUpRight size={14} />
          </a>

          <p style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.08em', color: 'rgba(228,217,195,0.3)', lineHeight: 1.7, margin: 'clamp(18px,2.2vw,24px) 0 0', maxWidth: 300 }}>
            Illustrative, based on lifestyle and environmental factors associated with a longer, healthier life. Not medical advice.
          </p>
        </div>
      </div>
    </section>
  );
}
