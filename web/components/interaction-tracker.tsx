'use client';

import { useEffect } from 'react';
import { captureSource } from '@/lib/source';

/* One global listener that captures every meaningful click on the live site and
   logs it to the CRM as an interaction event — so opening a form, tapping
   WhatsApp/phone, or downloading the brochure "appears" even without a full
   submission. No per-component wiring needed. Add data-notrack to opt an
   element out, or data-track="Label" to override its label. */
export function InteractionTracker() {
  useEffect(() => {
    // One "visit" per browser session — real visitor counting for the CRM
    // dashboard. Label carries where they came from (referrer host / direct).
    try {
      if (!sessionStorage.getItem('lr-visit')) {
        sessionStorage.setItem('lr-visit', '1');
        let from = 'direct';
        try {
          if (document.referrer) {
            const h = new URL(document.referrer).hostname;
            if (h && !h.includes(location.hostname)) from = h.replace(/^www\./, '');
          }
        } catch { /* keep 'direct' */ }
        fetch('/api/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({ type: 'visit', label: from, path: location.pathname, source: captureSource() }),
        });
      }
    } catch { /* best-effort */ }

    let lastKey = '';
    let lastAt = 0;

    function onClick(e: MouseEvent) {
      const start = e.target as HTMLElement | null;
      const el = start?.closest?.('a, button, [role="button"], [data-track]') as HTMLElement | null;
      if (!el || el.hasAttribute('data-notrack')) return;

      const label = (
        el.getAttribute('data-track') ||
        el.getAttribute('aria-label') ||
        (el.textContent || '').replace(/\s+/g, ' ').trim()
      ).slice(0, 80);
      if (!label) return;

      const href = el.getAttribute?.('href') || '';
      let type = 'click';
      if (href.startsWith('mailto:')) type = 'email';
      else if (href.startsWith('tel:')) type = 'phone';
      else if (/wa\.me|whatsapp/i.test(href)) type = 'whatsapp';
      else if (/\.pdf|brochure|download/i.test(href)) type = 'brochure';
      else if (/reserve|enquir|brochure|contact|book|request/i.test(label)) type = 'form_open';

      const key = type + '|' + label;
      const t = Date.now();
      if (key === lastKey && t - lastAt < 900) return; // de-dupe rapid repeats
      lastKey = key;
      lastAt = t;

      try {
        fetch('/api/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true, // survive the navigation on brochure download etc.
          body: JSON.stringify({ type, label, path: location.pathname, source: captureSource() }),
        });
      } catch {
        /* best-effort */
      }
    }

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
