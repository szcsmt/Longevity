'use client';

import { useEffect, useState } from 'react';

/* Persistent "Reserve" call-to-action.
   Follows the visitor through every section: it fades in once they've scrolled
   past the hero, and hides itself while the Reserve/contact section is on screen
   (so it never floats on top of the enquiry form). */
const WHATSAPP = 'https://wa.me/66948258673?text=Hello%2C%20I%27d%20like%20to%20learn%20more%20about%20Longevity%20Resort.';

export function ReserveFab() {
  // pastHero: WhatsApp follows the visitor from here on.
  // reserveInView: hide only the contact pill while the enquiry form is on screen.
  const [pastHero, setPastHero] = useState(false);
  const [reserveInView, setReserveInView] = useState(false);

  useEffect(() => {
    let inView = false;
    let ticking = false;
    const heroEl = document.getElementById('hero');

    const compute = () => {
      ticking = false;
      // Only once the whole hero has scrolled past (its bottom above the viewport).
      const afterHero = heroEl
        ? heroEl.getBoundingClientRect().bottom <= 0
        : window.scrollY > window.innerHeight;
      setPastHero(afterHero);
      setReserveInView(inView);
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(compute); }
    };

    const reserveEl = document.getElementById('reserve');
    let io: IntersectionObserver | null = null;
    if (reserveEl) {
      io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; compute(); }, { rootMargin: '0px 0px -10% 0px' });
      io.observe(reserveEl);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    compute();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      io?.disconnect();
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('reserve');
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="fab-stack">
      {/* WhatsApp — follows the visitor, sits above the contact pill */}
      <a
        href={WHATSAPP}
        target="_blank" rel="noopener noreferrer"
        aria-label="Chat with sales on WhatsApp"
        className="fab-wa"
        data-show={pastHero ? 'true' : 'false'}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.42 5.82c0 4.54-3.7 8.24-8.25 8.24-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.24 8.25-8.24zm-3.6 4.43c-.17 0-.45.06-.68.31-.23.25-.9.88-.9 2.15 0 1.27.92 2.49 1.05 2.66.13.17 1.8 2.74 4.37 3.84.61.26 1.09.42 1.46.54.61.2 1.17.17 1.61.1.49-.07 1.5-.61 1.71-1.2.21-.59.21-1.1.15-1.2-.06-.11-.23-.17-.48-.3-.25-.12-1.5-.74-1.73-.82-.23-.08-.4-.12-.57.13-.17.25-.65.82-.8.99-.15.17-.29.19-.54.06-.25-.12-1.06-.39-2.02-1.25-.75-.66-1.25-1.48-1.4-1.73-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.55-1.37-.77-1.87-.2-.49-.4-.42-.55-.43-.14-.01-.3-.01-.46-.01z"/>
        </svg>
      </a>

      {/* Get in Contact — gold pill, hides while the enquiry form is on screen */}
      <a
        href="#reserve"
        onClick={handleClick}
        aria-label="Get in contact"
        className="reserve-fab"
        data-show={pastHero && !reserveInView ? 'true' : 'false'}
      >
        <span>Get in Contact</span>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 5h14M10 1l5 4-5 4" />
        </svg>
      </a>
    </div>
  );
}
