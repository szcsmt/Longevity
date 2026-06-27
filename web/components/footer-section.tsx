'use client';

import { BrochureDownload } from '@/components/brochure-download';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

const CONTACT_EMAIL = 'info@longevityresort.com';

// Leading "/" so the anchors also work from the legal pages (jump home, then scroll).
const explore = [
  { label: 'The Park',     href: '/#park'        },
  { label: 'The Villas',   href: '/#villas'      },
  { label: 'Personalise',  href: '/#personalise' },
  { label: 'Location',     href: '/#location'    },
  { label: 'Partners',     href: '/#'            },
  { label: 'Reserve',      href: '/#reserve'     },
];

const legal = [
  { label: 'Privacy & GDPR', href: '/privacy' },
  { label: 'Cookie Policy',  href: '/cookies' },
  { label: 'Imprint',        href: '/imprint' },
];

const colLabel: React.CSSProperties = {
  display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300,
  letterSpacing: '0.26em', textTransform: 'uppercase',
  color: 'var(--gold)', opacity: 0.6, marginBottom: 20,
};

export function FooterSection() {
  return (
    <footer style={{ background: 'var(--bg-2)', position: 'relative' }}>
      {/* Gold hairline accent across the very top */}
      <div aria-hidden="true" style={{
        height: 1, width: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(201,169,110,0.5), transparent)',
      }} />

      <style>{`
        .ft-link { color: var(--cr70); text-decoration: none; transition: color 0.3s, padding-left 0.3s; }
        .ft-link:hover { color: var(--cream); padding-left: 4px; }
        .ft-email:hover { border-color: var(--gold) !important; color: #fff !important; }
      `}</style>

      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: 'clamp(60px,7vw,96px) clamp(24px,8vw,120px) clamp(32px,4vw,48px)',
      }}>

        {/* Top: brand + columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 1.4fr) repeat(3, minmax(150px, 1fr))',
          gap: 'clamp(36px,4vw,64px)',
          alignItems: 'start',
          paddingBottom: 'clamp(44px,5vw,68px)',
          borderBottom: '1px solid rgba(201,169,110,0.10)',
        }} className="lr-footer-grid">

          {/* Brand */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO.svg" alt="Longevity Resort" style={{ height: 'clamp(72px,9vw,104px)', width: 'auto', display: 'block', marginBottom: 22, marginLeft: -6 }} />
            <p style={{
              fontFamily: ff, fontStyle: 'italic',
              fontSize: 'clamp(14px,1.3vw,16px)', lineHeight: 1.7,
              color: 'var(--cr70)', margin: 0, maxWidth: 280,
            }}>
              A private sanctuary for renewal.<br />Plai Laem, Koh Samui.
            </p>
          </div>

          {/* Explore */}
          <div>
            <span style={colLabel}>Explore</span>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {explore.map(({ label, href }) => (
                <a key={label} href={href} className="ft-link" style={{
                  fontFamily: ff, fontSize: 'clamp(14px,1.3vw,16px)', width: 'fit-content',
                }}>{label}</a>
              ))}
            </nav>
          </div>

          {/* Contact */}
          <div>
            <span style={colLabel}>Enquiries</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="ft-email" style={{
              fontFamily: ff, fontSize: 'clamp(15px,1.4vw,18px)',
              color: 'var(--cream)', textDecoration: 'none',
              borderBottom: '1px solid rgba(201,169,110,0.35)',
              paddingBottom: 2, transition: 'color 0.3s, border-color 0.3s',
            }}>{CONTACT_EMAIL}</a>
            <p style={{
              fontFamily: ffs, fontSize: 8, fontWeight: 300,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--cr40)', margin: '18px 0 0', lineHeight: 1.8,
            }}>Plai Laem · Koh Samui · Thailand</p>
            <BrochureDownload variant="footer" />
          </div>

          {/* Legal */}
          <div>
            <span style={colLabel}>Legal</span>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {legal.map(({ label, href }) => (
                <a key={label} href={href} className="ft-link" style={{
                  fontFamily: ffs, fontSize: 'clamp(11px,1vw,13px)', fontWeight: 300,
                  letterSpacing: '0.04em',
                }}>{label}</a>
              ))}
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px 24px',
          alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 'clamp(26px,3.2vw,36px)',
        }}>
          <span style={{ fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.1em', color: 'var(--cr40)' }}>
            © 2026 Longevity Resort. All rights reserved.
          </span>
          <span style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(228,217,195,0.22)' }}>
            Est. 2026 · Koh Samui
          </span>
        </div>

      </div>
    </footer>
  );
}
