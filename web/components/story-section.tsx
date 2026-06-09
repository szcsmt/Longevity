'use client';

import { useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const chapters = [
  {
    title: 'The Feeling',
    body: 'Travelling between capitals and luxury hotels, something was always missing. Every resort looked expensive. None of them felt healing. The founder wanted a place that actually changed how you lived — not just where you stayed.',
    bg: '/images/villa-I.jpg',
  },
  {
    title: 'The Place',
    body: 'Bophut, northeast Koh Samui. Untouched jungle, a private shore five minutes on foot, the first development of its kind on the island. 330 days of sunshine. Ancient trees. The Gulf of Thailand at your doorstep. The moment he stood here, the search was over.',
    bg: '/images/sanaila.jpg',
  },
  {
    title: 'The Standard',
    body: 'Thai warmth, Dubai precision. Thermo-glazed windows, central climate control engineered for the tropics, full soundproofing, private pools. Not a compromise anywhere. Built around a single belief: that where you live should make you healthier, sharper, and more alive — every single day.',
    bg: '/images/ks-villa-05.webp',
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
  }, []);

  return (
    <section ref={ref} style={{
      background: 'transparent',
      padding: 'clamp(120px,14vw,180px) clamp(24px,8vw,120px) clamp(80px,10vw,140px)',
      position: 'relative', overflow: 'hidden', isolation: 'isolate',
    }}>

      <style>{`
        .story-card:hover .story-card-img  { opacity: 0.5 !important; transform: scale(1) !important; }
        .story-card:hover .story-card-veil { opacity: 1 !important; }
        .story-card:hover p { color: var(--cr70) !important; }
        .story-card:hover h3 { color: #fff !important; }
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
        fontSize: 'clamp(38px,6.5vw,96px)',
        lineHeight: 1.08, letterSpacing: '-0.01em',
        color: 'var(--cream)',
        margin: '0 0 clamp(64px,9vw,120px)',
        maxWidth: '14em',
      }}>
        We found<br />
        a different answer.<br />
        <em className="gold-text" style={{ fontStyle: 'italic' }}>We built it here.</em>
      </h2>

      {/* Chapters — 3 glass cards */}
      <div className="reveal lr-cols-3" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'clamp(14px,1.6vw,24px)',
        marginBottom: 'clamp(64px,9vw,120px)',
      }}>
        {chapters.map((ch, i) => (
          <div key={i} className="glass-card story-card" style={{
            padding: 'clamp(32px,4vw,56px) clamp(24px,3vw,44px)',
            position: 'relative', overflow: 'hidden',
            minHeight: 'clamp(300px,26vw,360px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}>
            {/* Material image — revealed on hover */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="story-card-img" src={ch.bg} alt="" aria-hidden="true"
              loading="lazy" decoding="async"
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', zIndex: 0, opacity: 0, transform: 'scale(1.06)',
                transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 1.1s cubic-bezier(0.16,1,0.3,1)',
              }}
            />
            <div className="story-card-veil" aria-hidden="true" style={{
              position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(to top, rgba(6,14,8,0.92) 18%, rgba(6,14,8,0.55) 60%, rgba(6,14,8,0.35) 100%)',
              opacity: 0, transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1)',
            }} />

            <h3 style={{
              position: 'relative', zIndex: 2,
              fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
              fontSize: 'clamp(18px,2vw,28px)',
              lineHeight: 1.2,
              color: 'var(--cream)',
              margin: '0 0 18px',
              letterSpacing: '0.01em',
            }}>{ch.title}</h3>

            <p style={{
              position: 'relative', zIndex: 2,
              fontFamily: ff, fontWeight: 400,
              fontSize: 'clamp(13px,1.15vw,15px)',
              lineHeight: 1.9, color: 'var(--cr40)',
              margin: 0, transition: 'color 0.5s',
            }}>{ch.body}</p>
          </div>
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
          fontFamily: ffs, fontSize: 8, fontWeight: 300,
          letterSpacing: '0.24em', textTransform: 'uppercase',
          color: 'var(--gold)', opacity: 0.45, marginTop: 22,
        }}>— The Founder</p>
      </div>

    </section>
  );
}
