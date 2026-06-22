import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { CookieReset } from '@/components/cookie-reset';

export const metadata: Metadata = {
  title: 'Cookie Policy — Longevity Resort',
  description: 'How Longevity Resort uses cookies and similar storage, and how to manage your choices.',
};

export default function CookiePage() {
  return (
    <LegalPage title="Cookie Policy" updated="22 June 2026">
      <p>
        This Cookie Policy explains how <strong>Longevity Resort</strong> uses cookies and
        similar storage technologies on this website, and how you can control them. It should be
        read together with our <a href="/privacy">Privacy &amp; GDPR Policy</a>.
      </p>

      <h2>1. What cookies and similar storage are</h2>
      <p>
        Cookies are small text files stored on your device by a website. Similar technologies,
        such as the browser&rsquo;s local storage, work in the same way. They can be
        &ldquo;strictly necessary&rdquo; (needed for the site to function) or
        &ldquo;non-essential&rdquo; (for example analytics or marketing).
      </p>

      <h2>2. What we currently use</h2>
      <p>
        This site is intentionally light. By default we use <strong>only strictly necessary
        storage</strong>, and we do not load analytics, advertising or social-media tracking
        unless you accept them through the consent banner.
      </p>
      <table>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Purpose</th><th>Duration</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>lr-cookie-consent</td>
            <td>Strictly necessary (local storage)</td>
            <td>Remembers your cookie choice so we don&rsquo;t ask again.</td>
            <td>Until you clear it / 12 months</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Third-party content</h2>
      <p>
        The Location section embeds an interactive map. The map tiles are loaded from a
        third-party map provider (OpenStreetMap / CARTO), which means your IP address is shared
        with that provider purely so the map images can be delivered. The map does not set
        advertising cookies.
      </p>

      <h2>4. Analytics and marketing</h2>
      <p>
        We do not currently run analytics or marketing cookies. If we add them in future, they
        will be listed here and will only run after you give consent for the relevant category
        in the banner.
      </p>

      <h2>5. Managing your choices</h2>
      <p>
        When you first visit, the consent banner lets you choose <strong>&ldquo;Only
        necessary&rdquo;</strong> or <strong>&ldquo;Accept all&rdquo;</strong>. Non-essential
        storage stays off unless you opt in. You can change your decision at any time below, or
        by clearing cookies and site data in your browser settings.
      </p>
      <p><CookieReset /></p>

      <h2>6. Changes</h2>
      <p>
        We may update this policy as the site evolves. The current version, with its
        &ldquo;last updated&rdquo; date, is always shown on this page.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about cookies? Email{' '}
        <a href="mailto:info@longevityresort.com">info@longevityresort.com</a>.
      </p>
    </LegalPage>
  );
}
