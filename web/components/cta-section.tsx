'use client';

import { useState, useEffect, useRef } from 'react';
import { BrochureDownload } from '@/components/brochure-download';
import { useT, richText } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* Real-format checks so the enquiry list stays clean (no junk numbers / addresses) */
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const phoneOk = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+\d\s().\-/]+$/.test(v.trim());
};

export function CtaSection() {
  const t = useT();
  const ref   = useRef<HTMLElement>(null);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', villa: '', note: '', company: '' });
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string }>({});
  // Ownership-path steps: each toggles open/closed on click (step 1 open by default).
  const [openSteps, setOpenSteps] = useState<number[]>([0]);
  const toggleStep = (i: number) =>
    setOpenSteps(o => (o.includes(i) ? o.filter(x => x !== i) : [...o, i]));
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
    if (!form.name.trim())     errs.name  = t('cta.err.name');
    if (!emailOk(form.email))  errs.email = t('cta.err.email');
    if (!phoneOk(form.phone))  errs.phone = t('cta.err.phone');
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
        /* Ownership path: closed steps sit dim; hover hints they're tappable. */
        .cta-step { opacity: 0.34; transition: opacity 0.55s cubic-bezier(0.16,1,0.3,1); }
        .cta-step:hover { opacity: 0.6; }
        .cta-step[data-on="true"] { opacity: 1; }
        .cta-step[data-on="true"]:hover { opacity: 1; }
        .cta-node { transition: background 0.4s, border-color 0.4s, color 0.4s, box-shadow 0.4s; }
        /* When a step opens, its node springs in and pulses a gold ring once. */
        .cta-step[data-on="true"] .cta-node { animation: stepPop 0.55s cubic-bezier(0.34,1.56,0.64,1), stepRing 0.7s ease-out; }
        @keyframes stepPop { 0% { transform: scale(0.55); } 60% { transform: scale(1.14); } 100% { transform: scale(1); } }
        @keyframes stepRing { 0% { box-shadow: 0 0 0 0 rgba(201,169,110,0.55); } 100% { box-shadow: 0 0 0 13px rgba(201,169,110,0); } }
        /* Stacked on tablet/phone: no forced full-height columns + tighter padding so
           the steps and the form sit together without a big empty gap between them. */
        @media (max-width: 900px) {
          .cta-grid { min-height: 0 !important; }
          .cta-grid > div { justify-content: flex-start !important; padding-top: clamp(64px,9vw,96px) !important; padding-bottom: clamp(40px,7vw,64px) !important; }
          .cta-grid > div:last-child { padding-top: clamp(24px,5vw,48px) !important; }
        }
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

        {/* Two-column layout — editorial invitation left, headline + form right.
            The left column is filled (invitation, the three steps, a direct email)
            so the title can sit on the right without leaving a bare column. */}
        <div className="lr-split cta-grid" style={{
          position: 'relative', zIndex: 2,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          minHeight: '100vh',
        }}>

          {/* LEFT — invitation + what happens next */}
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: 'clamp(100px,12vw,160px) clamp(24px,6vw,80px) clamp(80px,10vw,120px) clamp(24px,8vw,120px)',
            borderRight: '1px solid rgba(201,169,110,0.06)',
          }}>
            <span className="reveal" style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.60, marginBottom: 'clamp(18px,2.2vw,28px)' }}>{t('cta.reserve')}</span>

            <span className="reveal" style={{ display: 'block', fontFamily: ff, fontStyle: 'normal', fontSize: 'clamp(20px,2.2vw,30px)', lineHeight: 1.35, color: 'var(--cream)', margin: '0 0 clamp(28px,3.4vw,42px)' }}>
              {richText(t('cta.journeyTitle'), { fontStyle: 'normal' })}
            </span>

            {/* Ownership path — press a step to open it (it springs in + reveals its
                detail); press again to close it. Step 1 is open by default. */}
            <div className="reveal" style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                'cta.step1', 'cta.step2', 'cta.step3', 'cta.step4', 'cta.step5', 'cta.step6',
              ].map((key, i, arr) => {
                const on = openSteps.includes(i);
                const last = i === arr.length - 1;
                const linkOn = on && openSteps.includes(i + 1);   // gold link between two open steps
                return (
                  <button
                    key={key}
                    type="button"
                    className="cta-step"
                    data-on={on ? 'true' : 'false'}
                    aria-expanded={on}
                    onClick={() => toggleStep(i)}
                    style={{ display: 'flex', gap: 'clamp(14px,1.6vw,20px)', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '100%', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {/* node + connector */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <span className="cta-node" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%',
                        border: '1px solid', borderColor: on ? 'var(--gold)' : 'rgba(201,169,110,0.4)',
                        background: on ? 'var(--gold)' : 'transparent',
                        color: on ? 'var(--bg)' : 'var(--gold)', fontFamily: ff, fontSize: 13, flexShrink: 0,
                      }}>{String(i + 1).padStart(2, '0')}</span>
                      {!last && <span style={{ width: 1, flex: 1, minHeight: 'clamp(12px,1.6vw,20px)', background: linkOn ? 'var(--gold)' : 'rgba(201,169,110,0.2)', transition: 'background 0.5s', margin: '4px 0' }} />}
                    </div>
                    {/* content */}
                    <div style={{ flex: 1, paddingBottom: last ? 0 : 'clamp(14px,1.8vw,22px)' }}>
                      <span style={{ display: 'block', fontFamily: ff, fontSize: 'clamp(15px,1.5vw,19px)', color: on ? 'var(--cream)' : 'var(--cr70)', lineHeight: 1.2, transition: 'color 0.4s' }}>{t(`${key}.t`)}</span>
                      <div style={{ display: 'grid', gridTemplateRows: on ? '1fr' : '0fr', transition: 'grid-template-rows 0.5s cubic-bezier(0.16,1,0.3,1)' }}>
                        <div style={{ overflow: 'hidden' }}>
                          <span style={{
                            display: 'block', fontFamily: ffs, fontSize: 'clamp(11px,1vw,12.5px)', fontWeight: 300, color: 'var(--cr70)', lineHeight: 1.6, paddingTop: 5,
                            opacity: on ? 1 : 0, transform: on ? 'translateY(0)' : 'translateY(7px)',
                            transition: 'opacity 0.5s ease 0.08s, transform 0.5s cubic-bezier(0.16,1,0.3,1) 0.08s',
                          }}>{t(`${key}.d`)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <a href="mailto:sales@longevitysamui.com" className="reveal" style={{ fontFamily: ffs, fontSize: 'clamp(11px,1.05vw,13px)', fontWeight: 300, letterSpacing: '0.04em', color: 'var(--gold)', textDecoration: 'none', opacity: 0.85, marginTop: 'clamp(16px,2.2vw,28px)' }}>
              {t('cta.email')} sales@longevitysamui.com
            </a>
          </div>

          {/* RIGHT — headline + form */}
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: 'clamp(100px,12vw,160px) clamp(24px,8vw,120px) clamp(80px,10vw,120px) clamp(24px,6vw,80px)',
          }}>

            <h2 className="reveal" style={{
              fontFamily: ff, fontWeight: 400,
              fontSize: 'clamp(34px,4.4vw,58px)',
              lineHeight: 1.08, letterSpacing: '-0.01em',
              color: 'var(--cream)',
              margin: '0 0 clamp(24px,3.5vw,40px)',
            }}>
              {richText(t('cta.headline'), { fontStyle: 'normal', filter: 'drop-shadow(0 0 28px var(--gold-glow))' })}
            </h2>

            {sent ? (
              <div className="reveal" style={{ width: '100%', textAlign: 'center', padding: 'clamp(40px,5vw,60px)', border: '1px solid rgba(201,169,110,0.14)' }}>
                <span style={{ display: 'block', fontFamily: ff, fontStyle: 'normal', fontSize: 'clamp(22px,2.8vw,32px)', color: 'var(--cream)', marginBottom: 14 }}>
                  {t('cta.thanks')}
                </span>
                <span style={{ fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.20em', color: 'var(--gold)', opacity: 0.7 }}>
                  {t('cta.thanksSub')}
                </span>
              </div>
            ) : (
              <form className="reveal glass-card" onSubmit={handleSubmit} noValidate style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'clamp(22px,3vw,32px)', padding: 'clamp(28px,4vw,52px)' }}>

                {/* Honeypot — invisible to people, irresistible to bots. If filled, the
                    submission is silently dropped. Kept out of the layout + tab order. */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden' }}>
                  <label>Company
                    <input type="text" name="company_website" tabIndex={-1} autoComplete="off" value={form.company} onChange={update('company')} />
                  </label>
                </div>

                <div className="lr-form-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(20px,3vw,36px)' }}>
                  <div>
                    <span style={labelStyle}>{t('cta.form.name')}</span>
                    <input className={`cta-input${errors.name ? ' err' : ''}`} style={inputStyle} type="text" placeholder={t('cta.ph.name')} value={form.name} onChange={update('name')} />
                    {errors.name && <span className="cta-err">{errors.name}</span>}
                  </div>
                  <div>
                    <span style={labelStyle}>{t('cta.form.email')}</span>
                    <input className={`cta-input${errors.email ? ' err' : ''}`} style={inputStyle} type="email" inputMode="email" autoComplete="email" placeholder="your@email.com" value={form.email} onChange={update('email')} />
                    {errors.email && <span className="cta-err">{errors.email}</span>}
                  </div>
                </div>

                <div>
                  <span style={labelStyle}>{t('cta.form.phone')}</span>
                  <input className={`cta-input${errors.phone ? ' err' : ''}`} style={inputStyle} type="tel" inputMode="tel" autoComplete="tel" placeholder="+66 00 000 0000" value={form.phone} onChange={update('phone')} />
                  {errors.phone && <span className="cta-err">{errors.phone}</span>}
                </div>

                <div>
                  <span style={labelStyle}>{t('cta.form.villa')}</span>
                  <select className="cta-input" style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.villa} onChange={update('villa')}>
                    <option value="">{t('cta.ph.anyVilla')}</option>
                    <option value="M">Villa M · 76.46 m²</option>
                    <option value="L">Villa L · 79.19 m²</option>
                    <option value="XL">Villa XL · 126.65 m²</option>
                  </select>
                </div>

                <div>
                  <span style={labelStyle}>{t('cta.form.message')}</span>
                  <textarea
                    className="cta-input"
                    style={{ ...inputStyle, resize: 'none', height: 88, paddingTop: 12 }}
                    placeholder={t('cta.ph.message')}
                    value={form.note}
                    onChange={update('note')}
                  />
                </div>

                <button type="submit" className="cta-submit">
                  {t('cta.submit')}
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 5h14M10 1l5 4-5 4" />
                  </svg>
                </button>

                <p style={{
                  fontFamily: ffs, fontSize: 'clamp(8.5px,0.8vw,10px)', fontWeight: 300,
                  letterSpacing: '0.08em', color: 'var(--cr40)',
                  lineHeight: 1.8, margin: 0,
                }}>
                  {t('cta.privacy')}
                </p>

              </form>
            )}
          </div>

        </div>

        {/* Brochure — moved to the bottom of the section, centred */}
        <div style={{
          position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          padding: '0 clamp(24px,6vw,80px) clamp(64px,9vw,110px)',
        }}>
          <BrochureDownload variant="cta" />
        </div>
      </section>
    </>
  );
}
