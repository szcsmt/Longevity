'use client';

import { openConsent } from '@/components/consent-banner';

/* "Manage / withdraw consent" control on the Cookie Policy page — reopens our
   own consent banner (lib/consent.ts) with the category switches shown, so a
   visitor can change or withdraw any category as easily as they granted it. */
export function CookieReset() {
  return (
    <button type="button" className="cookie-reset-btn" onClick={openConsent}>
      Manage cookie preferences
    </button>
  );
}
