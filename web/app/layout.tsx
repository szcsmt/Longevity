import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Raleway } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { EnquiryModal } from '@/components/enquiry-modal';
import { SourceTracker } from '@/components/source-tracker';
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
        {/* CookieYes — Google-certified CMP. MUST load before GTM so it can set the
            Consent Mode defaults (denied) before any tag fires. (Enable "Google
            Consent Mode" in the CookieYes dashboard for the gtag signals.) */}
        <Script id="cookieyes" src="https://cdn-cookieyes.com/client_data/2926553fd3e7d76877f91545cb4ce7c3/script.js" strategy="beforeInteractive" />
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
        </LanguageProvider>
        <SourceTracker />
        <Analytics />
      </body>
    </html>
  );
}
