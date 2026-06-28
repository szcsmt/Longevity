'use client';

import { useEffect, useRef } from 'react';
import { useT, richText } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const team = [
  { catKey: 'bh.t1.cat', title: 'Longevity Property Group', roleKey: 'bh.t1.role' },
  { catKey: 'bh.t2.cat', title: 'SVA Architects',           roleKey: 'bh.t2.role' },
  { catKey: 'bh.t3.cat', title: 'Panmas Construction',      roleKey: 'bh.t3.role' },
  { catKey: 'bh.t4.cat', title: 'Legacy Fitness & Spa',     roleKey: 'bh.t4.role' },
  { catKey: 'bh.t5.cat', title: 'Specialist Partners',      roleKey: 'bh.t5.role' },
];

/* Deliberately compact + minimal — credibility without taking over a screen. */
export function BehindSection() {
  const t = useT();
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
          {richText(t('bh.headline'), { fontStyle: 'normal' })}
        </h2>
        <p style={{ fontFamily: ffs, fontSize: 'clamp(11px,1.05vw,13px)', fontWeight: 300, letterSpacing: '0.06em', color: 'var(--cr40)', margin: 0, maxWidth: 420 }}>
          {t('bh.sub')}
        </p>
      </div>

      <div className="bh-grid reveal">
        {team.map(({ catKey, title, roleKey }) => (
          <div key={title} className="bh-item">
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 9 }}>{t(catKey)}</span>
            <span style={{ display: 'block', fontFamily: ff, fontWeight: 400, fontSize: 'clamp(15px,1.4vw,18px)', color: 'var(--cream)', lineHeight: 1.25, marginBottom: 5 }}>{title}</span>
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 'clamp(10px,0.9vw,11.5px)', fontWeight: 300, letterSpacing: '0.04em', color: 'var(--cr40)', lineHeight: 1.5 }}>{t(roleKey)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
