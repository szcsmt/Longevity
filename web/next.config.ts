import type { NextConfig } from 'next';

/* ── Headers ──

   The per-request Content-Security-Policy lives in middleware.ts, because it
   carries a nonce and so has to be built per request. Everything here is the
   same on every response, which makes it cheaper to state once.

   HSTS says "this domain is HTTPS, never try otherwise" for two years, which
   closes the gap where a first request over http:// can be intercepted before
   the redirect. includeSubDomains is safe here: www is the only subdomain and
   it is on Vercel like the apex. `preload` is deliberately NOT set — that one
   is a submission to a list baked into browsers, and it is a great deal
   harder to undo than to add. */

const security = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  /* Stops a browser deciding for itself that an uploaded .txt is really
     JavaScript — the trick that turns a file field into a script host. */
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  /* A lead id in a URL should not travel to another site in a Referer. */
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  /* Hardware this app has no use for, switched off rather than left to a
     dependency to ask for one day. */
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this app. A stray lockfile in the parent folder
  // otherwise makes Turbopack watch the entire Desktop tree (including the
  // crm-deploy-wt copy and its node_modules), which spins the dev server CPU.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      {
        /* Belt and braces with the CSP's frame-ancestors: X-Frame-Options is
           the version old browsers understand, and the CRM has no business
           inside anybody's iframe. Scoped to /admin so the public site can
           still be embedded — a villa page in a partner's listing is a
           feature, not an attack. */
        source: '/admin/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
    ];
  },
};

export default nextConfig;
