'use client';

import { useState } from 'react';
import { Sofa, Briefcase, Mic, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

interface Config {
  id: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  desc: string;
  features: string[];
  img: string;     // placeholder render — swap for the real config render later
  tint: string;
}

/* The structure never changes — only the interior fit-out. Images are placeholders
   (existing interior renders) until the real per-configuration renders are supplied. */
const configs: Config[] = [
  {
    id: 'living', name: 'Living Lounge', icon: Sofa,
    tagline: 'The heart of the home.',
    desc: 'An open, sunlit lounge that flows to the terrace and pool. The natural default for the villa.',
    features: ['Indoor and outdoor flow', 'Custom lounge seating', 'Circadian lighting'],
    img: '/images/villa/int-living-1.webp', tint: 'rgba(201,169,110,0.30)',
  },
  {
    id: 'office', name: 'Home Office', icon: Briefcase,
    tagline: 'Focus, framed by the jungle.',
    desc: 'A quiet workspace with no glare, a built in desk, soundproofing and fibre. Productivity with a view.',
    features: ['Soundproofed walls', 'Built in desk & storage', 'Fast fibre'],
    img: '/images/villa/int-living-4.webp', tint: 'rgba(150,170,190,0.28)',
  },
  {
    id: 'podcast', name: 'Podcast Studio', icon: Mic,
    tagline: 'Acoustically treated, ready to record.',
    desc: 'A soundproofed room with warm lighting and a layout ready to record in. Press record and create.',
    features: ['Sound isolation', 'Recording ready wiring', 'Warm key lighting'],
    img: '/images/villa/int-bedroom-living.webp', tint: 'rgba(206,138,120,0.30)',
  },
];

export function InteriorSection() {
  const [active, setActive] = useState(0);
  const cur = configs[active];

  return (
    <section id="personalise" style={{
      background: 'transparent', position: 'relative', isolation: 'isolate', overflow: 'hidden',
      padding: 'clamp(44px,5.5vw,80px) clamp(24px,8vw,120px) clamp(110px,13vw,170px)',
      borderTop: '1px solid rgba(201,169,110,0.06)',
    }}>
      <style>{`
        .ds-item { transition: background 0.4s cubic-bezier(0.16,1,0.3,1), border-color 0.4s, transform 0.4s cubic-bezier(0.16,1,0.3,1); }
        .ds-item:hover { transform: translateX(4px); }
      `}</style>

      <div className="section-glow" aria-hidden="true" style={{ top: '2%', right: '-6%', width: 'min(560px,55vw)', height: 'min(560px,55vw)' }} />

      {/* Intro */}
      <span style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(20px,2.5vw,30px)' }}>Make it yours</span>
      <h2 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(38px,5.8vw,84px)', lineHeight: 1.04, letterSpacing: '-0.015em', color: 'var(--cream)', margin: '0 0 clamp(26px,3.5vw,48px)' }}>
        Your villa.<br /><em className="gold-text" style={{ fontStyle: 'italic' }}>Your interior.</em>
      </h2>

      {/* Configurator.
          Desktop = preview (image over details) left, selector right.
          Phone/tablet = heading, image, then "Choose the interior" selector,
          then the description + feature pills below. */}
      <div className="lr-interior" style={{
        display: 'grid',
        gridTemplateColumns: '1.35fr 0.65fr',
        gridTemplateAreas: '"image selector" "details selector"',
        columnGap: 'clamp(28px,4vw,64px)',
        rowGap: 'clamp(22px,2.6vw,32px)',
        alignItems: 'start',
      }}>

        {/* IMAGE preview */}
        <div style={{ gridArea: 'image' }}>
          <div className="elev-img" style={{
            position: 'relative', width: '100%', aspectRatio: '16 / 10', overflow: 'hidden',
            borderRadius: 'clamp(14px,1.6vw,22px)', border: '1px solid rgba(201,169,110,0.18)',
          }}>
            {configs.map((c, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={c.id} src={c.img} alt={c.name} loading="lazy" decoding="async"
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                  opacity: i === active ? 1 : 0, transform: i === active ? 'scale(1)' : 'scale(1.04)',
                  transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 1.2s cubic-bezier(0.16,1,0.3,1)',
                }} />
            ))}
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(120% 80% at 80% 10%, ${cur.tint} 0%, transparent 55%)` }} />
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(6,14,8,0.82) 6%, transparent 46%)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(20px,2.8vw,40px)' }}>
              <span style={{ display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, marginBottom: 8 }}>0{active + 1} / 0{configs.length} · The interior</span>
              <h3 key={cur.id} style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(26px,3.4vw,48px)', lineHeight: 1, color: 'var(--cream)', margin: '0 0 6px', animation: 'fadeIn 0.5s ease both' }}>{cur.name}</h3>
              <p style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(14px,1.5vw,20px)', color: 'var(--gold)', margin: 0 }}>{cur.tagline}</p>
            </div>
          </div>
        </div>

        {/* DETAILS: description + feature pills */}
        <div key={cur.id + '-d'} style={{ gridArea: 'details', animation: 'fadeIn 0.5s ease both' }}>
          <p style={{ fontFamily: ff, fontSize: 'clamp(14px,1.4vw,17px)', lineHeight: 1.8, color: 'var(--cr70)', margin: '0 0 clamp(18px,2vw,24px)', maxWidth: 640 }}>{cur.desc}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 12px' }}>
            {cur.features.map(f => (
              <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: ffs, fontSize: 'clamp(9px,0.9vw,11px)', fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cr70)', padding: '8px 15px', borderRadius: 100, border: '1px solid rgba(201,169,110,0.22)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />{f}
              </span>
            ))}
          </div>
        </div>

        {/* SELECTOR */}
        <div style={{ gridArea: 'selector' }}>
          <span style={{ display: 'block', fontFamily: ffs, fontSize: 'clamp(10px,1vw,12.5px)', fontWeight: 400, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 'clamp(16px,2vw,22px)' }}>Choose the interior</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {configs.map((c, i) => {
              const Icon = c.icon;
              const on = i === active;
              return (
                <button key={c.id} className="ds-item" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', cursor: 'pointer',
                    padding: 'clamp(14px,1.5vw,18px) clamp(14px,1.6vw,20px)', borderRadius: 12,
                    background: on ? 'linear-gradient(90deg, rgba(201,169,110,0.14), rgba(201,169,110,0.03))' : 'transparent',
                    border: `1px solid ${on ? 'rgba(201,169,110,0.5)' : 'rgba(201,169,110,0.14)'}`,
                    boxShadow: on ? '0 0 30px -10px var(--gold-glow)' : 'none',
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: `1px solid ${on ? 'var(--gold)' : 'rgba(201,169,110,0.3)'}`, background: on ? 'rgba(201,169,110,0.14)' : 'transparent', color: 'var(--gold)' }}>
                    <Icon size={18} strokeWidth={1.5} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: ff, fontSize: 'clamp(16px,1.6vw,19px)', color: on ? 'var(--cream)' : 'var(--cr70)' }}>{c.name}</span>
                    <span style={{ fontFamily: ffs, fontSize: 'clamp(10px,0.95vw,12px)', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? 'var(--cr70)' : 'var(--cr40)' }}>{c.tagline}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <a href="#reserve"
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.55)'; }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 'clamp(24px,3vw,34px)',
              fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase',
              color: 'var(--gold)', background: 'transparent', border: '1px solid rgba(201,169,110,0.55)',
              borderRadius: 100, padding: '17px 28px', textDecoration: 'none',
              transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
              animation: 'goldGlow 3.4s ease-in-out infinite',
            }}>
            Enquire about a bespoke interior <ArrowUpRight size={14} />
          </a>
          <p style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.1em', color: 'rgba(228,217,195,0.3)', lineHeight: 1.7, margin: 'clamp(16px,2vw,22px) 0 0' }}>
            Visuals shown are indicative. Your interior is rendered and agreed before build.
          </p>
        </div>
      </div>
    </section>
  );
}
