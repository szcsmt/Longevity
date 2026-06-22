import Link from 'next/link';
import { FooterSection } from '@/components/footer-section';

/* Shared shell for the Privacy / Cookie / Imprint pages — keeps them on-brand
   (dark atmosphere, logo, "back to site") and reuses the site footer. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ background: 'transparent', position: 'relative', minHeight: '100vh' }}>
      <div className="bg-atmosphere" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />

      <header className="legal-topbar">
        <Link href="/" aria-label="Longevity Resort — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LOGO.svg" alt="Longevity Resort" className="legal-logo" />
        </Link>
        <Link href="/" className="legal-back">
          <svg width="16" height="10" viewBox="0 0 18 10" fill="none" aria-hidden="true">
            <path d="M17 5H1M7 1L1 5l6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Back to the site</span>
        </Link>
      </header>

      <article className="legal-wrap legal-prose">
        <span className="legal-eyebrow">Legal</span>
        <h1>{title}</h1>
        <p className="legal-meta">Last updated: {updated}</p>
        {children}
      </article>

      <FooterSection />
    </main>
  );
}
