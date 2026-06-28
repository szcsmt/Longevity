'use client';

import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const terms = [
  { title: '3-Year Buyback Guarantee', sub: 'Option to sell your villa back under agreed terms.' },
  { title: 'Fully Managed Rental',     sub: 'Letting, guests, housekeeping and upkeep handled for you.' },
  { title: 'Personal Owner Use',       sub: 'A set number of weeks each year, alongside the rental program.' },
];

export function InvestmentSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 110);
        obs.disconnect();
      }, { threshold: 0.08 });
      obs.observe(el);
    });
  }, []);

  const scrollReserve = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('reserve');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section id="investment" ref={ref} style={{
      background: 'transparent', position: 'relative', isolation: 'isolate', overflow: 'hidden',
      padding: 'clamp(80px,10vw,140px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(201,169,110,0.06)',
    }}>
      <div className="section-glow" aria-hidden="true" style={{ top: '8%', right: '-6%', width: 'min(520px,55vw)', height: 'min(520px,55vw)' }} />

      <span className="reveal" style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(20px,2.5vw,30px)' }}>Investment</span>
      <h2 className="reveal" style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(34px,5vw,72px)', lineHeight: 1.06, letterSpacing: '-0.015em', color: 'var(--cream)', margin: '0 0 clamp(40px,5vw,64px)', maxWidth: '14em' }}>
        Ownership, <em className="gold-text" style={{ fontStyle: 'normal' }}>structured.</em>
      </h2>

      <div className="lr-invest" style={{
        display: 'grid', gridTemplateColumns: '0.9fr 1.1fr',
        gap: 'clamp(40px,5vw,80px)', alignItems: 'center',
      }}>
        {/* Hero number + CTA */}
        <div className="reveal">
          <span className="gold-text" style={{ display: 'block', fontFamily: ff, fontWeight: 400, fontSize: 'clamp(88px,12vw,170px)', lineHeight: 0.9, letterSpacing: '-0.03em', filter: 'drop-shadow(0 0 30px var(--gold-glow))' }}>10%</span>
          <span style={{ display: 'block', fontFamily: ff, fontStyle: 'normal', fontSize: 'clamp(18px,2vw,28px)', color: 'var(--cream)', margin: '12px 0 6px' }}>Fixed annual ROI</span>
          <span style={{ display: 'block', fontFamily: ffs, fontSize: 'clamp(11px,1.1vw,13px)', fontWeight: 300, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8 }}>Paid quarterly for the first three years</span>

          <a href="#reserve" onClick={scrollReserve}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(201,169,110,0.12)'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.6)'; }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 'clamp(30px,4vw,44px)',
              fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase',
              color: 'var(--gold)', background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.6)',
              borderRadius: 100, padding: '16px 30px', textDecoration: 'none', cursor: 'pointer',
              boxShadow: '0 0 24px -12px var(--gold-glow)',
              transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
            }}>
            Request Full Investment Breakdown <ArrowUpRight size={14} />
          </a>
        </div>

        {/* Terms */}
        <div className="reveal" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(2px,0.4vw,6px)' }}>
          {terms.map(({ title, sub }) => (
            <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 18, padding: 'clamp(18px,2vw,24px) 0', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>
              <span style={{ display: 'block', width: 1, height: 'clamp(34px,4vw,46px)', background: 'linear-gradient(to bottom, var(--gold-65), transparent)', flexShrink: 0, marginTop: 3 }} />
              <div>
                <span style={{ display: 'block', fontFamily: ff, fontWeight: 400, fontSize: 'clamp(18px,1.9vw,24px)', color: 'var(--cream)', marginBottom: 5 }}>{title}</span>
                <span style={{ display: 'block', fontFamily: ffs, fontSize: 'clamp(12px,1.05vw,14px)', fontWeight: 300, lineHeight: 1.6, color: 'var(--cr70)' }}>{sub}</span>
              </div>
            </div>
          ))}
          <p style={{ fontFamily: ffs, fontSize: 'clamp(10px,1vw,12px)', fontWeight: 300, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, margin: 'clamp(18px,2vw,24px) 0 0' }}>
            Full legal pack available on request
          </p>
        </div>
      </div>
    </section>
  );
}
