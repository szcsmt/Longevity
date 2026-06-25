'use client';

import { useState, useEffect, useRef } from 'react';
import { BrochureDownload } from '@/components/brochure-download';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* Real-format checks so the enquiry list stays clean (no junk numbers / addresses) */
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const phoneOk = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+\d\s().\-/]+$/.test(v.trim());
};

export function CtaSection() {
  const ref   = useRef<HTMLElement>(null);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', villa: '', note: '', company: '' });
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string }>({});
  const mountedAt = useRef(0);

  useEffect(() => {
    mountedAt.current = Date.now();   // start the spam time-trap clock on mount
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 110);
        obs.disconnect();
      }, { threshold: 0.06 });
      obs.observe(el);
    });
  }, []);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (k in errors) setErrors(prev => ({ ...prev, [k]: undefined }));   // clear the error as they fix it
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // ── Spam guards (silently accepted so bots get no feedback to learn from) ──
    // 1) Honeypot: a hidden field only an automated script would fill.
    if (form.company) { setSent(true); return; }
    // 2) Time trap: a genuine visitor can't complete the form in under ~2.5s.
    if (Date.now() - mountedAt.current < 2500) { setSent(true); return; }

    // ── Real-person validation ──
    const errs: typeof errors = {};
    if (!form.name.trim())     errs.name  = 'Please enter your name.';
    if (!emailOk(form.email))  errs.email = 'Please enter a valid email address.';
    if (!phoneOk(form.phone))  errs.phone = 'Please enter a valid phone number.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSent(true);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,252,248,0.06)',
    border: '1px solid rgba(201,169,110,0.35)',
    borderRadius: 8,
    padding: '14px 16px',
    fontFamily: ff,
    fontSize: 'clamp(14px,1.3vw,16px)',
    color: 'var(--cream)',
    outline: 'none',
    letterSpacing: '0.01em',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: ffs,
    fontSize: 8,
    fontWeight: 400,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'var(--gold)',
    opacity: 0.85,
    marginBottom: 8,
  };

  return (
    <>
      <style>{`
        .cta-input::placeholder { color: rgba(228,217,195,0.45); font-style: italic; font-family: var(--font-playfair), serif; }
        .cta-input:focus { border-color: rgba(201,169,110,0.75) !important; background: rgba(255,252,248,0.10) !important; }
        .cta-input.err { border-color: rgba(224,138,138,0.8) !important; background: rgba(224,138,138,0.07) !important; }
        .cta-err { display: block; margin-top: 7px; font-family: var(--font-raleway), sans-serif; font-size: 10px; font-weight: 300; letter-spacing: 0.04em; color: rgba(228,160,160,0.92); }
        select.cta-input option { background: #0A1A0D; color: var(--cream); }
        .cta-submit {
          display: flex; align-items: center; justify-content: center; gap: 14px;
          width: 100%;
          padding: 20px 36px;
          border-radius: 100px;
          background: transparent;
          border: 1px solid rgba(201,169,110,0.55);
          cursor: pointer;
          font-family: var(--font-raleway), sans-serif;
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 0.30em;
          text-transform: uppercase;
          color: var(--gold);
          transition: background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s;
          margin-top: 12px;
          animation: goldGlow 3.4s ease-in-out infinite;
        }
        .cta-submit:hover {
          background: var(--gold);
          color: var(--bg);
          border-color: var(--gold);
          box-shadow: 0 0 44px -4px rgba(201,169,110,0.5) !important;
        }
        .cta-submit svg { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1); }
        .cta-submit:hover svg { transform: translateX(5px); }
        form.glass-card:hover { transform: none; }
      `}</style>

      <section id="reserve" ref={ref} style={{
        position: 'relative', overflow: 'hidden',
        background: 'transparent',
      }}>

        {/* Background image — very dark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/sanaila.jpg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            filter: 'brightness(0.18) saturate(0.6)',
            pointerEvents: 'none',
          }}
        />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(6,14,8,0.96) 0%, rgba(6,14,8,0.70) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Two-column layout */}
        <div className="lr-split" style={{
          position: 'relative', zIndex: 2,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          minHeight: '100vh',
        }}>

          {/* LEFT — Editorial invitation */}
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: 'clamp(100px,12vw,160px) clamp(24px,6vw,80px) clamp(80px,10vw,120px) clamp(24px,8vw,120px)',
            borderRight: '1px solid rgba(201,169,110,0.06)',
          }}>

            <span className="reveal" style={{
              display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300,
              letterSpacing: '0.30em', textTransform: 'uppercase',
              color: 'var(--gold)', opacity: 0.60,
              marginBottom: 'clamp(28px,3.5vw,44px)',
            }}>Reserve</span>

            <h2 className="reveal" style={{
              fontFamily: ff, fontWeight: 400,
              fontSize: 'clamp(40px,5.5vw,78px)',
              lineHeight: 1.08, letterSpacing: '-0.01em',
              color: 'var(--cream)',
              margin: '0 0 clamp(24px,3.5vw,40px)',
            }}>
              Your place<br />
              <em className="gold-text" style={{ fontStyle: 'italic', filter: 'drop-shadow(0 0 28px var(--gold-glow))' }}>is waiting.</em>
            </h2>

            <p className="reveal" style={{
              fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
              fontSize: 'clamp(15px,1.5vw,19px)',
              lineHeight: 1.85, color: 'var(--cr40)',
              margin: '0 0 clamp(48px,6vw,72px)',
              maxWidth: 400,
            }}>
              Longevity Resort welcomes a limited number of enquiries from those
              ready to commit to a better life. Begin here.
            </p>

            {/* Details strip */}
            <div className="reveal">
              <span style={{ fontFamily: ffs, fontSize: 'clamp(11px,1.1vw,13px)', fontWeight: 400, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)' }}>Enquiry within 24 h</span>
            </div>

            {/* Brochure download — email-gated */}
            <BrochureDownload variant="cta" />

            {/* Bottom brand */}
            <span style={{
              display: 'block', marginTop: 'auto', paddingTop: 'clamp(48px,7vw,80px)',
              fontFamily: ffs, fontSize: 7, fontWeight: 300,
              letterSpacing: '0.28em', textTransform: 'uppercase',
              color: 'rgba(228,217,195,0.15)',
            }}>Longevity Resort · Est. 2026</span>
          </div>

          {/* RIGHT — Form */}
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: 'clamp(100px,12vw,160px) clamp(24px,8vw,120px) clamp(80px,10vw,120px) clamp(24px,6vw,80px)',
          }}>

            {/* Form heading — gives the enquiry panel a clear invitation */}
            <div className="reveal" style={{ marginBottom: 'clamp(26px,3vw,40px)' }}>
              <span style={{ ...labelStyle, fontSize: 9, letterSpacing: '0.30em', opacity: 0.6, marginBottom: 12 }}>Get in touch</span>
              <h3 style={{
                fontFamily: ff, fontWeight: 400, fontSize: 'clamp(28px,3.4vw,46px)',
                lineHeight: 1.1, letterSpacing: '-0.01em', color: 'var(--cream)', margin: '0 0 12px',
              }}>
                We&rsquo;re ready<br /><em className="gold-text" style={{ fontStyle: 'italic' }}>when you are.</em>
              </h3>
              <p style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(14px,1.4vw,17px)', lineHeight: 1.7, color: 'var(--cr70)', margin: 0, maxWidth: 380 }}>
                Leave your name, email and phone, and we will reply within 24 hours.
              </p>
            </div>

            {sent ? (
              <div className="reveal" style={{ textAlign: 'center', padding: 'clamp(40px,5vw,60px)', border: '1px solid rgba(201,169,110,0.14)' }}>
                <span style={{ display: 'block', fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(22px,2.8vw,32px)', color: 'var(--cream)', marginBottom: 14 }}>
                  Thank you.
                </span>
                <span style={{ fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.20em', color: 'var(--gold)', opacity: 0.7 }}>
                  We will be in touch within 24 hours.
                </span>
              </div>
            ) : (
              <form className="reveal glass-card" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(22px,3vw,32px)', padding: 'clamp(28px,4vw,52px)' }}>

                {/* Honeypot — invisible to people, irresistible to bots. If filled, the
                    submission is silently dropped. Kept out of the layout + tab order. */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden' }}>
                  <label>Company
                    <input type="text" name="company_website" tabIndex={-1} autoComplete="off" value={form.company} onChange={update('company')} />
                  </label>
                </div>

                <div className="lr-form-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(20px,3vw,36px)' }}>
                  <div>
                    <span style={labelStyle}>Name</span>
                    <input className={`cta-input${errors.name ? ' err' : ''}`} style={inputStyle} type="text" placeholder="Your name" value={form.name} onChange={update('name')} />
                    {errors.name && <span className="cta-err">{errors.name}</span>}
                  </div>
                  <div>
                    <span style={labelStyle}>Email</span>
                    <input className={`cta-input${errors.email ? ' err' : ''}`} style={inputStyle} type="email" inputMode="email" autoComplete="email" placeholder="your@email.com" value={form.email} onChange={update('email')} />
                    {errors.email && <span className="cta-err">{errors.email}</span>}
                  </div>
                </div>

                <div>
                  <span style={labelStyle}>Phone</span>
                  <input className={`cta-input${errors.phone ? ' err' : ''}`} style={inputStyle} type="tel" inputMode="tel" autoComplete="tel" placeholder="+66 00 000 0000" value={form.phone} onChange={update('phone')} />
                  {errors.phone && <span className="cta-err">{errors.phone}</span>}
                </div>

                <div>
                  <span style={labelStyle}>Preferred Villa</span>
                  <select className="cta-input" style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.villa} onChange={update('villa')}>
                    <option value="">Any villa</option>
                    <option value="M">Villa M · 76.46 m²</option>
                    <option value="L">Villa L · 79.19 m²</option>
                    <option value="XL">Villa XL · 126.65 m²</option>
                  </select>
                </div>

                <div>
                  <span style={labelStyle}>Message</span>
                  <textarea
                    className="cta-input"
                    style={{ ...inputStyle, resize: 'none', height: 88, paddingTop: 12 }}
                    placeholder="Arrival date, duration, enquiry about ownership…"
                    value={form.note}
                    onChange={update('note')}
                  />
                </div>

                <button type="submit" className="cta-submit">
                  Begin Your Enquiry
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 5h14M10 1l5 4-5 4" />
                  </svg>
                </button>

                <p style={{
                  fontFamily: ffs, fontSize: 'clamp(8.5px,0.8vw,10px)', fontWeight: 300,
                  letterSpacing: '0.08em', color: 'var(--cr40)',
                  lineHeight: 1.8, margin: 0,
                }}>
                  Your information is kept strictly private. No marketing. No third parties.
                </p>

              </form>
            )}
          </div>

        </div>
      </section>
    </>
  );
}
