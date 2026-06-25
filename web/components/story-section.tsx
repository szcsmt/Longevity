'use client';

import { useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

interface Chapter {
  title: string;
  tagline: string;
  body: string;
  bg: string;
  tint: string;
}

const chapters: Chapter[] = [
  {
    title: 'The Feeling', tint: 'rgba(206,138,120,0.32)',
    tagline: 'Built to be felt.',
    body: 'It started with a feeling, not a blueprint. The sense that a home should give something back: calm in the morning, clarity through the day, deep rest at night. Most places are built to be seen. This one was built to be felt.',
    bg: '/images/story/feeling.webp',
  },
  {
    title: 'The Place', tint: 'rgba(120,178,150,0.30)',
    tagline: 'Northeast Koh Samui.',
    body: 'Plai Leam, northeast Koh Samui. Untouched jungle, a private shore five minutes on foot, the first development of its kind on the island. 330 days of sunshine. Ancient trees. The Gulf of Thailand at your doorstep. The moment he stood here, the search was over.',
    bg: '/images/story/place.webp',
  },
  {
    title: 'The Standard', tint: 'rgba(201,169,110,0.34)',
    tagline: 'Thai warmth, Dubai precision.',
    body: 'Thermally glazed windows, central climate control engineered for the tropics, full soundproofing, private pools. Not a compromise anywhere. Built around a single belief: that where you live should make you healthier, sharper, and more alive, every single day.',
    bg: '/images/story/standard.webp',
  },
];

export function StorySection() {
  const ref = useRef<HTMLElement>(null);

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

    // Touch devices (no hover): a 0-height band at the screen centre means only the
    // single card spanning the centre line is ever active — never two at once.
    const cards = ref.current?.querySelectorAll<HTMLElement>('.story-card') ?? [];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => e.target.classList.toggle('lane-active', e.isIntersecting));
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    cards.forEach(c => obs.observe(c));
    return () => obs.disconnect();
  }, []);

  return (
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
        /* Touch: only the centred card shows its image; the incoming one waits for
           the outgoing one to fade out first (delayed fade-in), so they never overlap. */
        @media (hover: none) {
          .story-card .story-card-img { transition: opacity 0.45s ease; }
          .story-card.lane-active .story-card-img { opacity: 0.85; transform: scale(1); transition: opacity 0.45s ease 0.45s; }
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
            <article key={ch.title} className="story-card" style={{
              position: 'relative', overflow: 'hidden',
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

              {/* Text */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <h3 style={{
                  fontFamily: ff, fontWeight: 400,
                  fontSize: 'clamp(24px,2.4vw,34px)', lineHeight: 1.06,
                  color: 'var(--cream)', margin: '0 0 8px',
                  textShadow: '0 2px 18px rgba(6,14,8,0.92)',
                }}>{ch.title}</h3>
                <p style={{
                  fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
                  fontSize: 'clamp(14px,1.4vw,18px)', color: 'var(--gold)',
                  margin: '0 0 16px', textShadow: '0 1px 14px rgba(6,14,8,0.92)',
                }}>{ch.tagline}</p>
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
  );
}
