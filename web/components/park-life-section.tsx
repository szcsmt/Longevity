'use client';

import { useEffect, useRef } from 'react';
import { ShieldCheck, Fence, Car, Zap, KeyRound, ConciergeBell, Leaf, Sun, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* ── Themed lanes — the heart of the section ────────────────────────────
   Each street keeps the brand discipline (gold/cream on dark) and is
   differentiated only by a muted, on-brand tint + an evocative icon. */
interface Street {
  index: string;
  name: string;
  tagline: string;
  desc: string;
  keywords: string[];
  icon: LucideIcon;
  tint: string;   // muted rgba used for the card's radial glow + accent line
}

const streets: Street[] = [
  {
    index: '01', name: 'Zen Street', icon: Leaf,
    tagline: 'Stillness by design.',
    desc: 'Koi ponds, shaded meditation decks, and the soft sound of moving water. The quietest lane on the estate.',
    keywords: ['Meditation gardens', 'Water features', 'Absolute silence'],
    tint: 'rgba(120,178,150,0.30)',
  },
  {
    index: '02', name: 'Desert Street', icon: Sun,
    tagline: 'Warm, sculpted light.',
    desc: 'Sandstone walls, sunlit courtyards, and architectural shade. Minimalism that glows at golden hour.',
    keywords: ['Sandstone courtyards', 'Sun terraces', 'Sculptural shade'],
    tint: 'rgba(201,169,110,0.34)',
  },
  {
    index: '03', name: 'Carnival Street', icon: Sparkles,
    tagline: 'Where the estate comes alive.',
    desc: 'The social heart — a lantern-lit plaza for dining, music, and gathering long after the sun goes down.',
    keywords: ['Social plaza', 'Lantern light', 'Dining & events'],
    tint: 'rgba(206,138,120,0.32)',
  },
];

/* ── Services & security ── */
const facilities: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: ShieldCheck,    title: '24/7 Security',         sub: 'Manned patrols, every hour' },
  { icon: Fence,          title: 'Single Gated Entrance', sub: 'One guarded point of access' },
  { icon: Car,            title: 'Private Parking',       sub: 'Dedicated space per villa' },
  { icon: Zap,            title: 'EV Charging',           sub: 'At every residence' },
  { icon: KeyRound,       title: 'Smart Keyless Access',  sub: 'App & biometric entry' },
  { icon: ConciergeBell,  title: '24/7 Concierge',        sub: 'On call, day and night' },
];

const stats = [
  { v: '12',    l: 'Private villas' },
  { v: '3',     l: 'Themed lanes' },
  { v: '24/7',  l: 'Secured & gated' },
  { v: '5 min', l: 'To the private beach' },
];

export function ParkLifeSection() {
  const ref = useRef<HTMLElement>(null);

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

  return (
    <section id="park" ref={ref} style={{
      background: 'transparent',
      padding: 'clamp(120px,14vw,180px) clamp(24px,8vw,120px)',
      position: 'relative', overflow: 'hidden', isolation: 'isolate',
      borderTop: '1px solid rgba(201,169,110,0.06)',
    }}>

      <style>{`
        .street-card {
          transition: transform 0.55s cubic-bezier(0.16,1,0.3,1),
                      border-color 0.55s cubic-bezier(0.16,1,0.3,1),
                      box-shadow 0.55s cubic-bezier(0.16,1,0.3,1);
        }
        .street-card:hover {
          transform: translateY(-6px);
          border-color: rgba(201,169,110,0.45);
          box-shadow: 0 40px 80px -28px rgba(0,0,0,0.8), 0 0 50px -12px var(--gold-glow);
        }
        .street-card:hover .street-glow { opacity: 1; }
      `}</style>

      {/* Ambient glow behind headline */}
      <div className="section-glow" aria-hidden="true" style={{
        top: '4%', right: '-5%', width: 'min(520px,55vw)', height: 'min(520px,55vw)',
      }} />

      {/* Label */}
      <span className="reveal" style={{
        display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300,
        letterSpacing: '0.30em', textTransform: 'uppercase',
        color: 'var(--gold)', opacity: 0.65,
        marginBottom: 'clamp(28px,3.5vw,44px)',
      }}>The Park · Bophut Longevity Park</span>

      {/* Two-column header */}
      <div className="reveal" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'clamp(28px,5vw,72px)', alignItems: 'end',
        marginBottom: 'clamp(56px,7vw,96px)',
      }}>
        <h2 style={{
          fontFamily: ff, fontWeight: 400,
          fontSize: 'clamp(38px,5.6vw,82px)',
          lineHeight: 1.08, letterSpacing: '-0.01em',
          color: 'var(--cream)', margin: 0,
        }}>
          Not a complex.<br />
          <em className="gold-text" style={{ fontStyle: 'italic' }}>A village.</em>
        </h2>
        <p style={{
          fontFamily: ff, fontWeight: 400,
          fontSize: 'clamp(15px,1.5vw,20px)',
          lineHeight: 1.9, color: 'var(--cr70)', margin: 0,
        }}>
          A private, gated park of just twelve residences — laid out as a handful of
          themed lanes, each with its own atmosphere. One guarded entrance, no through
          traffic, utilities buried underground. You don&rsquo;t arrive at a building.
          You come home to a neighbourhood.
        </p>
      </div>

      {/* Stats strip */}
      <div className="reveal" style={{
        display: 'flex', flexWrap: 'wrap', gap: 'clamp(28px,5vw,72px)',
        padding: 'clamp(22px,3vw,34px) 0',
        borderTop: '1px solid rgba(201,169,110,0.10)',
        borderBottom: '1px solid rgba(201,169,110,0.10)',
        marginBottom: 'clamp(56px,8vw,104px)',
      }}>
        {stats.map(({ v, l }) => (
          <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="gold-text" style={{
              fontFamily: ff, fontWeight: 400, fontSize: 'clamp(26px,3vw,42px)',
              lineHeight: 1, letterSpacing: '-0.01em',
            }}>{v}</span>
            <span style={{
              fontFamily: ffs, fontSize: 8, fontWeight: 300,
              letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cr40)',
            }}>{l}</span>
          </div>
        ))}
      </div>

      {/* ── Services & security (moved to the front) ── */}
      <span className="reveal" style={{
        display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
        letterSpacing: '0.26em', textTransform: 'uppercase',
        color: 'var(--gold)', opacity: 0.5, marginBottom: 'clamp(22px,3vw,32px)',
      }}>Services &amp; security</span>

      <div className="reveal" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 'clamp(10px,1.2vw,18px)', marginBottom: 'clamp(72px,10vw,120px)',
      }}>
        {facilities.map(({ icon: Icon, title, sub }) => (
          <div key={title} className="glass-card" style={{
            display: 'flex', alignItems: 'center', gap: 'clamp(16px,1.6vw,22px)',
            padding: 'clamp(22px,2.4vw,32px) clamp(20px,2.2vw,30px)',
          }}>
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
              border: '1px solid rgba(201,169,110,0.28)',
              color: 'var(--gold)',
            }}>
              <Icon size={19} strokeWidth={1.4} />
            </span>
            <div>
              <span style={{
                display: 'block', fontFamily: ff, fontWeight: 400,
                fontSize: 'clamp(15px,1.4vw,18px)', color: 'var(--cream)', marginBottom: 3,
              }}>{title}</span>
              <span style={{
                display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cr40)',
              }}>{sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Themed lanes ── */}
      <span className="reveal" style={{
        display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
        letterSpacing: '0.26em', textTransform: 'uppercase',
        color: 'var(--gold)', opacity: 0.5, marginBottom: 'clamp(22px,3vw,32px)',
      }}>Themed lanes</span>

      <div className="reveal" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'clamp(14px,1.6vw,22px)', marginBottom: 'clamp(72px,10vw,120px)',
      }}>
        {streets.map((s) => {
          const Icon = s.icon;
          return (
            <article key={s.name} className="street-card" style={{
              position: 'relative', overflow: 'hidden',
              minHeight: 'clamp(320px,34vw,400px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              padding: 'clamp(26px,2.6vw,40px)',
              borderRadius: 'clamp(12px,1.2vw,18px)',
              border: '1px solid var(--glass-border)',
              background: 'linear-gradient(165deg, rgba(228,217,195,0.045), rgba(228,217,195,0.01))',
              boxShadow: 'var(--glass-shadow)',
            }}>
              {/* Themed radial glow */}
              <div className="street-glow" aria-hidden="true" style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
                background: `radial-gradient(120% 90% at 80% 0%, ${s.tint} 0%, transparent 58%)`,
                opacity: 0.72, transition: 'opacity 0.55s cubic-bezier(0.16,1,0.3,1)',
              }} />

              {/* Top: index + icon */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em',
                  color: 'rgba(201,169,110,0.55)',
                }}>{s.index} / 0{streets.length}</span>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 46, height: 46, borderRadius: '50%',
                  border: '1px solid rgba(201,169,110,0.30)',
                  color: 'var(--gold)',
                }}>
                  <Icon size={20} strokeWidth={1.4} />
                </span>
              </div>

              {/* Bottom: text */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <h3 style={{
                  fontFamily: ff, fontWeight: 400,
                  fontSize: 'clamp(26px,2.6vw,38px)', lineHeight: 1.05,
                  color: 'var(--cream)', margin: '0 0 6px',
                }}>{s.name}</h3>
                <p style={{
                  fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
                  fontSize: 'clamp(14px,1.4vw,18px)', color: 'var(--gold)',
                  margin: '0 0 16px',
                }}>{s.tagline}</p>
                <p style={{
                  fontFamily: ffs, fontWeight: 300,
                  fontSize: 'clamp(12px,0.95vw,13px)', lineHeight: 1.8,
                  color: 'var(--cr40)', margin: '0 0 20px', letterSpacing: '0.01em',
                }}>{s.desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px' }}>
                  {s.keywords.map((k) => (
                    <span key={k} style={{
                      fontFamily: ffs, fontSize: 7.5, fontWeight: 300,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--cr70)',
                      padding: '5px 11px', borderRadius: 100,
                      border: '1px solid rgba(201,169,110,0.20)',
                    }}>{k}</span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

    </section>
  );
}
