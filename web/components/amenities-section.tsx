'use client';

import { useEffect, useRef, useState } from 'react';
import { Sun, Droplets, Moon, Snowflake, Flame, Waves, Activity } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

interface Hotspot {
  x: number;            // % from left
  y: number;            // % from top
  icon: LucideIcon;
  title: string;
  body: string;
}

/* Positions tuned to the ks-villa-01 render (open villa, pool, interior). */
const hotspots: Hotspot[] = [
  { x: 42, y: 18, icon: Sun,       title: 'Circadian Lighting',     body: 'Light that follows the sun — morning white, evening amber. Your internal clock supported by architecture.' },
  { x: 24, y: 45, icon: Droplets,  title: 'Filtered Water Everywhere', body: 'Pure water at every point of use. Kitchen, bathroom, shower. No exceptions.' },
  { x: 68, y: 39, icon: Moon,      title: 'Full Blackout Bedrooms', body: 'Not curtains — architecture. Every bedroom sealed from light for complete sleep quality.' },
  { x: 80, y: 50, icon: Snowflake, title: 'Cooled Mattresses',      body: 'Clinical sleep-cooling technology. Optimal core temperature for deep, uninterrupted rest.' },
  { x: 92, y: 35, icon: Flame,     title: 'Infrared Sauna',         body: 'Deep heat therapy. Reduces inflammation, improves circulation, accelerates cellular recovery.' },
  { x: 23, y: 84, icon: Waves,     title: 'Ice Bath',               body: 'Cold immersion for recovery, immune function, and mental resilience — on your schedule.' },
  { x: 80, y: 74, icon: Activity,  title: 'On-site Wellness Lab',   body: 'VO₂ max testing, body-composition analysis, and a personal dietitian. Your biology, tracked and coached.' },
];

export function AmenitiesSection() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 100);
        obs.disconnect();
      }, { threshold: 0.06 });
      obs.observe(el);
    });
  }, []);

  const cur = hotspots[active];

  return (
    <section ref={ref} style={{
      background: 'transparent',
      padding: 'clamp(120px,14vw,180px) clamp(24px,8vw,120px)',
      position: 'relative', overflow: 'hidden', isolation: 'isolate',
    }}>

      <style>{`
        @keyframes hsPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(201,169,110,0.45); } 70% { box-shadow: 0 0 0 14px rgba(201,169,110,0); } }
        .hs-dot { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), background 0.3s, border-color 0.3s; }
        .hs-dot:hover { transform: translate(-50%,-50%) scale(1.12); }
      `}</style>

      <div className="section-glow" aria-hidden="true" style={{
        top: '6%', left: '-5%', width: 'min(520px,55vw)', height: 'min(520px,55vw)',
      }} />

      {/* Label */}
      <span className="reveal" style={{
        display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300,
        letterSpacing: '0.30em', textTransform: 'uppercase',
        color: 'var(--gold)', opacity: 0.65, marginBottom: 'clamp(28px,3.5vw,44px)',
      }}>Built Into Every Villa</span>

      {/* Headline */}
      <h2 className="reveal" style={{
        fontFamily: ff, fontWeight: 400, fontSize: 'clamp(38px,5.8vw,84px)',
        lineHeight: 1.08, letterSpacing: '-0.01em', color: 'var(--cream)',
        margin: '0 0 clamp(20px,2.5vw,32px)', maxWidth: '14em',
      }}>
        Your home heals you<br />
        <em className="gold-text" style={{ fontStyle: 'italic' }}>while you live in it.</em>
      </h2>

      <p className="reveal" style={{
        fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(14px,1.4vw,18px)',
        lineHeight: 1.8, color: 'var(--cr40)', margin: '0 0 clamp(44px,5vw,64px)', maxWidth: 520,
      }}>
        Explore the residence — tap each point to see the longevity technology built into it.
      </p>

      {/* Interactive image */}
      <div className="reveal elev-img" style={{
        position: 'relative', width: '100%',
        aspectRatio: '16 / 9', overflow: 'hidden',
        borderRadius: 'clamp(12px,1.4vw,20px)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/ks-villa-01.webp"
          alt="A Longevity Resort villa interior"
          loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.82) saturate(1.05)' }}
        />
        {/* subtle darkening for dot/label legibility */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(120% 100% at 50% 50%, transparent 40%, rgba(6,14,8,0.45) 100%)',
        }} />

        {/* Hotspot dots */}
        {hotspots.map((h, i) => {
          const Icon = h.icon;
          const on = i === active;
          return (
            <button
              key={h.title}
              className="hs-dot"
              aria-label={h.title}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              style={{
                position: 'absolute', left: `${h.x}%`, top: `${h.y}%`,
                transform: 'translate(-50%,-50%)',
                width: 38, height: 38, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: on ? 6 : 4,
                background: on ? 'var(--gold)' : 'rgba(6,14,8,0.55)',
                border: `1px solid ${on ? 'var(--gold)' : 'rgba(201,169,110,0.65)'}`,
                color: on ? 'var(--bg)' : 'var(--gold)',
                backdropFilter: 'blur(6px)',
                animation: on ? 'none' : 'hsPulse 2.6s ease-out infinite',
                animationDelay: `${i * 0.35}s`,
              }}
            >
              <Icon size={16} strokeWidth={1.6} />
            </button>
          );
        })}

        {/* Floating detail card — anchored left/right & top/bottom per dot quadrant */}
        <div
          key={active}
          style={{
            position: 'absolute', zIndex: 7, pointerEvents: 'none',
            maxWidth: 'min(300px, 76%)',
            left:  cur.x > 55 ? undefined : `calc(${cur.x}% + 30px)`,
            right: cur.x > 55 ? `calc(${100 - cur.x}% + 30px)` : undefined,
            top:   cur.y > 60 ? undefined : `calc(${cur.y}% - 8px)`,
            bottom:cur.y > 60 ? `calc(${100 - cur.y}% - 8px)` : undefined,
            background: 'linear-gradient(160deg, rgba(10,22,14,0.92), rgba(6,14,8,0.92))',
            border: '1px solid rgba(201,169,110,0.30)',
            boxShadow: '0 30px 70px -24px rgba(0,0,0,0.85), 0 0 40px -12px var(--gold-glow)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12, padding: 'clamp(16px,1.6vw,22px)',
            animation: 'fadeIn 0.35s ease both',
          }}
        >
          <span style={{
            display: 'block', fontFamily: ffs, fontSize: 7.5, fontWeight: 300,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--gold)', opacity: 0.75, marginBottom: 8,
          }}>0{active + 1} / 0{hotspots.length}</span>
          <h3 style={{
            fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
            fontSize: 'clamp(17px,1.8vw,24px)', lineHeight: 1.2,
            color: 'var(--cream)', margin: '0 0 8px',
          }}>{cur.title}</h3>
          <p style={{
            fontFamily: ffs, fontWeight: 300, fontSize: 'clamp(11px,0.95vw,13px)',
            lineHeight: 1.75, color: 'var(--cr70)', margin: 0,
          }}>{cur.body}</p>
        </div>
      </div>

      {/* Chips — quick legend / also drive the active state */}
      <div className="reveal" style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px 10px',
        marginTop: 'clamp(24px,3vw,36px)',
      }}>
        {hotspots.map((h, i) => (
          <button
            key={h.title}
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 15px', borderRadius: 100, cursor: 'pointer',
              fontFamily: ffs, fontSize: 9, fontWeight: 300,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: i === active ? 'var(--bg)' : 'var(--cr70)',
              background: i === active ? 'var(--gold)' : 'transparent',
              border: `1px solid ${i === active ? 'var(--gold)' : 'rgba(201,169,110,0.25)'}`,
              transition: 'background 0.3s, color 0.3s, border-color 0.3s',
            }}
          >
            {h.title}
          </button>
        ))}
      </div>

    </section>
  );
}
