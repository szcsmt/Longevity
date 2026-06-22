'use client';

import { useEffect, useState } from 'react';

export const CONSENT_KEY = 'lr-cookie-consent';

/* EU-style consent banner. Non-essential storage stays OFF until the visitor
   explicitly chooses "Accept all" — "Only necessary" (and simply ignoring the
   banner) keeps everything off. The choice is stored in localStorage, not a
   cookie, and read back so we never nag a returning visitor.

   The site sets no analytics/marketing storage today; when it does, gate it on
   `localStorage[CONSENT_KEY]` parsing to `{ level: 'all' }`. */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(CONSENT_KEY); } catch { /* storage blocked */ }
    if (!stored) {
      // small delay so it eases in after first paint, not competing with the hero
      const t = setTimeout(() => setShow(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  const choose = (level: 'all' | 'necessary') => {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ level, ts: Date.now(), v: 1 }));
    } catch { /* storage blocked — banner just closes for this session */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent" aria-live="polite">
      <h2>A note on cookies</h2>
      <p>
        We use only strictly necessary storage to make this site work. We&rsquo;d also like your
        consent for optional cookies (used only if we add analytics later). See our{' '}
        <a href="/cookies">Cookie Policy</a>.
      </p>
      <div className="cookie-actions">
        <button type="button" className="cookie-btn cookie-btn-ghost" onClick={() => choose('necessary')}>
          Only necessary
        </button>
        <button type="button" className="cookie-btn cookie-btn-primary" onClick={() => choose('all')}>
          Accept all
        </button>
      </div>
    </div>
  );
}
