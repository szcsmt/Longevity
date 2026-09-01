import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Raleway } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { EnquiryModal } from '@/components/enquiry-modal';
import { SourceTracker } from '@/components/source-tracker';
import { ConsentBanner } from '@/components/consent-banner';
import { SiteTags } from '@/components/site-tags';
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
        <SiteTags />
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
