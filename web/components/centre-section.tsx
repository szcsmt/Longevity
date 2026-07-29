'use client';

import { useEffect, useRef, useState } from 'react';
import { openEnquiry } from '@/components/enquiry-modal';
import { useT, richText } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* The Longevity Centre — the development's flagship amenity as its own section.
   Left: the reception render with an overlapping 800 m² stat card. Right: the
   services as a numbered index — one open at a time, advancing on its own until
   the visitor takes over (click). Descriptions open with the grid-template-rows
   0fr→1fr technique (no height animation, no layout thrash). */
const SERVICES = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;
const ADVANCE_MS = 4600;

export function CentreSection() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false); // user clicked — stop auto-advance

  // Reveal-on-scroll, same pattern as the other sections.
  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 120);
        obs.disconnect();
      }, { threshold: 0.08 });
      obs.observe(el);
    });
  }, []);

  // Gentle auto-advance while the section is on screen and untouched.
  useEffect(() => {
    if (engaged) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !timer) {
        timer = setInterval(() => setActive((a) => (a + 1) % SERVICES.length), ADVANCE_MS);
      } else if (!e.isIntersecting && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearInterval(timer); };
  }, [engaged]);

  return (
    <section id="centre" ref={ref} style={{
      background: 'transparent', position: 'relative', overflow: 'hidden', isolation: 'isolate',
      padding: 'clamp(90px,11vw,150px) clamp(24px,8vw,120px)',
    }}>
      <style>{`
        .ctr-grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: clamp(32px,5vw,84px); align-items: center; }
        @media (max-width: 960px) { .ctr-grid { grid-template-columns: 1fr; gap: 40px; } }

        .ctr-img-wrap { position: relative; }
        .ctr-img {
          position: relative; width: 100%; aspect-ratio: 4 / 3; overflow: hidden;
          border-radius: clamp(14px,1.6vw,22px); border: 1px solid rgba(201,169,110,0.20);
          box-shadow: 0 40px 90px -30px rgba(0,0,0,0.85), 0 0 60px -18px var(--gold-glow);
        }
        .ctr-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
          transform: scale(1.03); transition: transform 1.4s cubic-bezier(0.16,1,0.3,1); }
        .ctr-img-wrap:hover .ctr-img img { transform: scale(1.075); }

        .ctr-stat {
          position: absolute; left: clamp(-14px,-1.5vw,-22px); bottom: clamp(-18px,-2vw,-26px);
          padding: clamp(16px,1.8vw,24px) clamp(20px,2.2vw,30px);
          border-radius: clamp(12px,1.3vw,18px);
          background: linear-gradient(160deg, rgba(13,28,16,0.92), rgba(6,14,8,0.88));
          border: 1px solid rgba(201,169,110,0.32);
          box-shadow: 0 30px 60px -22px rgba(0,0,0,0.9), 0 0 40px -10px var(--gold-glow);
          -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
        }
        @media (max-width: 960px) { .ctr-stat { left: 12px; bottom: -18px; } }

        .ctr-row { border-bottom: 1px solid rgba(201,169,110,0.14); }
        .ctr-row:first-child { border-top: 1px solid rgba(201,169,110,0.14); }
        .ctr-row button {
          display: grid; grid-template-columns: 34px 1fr auto; align-items: baseline; gap: 14px;
          width: 100%; padding: clamp(13px,1.5vw,17px) 2px; cursor: pointer;
          background: none; border: none; text-align: left;
        }
        .ctr-num { font-family: ${ffs}; font-size: 10px; font-weight: 300; letter-spacing: 0.14em;
          color: var(--cr40); transition: color 0.4s; }
        .ctr-title { font-family: ${ff}; font-weight: 400; font-size: clamp(16px,1.7vw,21px);
          letter-spacing: -0.01em; color: var(--cr70); transition: color 0.4s; line-height: 1.2; }
        .ctr-plus { font-family: ${ffs}; font-size: 14px; font-weight: 300; color: var(--cr40);
          transition: transform 0.45s cubic-bezier(0.16,1,0.3,1), color 0.4s; transform-origin: center; }
        .ctr-row.on .ctr-num { color: var(--gold); }
        .ctr-row.on .ctr-title { color: var(--cream); }
        .ctr-row.on .ctr-plus { transform: rotate(45deg); color: var(--gold); }
        .ctr-row:hover .ctr-title { color: var(--cream); }

        /* Description opens via grid-template-rows — smooth, no layout-thrash height animation */
        .ctr-desc { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.55s cubic-bezier(0.16,1,0.3,1), opacity 0.45s ease; opacity: 0; }
        .ctr-row.on .ctr-desc { grid-template-rows: 1fr; opacity: 1; }
        .ctr-desc > div { overflow: hidden; }
        .ctr-desc p { margin: 0; padding: 0 2px clamp(14px,1.6vw,18px) 48px;
          font-family: ${ff}; font-size: clamp(13px,1.25vw,15.5px); line-height: 1.75; color: var(--cr70); max-width: 52ch; }
      `}</style>

      {/* Ambient glow */}
      <div className="section-glow" aria-hidden="true" style={{ top: '8%', left: '-8%', width: 'min(620px,60vw)', height: 'min(620px,60vw)' }} />

      {/* Eyebrow + headline */}
      <span className="reveal" style={{
        display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em',
        textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(14px,1.8vw,20px)',
      }}>{t('ctr.eyebrow')}</span>
      <h2 className="reveal" style={{
        fontFamily: ff, fontWeight: 400, fontSize: 'clamp(34px,5vw,68px)', lineHeight: 1.04,
        letterSpacing: '-0.015em', color: 'var(--cream)', margin: '0 0 clamp(40px,5vw,68px)', maxWidth: '18ch',
      }}>
        {richText(t('ctr.headline'), { fontStyle: 'normal' })}
      </h2>

      <div className="ctr-grid">
        {/* ── Image + overlapping stat ── */}
        <div className="reveal ctr-img-wrap">
          <div className="ctr-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/centre/reception-01.webp" alt={t('ctr.caption')} loading="lazy" decoding="async" />
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,14,8,0.5) 0%, transparent 38%)' }} />
            {/* Caption chip */}
            <span style={{
              position: 'absolute', top: 14, right: 14,
              fontFamily: ffs, fontSize: 8.5, fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'var(--cream)', padding: '7px 13px', borderRadius: 100,
              background: 'rgba(6,14,8,0.6)', border: '1px solid rgba(201,169,110,0.25)',
              WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
            }}>{t('ctr.caption')}</span>
          </div>
          <div className="ctr-stat">
            <span className="gold-text" style={{
              display: 'block', fontFamily: ff, fontWeight: 400, fontSize: 'clamp(38px,4.6vw,64px)',
              lineHeight: 0.95, letterSpacing: '-0.02em',
            }}>800 m²</span>
            <span style={{
              display: 'block', marginTop: 7, fontFamily: ffs, fontSize: 'clamp(9px,0.9vw,11px)', fontWeight: 400,
              letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, maxWidth: 220,
            }}>{t('ctr.statLabel')}</span>
          </div>
        </div>

        {/* ── Copy + services index ── */}
        <div>
          <p className="reveal" style={{
            fontFamily: ff, fontSize: 'clamp(14px,1.4vw,17.5px)', lineHeight: 1.8,
            color: 'var(--cr70)', margin: '0 0 clamp(26px,3vw,38px)', maxWidth: '46ch',
          }}>{t('ctr.body')}</p>

          <span className="reveal" style={{
            display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.28em',
            textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(12px,1.4vw,16px)',
          }}>{t('ctr.servicesLabel')}</span>

          <div className="reveal" role="list">
            {SERVICES.map((s, i) => {
              const on = active === i;
              return (
                <div key={s} role="listitem" className={`ctr-row${on ? ' on' : ''}`}>
                  <button
                    type="button"
                    aria-expanded={on}
                    onClick={() => { setEngaged(true); setActive(i); }}
                  >
                    <span className="ctr-num">0{i + 1}</span>
                    <span className="ctr-title">{t(`ctr.${s}.t`)}</span>
                    <span className="ctr-plus" aria-hidden="true">+</span>
                  </button>
                  <div className="ctr-desc" aria-hidden={!on}>
                    <div><p>{t(`ctr.${s}.d`)}</p></div>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" className="reveal" onClick={() => openEnquiry('centre')}
            onMouseEnter={(e) => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
            onMouseLeave={(e) => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.55)'; }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 11, cursor: 'pointer',
              marginTop: 'clamp(26px,3vw,36px)',
              fontFamily: ffs, fontSize: 10, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase',
              color: 'var(--gold)', background: 'transparent', border: '1px solid rgba(201,169,110,0.55)',
              borderRadius: 100, padding: '15px 30px',
              transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
            }}>
            {t('ctr.cta')}
            <svg width="16" height="10" viewBox="0 0 18 10" fill="none" aria-hidden="true">
              <path d="M1 5h16M11 1l6 4-6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
