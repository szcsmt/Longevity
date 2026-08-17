'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { sendLead, captureSource } from '@/lib/source';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
/* Same rule as the main reserve form (cta-section) — one definition of "a usable
   number" across the site, or the two forms would disagree about the same lead. */
const phoneOk = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+\d\s().\-/]+$/.test(v.trim());
};

export const OPEN_ENQUIRY_EVENT = 'lr-open-enquiry';

/** Open the in-place enquiry popup. `origin` records WHERE it was opened (which CTA /
 *  section), so the CRM can attribute and score the lead (hot / warm / cold). */
export function openEnquiry(origin: string) {
  try { window.dispatchEvent(new CustomEvent(OPEN_ENQUIRY_EVENT, { detail: { origin } })); } catch { /* noop */ }
}

type Errors = { name?: string; email?: string; phone?: string; gdpr?: string };

export function EnquiryModal() {
  const t = useT();
  const [open, setOpen]     = useState(false);
  const [origin, setOrigin] = useState('');
  const [sent, setSent]     = useState(false);
  const [form, setForm]     = useState({ name: '', email: '', phone: '', gdpr: false, company: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [source, setSource] = useState('');
  const openedAt = useRef(0);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOrigin((e as CustomEvent).detail?.origin || 'unknown');
      setSource(captureSource());
      setForm({ name: '', email: '', phone: '', gdpr: false, company: '' });
      setErrors({});
      setSent(false);
      openedAt.current = Date.now();
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener(OPEN_ENQUIRY_EVENT, onOpen);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener(OPEN_ENQUIRY_EVENT, onOpen); window.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const update = (k: 'name' | 'email' | 'phone' | 'company') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (k in errors) setErrors(p => ({ ...p, [k]: undefined }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.company) { setOpen(false); return; }                       // honeypot (silent)
    if (Date.now() - openedAt.current < 1200) { setOpen(false); return; } // time trap (silent)
    const errs: Errors = {};
    if (!form.name.trim())    errs.name  = t('cta.err.name');
    if (!emailOk(form.email)) errs.email = t('cta.err.email');
    if (!phoneOk(form.phone)) errs.phone = t('cta.err.phone');
    if (!form.gdpr)           errs.gdpr  = t('enq.err.gdpr');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    sendLead({
      form_type: 'enquiry',
      form_origin: origin,          // where the form was opened (for hot/warm/cold)
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      whatsapp: form.phone.trim(),
      gdpr_consent: true,
    });
    // Real page navigation to a unique thank-you URL (clean conversion pageview for GTM).
    window.location.href = '/thank-you/enquiry';
  }

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,252,248,0.06)', border: '1px solid rgba(201,169,110,0.35)',
    borderRadius: 8, padding: '13px 15px', fontFamily: ff, fontSize: 'clamp(14px,1.3vw,16px)',
    color: 'var(--cream)', outline: 'none', letterSpacing: '0.01em',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 400, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 8,
  };
  const errStyle: React.CSSProperties = { display: 'block', fontFamily: ffs, fontSize: 10, fontWeight: 300, color: 'rgba(206,138,120,0.95)', marginTop: 6 };

  return (
    <div onClick={() => setOpen(false)} data-enquiry="" style={{
      position: 'fixed', inset: 0, zIndex: 2400, background: 'rgba(6,14,8,0.94)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,4vw,48px)',
      animation: 'fadeIn 0.3s ease both',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 460, background: '#0A1A0D', border: '1px solid rgba(201,169,110,0.22)',
        borderRadius: 'clamp(16px,1.8vw,24px)', padding: 'clamp(28px,4vw,44px)', position: 'relative',
        boxShadow: '0 50px 120px -30px rgba(0,0,0,0.9), 0 0 60px -10px var(--gold-glow), inset 0 1px 0 rgba(255,255,255,0.05)',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        <button onClick={() => setOpen(false)} aria-label="Close" style={{
          position: 'absolute', top: 14, right: 14, width: 38, height: 38, borderRadius: '50%',
          border: '1px solid rgba(228,217,195,0.30)', background: 'rgba(6,14,8,0.6)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="var(--cream)" strokeWidth="1.3" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9" /></svg>
        </button>

        {sent ? (
          <div style={{ textAlign: 'center', padding: 'clamp(20px,4vw,40px) 0' }}>
            <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(24px,3vw,32px)', color: 'var(--cream)', margin: '0 0 10px' }}>{t('cta.thanks')}</h3>
            <p style={{ fontFamily: ff, fontSize: 'clamp(14px,1.4vw,16px)', color: 'var(--cr70)', margin: 0 }}>{t('cta.thanksSub')}</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 10 }}>{t('cta.reserve')}</span>
            <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(24px,3vw,34px)', lineHeight: 1.15, color: 'var(--cream)', margin: '0 0 6px' }}>{t('enq.title')}</h3>
            <p style={{ fontFamily: ff, fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.7, color: 'var(--cr70)', margin: '0 0 22px' }}>{t('enq.sub')}</p>

            {/* Honeypot */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden' }}>
              <label>Company<input type="text" name="company_website" tabIndex={-1} autoComplete="off" value={form.company} onChange={update('company')} /></label>
            </div>
            {/* Hidden source — auto-filled from ?source= / ?utm_source= and sent with the lead. */}
            <input type="hidden" name="source" value={source} readOnly />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <label>
                <span style={labelStyle}>{t('cta.form.name')} *</span>
                <input style={inputStyle} type="text" placeholder={t('cta.ph.name')} value={form.name} onChange={update('name')} />
                {errors.name && <span style={errStyle}>{errors.name}</span>}
              </label>
              <label>
                <span style={labelStyle}>{t('cta.form.email')} *</span>
                <input style={inputStyle} type="email" inputMode="email" autoComplete="email" placeholder="your@email.com" value={form.email} onChange={update('email')} />
                {errors.email && <span style={errStyle}>{errors.email}</span>}
              </label>
              <label>
                <span style={labelStyle}>{t('enq.whatsapp')} *</span>
                <input
                  style={errors.phone ? { ...inputStyle, borderColor: 'rgba(206,138,120,0.75)' } : inputStyle}
                  type="tel" inputMode="tel" autoComplete="tel" placeholder="+66 00 000 0000"
                  value={form.phone} onChange={update('phone')}
                />
                {errors.phone && <span style={errStyle}>{errors.phone}</span>}
              </label>

              {/* GDPR consent — required */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.gdpr}
                  onChange={e => { setForm(f => ({ ...f, gdpr: e.target.checked })); if (errors.gdpr) setErrors(p => ({ ...p, gdpr: undefined })); }}
                  style={{ width: 17, height: 17, marginTop: 2, accentColor: 'var(--gold)', flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontFamily: ffs, fontSize: 11.5, fontWeight: 300, lineHeight: 1.6, color: 'var(--cr70)' }}>
                  {t('enq.gdpr')}{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'underline', textUnderlineOffset: 2 }} onClick={e => e.stopPropagation()}>{t('enq.gdprLink')}</a>.
                </span>
              </label>
              {errors.gdpr && <span style={{ ...errStyle, marginTop: -8 }}>{errors.gdpr}</span>}

              <button type="submit" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4,
                fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase',
                color: 'var(--bg)', background: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 100,
                padding: '16px 28px', cursor: 'pointer', boxShadow: '0 0 26px -8px var(--gold-glow)',
              }}>{t('enq.submit')} <ArrowUpRight size={14} /></button>

              <p style={{ fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.06em', color: 'var(--cr40)', lineHeight: 1.6, margin: 0, textAlign: 'center' }}>{t('cta.privacy')}</p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
