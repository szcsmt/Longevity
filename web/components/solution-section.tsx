'use client';

import { useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const stats = [
  { value: '330',       label: 'days of sunshine per year' },
  { value: '29°C',      label: 'average temperature all year' },
  { value: '5 min',     label: 'walk to the shore' },
  { value: '15 min',    label: 'from villa to the airport' },
];

const lifestyle = [
  { label: 'Crystal clear coastline', sub: 'Gulf of Thailand, northeast shore' },
  { label: 'Ancient jungle canopy',   sub: 'Native rainforest surrounding the estate' },
  { label: 'Warmth all year',         sub: '29°C average, minimal rain season' },
  { label: 'Absolute silence',        sub: 'No traffic, no concrete, no noise' },
];

export function SolutionSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 110);
        obs.disconnect();
      }, { threshold: 0.10 });
      obs.observe(el);
    });
  }, []);

  return (
    <section ref={ref} style={{ background: 'transparent', position: 'relative', overflow: 'hidden' }}>

      {/* ── Full-bleed image reveal ── */}
      <div className="lr-koh-hero" style={{ position: 'relative', height: 'clamp(420px,68vh,720px)', overflow: 'hidden' }}>
        <img
          src="/images/another-way.webp"
          alt="Koh Samui"
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 55%',
            filter: 'brightness(0.46) saturate(0.78)',
          }}
        />
        {/* Edge fade */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, var(--bg) 0%, transparent 20%, transparent 58%, rgba(6,14,8,0.82) 86%, var(--bg) 100%)',
          pointerEvents: 'none',
        }} />
        {/* Calming wash + centre vignette so the headline keeps focus */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(120% 90% at 50% 42%, rgba(6,14,8,0.32) 0%, rgba(6,14,8,0.55) 100%)',
        }} />
        <div className="reveal" style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center', width: '90%', zIndex: 2,
        }}>
          <span style={{
            display: 'block',
            fontFamily: ffs, fontSize: 'clamp(13px,1.6vw,18px)', fontWeight: 400,
            letterSpacing: '0.28em', textTransform: 'uppercase',
            color: 'var(--gold)', opacity: 1,
            textShadow: '0 1px 16px rgba(6,14,8,0.9), 0 0 30px rgba(201,169,110,0.35)',
            marginBottom: 'clamp(16px,2.5vw,28px)',
          }}>Where we built it</span>
          <h2 style={{
            fontFamily: ff, fontWeight: 400,
            fontSize: 'clamp(60px,10vw,140px)',
            letterSpacing: '0.04em',
            color: 'var(--w90)', lineHeight: 1,
            margin: '0 0 20px',
            textShadow: '0 2px 40px rgba(6,14,8,0.60), 0 0 60px rgba(201,169,110,0.18)',
          }}>Koh Samui.</h2>
          <p style={{
            fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
            fontSize: 'clamp(15px,1.6vw,21px)',
            color: 'rgba(255,252,248,0.78)',
            lineHeight: 1.7, letterSpacing: '0.01em',
            maxWidth: 500, margin: '0 auto',
            textShadow: '0 1px 16px rgba(6,14,8,0.85)',
          }}>
            An island in the Gulf of Thailand where the sun shines 330 days a year,
            the jungle meets the sea, and the air still heals.
          </p>
        </div>
      </div>

      {/* ── Stats + prose ── */}
      <div className="lr-koh-body" style={{
        padding: 'clamp(60px,7vw,96px) clamp(24px,8vw,120px) clamp(80px,10vw,140px)',
        position: 'relative', zIndex: 2,
      }}>

        {/* Stats grid — 4 cells */}
        <div className="reveal lr-cols-4 lr-koh-stats" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
          gap: 'clamp(10px,1.2vw,18px)',
          maxWidth: 900, margin: '0 auto clamp(72px,9vw,112px)',
        }}>
          {stats.map(({ value, label }, i) => (
            <div key={i} className="glass-card" style={{
              padding: 'clamp(18px,2.2vw,28px) clamp(10px,1.3vw,18px)',
              textAlign: 'center',
            }}>
              <span className="gold-text" style={{
                display: 'block',
                fontFamily: ff, fontWeight: 400,
                fontSize: 'clamp(19px,2vw,30px)',
                letterSpacing: '-0.01em',
                marginBottom: 'clamp(6px,0.8vw,10px)',
                filter: 'drop-shadow(0 0 14px var(--gold-glow))',
              }}>{value}</span>
              <span style={{
                fontFamily: ffs, fontSize: 'clamp(8.5px,0.8vw,10px)', fontWeight: 300,
                letterSpacing: '0.13em', textTransform: 'uppercase', lineHeight: 1.45,
                color: 'var(--cr70)',
              }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Two-column prose */}
        <div className="reveal lr-cols-2" style={{
          maxWidth: 900, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 'clamp(40px,6vw,80px)',
          alignItems: 'center',
        }}>
          <div>
            <span style={{ display: 'block', width: 36, height: 1, background: 'var(--gold-40)', marginBottom: 28 }} />
            <p style={{
              fontFamily: ff, fontWeight: 400,
              fontSize: 'clamp(15px,1.6vw,20px)',
              lineHeight: 1.9, letterSpacing: '0.01em',
              color: 'var(--cr70)', margin: 0,
            }}>
              Koh Samui sits in the Gulf of Thailand. 330 days of sun, ancient jungle,
              crystal clear water. The northeast coast is one of the last untouched
              stretches on the island. That is precisely where Longevity Resort is.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {lifestyle.map(({ label, sub }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <span style={{
                  display: 'block', width: 1, height: 34,
                  background: 'linear-gradient(to bottom, var(--gold-65), transparent)',
                  flexShrink: 0, marginTop: 3,
                }} />
                <div>
                  <span style={{
                    display: 'block', fontFamily: ff, fontWeight: 400,
                    fontSize: 'clamp(13px,1.3vw,16px)', color: 'var(--cream)', marginBottom: 2,
                  }}>{label}</span>
                  <span style={{
                    display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
                    letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cr40)',
                  }}>{sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
