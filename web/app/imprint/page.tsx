import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Imprint — Longevity Resort',
  description: 'Legal notice and company information for Longevity Resort.',
};

export default function ImprintPage() {
  return (
    <LegalPage title="Imprint" updated="28 July 2026">
      <h2>Company information</h2>
      <ul>
        <li><strong>Longevity Property Group Limited</strong></li>
        <li>No 5, 17/F, Strand 50, 50 Bonham Strand</li>
        <li>Sheung Wan, Hong Kong</li>
        <li>A company incorporated in the Hong Kong Special Administrative Region</li>
      </ul>

      <h2>Contact</h2>
      <ul>
        <li>Email: <a href="mailto:sales@longevitysamui.com">sales@longevitysamui.com</a></li>
        <li>Web: <a href="https://longevitysamui.com">longevitysamui.com</a></li>
        <li>Development location: Plai Laem, Koh Samui, Thailand</li>
      </ul>

      <h2>Responsible for content</h2>
      <p>
        Longevity Property Group Limited, No 5, 17/F, Strand 50, 50 Bonham Strand, Sheung Wan,
        Hong Kong.
      </p>

      <h2>Hosting</h2>
      <p>
        This website is hosted by Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA.
      </p>

      <h2>Liability for content</h2>
      <p>
        We prepare the content of this site with care, but we cannot guarantee that it is always
        accurate, complete or up to date. Renderings, visuals and indicative figures shown on the
        site are illustrative and do not form part of any contract or binding offer.
      </p>

      <h2>Liability for links</h2>
      <p>
        This site may contain links to external websites operated by third parties. We have no
        control over their content and accept no responsibility for it. Responsibility lies with
        the respective operators.
      </p>

      <h2>Copyright</h2>
      <p>
        © 2026 Longevity Resort. All content on this website (text, images, renderings, logo and
        design) is protected by copyright. Any use beyond what copyright law permits requires our
        prior written consent.
      </p>
    </LegalPage>
  );
}
