'use client';

import { ArrowUpRight } from 'lucide-react';
import { openEnquiry } from '@/components/enquiry-modal';
import { useT } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* Compact "key facts" band — first thing after the hero. A villa render (left)
   shows the product immediately; the key facts + enquiry sit beside it (no prices,
   no extra scroll section). Stacks on mobile. */
export function KeyFactsBand() {
  const t = useT();
  const facts = [
    { v: t('kf.f1.v'), l: t('kf.f1.l') },
    { v: t('kf.f2.v'), l: t('kf.f2.l') },
    { v: t('kf.f3.v'), l: t('kf.f3.l') },
    { v: t('kf.f4.v'), l: t('kf.f4.l') },
  ];

  return (
    <section style={{
      background: 'transparent', position: 'relative', isolation: 'isolate',
      padding: 'clamp(40px,5vw,72px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(201,169,110,0.12)',
      borderBottom: '1px solid rgba(201,169,110,0.12)',
    }}>
      <style>{`
        .kf-split { display: grid; grid-template-columns: 0.85fr 1fr; gap: clamp(28px,4vw,64px); align-items: center; }
        @media (max-width: 860px) { .kf-split { grid-template-columns: 1fr; gap: clamp(24px,5vw,32px); } }
        .kf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(20px,2.6vw,34px) clamp(18px,2.4vw,32px); }
      `}</style>

      <div className="kf-split">
        {/* Villa render — shows the product right away */}
        <div className="elev-img" style={{
          position: 'relative', width: '100%', aspectRatio: '4 / 5', overflow: 'hidden',
          borderRadius: 'clamp(14px,1.6vw,22px)', border: '1px solid rgba(201,169,110,0.18)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/villa-m/m-1.webp" alt="A Longevity Resort pool residence" loading="eager" decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,14,8,0.55) 2%, transparent 40%)' }} />
        </div>

        {/* Eyebrow + facts + enquire */}
        <div>
          <span style={{
            display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em',
            textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(20px,2.5vw,30px)',
          }}>{t('kf.eyebrow')}</span>

          <div className="kf-grid">
            {facts.map((f, i) => (
              <div key={i}>
                <span style={{
                  display: 'block', fontFamily: ff, fontWeight: 400,
                  fontSize: 'clamp(22px,2.4vw,32px)', lineHeight: 1.08, color: 'var(--cream)', marginBottom: 7,
                }}>{f.v}</span>
                <span style={{
                  display: 'block', fontFamily: ffs, fontSize: 'clamp(9px,0.9vw,11px)', fontWeight: 400,
                  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, lineHeight: 1.5,
                }}>{f.l}</span>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => openEnquiry('keyfacts')}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.55)'; }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 11, marginTop: 'clamp(26px,3vw,38px)', cursor: 'pointer',
              fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase',
              color: 'var(--gold)', background: 'transparent', border: '1px solid rgba(201,169,110,0.55)',
              borderRadius: 100, padding: '15px 28px',
              transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
            }}>
            {t('kf.cta')} <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
