import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Raleway } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { EnquiryModal } from '@/components/enquiry-modal';
import { SourceTracker } from '@/components/source-tracker';
import { ConsentBanner } from '@/components/consent-banner';
import { LanguageProvider } from '@/lib/i18n';

// latin-ext covers German/Hungarian/French accents; cyrillic covers Russian.
// (Raleway has no cyrillic subset, so Russian body text falls back to the system
// sans; Chinese falls back to the system CJK font in both.)
const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const raleway = Raleway({
  variable: '--font-raleway',
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Longevity Resort',
  description: 'A private sanctuary for renewal. Koh Samui, Thailand.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#060E08',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${raleway.variable}`}>
      <body>
        {/* ── Consent Mode default: DENIED, before anything else ──

            This must run before GTM, and it does: beforeInteractive puts it in
            the document head while the GTM loader below is afterInteractive.
            Until the visitor decides, Google measures nothing.

            This replaced CookieYes, which was loaded from inside GTM — i.e.
            after GTM itself, which is exactly the timing problem this fixes.
            When removing the CookieYes tag from the GTM container, nothing here
            needs to change. */}
        <Script id="consent-default" strategy="beforeInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',
analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',
security_storage:'granted',wait_for_update:500});`}
        </Script>
        {/* Google Tag Manager (noscript) — immediately after <body> per GTM install */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-PG5LJCZL"
            height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* Google Tag Manager loader — next/script injects it high in the document */}
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PG5LJCZL');`}
        </Script>
        <LanguageProvider>
          {children}
          <EnquiryModal />
          <ConsentBanner />
        </LanguageProvider>
        <SourceTracker />
        <Analytics />
      </body>
    </html>
  );
}
