'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/* ── Google's tags, on the marketing site only ──

   These used to sit in the root layout, which every route inherits — so Tag
   Manager was also running on /admin, on the pages that list buyers by name,
   e-mail and phone number, with the lead id in the URL. GTM's whole purpose
   is loading third-party tags decided elsewhere and later; giving that the
   run of the CRM means the customer database is one container edit away from
   being readable by whatever gets added to it next. Nobody intended that. It
   was inheritance, not a decision.

   So the tags render for the public site and nowhere else. The CRM's Content
   Security Policy refuses third-party script outright, which is what makes
   this a rule rather than a habit: if these ever creep back into a shared
   layout, the CRM stops working rather than quietly leaking.

   Consent Mode still goes first, and now provably so: the default and the
   GTM loader are one script rather than two. They used to be separate tags
   whose order was guaranteed by their strategies — beforeInteractive in the
   head, afterInteractive later. Neither runs in the head from here, and two
   afterInteractive scripts are not promised to execute in render order, so
   the guarantee had to move somewhere it could not slip: the same script. */

const PRIVATE = ['/admin', '/portal'];

const CONSENT_DEFAULT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',
analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',
security_storage:'granted',wait_for_update:500});`;

const GTM_LOADER = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PG5LJCZL');`;

export function SiteTags() {
  const path = usePathname() || '';
  if (PRIVATE.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  return (
    <>
      {/* Google Tag Manager (noscript) */}
      <noscript>
        <iframe
          src="https://www.googletagmanager.com/ns.html?id=GTM-PG5LJCZL"
          height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
      {/* Consent Mode default (DENIED) and then the Tag Manager loader, in
          one script so that nothing can measure anything before being told
          not to. The consent default replaced CookieYes, which GTM used to
          load itself — i.e. after GTM — which is the timing problem this
          fixes. Removing the CookieYes tag from the container needs no change
          here. */}
      <Script id="gtm" strategy="afterInteractive">
        {`${CONSENT_DEFAULT}\n${GTM_LOADER}`}
      </Script>
    </>
  );
}
