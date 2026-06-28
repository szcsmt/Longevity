import { Nav }           from '@/components/nav';
import { BehindSection } from '@/components/behind-section';
import { FooterSection } from '@/components/footer-section';

export const metadata = {
  title: 'Partners · Longevity Resort',
  description: 'The developer, architects, builders and partners behind Longevity Resort.',
};

export default function PartnersPage() {
  return (
    <main style={{ background: 'transparent', position: 'relative', minHeight: '100vh' }}>
      <div className="bg-atmosphere" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />
      <Nav />
      {/* Top spacing so the section clears the fixed nav/logo */}
      <div style={{ paddingTop: 'clamp(70px,11vh,130px)' }}>
        <BehindSection />
      </div>
      <FooterSection />
    </main>
  );
}
