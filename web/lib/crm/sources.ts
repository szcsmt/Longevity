/* ══════════════════ What a lead's source actually was ══════════════════

   `source` is whatever arrived in `?source=` or `utm_source`, unconstrained,
   from a link somebody built months ago. In practice that means `fb`,
   `Facebook`, `FB_ads` and `l.facebook.com` are four rows in a report that only
   has room for eight — so the scattered spelling does not just look untidy, it
   actively HIDES the performance of the channel that produced the most.

   Normalising happens on READ, not on write. The raw value is what we were
   actually told and is never overwritten: attribution is evidence, and the day
   this mapping turns out to be wrong the raw values are still there to redo it
   from. It also means every historical report improves the moment a spelling is
   added below — no migration, no backfill, nothing to run.

   Anything unrecognised lands in `other`, and the reports carry the raw values
   folded into it. An "Other: 14" row that will not say what it contains is how
   a real channel stays invisible. */

export interface SourceDef {
  id: string;
  label: string;
  /** Whole tokens, after stripping punctuation and case. */
  exact?: string[];
  /** Substrings — only ones long enough to be unambiguous. `ig` as a substring
      would match "signup", so short aliases live in `exact` and nowhere else. */
  contains?: string[];
}

/* Order matters: the first definition that matches wins, so the specific ones
   come before the general. */
export const SOURCES: SourceDef[] = [
  { id: 'direct',    label: 'Direct',          exact: ['', 'direct', 'none', 'null', 'undefined'], contains: ['(direct)'] },
  { id: 'google',    label: 'Google',          exact: ['g', 'gads', 'ga', 'sem', 'ppc'], contains: ['google', 'adwords', 'gclid', 'doubleclick'] },
  { id: 'facebook',  label: 'Facebook',        exact: ['fb', 'fbads', 'fbad', 'facebook'], contains: ['facebook', 'fbclid'] },
  { id: 'instagram', label: 'Instagram',       exact: ['ig', 'igads', 'insta'], contains: ['instagram'] },
  { id: 'meta',      label: 'Meta',            exact: ['meta', 'metaads'], contains: ['metaads', 'meta_ads'] },
  { id: 'tiktok',    label: 'TikTok',          exact: ['tt'], contains: ['tiktok'] },
  { id: 'youtube',   label: 'YouTube',         exact: ['yt'], contains: ['youtube', 'youtu.be'] },
  { id: 'linkedin',  label: 'LinkedIn',        exact: ['li'], contains: ['linkedin'] },
  { id: 'portal',    label: 'Property portal', exact: ['portal'], contains: ['fazwaz', 'ddproperty', 'dotproperty', 'thailandproperty', 'rightmove', 'idealista', 'realestate', 'propertyportal', 'hipflat'] },
  { id: 'agency',    label: 'Partner agency',  exact: ['agent', 'agency', 'broker', 'partner'], contains: ['agency', 'broker'] },
  { id: 'referral',  label: 'Referral',        exact: ['referral', 'referrer', 'ref', 'wom', 'friend'], contains: ['referral', 'wordofmouth'] },
  { id: 'event',     label: 'Event / walk-in', exact: ['event', 'walkin', 'expo', 'fair', 'show', 'roadshow'], contains: ['walkin', 'roadshow'] },
  { id: 'email',     label: 'E-mail',          exact: ['email', 'mail', 'newsletter', 'edm'], contains: ['newsletter', 'mailchimp'] },
  { id: 'whatsapp',  label: 'WhatsApp',        exact: ['wa', 'whatsapp'], contains: ['whatsapp', 'wa.me'] },
  { id: 'phone',     label: 'Phone',           exact: ['phone', 'call', 'inboundcall', 'tel'] },
  { id: 'qr',        label: 'QR code',         exact: ['qr', 'qrcode'], contains: ['qrcode'] },
  { id: 'manual',    label: 'Entered by hand', exact: ['manual', 'crm'] },
  { id: 'other',     label: 'Other' },
];

export const OTHER = 'other';

const byId = new Map(SOURCES.map((s) => [s.id, s]));

/** The label to print, falling back to the raw value for anything unmapped. */
export const sourceLabel = (id: string): string => byId.get(id)?.label || id;

/* Two readings of the same string. `token` is for exact matching and throws
   away every separator, so `fb_ads`, `fb-ads` and `FB Ads` are one value.
   `loose` keeps dots and slashes, because `wa.me` and `youtu.be` are the
   patterns people actually paste. */
const token = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, '');
const loose = (raw: string) => raw.toLowerCase().trim();

/** The canonical channel for a raw source value. */
export function sourceKey(raw?: string | null): string {
  const t = token(String(raw ?? ''));
  const l = loose(String(raw ?? ''));
  for (const def of SOURCES) {
    if (def.exact?.includes(t)) return def.id;
  }
  for (const def of SOURCES) {
    if (def.contains?.some((needle) => l.includes(needle) || t.includes(token(needle)))) return def.id;
  }
  return OTHER;
}

/** The raw value a lead was recorded with — `?source=` wins over `utm_source`,
    and a lead with neither came to us directly. */
export const rawSource = (l: { source?: string; utm_source?: string }): string =>
  (l.source || l.utm_source || 'direct').trim();

/** The channel to group a lead under in a report. */
export const leadSource = (l: { source?: string; utm_source?: string }): string =>
  sourceKey(rawSource(l));
