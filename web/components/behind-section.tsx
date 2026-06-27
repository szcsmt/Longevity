'use client';

import { useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const team = [
  { category: 'Developer',                title: 'Longevity Property Group',  role: 'Concept, structure and delivery' },
  { category: 'Architecture & Interiors', title: 'SVA Architects',            role: 'Tropical modern design' },
  { category: 'Construction',             title: 'Panmas Construction',       role: 'Koh Samui build expertise' },
  { category: 'Wellness Partner',         title: 'Legacy Fitness & Spa',      role: 'Fitness, spa and recovery' },
  { category: 'Longevity Partner',        title: 'Specialist Partners',       role: 'Diagnostics and preventive health' },
];

/* Deliberately compact + minimal — credibility without taking over a screen. */
export function BehindSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 90);
        obs.disconnect();
      }, { threshold: 0.1 });
      obs.observe(el);
    });
  }, []);

  return (
    <section id="team" ref={ref} style={{
      background: 'transparent', position: 'relative',
      padding: 'clamp(56px,6vw,84px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(201,169,110,0.06)',
    }}>
      <style>{`
        .bh-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: clamp(20px,2.4vw,40px); }
        .bh-item { border-top: 1px solid rgba(201,169,110,0.18); padding-top: clamp(14px,1.6vw,20px); }
        @media (max-width: 900px) { .bh-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .bh-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="reveal" style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between',
        gap: '8px 24px', marginBottom: 'clamp(28px,3.2vw,44px)',
      }}>
        <h2 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(24px,3vw,40px)', letterSpacing: '-0.01em', color: 'var(--cream)', margin: 0 }}>
          Behind the <em className="gold-text" style={{ fontStyle: 'italic' }}>Resort.</em>
        </h2>
        <p style={{ fontFamily: ffs, fontSize: 'clamp(11px,1.05vw,13px)', fontWeight: 300, letterSpacing: '0.06em', color: 'var(--cr40)', margin: 0, maxWidth: 420 }}>
          A focused team of specialists across development, architecture, construction, wellness and operation.
        </p>
      </div>

      <div className="bh-grid reveal">
        {team.map(({ category, title, role }) => (
          <div key={title} className="bh-item">
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 9 }}>{category}</span>
            <span style={{ display: 'block', fontFamily: ff, fontWeight: 400, fontSize: 'clamp(15px,1.4vw,18px)', color: 'var(--cream)', lineHeight: 1.25, marginBottom: 5 }}>{title}</span>
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 'clamp(10px,0.9vw,11.5px)', fontWeight: 300, letterSpacing: '0.04em', color: 'var(--cr40)', lineHeight: 1.5 }}>{role}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
