'use client';

import { useState, useEffect } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const PDF = '/brochure/longevity-brochure-2026.pdf';
// Reasonable client-side check — only well-formed addresses are accepted.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 1v9M3.5 6.5L7 10l3.5-3.5M2 12.5h10" />
  </svg>
);

/** "Download brochure" button that first asks for a valid email, then downloads. */
export function BrochureDownload({ variant }: { variant: 'cta' | 'footer' }) {
  const [open, setOpen]   = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [done, setDone]   = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const openGate = () => { setEmail(''); setError(false); setDone(false); setOpen(true); };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError(true); return; }
    setError(false);
    const a = document.createElement('a');
    a.href = PDF;
    a.download = 'Longevity-Resort-Brochure-2026.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setDone(true);
  }

  // ── Trigger button (styled to match its context) ──
  const trigger = variant === 'cta' ? (
    <button
      type="button"
      onClick={openGate}
      onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
      onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.45)'; }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        marginTop: 'clamp(36px,4.5vw,52px)', width: 'fit-content',
        fontFamily: ffs, fontSize: 9, fontWeight: 300,
        letterSpacing: '0.26em', textTransform: 'uppercase',
        color: 'var(--gold)', background: 'transparent',
        border: '1px solid rgba(201,169,110,0.45)', borderRadius: 100,
        padding: '15px 26px', cursor: 'pointer',
        transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
      }}
    >
      Download the brochure
      <DownloadIcon />
    </button>
  ) : (
    <button
      type="button"
      onClick={openGate}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 20,
        fontFamily: ffs, fontSize: 'clamp(11px,1vw,13px)', fontWeight: 300,
        letterSpacing: '0.06em', color: 'var(--gold)', background: 'transparent',
        border: 'none', borderBottom: '1px solid rgba(201,169,110,0.3)', paddingBottom: 2,
        width: 'fit-content', cursor: 'pointer',
        transition: 'color 0.3s, border-color 0.3s',
      }}
    >
      Download brochure (PDF)
      <DownloadIcon />
    </button>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,252,248,0.06)',
    border: `1px solid ${error ? 'rgba(206,138,120,0.7)' : 'rgba(201,169,110,0.35)'}`,
    borderRadius: 8, padding: '14px 16px',
    fontFamily: ff, fontSize: 'clamp(14px,1.3vw,16px)', color: 'var(--cream)',
    outline: 'none', letterSpacing: '0.01em',
  };

  return (
    <>
      {trigger}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(6,14,8,0.97)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'clamp(16px,4vw,48px)', animation: 'fadeIn 0.3s ease both',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 460, textAlign: 'center',
              background: '#0A1A0D', border: '1px solid rgba(201,169,110,0.22)',
              borderRadius: 'clamp(16px,1.8vw,24px)', padding: 'clamp(34px,5vw,52px)',
              boxShadow: '0 50px 120px -30px rgba(0,0,0,0.9), 0 0 60px -10px var(--gold-glow), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', marginBottom: 'clamp(18px,2.2vw,26px)', border: '1px solid rgba(201,169,110,0.4)', color: 'var(--gold)', background: 'rgba(201,169,110,0.08)' }}>
              <svg width="22" height="22" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1v9M3.5 6.5L7 10l3.5-3.5M2 12.5h10" /></svg>
            </span>

            {done ? (
              <>
                <h3 style={{ fontFamily: ff, fontWeight: 400, fontStyle: 'italic', fontSize: 'clamp(24px,3vw,32px)', color: 'var(--cream)', margin: '0 0 12px' }}>
                  Thank you.
                </h3>
                <p style={{ fontFamily: ff, fontSize: 'clamp(14px,1.4vw,16px)', lineHeight: 1.75, color: 'var(--cr70)', margin: '0 0 clamp(24px,3vw,32px)' }}>
                  Your brochure is downloading. If it doesn&rsquo;t start automatically,
                  use the button below.
                </p>
                <a
                  href={PDF}
                  download="Longevity-Resort-Brochure-2026.pdf"
                  onClick={() => setOpen(false)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--bg)', background: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 100, padding: '15px 30px', textDecoration: 'none', cursor: 'pointer' }}
                >
                  Download again
                  <DownloadIcon />
                </a>
              </>
            ) : (
              <>
                <span style={{ display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 12 }}>
                  Longevity Resort · Brochure 2026
                </span>
                <h3 style={{ fontFamily: ff, fontWeight: 400, fontStyle: 'italic', fontSize: 'clamp(23px,2.8vw,30px)', lineHeight: 1.18, color: 'var(--cream)', margin: '0 0 12px' }}>
                  Where shall we send it?
                </h3>
                <p style={{ fontFamily: ff, fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.7, color: 'var(--cr70)', margin: '0 0 clamp(22px,2.8vw,30px)' }}>
                  Enter your email to receive the full brochure. We only accept valid
                  addresses, and your details stay strictly private.
                </p>
                <form onSubmit={submit}>
                  <input
                    type="email"
                    autoFocus
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); if (error) setError(false); }}
                    style={inputStyle}
                  />
                  {error && (
                    <p style={{ fontFamily: ffs, fontSize: 10, fontWeight: 300, letterSpacing: '0.04em', color: 'rgba(206,138,120,0.95)', margin: '10px 0 0', textAlign: 'left' }}>
                      Please enter a valid email address.
                    </p>
                  )}
                  <button
                    type="submit"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', marginTop: 'clamp(18px,2.2vw,24px)', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--bg)', background: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 100, padding: '16px 30px', cursor: 'pointer' }}
                  >
                    Download the brochure
                    <DownloadIcon />
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
