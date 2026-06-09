'use client';

import { useState, useEffect, useRef } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

export function CtaSection() {
  const ref   = useRef<HTMLElement>(null);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', villa: '', note: '' });

  useEffect(() => {
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(228,217,195,0.12)',
    padding: '16px 0',
    fontFamily: ff,
    fontSize: 'clamp(14px,1.3vw,16px)',
    color: 'var(--cream)',
    outline: 'none',
    letterSpacing: '0.01em',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: ffs,
    fontSize: 7,
    fontWeight: 300,
    letterSpacing: '0.26em',
    textTransform: 'uppercase',
    color: 'var(--gold)',
    opacity: 0.55,
    marginBottom: 4,
  };

  return (
    <>
      <style>{`
        .cta-input::placeholder { color: rgba(228,217,195,0.22); font-style: italic; font-family: var(--font-playfair), serif; }
        .cta-input:focus { border-bottom-color: rgba(201,169,110,0.50) !important; }
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
            <div className="reveal" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                ['Private estate', 'Koh Samui, Thailand'],
                ['Limited to 12 villas', 'Each villa individually owned'],
                ['Enquiry within 24 h', 'Personal response guaranteed'],
              ].map(([a, b]) => (
                <div key={a} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ display: 'block', width: 18, height: 1, background: 'var(--gold-40)', flexShrink: 0 }} />
                  <span style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cr40)' }}>{a}</span>
                  <span style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 11, color: 'rgba(228,217,195,0.22)', marginLeft: 4 }}>{b}</span>
                </div>
              ))}
            </div>

            {/* Bottom brand */}
            <span style={{
              display: 'block', marginTop: 'auto', paddingTop: 'clamp(48px,7vw,80px)',
              fontFamily: ffs, fontSize: 7, fontWeight: 300,
              letterSpacing: '0.28em', textTransform: 'uppercase',
              color: 'rgba(228,217,195,0.15)',
            }}>Longevity Resort · Est. 2025</span>
          </div>

          {/* RIGHT — Form */}
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: 'clamp(100px,12vw,160px) clamp(24px,8vw,120px) clamp(80px,10vw,120px) clamp(24px,6vw,80px)',
          }}>

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
              <form className="reveal glass-card" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(28px,3.5vw,40px)', padding: 'clamp(28px,4vw,52px)' }}>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(20px,3vw,36px)' }}>
                  <div>
                    <span style={labelStyle}>Name</span>
                    <input className="cta-input" style={inputStyle} type="text" placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div>
                    <span style={labelStyle}>Email</span>
                    <input className="cta-input" style={inputStyle} type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                  </div>
                </div>

                <div>
                  <span style={labelStyle}>Preferred Villa</span>
                  <select className="cta-input" style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.villa} onChange={e => setForm(f => ({ ...f, villa: e.target.value }))}>
                    <option value="">Any villa</option>
                    <option value="M">Villa M — 76.46 m²</option>
                    <option value="L">Villa L — 79.19 m²</option>
                    <option value="XL">Villa XL — 126.65 m²</option>
                  </select>
                </div>

                <div>
                  <span style={labelStyle}>Message</span>
                  <textarea
                    className="cta-input"
                    style={{ ...inputStyle, resize: 'none', height: 88, paddingTop: 12 }}
                    placeholder="Arrival date, duration, enquiry about ownership…"
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  />
                </div>

                <button type="submit" className="cta-submit">
                  Begin Your Enquiry
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 5h14M10 1l5 4-5 4" />
                  </svg>
                </button>

                <p style={{
                  fontFamily: ffs, fontSize: 7, fontWeight: 300,
                  letterSpacing: '0.14em', color: 'rgba(228,217,195,0.22)',
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
