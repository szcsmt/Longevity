'use client';

import { CONSENT_KEY } from '@/components/cookie-consent';

/* "Manage / withdraw consent" control on the Cookie Policy page — clears the
   stored choice and reloads so the consent banner appears again. */
export function CookieReset() {
  const reset = () => {
    try { localStorage.removeItem(CONSENT_KEY); } catch { /* ignore */ }
    location.reload();
  };
  return (
    <button type="button" className="cookie-reset-btn" onClick={reset}>
      Manage cookie preferences
    </button>
  );
}
