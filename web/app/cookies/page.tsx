import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { CookieReset } from '@/components/cookie-reset';

export const metadata: Metadata = {
  title: 'Cookie Policy — Longevity Resort',
  description: 'How this website uses cookies and similar storage, and how to manage your choices.',
};

export default function CookiePage() {
  return (
    <LegalPage title="Cookie Policy" updated="28 July 2026">
      <p>
        This Cookie Policy explains how <strong>Longevity Property Group Limited</strong>{' '}
        (&ldquo;the Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) uses cookies and similar
        storage technologies on https://longevitysamui.com, and how you can control them. It
        should be read together with our <a href="/privacy">Privacy &amp; Data Protection
        Policy</a>, of which it forms part.
      </p>

      <h2>1. What cookies and similar storage are</h2>
      <p>
        Cookies are small text files placed on your device by a website. Similar technologies —
        such as local storage, session storage, pixels and software development kits — serve
        comparable functions. Cookies may be &ldquo;first-party&rdquo; (set by this website) or
        &ldquo;third-party&rdquo; (set by another domain), and &ldquo;session&rdquo; (deleted
        when the browser closes) or &ldquo;persistent&rdquo; (retained for a defined period).
        They are categorised as strictly necessary, functional, analytical/performance or
        advertisement/targeting cookies.
      </p>

      <h2>2. Consent management</h2>
      <p>
        On your first visit, a consent banner operated by the <strong>CookieYes</strong>{' '}
        consent-management platform (deployed via Google Tag Manager) asks for your choices.
        Strictly necessary storage operates without consent, as permitted by applicable law; all
        non-essential categories remain disabled unless and until you enable them. Your consent
        state, including the categories accepted or refused and the time of the consent event,
        is recorded by the consent-management platform in order to demonstrate compliance. Tags
        managed through Google Tag Manager are conditioned on your consent state and are not
        fired for categories you have not accepted.
      </p>

      <h2>3. Cookies used on this website</h2>
      <p>
        The table below is generated and kept up to date automatically by our consent-management
        platform on the basis of periodic scans of this website, and reflects the cookies and
        similar technologies currently in use, their providers, purposes and retention periods.
        It is the same declaration that is accessible from the consent banner.
      </p>
      {/* CookieYes auto-populated cookie declaration — the CookieYes script (loaded
          via GTM) fills this element with the live, categorised cookie audit table. */}
      <div className="cky-audit-table-element" />
      <p>
        If the table is not visible, your browser or an extension may be blocking the
        consent-management script; the declaration can also be viewed through the consent
        banner itself via the &ldquo;Manage cookie preferences&rdquo; control below.
      </p>

      <h2>4. Third-party content</h2>
      <p>
        The Location section of the website embeds an interactive map. Map tiles are loaded from
        a third-party map provider (OpenStreetMap / CARTO), which requires your IP address to be
        transmitted to that provider solely for the delivery of the map images. Aggregate,
        cookieless usage measurement is additionally performed by the website&rsquo;s hosting
        infrastructure (Vercel), which does not involve the placement of cookies or the use of
        advertising identifiers.
      </p>

      <h2>5. Managing your choices</h2>
      <p>
        You may review, change or withdraw your consent at any time using the control below,
        which reopens the consent banner. You may also delete or block cookies through your
        browser settings; please note that blocking strictly necessary storage may affect the
        proper functioning of the website. For further information on the processing of personal
        data collected through cookies, including the legal bases relied upon and your rights,
        please refer to our <a href="/privacy">Privacy &amp; Data Protection Policy</a>.
      </p>
      <p><CookieReset /></p>

      <h2>6. Changes to this Policy</h2>
      <p>
        We may update this Cookie Policy from time to time to reflect changes in the cookies
        used, our service providers or legal requirements. The version published on this page,
        together with its &ldquo;last updated&rdquo; date, is the version in force. The cookie
        table in Section 3 updates automatically and may change without a revision to the date
        of this Policy.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions concerning this Cookie Policy should be addressed to Longevity Property Group
        Limited, No 5, 17/F, Strand 50, 50 Bonham Strand, Sheung Wan, Hong Kong, or by email to{' '}
        <a href="mailto:sales@longevitysamui.com">sales@longevitysamui.com</a>.
      </p>
    </LegalPage>
  );
}
