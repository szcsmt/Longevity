'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

interface Chapter {
  title: string;
  body: string;
  bg: string;
  tint: string;
}

const chapters: Chapter[] = [
  {
    title: 'The Feeling', tint: 'rgba(206,138,120,0.32)',
    body: 'It started with a feeling, not a blueprint. The sense that a home should give something back: calm in the morning, clarity through the day, deep rest at night. Most places are built to be seen. This one was built to be felt.',
    bg: '/images/story/feeling.webp',
  },
  {
    title: 'The Place', tint: 'rgba(120,178,150,0.30)',
    body: 'Plai Leam, northeast Koh Samui. Untouched jungle, a private shore five minutes on foot, the first development of its kind on the island. 330 days of sunshine. Ancient trees. The Gulf of Thailand at your doorstep. The moment he stood here, the search was over.',
    bg: '/images/story/place.webp',
  },
  {
    title: 'The Standard', tint: 'rgba(201,169,110,0.34)',
    body: 'Thermally glazed windows, central climate control engineered for the tropics, full soundproofing, private pools. Not a compromise anywhere. Built around a single belief: that where you live should make you healthier, sharper, and more alive, every single day.',
    bg: '/images/story/standard.webp',
  },
];

export function StorySection() {
  const ref = useRef<HTMLElement>(null);
  const [lightbox, setLightbox] = useState<Chapter | null>(null);

  const stepLightbox = (dir: number) => {
    setLightbox(cur => {
      if (!cur) return cur;
      const i = chapters.findIndex(c => c.title === cur.title);
      return chapters[(i + dir + chapters.length) % chapters.length];
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

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 130);
        obs.disconnect();
      }, { threshold: 0.08 });
      obs.observe(el);
    });

    // Touch devices (no hover): reveal a card's image while it's in the central band
    // of the screen (so it's already showing as you reach it).
    const cards = ref.current?.querySelectorAll<HTMLElement>('.story-card') ?? [];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => e.target.classList.toggle('lane-active', e.isIntersecting));
    }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });
    cards.forEach(c => obs.observe(c));
    return () => obs.disconnect();
  }, []);

  return (
    <>
    <section ref={ref} style={{
      background: 'transparent',
      padding: 'clamp(120px,14vw,180px) clamp(24px,8vw,120px) clamp(80px,10vw,140px)',
      position: 'relative', overflow: 'hidden', isolation: 'isolate',
    }}>

      <style>{`
        .story-card {
          transition: transform 0.55s cubic-bezier(0.16,1,0.3,1),
                      border-color 0.55s cubic-bezier(0.16,1,0.3,1),
                      box-shadow 0.55s cubic-bezier(0.16,1,0.3,1);
        }
        .story-card:hover {
          transform: translateY(-6px);
          border-color: rgba(201,169,110,0.45);
          box-shadow: 0 40px 80px -28px rgba(0,0,0,0.8), 0 0 50px -12px var(--gold-glow);
        }
        .story-card:hover .story-glow { opacity: 1; }
        .story-card-img { opacity: 0; transform: scale(1.08); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 1.2s cubic-bezier(0.16,1,0.3,1); }
        .story-card:hover .story-card-img { opacity: 0.9; transform: scale(1); }
        .story-card .story-zoom { opacity: 0; transition: opacity 0.4s ease; }
        .story-card:hover .story-zoom { opacity: 1; }
        /* Touch: reveal the card's image immediately as it nears the centre — a quick
           crossfade, no waiting, so it's already there by the time you read it. */
        @media (hover: none) {
          .story-card .story-card-img { transition: opacity 0.35s ease; }
          .story-card.lane-active .story-card-img { opacity: 0.85; transform: scale(1); }
          .story-card.lane-active .story-zoom { opacity: 1; }
        }
      `}</style>

      {/* Ambient glow behind headline */}
      <div className="section-glow" aria-hidden="true" style={{
        top: '8%', left: '-6%', width: 'min(560px,60vw)', height: 'min(560px,60vw)',
      }} />

      {/* Label */}
      <span className="reveal" style={{
        display: 'block',
        fontFamily: ffs, fontSize: 9, fontWeight: 300,
        letterSpacing: '0.30em', textTransform: 'uppercase',
        color: 'var(--gold)', opacity: 0.65,
        marginBottom: 'clamp(28px,3.5vw,44px)',
      }}>The Story</span>

      {/* Headline */}
      <h2 className="reveal" style={{
        fontFamily: ff, fontWeight: 400,
        fontSize: 'clamp(32px,4.8vw,68px)',
        lineHeight: 1.1, letterSpacing: '-0.01em',
        color: 'var(--cream)',
        margin: '0 0 clamp(52px,7vw,96px)',
        maxWidth: '14em',
      }}>
        We wanted more<br />
        than a place to stay.<br />
        <em className="gold-text" style={{ fontStyle: 'italic' }}>So we built this.</em>
      </h2>

      {/* Chapters — cards styled like the themed lanes */}
      <div className="reveal lr-cols-3" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'clamp(14px,1.6vw,24px)',
        marginBottom: 'clamp(64px,9vw,120px)',
      }}>
        {chapters.map((ch) => (
            <article key={ch.title} className="story-card" onClick={() => setLightbox(ch)} style={{
              position: 'relative', overflow: 'hidden', cursor: 'pointer',
              minHeight: 'clamp(320px,28vw,400px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              textAlign: 'center',
              padding: 'clamp(30px,3vw,48px)',
              borderRadius: 'clamp(12px,1.2vw,18px)',
              border: '1px solid var(--glass-border)',
              background: 'linear-gradient(165deg, rgba(228,217,195,0.045), rgba(228,217,195,0.01))',
              boxShadow: 'var(--glass-shadow)',
            }}>
              {/* Material image — revealed on hover (desktop) / when centred (touch) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="story-card-img" src={ch.bg} alt="" aria-hidden="true"
                loading="lazy" decoding="async"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} />
              <div aria-hidden="true" style={{
                position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
                background: 'linear-gradient(to top, rgba(6,14,8,0.80) 26%, rgba(6,14,8,0.40) 100%)',
              }} />

              {/* Themed radial glow */}
              <div className="story-glow" aria-hidden="true" style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
                background: `radial-gradient(120% 90% at 80% 0%, ${ch.tint} 0%, transparent 58%)`,
                opacity: 0.72, transition: 'opacity 0.55s cubic-bezier(0.16,1,0.3,1)',
              }} />

              {/* Zoom hint (appears on hover / when active) */}
              <span className="story-zoom" aria-hidden="true" style={{
                position: 'absolute', top: 14, right: 14, zIndex: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(6,14,8,0.6)', border: '1px solid rgba(201,169,110,0.5)',
                color: 'var(--gold)',
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 6V3h3M11 8v3H8"/></svg>
              </span>

              {/* Text */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <h3 style={{
                  fontFamily: ff, fontWeight: 400,
                  fontSize: 'clamp(24px,2.4vw,34px)', lineHeight: 1.06,
                  color: 'var(--cream)', margin: '0 0 8px',
                  textShadow: '0 2px 18px rgba(6,14,8,0.92)',
                }}>{ch.title}</h3>
                <p style={{
                  fontFamily: ffs, fontWeight: 300,
                  fontSize: 'clamp(12px,0.95vw,13.5px)', lineHeight: 1.85,
                  color: 'var(--cr70)', margin: 0, letterSpacing: '0.01em',
                  textShadow: '0 1px 12px rgba(6,14,8,0.92)',
                }}>{ch.body}</p>
              </div>
            </article>
        ))}
      </div>

      {/* Pull quote — centered */}
      <div className="reveal" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <span style={{
          display: 'block', width: 40, height: 1,
          background: 'linear-gradient(to right, transparent, var(--gold-65), transparent)',
          margin: '0 auto clamp(28px,3.5vw,40px)',
        }} />
        <blockquote style={{
          margin: 0,
          fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
          fontSize: 'clamp(17px,2vw,26px)',
          lineHeight: 1.72, color: 'var(--cr70)', letterSpacing: '0.01em',
        }}>
          &ldquo;Premium quality, a good life, a long life.<br />
          That is what this place is built for.&rdquo;
        </blockquote>
        <p style={{
          fontFamily: ffs, fontSize: 'clamp(10px,1vw,11px)', fontWeight: 300,
          letterSpacing: '0.24em', textTransform: 'uppercase',
          color: 'var(--gold)', opacity: 0.7, marginTop: 22,
        }}>The Founder</p>
      </div>

    </section>

    {/* Lightbox — chapter image shown large (portal → escapes section stacking) */}
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
        <div key={lightbox.title} onClick={e => e.stopPropagation()} style={{
          position: 'relative', width: '100%', maxWidth: 1100,
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid rgba(201,169,110,0.25)',
          boxShadow: '0 50px 120px -30px rgba(0,0,0,0.9), 0 0 60px -10px var(--gold-glow)',
          animation: 'fadeIn 0.4s ease both',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.bg} alt={lightbox.title} style={{ width: '100%', maxHeight: '80vh', objectFit: 'cover', display: 'block' }} />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: 'clamp(24px,3.2vw,48px)',
            background: 'linear-gradient(to top, rgba(6,14,8,0.94) 12%, transparent)',
          }}>
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, marginBottom: 10 }}>
              The Story
            </span>
            <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(28px,4vw,56px)', lineHeight: 1, color: 'var(--cream)', margin: 0 }}>{lightbox.title}</h3>
          </div>
        </div>

        {/* Prev / Next */}
        {[
          { lbl: 'Previous', side: 'left'  as const, dir: -1, d: 'M15 4L7 10l8 6' },
          { lbl: 'Next',     side: 'right' as const, dir:  1, d: 'M7 4l8 6-8 6' },
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
        <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} aria-label="Close"
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
