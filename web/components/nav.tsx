'use client';

import { useState } from 'react';

const ffs = 'var(--font-raleway), sans-serif';
const ff  = 'var(--font-playfair), serif';

const links = [
  { label: 'The Estate', href: '#discover' },
  { label: 'The Park',   href: '#park'     },
  { label: 'Villas',     href: '#villas'   },
  { label: 'Personalise', href: '#personalise' },
  { label: 'Location',   href: '#location' },
  { label: 'Reserve',    href: '#reserve'  },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 1000,
        // The bar itself is click-through — only the logo and hamburger below
        // re-enable pointer events. Without this, the transparent bar would
        // silently swallow clicks on anything scrolled beneath the top strip.
        pointerEvents: 'none',
        padding: 'clamp(14px,2vw,24px) clamp(24px,5vw,60px) clamp(14px,2vw,24px) clamp(6px,0.8vw,14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        animation: 'fadeIn 1.8s ease 0.6s both',
      }}>
        {/* Logo */}
        <a href="/" style={{ display: 'block', pointerEvents: 'auto', lineHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/LOGO.svg"
            alt="Longevity Resort"
            style={{ height: 'clamp(58px,6.8vw,92px)', width: 'auto', display: 'block', opacity: 1 }}
          />
        </a>

        {/* Hamburger — two lines */}
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 0',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
            gap: 7, pointerEvents: 'auto',
          }}
        >
          <span style={{
            display: 'block',
            width: open ? 26 : 28,
            height: 1,
            background: 'var(--w90)',
            opacity: open ? 0.55 : 0.75,
            transform: open ? 'translateY(4px) rotate(45deg)' : 'none',
            transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), width 0.3s, opacity 0.3s',
            transformOrigin: 'center',
          }} />
          <span style={{
            display: 'block',
            width: open ? 26 : 20,
            height: 1,
            background: 'var(--w90)',
            opacity: open ? 0.55 : 0.5,
            transform: open ? 'translateY(-4px) rotate(-45deg)' : 'none',
            transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), width 0.3s, opacity 0.3s',
            transformOrigin: 'center',
          }} />
        </button>
      </nav>

      {/* Menu overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 990,
        background: 'rgba(6,14,8,0.97)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(80px,12vw,140px) clamp(40px,8vw,120px)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.45s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(20px,3.5vh,36px)', width: '100%' }}>
          {links.map((lnk, i) => (
            <a
              key={lnk.href}
              href={lnk.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'inline-block',
                fontFamily: ff, fontWeight: 400,
                fontSize: 'clamp(32px,6vw,72px)',
                letterSpacing: '-0.01em',
                color: 'var(--cream)',
                textDecoration: 'none',
                lineHeight: 1,
                opacity: open ? 1 : 0,
                transform: open ? 'translateY(0)' : 'translateY(16px)',
                transition: `opacity 0.55s cubic-bezier(0.16,1,0.3,1) ${i * 70 + 80}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${i * 70 + 80}ms`,
              }}
            >
              <span style={{ display: 'block', fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, marginBottom: 4 }}>0{i + 1}</span>
              {lnk.label}
            </a>
          ))}
        </div>

        <div style={{
          position: 'absolute', bottom: 'clamp(36px,5vh,60px)', left: 'clamp(40px,8vw,120px)',
          opacity: open ? 0.35 : 0,
          transition: 'opacity 0.6s ease 400ms',
        }}>
          <span style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--cream)' }}>
            Koh Samui &nbsp;·&nbsp; Thailand
          </span>
        </div>
      </div>
    </>
  );
}
