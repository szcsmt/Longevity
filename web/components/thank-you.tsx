'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* Dedicated thank-you page shown at a unique URL per form (/thank-you/enquiry,
   /thank-you/brochure, /thank-you/reserve) — a clean conversion URL for GTM/GA4/Ads. */
export function ThankYou({ variant }: { variant: 'enquiry' | 'brochure' | 'reserve' }) {
  const t = useT();
  const sub = variant === 'brochure' ? t('br.requested') : t('cta.thanksSub');

  return (
    <main style={{
      minHeight: '100svh', background: 'var(--bg)', color: 'var(--cream)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'clamp(28px,6vw,80px)', textAlign: 'center', position: 'relative', overflow: 'hidden',
    }}>
      <div className="section-glow" aria-hidden="true" style={{ top: '20%', left: '50%', transform: 'translateX(-50%)', width: 'min(560px,70vw)', height: 'min(560px,70vw)' }} />
      <div style={{ maxWidth: 520, position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/LOGO.svg" alt="Longevity Resort" style={{ height: 'clamp(52px,7vw,80px)', width: 'auto', margin: '0 auto clamp(28px,4vw,44px)', display: 'block', opacity: 0.95 }} />

        <span style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 16 }}>
          {t('locThailand')}
        </span>

        <h1 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(34px,5vw,56px)', lineHeight: 1.1, color: 'var(--cream)', margin: '0 0 16px' }}>
          {t('cta.thanks')}
        </h1>
        <p style={{ fontFamily: ff, fontSize: 'clamp(15px,1.6vw,19px)', lineHeight: 1.7, color: 'var(--cr70)', margin: '0 0 clamp(30px,4vw,46px)' }}>
          {sub}
        </p>

        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase',
          color: 'var(--gold)', background: 'transparent', border: '1px solid rgba(201,169,110,0.55)',
          borderRadius: 100, padding: '16px 30px', textDecoration: 'none',
        }}>
          {t('ty.back')}
        </Link>
      </div>
    </main>
  );
}
