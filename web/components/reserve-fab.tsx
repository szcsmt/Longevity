'use client';

import { useEffect, useState } from 'react';

/* Persistent "Reserve" call-to-action.
   Follows the visitor through every section: it fades in once they've scrolled
   past the hero, and hides itself while the Reserve/contact section is on screen
   (so it never floats on top of the enquiry form). */
export function ReserveFab() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let reserveInView = false;
    let ticking = false;

    const compute = () => {
      ticking = false;
      const pastHero = window.scrollY > window.innerHeight * 0.85;
      setShow(pastHero && !reserveInView);
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(compute); }
    };

    // Hide the button whenever the reserve section is visible
    const reserveEl = document.getElementById('reserve');
    let io: IntersectionObserver | null = null;
    if (reserveEl) {
      io = new IntersectionObserver(([e]) => {
        reserveInView = e.isIntersecting;
        compute();
      }, { rootMargin: '0px 0px -10% 0px' });
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
    <a
      href="#reserve"
      onClick={handleClick}
      aria-label="Reserve your villa"
      className="reserve-fab"
      data-show={show ? 'true' : 'false'}
    >
      <span>Reserve</span>
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 5h14M10 1l5 4-5 4" />
      </svg>
    </a>
  );
}
