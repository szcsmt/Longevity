import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Imprint — Longevity Resort',
  description: 'Legal notice and company information for Longevity Resort.',
};

export default function ImprintPage() {
  return (
    <LegalPage title="Imprint" updated="22 June 2026">
      <div className="legal-note">
        <p>
          This legal notice is a base template. The company identity, registration and
          responsible-person details in square brackets must be completed and confirmed by legal
          counsel before the site goes live.
        </p>
      </div>

      <h2>Company information</h2>
      <ul>
        <li><strong>Longevity Property Group LLC</strong></li>
        <li>Hong Kong</li>
        <li>[Registered address]</li>
        <li>[Company / registration number]</li>
        <li>[Managing director / authorised representative]</li>
      </ul>

      <h2>Contact</h2>
      <ul>
        <li>Email: <a href="mailto:sales@longevitysamui.com">sales@longevitysamui.com</a></li>
        <li>Web: <a href="https://longevitysamui.com">longevitysamui.com</a></li>
        <li>Location: Plai Leam, Koh Samui, Thailand</li>
      </ul>

      <h2>Responsible for content</h2>
      <p>[Name and address of the person responsible for the content of this website.]</p>

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
