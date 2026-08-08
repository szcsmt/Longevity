/* ── Cookie consent ──

   Replaces the paid CookieYes CMP with our own, doing the same job: block
   non-essential storage until the visitor agrees, offer per-category choice,
   drive Google Consent Mode v2, keep the decision for a year, and let it be
   changed or withdrawn at any time.

   This is a re-implementation, not a copy — the categories and Consent Mode
   signal names are the industry/Google vocabulary, the code is ours.

   Legal shape (GDPR Art. 6/7 + ePrivacy Art. 5(3)):
     · nothing but strictly necessary storage runs before a choice is made;
     · accept and reject are equally easy — one click each, same prominence;
     · consent is granular per category and withdrawable from the footer;
     · the choice is versioned, so a change to what we run re-asks;
     · every decision is logged server-side as evidence of consent.

   The site itself sets no analytics or advertising cookies directly — those
   come from Google Analytics via GTM. So consent here is enforced by the
   Consent Mode signals below, which GTM and GA4 obey natively. */

export const CONSENT_COOKIE = 'lr_consent';
export const CONSENT_VERSION = 1;        // bump when the cookie set changes
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 12 months, per EDPB guidance

export type Category = 'necessary' | 'preferences' | 'analytics' | 'marketing';

/** What the visitor decided, per category. `necessary` is always true. */
export type Choices = Record<Category, boolean>;

export interface ConsentRecord {
  v: number;        // CONSENT_VERSION at the time of the decision
  at: string;       // ISO instant
  c: Choices;
}

export const ALL_DENIED: Choices = { necessary: true, preferences: false, analytics: false, marketing: false };
export const ALL_GRANTED: Choices = { necessary: true, preferences: true, analytics: true, marketing: true };

/* ── Google Consent Mode v2 ──
   The seven signals Google reads. `security_storage` is strictly necessary and
   always granted; everything else follows the visitor's choice. Sent as
   "default" (denied) before any tag loads, then "update" once they decide. */
export type GoogleSignal =
  | 'ad_storage' | 'ad_user_data' | 'ad_personalization'
  | 'analytics_storage' | 'functionality_storage' | 'personalization_storage'
  | 'security_storage';

export function googleSignals(c: Choices): Record<GoogleSignal, 'granted' | 'denied'> {
  const g = (on: boolean) => (on ? 'granted' as const : 'denied' as const);
  return {
    ad_storage: g(c.marketing),
    ad_user_data: g(c.marketing),
    ad_personalization: g(c.marketing),
    analytics_storage: g(c.analytics),
    functionality_storage: g(c.preferences),
    personalization_storage: g(c.preferences),
    security_storage: 'granted',
  };
}

/** Read the stored decision. Returns null when there is none, or when the
    stored version predates a change to what we run (which re-asks). */
export function readConsent(raw?: string | null): ConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as ConsentRecord;
    if (parsed.v !== CONSENT_VERSION || !parsed.c) return null;
    return { ...parsed, c: { ...ALL_DENIED, ...parsed.c, necessary: true } };
  } catch {
    return null;
  }
}

/* ── The cookie declaration ──

   Kept by hand rather than auto-scanned, because a list that says exactly what
   we run is more honest than one a crawler guessed at. Keep it in step with
   reality; when an entry changes, bump CONSENT_VERSION so visitors re-consent. */
export interface CookieEntry {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  category: Category;
}

export const COOKIE_TABLE: CookieEntry[] = [
  { name: CONSENT_COOKIE, provider: 'longevitysamui.com', category: 'necessary',
    purpose: 'Stores your cookie choices so we do not ask again on every page.', duration: '12 months' },
  { name: 'lr-locale', provider: 'longevitysamui.com (local storage)', category: 'preferences',
    purpose: 'Remembers which language you chose to read the site in.', duration: 'Until cleared' },
  { name: 'lr-source, lr-utm', provider: 'longevitysamui.com (session storage)', category: 'necessary',
    purpose: 'Keeps the campaign you arrived from for the length of your visit, so an enquiry can be attributed correctly.', duration: 'End of session' },
  { name: '_ga, _ga_*', provider: 'Google Analytics', category: 'analytics',
    purpose: 'Counts visits and tells us which pages are read, in aggregate.', duration: '2 years' },
  { name: '_gid', provider: 'Google Analytics', category: 'analytics',
    purpose: 'Distinguishes visitors for a day so a session is counted once.', duration: '24 hours' },
];
