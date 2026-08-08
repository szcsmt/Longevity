'use client';

import { useState, useEffect } from 'react';
import { captureSource, sendLead } from '@/lib/source';
import { useT } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="M2 4l6 4.5L14 4" />
  </svg>
);

/** "Request the brochure" — collects name + email (with consent) and sends a lead;
    the team emails the brochure. No direct download. */
export function BrochureDownload({ variant }: { variant: 'cta' | 'footer' }) {
  const t = useT();
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [gdpr, setGdpr]     = useState(false);
  const [errors, setErrors] = useState<{ name?: boolean; email?: boolean; gdpr?: boolean }>({});
  const [done, setDone]     = useState(false);
  const [source, setSource] = useState('');

  useEffect(() => { setSource(captureSource()); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const openGate = () => { setName(''); setEmail(''); setGdpr(false); setErrors({}); setDone(false); setOpen(true); };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = true;
    if (!EMAIL_RE.test(email.trim())) errs.email = true;
    if (!gdpr) errs.gdpr = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // Lead only — the team sends the brochure by email (no direct download).
    // form_origin records WHICH brochure button was used, so the CRM can tell a
    // request made from the closing CTA (further down the funnel) from one made
    // in the footer. Without it every brochure lead reads as "direct".
    sendLead({
      form_type: 'brochure_request',
      form_origin: `brochure: ${variant}`,
      name: name.trim(),
      email: email.trim(),
      gdpr_consent: true,
    });
    // Real page navigation to a unique thank-you URL (clean conversion pageview for GTM).
    window.location.href = '/thank-you/brochure';
  }

  // ── Trigger button ──
  const trigger = variant === 'cta' ? (
    <button type="button" onClick={openGate}
      onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
      onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.45)'; }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 'clamp(36px,4.5vw,52px)', width: 'fit-content',
        fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase',
        color: 'var(--gold)', background: 'transparent', border: '1px solid rgba(201,169,110,0.45)', borderRadius: 100,
        padding: '15px 26px', cursor: 'pointer', transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
      }}>
      {t('br.request')} <MailIcon />
    </button>
  ) : (
    <button type="button" onClick={openGate}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 20,
        fontFamily: ffs, fontSize: 'clamp(11px,1vw,13px)', fontWeight: 300, letterSpacing: '0.06em',
        color: 'var(--gold)', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(201,169,110,0.3)',
        paddingBottom: 2, width: 'fit-content', cursor: 'pointer', transition: 'color 0.3s, border-color 0.3s',
      }}>
      {t('br.request')} <MailIcon />
    </button>
  );

  const inp = (hasErr?: boolean): React.CSSProperties => ({
    width: '100%', background: 'rgba(255,252,248,0.06)',
    border: `1px solid ${hasErr ? 'rgba(206,138,120,0.7)' : 'rgba(201,169,110,0.35)'}`,
    borderRadius: 8, padding: '14px 16px', fontFamily: ff, fontSize: 'clamp(14px,1.3vw,16px)',
    color: 'var(--cream)', outline: 'none', letterSpacing: '0.01em',
  });

  return (
    <>
      {trigger}

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(6,14,8,0.97)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,4vw,48px)', animation: 'fadeIn 0.3s ease both',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 460, textAlign: 'center', background: '#0A1A0D',
            border: '1px solid rgba(201,169,110,0.22)', borderRadius: 'clamp(16px,1.8vw,24px)', padding: 'clamp(34px,5vw,52px)',
            boxShadow: '0 50px 120px -30px rgba(0,0,0,0.9), 0 0 60px -10px var(--gold-glow), inset 0 1px 0 rgba(255,255,255,0.05)',
            maxHeight: '92vh', overflowY: 'auto',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', marginBottom: 'clamp(18px,2.2vw,26px)', border: '1px solid rgba(201,169,110,0.4)', color: 'var(--gold)', background: 'rgba(201,169,110,0.08)' }}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="M2 4l6 4.5L14 4" /></svg>
            </span>

            {done ? (
              <>
                <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(24px,3vw,32px)', color: 'var(--cream)', margin: '0 0 12px' }}>{t('cta.thanks')}</h3>
                <p style={{ fontFamily: ff, fontSize: 'clamp(14px,1.4vw,16px)', lineHeight: 1.75, color: 'var(--cr70)', margin: 0 }}>{t('br.requested')}</p>
              </>
            ) : (
              <>
                <span style={{ display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 12 }}>{t('br.eyebrow')}</span>
                <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(23px,2.8vw,30px)', lineHeight: 1.18, color: 'var(--cream)', margin: '0 0 12px' }}>{t('br.where')}</h3>
                <p style={{ fontFamily: ff, fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.7, color: 'var(--cr70)', margin: '0 0 clamp(22px,2.8vw,30px)' }}>{t('br.enterEmail')}</p>
                <form onSubmit={submit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <input type="hidden" name="source" value={source} readOnly />
                  <input type="text" placeholder={t('cta.ph.name')} value={name}
                    onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: undefined })); }} style={inp(errors.name)} />
                  <input type="email" autoFocus placeholder="your@email.com" value={email}
                    onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: undefined })); }} style={inp(errors.email)} />
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={gdpr}
                      onChange={e => { setGdpr(e.target.checked); if (errors.gdpr) setErrors(p => ({ ...p, gdpr: undefined })); }}
                      style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--gold)', flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ fontFamily: ffs, fontSize: 11, fontWeight: 300, lineHeight: 1.6, color: 'var(--cr70)' }}>
                      {t('enq.gdpr')}{' '}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'underline', textUnderlineOffset: 2 }} onClick={e => e.stopPropagation()}>{t('enq.gdprLink')}</a>.
                    </span>
                  </label>
                  {(errors.email || errors.name || errors.gdpr) && (
                    <p style={{ fontFamily: ffs, fontSize: 10, fontWeight: 300, color: 'rgba(206,138,120,0.95)', margin: 0 }}>
                      {errors.gdpr && !errors.name && !errors.email ? t('enq.err.gdpr') : t('cta.err.email')}
                    </p>
                  )}
                  <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', marginTop: 4, fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--bg)', background: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 100, padding: '16px 30px', cursor: 'pointer' }}>
                    {t('br.request')} <MailIcon />
                  </button>
                </form>
              </>
            )}
          </div>

          <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} aria-label="Close" style={{ position: 'fixed', top: 'clamp(16px,3vw,28px)', right: 'clamp(16px,3vw,28px)', zIndex: 2001, width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(228,217,195,0.30)', background: 'rgba(6,14,8,0.85)', backdropFilter: 'blur(8px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 10 10" fill="none" stroke="var(--cream)" strokeWidth="1.3" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
          </button>
        </div>
      )}
    </>
  );
}
