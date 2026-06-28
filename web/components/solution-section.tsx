'use client';

import { useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const stats = [
  { v: 'sol.stat.sun',   l: 'sol.stat.sun.l' },
  { v: 'sol.stat.temp',  l: 'sol.stat.temp.l' },
  { v: 'sol.stat.shore', l: 'sol.stat.shore.l' },
  { v: 'sol.stat.air',   l: 'sol.stat.air.l' },
];

const lifestyle = [
  { l: 'sol.life.coast',   s: 'sol.life.coast.s' },
  { l: 'sol.life.jungle',  s: 'sol.life.jungle.s' },
  { l: 'sol.life.warm',    s: 'sol.life.warm.s' },
  { l: 'sol.life.silence', s: 'sol.life.silence.s' },
];

export function SolutionSection() {
  const t = useT();
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
          }}>{t('sol.builtHere')}</span>
          <h2 style={{
            fontFamily: ff, fontWeight: 400,
            fontSize: 'clamp(60px,10vw,140px)',
            letterSpacing: '0.04em',
            color: 'var(--w90)', lineHeight: 1,
            margin: '0 0 20px',
            textShadow: '0 2px 40px rgba(6,14,8,0.60), 0 0 60px rgba(201,169,110,0.18)',
          }}>{t('sol.kohSamui')}</h2>
          <p style={{
            fontFamily: ff, fontWeight: 400, fontStyle: 'normal',
            fontSize: 'clamp(15px,1.6vw,21px)',
            color: 'rgba(255,252,248,0.78)',
            lineHeight: 1.7, letterSpacing: '0.01em',
            maxWidth: 500, margin: '0 auto',
            textShadow: '0 1px 16px rgba(6,14,8,0.85)',
          }}>
            {t('kohSamuiDesc')}
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
          {stats.map(({ v, l }, i) => (
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
              }}>{t(v)}</span>
              <span style={{
                fontFamily: ffs, fontSize: 'clamp(8.5px,0.8vw,10px)', fontWeight: 300,
                letterSpacing: '0.13em', textTransform: 'uppercase', lineHeight: 1.45,
                color: 'var(--cr70)',
              }}>{t(l)}</span>
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
              {t('sol.prose')}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {lifestyle.map(({ l, s }) => (
              <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <span style={{
                  display: 'block', width: 1, height: 34,
                  background: 'linear-gradient(to bottom, var(--gold-65), transparent)',
                  flexShrink: 0, marginTop: 3,
                }} />
                <div>
                  <span style={{
                    display: 'block', fontFamily: ff, fontWeight: 400,
                    fontSize: 'clamp(13px,1.3vw,16px)', color: 'var(--cream)', marginBottom: 2,
                  }}>{t(l)}</span>
                  <span style={{
                    display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
                    letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cr40)',
                  }}>{t(s)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
