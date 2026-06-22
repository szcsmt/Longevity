import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy & GDPR — Longevity Resort',
  description: 'How Longevity Resort collects, uses and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy & GDPR" updated="22 June 2026">
      <div className="legal-note">
        <p>
          This policy is a base template prepared for the Longevity Resort website. The
          company details in square brackets and the final wording should be confirmed by
          legal counsel before the site goes live.
        </p>
      </div>

      <p>
        This Privacy Policy explains how <strong>Longevity Resort</strong> (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects, uses and protects your personal data when
        you visit this website or contact us, in line with the EU General Data Protection
        Regulation (GDPR) and applicable local law.
      </p>

      <h2>1. Who is responsible for your data</h2>
      <p>The data controller for this website is:</p>
      <ul>
        <li><strong>[Legal entity name]</strong></li>
        <li>[Registered address]</li>
        <li>[Company / registration number, if applicable]</li>
        <li>Email: <a href="mailto:info@longevityresort.com">info@longevityresort.com</a></li>
      </ul>

      <h2>2. What data we collect</h2>
      <p>We only collect data you choose to give us, plus the minimum needed to run the site securely:</p>
      <ul>
        <li><strong>Enquiry form:</strong> your name, email address, preferred villa and any message you send through the &ldquo;Reserve&rdquo; form.</li>
        <li><strong>Brochure download:</strong> the email address you enter to receive the brochure.</li>
        <li><strong>Technical data:</strong> standard server and security logs (for example IP address, browser type, pages viewed) created automatically when any website is accessed.</li>
      </ul>
      <p>We do not knowingly collect special-category data, and the site is not intended for children.</p>

      <h2>3. Why we use your data and our legal basis</h2>
      <table>
        <thead>
          <tr><th>Purpose</th><th>Legal basis (GDPR Art. 6)</th></tr>
        </thead>
        <tbody>
          <tr><td>Responding to your enquiry and providing information you request</td><td>Steps taken at your request prior to a contract — Art. 6(1)(b)</td></tr>
          <tr><td>Sending the brochure you asked for</td><td>Consent — Art. 6(1)(a)</td></tr>
          <tr><td>Operating, securing and improving the website</td><td>Legitimate interests — Art. 6(1)(f)</td></tr>
          <tr><td>Meeting legal and accounting obligations</td><td>Legal obligation — Art. 6(1)(c)</td></tr>
        </tbody>
      </table>
      <p>
        We do not send marketing emails or share your data with third parties for their own
        marketing, as stated next to the enquiry form.
      </p>

      <h2>4. Cookies and similar technologies</h2>
      <p>
        We use only strictly necessary storage by default and ask for your choice through a
        consent banner. Full details are in our <a href="/cookies">Cookie Policy</a>.
      </p>

      <h2>5. Who we share your data with</h2>
      <p>We may share data with trusted service providers who process it on our behalf, under contract:</p>
      <ul>
        <li><strong>Website hosting / infrastructure:</strong> Vercel Inc.</li>
        <li><strong>Email and enquiry handling:</strong> [email provider]</li>
        <li><strong>Customer relationship management (CRM):</strong> [CRM provider, e.g. Zoho Bigin — if used]</li>
      </ul>
      <p>We may also disclose data where required by law or to protect our legal rights.</p>

      <h2>6. International transfers</h2>
      <p>
        Some providers may process data outside the European Economic Area. Where that happens,
        we rely on appropriate safeguards such as the European Commission&rsquo;s Standard
        Contractual Clauses or an adequacy decision.
      </p>

      <h2>7. How long we keep your data</h2>
      <p>
        We keep enquiry and brochure data only as long as needed to handle your request and for
        a reasonable follow-up period, then delete or anonymise it, unless a longer period is
        required by law. Security logs are kept for a short, limited period.
      </p>

      <h2>8. Your rights</h2>
      <p>Under the GDPR you have the right to:</p>
      <ul>
        <li>access the personal data we hold about you;</li>
        <li>have inaccurate data corrected;</li>
        <li>have your data erased;</li>
        <li>restrict or object to processing;</li>
        <li>data portability;</li>
        <li>withdraw consent at any time, without affecting prior processing;</li>
        <li>lodge a complaint with a data protection supervisory authority.</li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{' '}
        <a href="mailto:info@longevityresort.com">info@longevityresort.com</a>.
      </p>

      <h2>9. How we protect your data</h2>
      <p>
        We use appropriate technical and organisational measures to protect your data against
        unauthorised access, loss or misuse. No method of transmission over the internet is
        fully secure, but we work to keep your data safe.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The current version is always available on
        this page, with the &ldquo;last updated&rdquo; date shown above.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this policy or your data? Email{' '}
        <a href="mailto:info@longevityresort.com">info@longevityresort.com</a>. You also have the
        right to complain to the supervisory authority in your country of residence.
      </p>
    </LegalPage>
  );
}
