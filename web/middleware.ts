import { NextResponse, type NextRequest } from 'next/server';

/* ── Content Security Policy ──

   The CRM had no security headers at all, which meant that any script that
   ever found its way onto an admin page — an injected string that rendered
   as markup, a compromised dependency, a browser extension reading the DOM —
   could quietly read the lead list and post it somewhere, using the signed-in
   session to do it. A CSP is the instruction that stops that: the browser
   refuses to run or contact anything the page did not declare.

   Two policies, because this app is two applications sharing a domain.

   The CRM under /admin loads nothing from anywhere else — it is a logo, some
   CSS and its own JavaScript — so it gets the strict one, where the only
   scripts that run are the ones carrying this request's nonce, and the only
   place the page may talk to is itself. That last clause is the one worth
   having: it is what makes exfiltrating the customer list impossible even for
   code that is already running on the page.

   The public site cannot have that policy and should not pretend to. It runs
   Google Tag Manager, whose entire job is loading third-party tags nobody has
   enumerated in advance, plus Leaflet's map tiles and the 3D tour launcher.
   Locking script-src there would break marketing on the day it shipped. So it
   gets the half that costs nothing and still helps: nobody may frame the site,
   inject a <base> tag, or load a plugin. */

const ADMIN_PATHS = ['/admin', '/api/crm', '/portal', '/api/partners'];

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/* 'strict-dynamic' is what lets Next load its own chunks: the one inline
   script that carries the nonce is trusted to pull in the rest, and nothing
   else is — including anything that arrives later by injecting a tag. */
const strict = (n: string) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${n}' 'strict-dynamic'`,
  /* Inline styles stay allowed: Tailwind and the CRM's own components write
     style attributes throughout, and a style attribute cannot exfiltrate a
     lead list. Scripts are where the risk is, and scripts are locked. */
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  /* The clause that matters most: the CRM may talk to this origin and no
     other. Nothing running on an admin page can POST the database anywhere. */
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  'upgrade-insecure-requests',
].join('; ');

const publicSite = [
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  'upgrade-insecure-requests',
].join('; ');

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdmin = ADMIN_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!isAdmin) {
    const res = NextResponse.next();
    res.headers.set('Content-Security-Policy', publicSite);
    return res;
  }

  const n = nonce();
  const policy = strict(n);

  /* Next reads the nonce back out of the CSP on the REQUEST headers and
     stamps it onto the script tags it renders itself. Setting it only on the
     response would produce a correct-looking policy that blocks the app's own
     hydration — which is the failure mode worth naming, because the symptom
     is a page that renders and then does nothing. */
  const headers = new Headers(request.headers);
  headers.set('x-nonce', n);
  headers.set('Content-Security-Policy', policy);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', policy);
  return res;
}

export const config = {
  matcher: [
    /* Everything except static assets and image optimisation, which are files
       on a CDN with no scripts in them and no session to protect. */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
