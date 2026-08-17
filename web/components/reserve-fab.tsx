'use client';

import { useEffect, useState } from 'react';
import { openEnquiry } from '@/components/enquiry-modal';
import { useT } from '@/lib/i18n';

/* Persistent "Reserve" call-to-action.
   Follows the visitor through every section: it fades in once they've scrolled
   past the hero, and hides itself while the Reserve/contact section is on screen
   (so it never floats on top of the enquiry form).

   There is no phone route out of the site on purpose: every enquiry arrives
   through the form, so it lands in the CRM with its page, language and campaign
   attached instead of as a bare number on someone's handset. */

export function ReserveFab() {
  const t = useT();
  // pastHero: the pill follows the visitor from here on.
  // reserveInView: hide the contact pill while the enquiry form is on screen.
  const [pastHero, setPastHero] = useState(false);
  const [reserveInView, setReserveInView] = useState(false);

  useEffect(() => {
    let inView = false;
    let ticking = false;
    const heroEl = document.getElementById('hero');

    // Appear exactly when the hero's own buttons fade out (the hero fades them at
    // ~78% of its scrub; same formula here so the hand-off lines up). Cached so the
    // scroll path never reads layout.
    let threshold = window.innerHeight;
    const measure = () => {
      threshold = heroEl
        ? heroEl.offsetTop + Math.max(0, heroEl.offsetHeight - window.innerHeight) * 0.78
        : window.innerHeight;
    };

    const compute = () => {
      ticking = false;
      setPastHero(window.scrollY > threshold);
      setReserveInView(inView);
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(compute); }
    };
    const onResize = () => { measure(); onScroll(); };

    const reserveEl = document.getElementById('reserve');
    let io: IntersectionObserver | null = null;
    if (reserveEl) {
      io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; compute(); }, { rootMargin: '0px 0px -10% 0px' });
      io.observe(reserveEl);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    measure();
    compute();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      io?.disconnect();
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openEnquiry('fab');   // open the enquiry popup in place instead of scrolling to the bottom
  };

  return (
    <div className="fab-stack">
      {/* Get in Contact — gold pill, hides while the enquiry form is on screen */}
      <a
        href="#reserve"
        onClick={handleClick}
        aria-label="Get in contact"
        className="reserve-fab"
        data-show={pastHero && !reserveInView ? 'true' : 'false'}
      >
        <span>{t('fab.contact')}</span>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 5h14M10 1l5 4-5 4" />
        </svg>
      </a>
    </div>
  );
}
