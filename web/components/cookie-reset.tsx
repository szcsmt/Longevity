'use client';

/* "Manage / withdraw consent" control on the Cookie Policy page — opens the CookieYes
   consent banner. `cky-banner-element` is the class CookieYes binds its settings
   trigger to. */
export function CookieReset() {
  return (
    <button type="button" className="cookie-reset-btn cky-banner-element">
      Manage cookie preferences
    </button>
  );
}
