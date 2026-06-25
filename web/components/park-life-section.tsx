'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Leaf, Sun, Sparkles, Trees } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* ── Themed lanes — the heart of the section ────────────────────────────
   Each street keeps the brand discipline (gold/cream on dark) and is
   differentiated only by a muted, on-brand tint + an evocative icon.
   `img` is a placeholder render — swap for real street imagery later. */
interface Street {
  index: string;
  name: string;
  tagline: string;
  desc: string;
  keywords: string[];
  icon: LucideIcon;
  tint: string;   // muted rgba used for the card's radial glow + accent line
  img: string;
}

const streets: Street[] = [
  {
    index: '01', name: 'Zen Street', icon: Leaf,
    tagline: 'Stillness by design.',
    desc: 'Stone gardens, shaded meditation decks, and the soft sound of moving water. The quietest lane on the estate.',
    keywords: ['Meditation gardens', 'Water features', 'Absolute silence'],
    tint: 'rgba(120,178,150,0.30)', img: '/images/streets/zen.webp',
  },
  {
    index: '02', name: 'Desert Street', icon: Sun,
    tagline: 'Warm, sculpted light.',
    desc: 'Sandstone walls, cacti gardens, and architectural shade. Minimalism that glows at golden hour.',
    keywords: ['Sandstone courtyards', 'Cacti gardens', 'Sculptural shade'],
    tint: 'rgba(201,169,110,0.34)', img: '/images/streets/desert.webp',
  },
  {
    index: '03', name: 'Carnival Street', icon: Sparkles,
    tagline: 'Where the estate comes alive.',
    desc: 'The social heart, with lanes lit by lanterns for strolling, gathering, and life after the sun goes down.',
    keywords: ['Festive lighting', 'Social lanes', 'Evenings out'],
    tint: 'rgba(206,138,120,0.32)', img: '/images/streets/carnival.webp',
  },
  {
    index: '04', name: 'Garden Street', icon: Trees,
    tagline: 'Lush green, softly lit.',
    desc: 'A leafy residential lane wrapped in tropical planting, with warm light tracing every villa at dusk.',
    keywords: ['Tropical planting', 'Evening glow', 'Family friendly'],
    tint: 'rgba(176,160,118,0.30)', img: '/images/streets/garden.webp',
  },
];

const stats = [
  { v: '+60',   l: 'Private villas' },
  { v: '4',     l: 'Themed lanes' },
  { v: '24/7',  l: 'Secured & gated' },
  { v: '5 min', l: 'To the nearest beach' },
];

export function ParkLifeSection() {
  const ref = useRef<HTMLElement>(null);
  const [lightbox, setLightbox] = useState<Street | null>(null);

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

    // On touch devices there's no hover, so reveal ONLY the lane currently crossing
    // the centre of the screen (others go dark again as they leave) — so you see one
    // street render at a time while scrolling. Desktop keeps hover-to-reveal.
    const cards = ref.current?.querySelectorAll<HTMLElement>('.street-card') ?? [];
    const laneObs = new IntersectionObserver((entries) => {
      entries.forEach(e => e.target.classList.toggle('lane-active', e.isIntersecting));
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    cards.forEach(c => laneObs.observe(c));
    return () => laneObs.disconnect();
  }, []);

  const stepLightbox = (dir: number) => {
    setLightbox(cur => {
      if (!cur) return cur;
      const i = streets.findIndex(s => s.name === cur.name);
      return streets[(i + dir + streets.length) % streets.length];
    });
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     setLightbox(null);
      if (e.key === 'ArrowRight') stepLightbox(1);
      if (e.key === 'ArrowLeft')  stepLightbox(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [lightbox]);

  return (
    <>
    <section id="park" ref={ref} style={{
      background: 'transparent',
      padding: 'clamp(78px,9vw,120px) clamp(24px,8vw,120px) clamp(60px,7vw,96px)',
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
        .street-card-img { opacity: 0; transform: scale(1.08); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 1.2s cubic-bezier(0.16,1,0.3,1); }
        .street-card:hover .street-card-img { opacity: 0.9; transform: scale(1); }
        .street-card .street-zoom { opacity: 0; transition: opacity 0.4s ease; }
        .street-card:hover .street-zoom { opacity: 1; }

        /* Touch devices (no hover): only the lane crossing the screen centre shows its
           render — and the incoming one waits for the outgoing one to fade out first
           (delayed fade-in), so the image is never on two cards at once. */
        @media (hover: none) {
          .street-card .street-card-img { transition: opacity 0.45s ease; }
          .street-card.lane-active .street-card-img { opacity: 0.85; transform: scale(1); transition: opacity 0.45s ease 0.45s; }
          .street-card.lane-active .street-zoom { opacity: 1; }
        }
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
      }}>The Park · Plai Leam Longevity Park</span>

      {/* Two-column header */}
      <div className="reveal" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'clamp(28px,5vw,72px)', alignItems: 'end',
        marginBottom: 'clamp(28px,3.5vw,48px)',
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
          A private, gated park of 60+ residences, laid out as four
          themed lanes, each with its own atmosphere. One guarded entrance, no through
          traffic, utilities buried underground. You don&rsquo;t arrive at a building.
          You come home to a neighbourhood.
        </p>
      </div>

      {/* Entrance banner */}
      <div className="reveal elev-img lr-entrance" style={{
        position: 'relative', width: '100%', aspectRatio: '2.3 / 1', minHeight: 220,
        borderRadius: 'clamp(12px,1.4vw,20px)', overflow: 'hidden',
        marginBottom: 'clamp(48px,6vw,80px)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/streets/entrance.webp" alt="Longevity Resort gated entrance"
          loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 58%' }} />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(6,14,8,0.6) 0%, transparent 45%)',
        }} />
        <span className="lr-entrance-chip" style={{
          position: 'absolute', left: 'clamp(16px,2.5vw,40px)', bottom: 'clamp(12px,2.2vw,30px)',
          display: 'inline-flex', alignItems: 'center', gap: 9,
          padding: '9px 16px', borderRadius: 100,
          background: 'rgba(6,14,8,0.6)', border: '1px solid rgba(201,169,110,0.35)', backdropFilter: 'blur(8px)',
          fontFamily: ffs, fontSize: 'clamp(8.5px,0.95vw,11px)', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--cr70)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
          Guarded Entrance
        </span>
      </div>

      {/* Stats strip — even 4-up on desktop, symmetric 2×2 grid on phones */}
      <div className="reveal lr-park-stats" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, max-content)',
        gap: 'clamp(22px,3vw,34px) clamp(28px,5vw,72px)',
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
              fontFamily: ffs, fontSize: 'clamp(10px,1.05vw,12px)', fontWeight: 300,
              letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cr70)',
            }}>{l}</span>
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
        gap: 'clamp(14px,1.6vw,22px)', marginBottom: 0,
      }}>
        {streets.map((s) => {
          const Icon = s.icon;
          return (
            <article key={s.name} className="street-card" onClick={() => setLightbox(s)} style={{
              position: 'relative', overflow: 'hidden', cursor: 'pointer',
              minHeight: 'clamp(292px,29vw,368px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
              gap: 'clamp(16px,2vw,26px)', textAlign: 'center',
              padding: 'clamp(26px,2.6vw,40px)',
              borderRadius: 'clamp(12px,1.2vw,18px)',
              border: '1px solid var(--glass-border)',
              background: 'linear-gradient(165deg, rgba(228,217,195,0.045), rgba(228,217,195,0.01))',
              boxShadow: 'var(--glass-shadow)',
            }}>
              {/* Street image — revealed on hover, click to enlarge */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="street-card-img" src={s.img} alt="" aria-hidden="true"
                loading="lazy" decoding="async"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} />
              <div aria-hidden="true" style={{
                position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
                background: 'linear-gradient(to top, rgba(6,14,8,0.78) 30%, rgba(6,14,8,0.32) 100%)',
              }} />

              {/* Themed radial glow */}
              <div className="street-glow" aria-hidden="true" style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
                background: `radial-gradient(120% 90% at 80% 0%, ${s.tint} 0%, transparent 58%)`,
                opacity: 0.72, transition: 'opacity 0.55s cubic-bezier(0.16,1,0.3,1)',
              }} />

              {/* Zoom hint (appears on hover) */}
              <span className="street-zoom" aria-hidden="true" style={{
                position: 'absolute', top: 14, right: 14, zIndex: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(6,14,8,0.6)', border: '1px solid rgba(201,169,110,0.5)',
                color: 'var(--gold)', backdropFilter: 'blur(6px)',
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 6V3h3M11 8v3H8"/></svg>
              </span>

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

              {/* Text — title aligned at top, everything centred */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <h3 style={{
                  fontFamily: ff, fontWeight: 400,
                  fontSize: 'clamp(26px,2.6vw,38px)', lineHeight: 1.05,
                  color: 'var(--cream)', margin: '0 0 6px',
                  textShadow: '0 2px 18px rgba(6,14,8,0.92)',
                }}>{s.name}</h3>
                <p style={{
                  fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
                  fontSize: 'clamp(14px,1.4vw,18px)', color: 'var(--gold)',
                  margin: '0 0 16px', textShadow: '0 1px 14px rgba(6,14,8,0.92)',
                }}>{s.tagline}</p>
                <p style={{
                  fontFamily: ffs, fontWeight: 300,
                  fontSize: 'clamp(12px,0.95vw,13px)', lineHeight: 1.8,
                  color: 'var(--cr70)', margin: '0 0 20px', letterSpacing: '0.01em',
                  textShadow: '0 1px 12px rgba(6,14,8,0.92)',
                }}>{s.desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 8px' }}>
                  {s.keywords.map((k) => (
                    <span key={k} style={{
                      fontFamily: ffs, fontSize: 7.5, fontWeight: 300,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--cr70)',
                      padding: '5px 11px', borderRadius: 100,
                      border: '1px solid rgba(201,169,110,0.20)',
                      background: 'rgba(6,14,8,0.35)',
                    }}>{k}</span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

    </section>

    {/* ── Lightbox — street shown large (portal → escapes section stacking) ── */}
    {lightbox && createPortal(
      <div
        onClick={() => setLightbox(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 3000,
          background: 'rgba(6,14,8,0.93)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'clamp(16px,4vw,56px)', animation: 'fadeIn 0.3s ease both',
        }}
      >
        <div key={lightbox.name} onClick={e => e.stopPropagation()} style={{
          position: 'relative', width: '100%', maxWidth: 1100,
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid rgba(201,169,110,0.25)',
          boxShadow: '0 50px 120px -30px rgba(0,0,0,0.9), 0 0 60px -10px var(--gold-glow)',
          animation: 'fadeIn 0.4s ease both',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.img} alt={lightbox.name} style={{ width: '100%', maxHeight: '80vh', objectFit: 'cover', display: 'block' }} />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: 'clamp(24px,3.2vw,48px)',
            background: 'linear-gradient(to top, rgba(6,14,8,0.94) 12%, transparent)',
          }}>
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, marginBottom: 10 }}>
              {lightbox.index} / 0{streets.length} · Themed lane
            </span>
            <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(28px,4vw,56px)', lineHeight: 1, color: 'var(--cream)', margin: '0 0 8px' }}>{lightbox.name}</h3>
            <p style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(15px,1.6vw,22px)', color: 'var(--gold)', margin: 0 }}>{lightbox.tagline}</p>
          </div>
        </div>

        {/* Prev / Next */}
        {[
          { lbl: 'Previous street', side: 'left'  as const, dir: -1, d: 'M15 4L7 10l8 6' },
          { lbl: 'Next street',     side: 'right' as const, dir:  1, d: 'M7 4l8 6-8 6' },
        ].map(({ lbl, side, dir, d }) => (
          <button key={side} aria-label={lbl}
            onClick={(e) => { e.stopPropagation(); stepLightbox(dir); }}
            style={{
              position: 'fixed', top: '50%', transform: 'translateY(-50%)', [side]: 'clamp(12px,3vw,40px)', zIndex: 3001,
              width: 52, height: 52, borderRadius: '50%',
              border: '1px solid rgba(201,169,110,0.45)', background: 'rgba(6,14,8,0.6)',
              backdropFilter: 'blur(8px)', cursor: 'pointer', color: 'var(--gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
          </button>
        ))}

        {/* Close */}
        <button
          onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
          aria-label="Close"
          style={{
            position: 'fixed', top: 'clamp(16px,3vw,28px)', right: 'clamp(16px,3vw,28px)', zIndex: 3001,
            width: 48, height: 48, borderRadius: '50%',
            border: '1px solid rgba(228,217,195,0.3)', background: 'rgba(6,14,8,0.85)',
            backdropFilter: 'blur(8px)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 10 10" fill="none" stroke="var(--cream)" strokeWidth="1.3" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
      </div>,
      document.body
    )}
    </>
  );
}
