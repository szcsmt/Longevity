'use client';

import { useEffect, useRef } from 'react';
// Placeholder icons — swap Shield/Gem/Sofa for your uploaded SVGs later.
import { Shield, Gem, Sofa, Waves, HeartPulse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

  // `num` shows the value, `icon` shows an icon (swap for custom SVGs).
  const highlights: { value: string | null; icon: LucideIcon | null; label: string; desc: string }[] = [
    { value: '10%', icon: null,   label: 'Fixed annual return', desc: 'Guaranteed, paid yearly on your investment.' },
    { value: null,  icon: Shield, label: 'Buyback guarantee',   desc: 'Full repurchase option after 3 years, at your discretion.' },
    { value: null,  icon: Gem,    label: 'Premium Quality',     desc: 'Thermo-glazed, soundproofed, climate-engineered — a standard you can feel.' },
  ];
  const facts: { icon: LucideIcon; v: string; l: string }[] = [
    { icon: Waves,      v: '5–7 min',        l: 'To the nearest beach' },
    { icon: HeartPulse, v: 'Included',       l: 'Wellness membership' },
    { icon: Sofa,       v: 'Fully furnished', l: 'Move-in ready' },
  ];

  return (
    <section ref={ref} className="lr-split" style={{
      background: 'transparent',
      display: 'grid',
      gridTemplateColumns: '52fr 48fr',
      minHeight: '100vh',
      overflow: 'hidden',
      marginTop: 'clamp(48px,7vw,110px)',
      borderTop: '1px solid rgba(201,169,110,0.08)',
    }}>

      {/* ── LEFT: Investment content ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: 'clamp(48px,6vw,88px) clamp(24px,5vw,72px) clamp(48px,6vw,88px) clamp(24px,8vw,120px)',
        position: 'relative',
        borderRight: '1px solid rgba(201,169,110,0.06)',
      }}>

        {/* Label */}
        <span className="reveal" style={{
          display: 'block', fontFamily: ffs, fontSize: 'clamp(10px,1vw,12px)', fontWeight: 400,
          letterSpacing: '0.26em', textTransform: 'uppercase',
          color: 'var(--gold)', opacity: 0.75, marginBottom: 'clamp(16px,2vw,24px)',
        }}>Private Ownership · The Estate</span>

        {/* Headline */}
        <h2 className="reveal" style={{
          fontFamily: ff, fontWeight: 400, fontSize: 'clamp(28px,3.4vw,50px)',
          lineHeight: 1.1, letterSpacing: '-0.01em', color: 'var(--cream)',
          margin: '0 0 clamp(24px,3vw,40px)', maxWidth: '12em',
        }}>
          A home that <em className="gold-text" style={{ fontStyle: 'italic' }}>pays you back.</em>
        </h2>

        {/* Interactive highlights — hover to light them up */}
        <style>{`
          .po-item { transition: background 0.4s, transform 0.4s cubic-bezier(0.16,1,0.3,1); border-radius: 12px; }
          .po-item:hover { background: linear-gradient(90deg, rgba(201,169,110,0.07), transparent 75%); transform: translateX(6px); }
          .po-item:hover .po-key  { filter: drop-shadow(0 0 26px rgba(201,169,110,0.6)) !important; }
          .po-item:hover .po-desc { color: var(--cr70); }
          .po-item:hover .po-icon { border-color: var(--gold); background: rgba(201,169,110,0.12); transform: scale(1.06); }
        `}</style>
        <div className="reveal" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {highlights.map((h) => {
            const Icon = h.icon;
            return (
              <div key={h.label} className="po-item" style={{
                display: 'grid', gridTemplateColumns: 'clamp(88px,10vw,132px) 1fr',
                gap: 'clamp(16px,2.2vw,32px)', alignItems: 'center',
                padding: 'clamp(13px,1.6vw,20px) clamp(8px,1.2vw,16px)',
                borderTop: '1px solid rgba(201,169,110,0.12)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  {h.value ? (
                    <span className="po-key gold-text" style={{
                      fontFamily: ff, fontWeight: 400, fontSize: 'clamp(42px,5vw,78px)',
                      lineHeight: 0.85, letterSpacing: '-0.03em',
                      filter: 'drop-shadow(0 0 26px var(--gold-glow))', transition: 'filter 0.4s',
                    }}>{h.value}</span>
                  ) : Icon ? (
                    <span className="po-icon" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 'clamp(54px,5.4vw,74px)', height: 'clamp(54px,5.4vw,74px)', borderRadius: '50%',
                      border: '1px solid rgba(201,169,110,0.4)', color: 'var(--gold)',
                      transition: 'border-color 0.4s, background 0.4s, transform 0.4s',
                    }}>
                      <Icon size={30} strokeWidth={1.3} />
                    </span>
                  ) : null}
                </div>
                <div>
                  <span style={{ display: 'block', fontFamily: ffs, fontSize: 'clamp(13px,1.25vw,16px)', fontWeight: 500, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--cream)', marginBottom: 7 }}>{h.label}</span>
                  <span className="po-desc" style={{ display: 'block', fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(14px,1.3vw,17px)', lineHeight: 1.55, color: 'var(--cr70)', transition: 'color 0.4s' }}>{h.desc}</span>
                </div>
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid rgba(201,169,110,0.12)' }} />
        </div>

        {/* Facts */}
        <div className="reveal" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'clamp(18px,2.6vw,34px)', marginTop: 'clamp(22px,2.8vw,36px)' }}>
          {facts.map(({ icon: Icon, v, l }) => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: '1px solid rgba(201,169,110,0.32)', color: 'var(--gold)' }}>
                <Icon size={20} strokeWidth={1.5} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(17px,1.7vw,22px)', color: 'var(--gold)', lineHeight: 1.05 }}>{v}</span>
                <span style={{ fontFamily: ffs, fontSize: 'clamp(11px,1.05vw,13px)', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cr70)' }}>{l}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a href="#reserve" className="reveal"
          onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.55)'; }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 'clamp(26px,3.2vw,40px)', alignSelf: 'flex-start',
            fontFamily: ffs, fontSize: 'clamp(10px,1vw,12px)', fontWeight: 400, letterSpacing: '0.24em', textTransform: 'uppercase',
            color: 'var(--gold)', textDecoration: 'none', background: 'transparent',
            border: '1px solid rgba(201,169,110,0.55)', borderRadius: 100, padding: '16px 30px',
            boxShadow: '0 0 30px -8px var(--gold-glow)',
            transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
          }}>Enquire about ownership →</a>

      </div>

      {/* ── RIGHT: Villa image (hover to enlarge) ── */}
      <style>{`
        .pays-stage .pays-img { transition: transform 0.7s cubic-bezier(0.16,1,0.3,1), filter 0.5s; }
        .pays-stage:hover .pays-img { transform: scale(1.07); filter: brightness(1.02) saturate(1.1); }
        .pays-frame { transition: border-color 0.5s, box-shadow 0.5s; }
        .pays-stage:hover .pays-frame { border-color: rgba(201,169,110,0.7); box-shadow: 0 0 50px -4px rgba(201,169,110,0.4); }
      `}</style>
      <div className="elev-img pays-stage" style={{ position: 'relative', overflow: 'hidden', minHeight: 'clamp(420px,58vh,860px)', cursor: 'pointer' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="pays-img"
          src="/images/pays-you-back.webp"
          alt="Longevity Resort villa — poolside dining"
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            filter: 'brightness(0.94) saturate(1.05)',
            transformOrigin: 'center center',
          }}
        />
        {/* Subtle inset frame — turns gold on hover */}
        <div aria-hidden="true" className="pays-frame" style={{
          position: 'absolute', inset: 'clamp(16px,2vw,30px)', zIndex: 4, pointerEvents: 'none',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 0 24px rgba(0,0,0,0.25)',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to right, rgba(6,14,8,0.34) 0%, transparent 24%, transparent 100%)',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(6,14,8,0.36) 0%, transparent 26%, transparent 100%)',
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
