'use client';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const CONTACT_EMAIL = 'info@longevityresort.com';

const legal = [
  { label: 'Privacy & GDPR', href: '#' },
  { label: 'Cookie Policy',  href: '#' },
  { label: 'Imprint',        href: '#' },
];

export function FooterSection() {
  return (
    <footer style={{
      background: 'var(--bg-2)',
      borderTop: '1px solid rgba(201,169,110,0.14)',
      position: 'relative',
    }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: 'clamp(56px,7vw,88px) clamp(24px,8vw,120px) clamp(36px,4vw,52px)',
      }}>

        {/* Top: brand + contact + nav */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'clamp(36px,5vw,72px)',
          alignItems: 'start',
          paddingBottom: 'clamp(40px,5vw,64px)',
          borderBottom: '1px solid rgba(201,169,110,0.10)',
        }}>

          {/* Brand */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO.svg" alt="Longevity Resort" style={{ height: 'clamp(72px,9vw,100px)', width: 'auto', display: 'block', marginBottom: 20, marginLeft: -6 }} />
            <p style={{
              fontFamily: ff, fontStyle: 'italic',
              fontSize: 'clamp(13px,1.2vw,15px)', lineHeight: 1.7,
              color: 'var(--cr40)', margin: 0, maxWidth: 260,
            }}>
              A private sanctuary for renewal.<br />Koh Samui, Thailand.
            </p>
          </div>

          {/* Contact */}
          <div>
            <span style={{
              display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              color: 'var(--gold)', opacity: 0.6, marginBottom: 16,
            }}>Enquiries</span>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{
              fontFamily: ff, fontSize: 'clamp(15px,1.5vw,19px)',
              color: 'var(--cream)', textDecoration: 'none',
              borderBottom: '1px solid rgba(201,169,110,0.35)',
              paddingBottom: 2, transition: 'color 0.3s, border-color 0.3s',
            }}>{CONTACT_EMAIL}</a>
            <p style={{
              fontFamily: ffs, fontSize: 8, fontWeight: 300,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--cr40)', margin: '18px 0 0',
            }}>Bophut · Koh Samui · Thailand</p>
          </div>

          {/* Legal nav */}
          <div>
            <span style={{
              display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              color: 'var(--gold)', opacity: 0.6, marginBottom: 16,
            }}>Legal</span>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {legal.map(({ label, href }) => (
                <a key={label} href={href} style={{
                  fontFamily: ffs, fontSize: 'clamp(11px,1vw,13px)', fontWeight: 300,
                  letterSpacing: '0.06em', color: 'var(--cr70)',
                  textDecoration: 'none', transition: 'color 0.3s', width: 'fit-content',
                }}>{label}</a>
              ))}
            </nav>
          </div>
        </div>

        {/* Bottom: copyright */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px 24px',
          alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 'clamp(28px,3.5vw,40px)',
        }}>
          <span style={{
            fontFamily: ffs, fontSize: 9, fontWeight: 300,
            letterSpacing: '0.1em', color: 'var(--cr40)',
          }}>© 2026 Longevity Resort. All rights reserved.</span>
          <span style={{
            fontFamily: ffs, fontSize: 8, fontWeight: 300,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(228,217,195,0.22)',
          }}>Est. 2025 · Koh Samui</span>
        </div>

      </div>
    </footer>
  );
}
