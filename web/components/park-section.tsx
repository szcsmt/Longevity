'use client';

import { useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

export function ParkSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 130);
        obs.disconnect();
      }, { threshold: 0.06 });
      obs.observe(el);
    });
  }, []);

  const metrics = [
    { v: '10%',     unit: '',      label: 'Fixed annual return',  sub: 'Guaranteed, paid yearly on your investment.' },
    { v: '3',       unit: 'years', label: 'Buyback guarantee',    sub: 'Full repurchase option, at your discretion.' },
  ];
  const facts = [
    { v: '5 min',    label: 'To the private beach · on foot' },
    { v: 'Included', label: 'Wellness membership with ownership' },
  ];

  return (
    <section ref={ref} className="lr-split" style={{
      background: 'transparent',
      display: 'grid',
      gridTemplateColumns: '52fr 48fr',
      minHeight: '100vh',
      overflow: 'hidden',
    }}>

      {/* ── LEFT: Investment content ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: 'clamp(80px,9vw,130px) clamp(24px,5vw,72px) clamp(80px,9vw,130px) clamp(24px,8vw,120px)',
        position: 'relative',
        borderRight: '1px solid rgba(201,169,110,0.06)',
      }}>

        {/* Label */}
        <span className="reveal" style={{
          display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300,
          letterSpacing: '0.30em', textTransform: 'uppercase',
          color: 'var(--gold)', opacity: 0.6, marginBottom: 'clamp(22px,2.6vw,30px)',
        }}>Private Ownership · The Estate</span>

        {/* Headline */}
        <h2 className="reveal" style={{
          fontFamily: ff, fontWeight: 400, fontSize: 'clamp(30px,3.8vw,56px)',
          lineHeight: 1.1, letterSpacing: '-0.01em', color: 'var(--cream)',
          margin: '0 0 clamp(36px,4.5vw,56px)', maxWidth: '12em',
        }}>
          A home that <em className="gold-text" style={{ fontStyle: 'italic' }}>pays you back.</em>
        </h2>

        {/* Metric rows */}
        <div className="reveal" style={{ display: 'flex', flexDirection: 'column' }}>
          {metrics.map(({ v, unit, label, sub }, i) => (
            <div key={label} style={{
              display: 'grid', gridTemplateColumns: 'clamp(120px,15vw,200px) 1fr',
              gap: 'clamp(18px,2.5vw,40px)', alignItems: 'center',
              padding: 'clamp(22px,2.6vw,32px) 0',
              borderTop: i === 0 ? '1px solid rgba(201,169,110,0.14)' : '1px solid rgba(201,169,110,0.10)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="gold-text" style={{
                  fontFamily: ff, fontWeight: 400, fontSize: 'clamp(52px,7vw,104px)',
                  lineHeight: 0.85, letterSpacing: '-0.03em',
                  filter: 'drop-shadow(0 0 30px var(--gold-glow))',
                }}>{v}</span>
                {unit && <span style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(18px,2vw,30px)', color: 'var(--gold)' }}>{unit}</span>}
              </div>
              <div>
                <span style={{
                  display: 'block', fontFamily: ffs, fontSize: 'clamp(11px,1.1vw,13px)', fontWeight: 400,
                  letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cream)', marginBottom: 8,
                }}>{label}</span>
                <span style={{
                  display: 'block', fontFamily: ff, fontStyle: 'italic',
                  fontSize: 'clamp(13px,1.2vw,15px)', lineHeight: 1.6, color: 'var(--cr40)',
                }}>{sub}</span>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(201,169,110,0.10)' }} />
        </div>

        {/* Facts + CTA */}
        <div className="reveal" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'clamp(20px,3vw,40px)', marginTop: 'clamp(32px,4vw,48px)' }}>
          {facts.map(({ v, label }) => (
            <div key={v} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(17px,1.8vw,24px)', color: 'var(--gold)' }}>{v}</span>
              <span style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cr40)', maxWidth: 160 }}>{label}</span>
            </div>
          ))}
          <a href="#reserve" style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10,
            fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'var(--gold)', textDecoration: 'none', borderBottom: '1px solid rgba(201,169,110,0.4)', paddingBottom: 4,
          }}>Enquire about ownership →</a>
        </div>

      </div>

      {/* ── RIGHT: Villa image ── */}
      <div className="elev-img" style={{ position: 'relative', overflow: 'hidden', minHeight: 'clamp(420px,60vh,100vh)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/ks-villa-05.webp"
          alt="Longevity Resort villa — infinity pool"
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 55%',
            filter: 'brightness(0.78) saturate(1.0)',
          }}
        />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to right, rgba(6,14,8,0.55) 0%, transparent 26%, transparent 100%)',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(6,14,8,0.55) 0%, transparent 28%, transparent 100%)',
        }} />
        {/* Caption chip */}
        <div style={{
          position: 'absolute', left: 'clamp(18px,2vw,28px)', bottom: 'clamp(18px,2vw,28px)',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 16px', borderRadius: 100,
          background: 'rgba(6,14,8,0.6)', border: '1px solid rgba(201,169,110,0.25)', backdropFilter: 'blur(8px)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
          <span style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--cr70)' }}>Villa XL · Private residence</span>
        </div>
      </div>

    </section>
  );
}
