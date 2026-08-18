import type { Agency, Lead, VillaRecord } from './types';
import { STAGES } from './types';
import { countryName, leadCountry } from './language';

/* ══════════════════ One search box, three kinds of answer ══════════════════

   The quick search in the sidebar has always filtered the lead list, which is
   the right answer to "where is that buyer" and no answer at all to "which
   agency was Nok at" or "who is holding B12". Both of those are asked out loud
   in this business every week.

   Pure: it takes the data and returns hits, so it can be tested without a
   database and the page decides what to load.

   PHONE NUMBERS are the reason this is not a substring match on a joined
   string. A buyer saved as "+66 81 234 5678" must be found by "0812345678",
   by "81 234 5678" and by "66812345678", because that is how the same number
   arrives from a business card, a WhatsApp export and somebody's memory. The
   digits are compared on their last nine, exactly as duplicate detection has
   always done — one rule, so "the search cannot find it" and "the CRM thinks
   it is a different person" can never disagree. */

export type HitKind = 'lead' | 'agency' | 'unit';

export interface SearchHit {
  kind: HitKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Which field matched, in words — so a hit on a phone number does not look
      like a mysterious one on the name. */
  matched: string;
}

export interface SearchInput {
  leads?: Lead[];
  agencies?: Agency[];
  villas?: Record<string, VillaRecord>;
}

/** Last nine digits, and only when there are enough of them to mean anything.
    The same rule the duplicate check uses. */
export const phoneKey = (s?: string): string => {
  const d = (s || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-9) : '';
};

const norm = (s?: string) => (s || '').trim().toLowerCase();

/** A query that is mostly digits is a phone number somebody is reading out. */
const asPhone = (q: string): string => {
  const digits = q.replace(/\D/g, '');
  return digits.length >= 6 && digits.length >= q.replace(/\s/g, '').length - 2 ? digits : '';
};

const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label || id;

export function search(query: string, data: SearchInput, limit = 40): SearchHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const digits = asPhone(query);
  /* A short query matches on a prefix; a long one anywhere. Typing three
     letters and getting every lead whose notes contain them is not a search,
     it is a shrug. */
  const hit = (value?: string) => {
    const v = norm(value);
    return Boolean(v) && v.includes(q);
  };
  const phoneHit = (value?: string) => {
    if (!digits) return false;
    const key = phoneKey(value);
    const wanted = digits.length >= 8 ? digits.slice(-9) : digits;
    return Boolean(key) && (key.endsWith(wanted) || wanted.endsWith(key));
  };

  const out: SearchHit[] = [];

  for (const l of data.leads || []) {
    const matched =
      hit(l.name) ? 'name'
      : hit(l.email) ? 'e-mail'
      : phoneHit(l.phone) ? 'phone'
      : phoneHit(l.whatsapp) ? 'WhatsApp'
      : hit(l.phone) || hit(l.whatsapp) ? 'phone'
      : hit(l.villa) ? 'residence of interest'
      : '';
    if (!matched) continue;
    out.push({
      kind: 'lead',
      id: l.id,
      title: l.name || l.email || l.phone || 'Unknown',
      subtitle: [
        stageLabel(l.stage),
        l.villa,
        countryName(leadCountry(l)),
        l.owner,
        l.archived_at ? 'archived' : '',
      ].filter(Boolean).join(' · '),
      href: `/admin/leads/${l.id}`,
      matched,
    });
  }

  for (const a of data.agencies || []) {
    /* An agency is found by its own name and by the name of anybody who works
       there — "which agency was Nok at" is the question, and the answer is the
       agency page. */
    const person = a.contacts.find(
      (c) => hit(c.name) || hit(c.email) || phoneHit(c.phone) || phoneHit(c.whatsapp),
    );
    const matched = hit(a.name) ? 'agency name' : person ? `their agent ${person.name}` : hit(a.country) ? 'country' : '';
    if (!matched) continue;
    out.push({
      kind: 'agency',
      id: a.id,
      title: a.name,
      subtitle: [a.country, `${a.contacts.filter((c) => !c.inactive).length} agents`, a.archived_at ? 'archived' : '']
        .filter(Boolean).join(' · '),
      href: `/admin/agencies/${a.id}`,
      matched,
    });
  }

  for (const [id, rec] of Object.entries(data.villas || {})) {
    const matched = norm(id).includes(q) ? 'unit number' : hit(rec.buyerName) ? 'buyer' : '';
    if (!matched) continue;
    out.push({
      kind: 'unit',
      id,
      title: id,
      subtitle: [rec.status, rec.buyerName, rec.contract?.status === 'signed' ? 'contract signed' : '']
        .filter(Boolean).join(' · '),
      href: '/admin/masterplan',
      matched,
    });
  }

  /* Exact-ish matches first, then leads, then everything else. Somebody typing
     a full name wants that person at the top, not a villa whose buyer field
     happens to contain it. */
  const rank = (h: SearchHit) => {
    const exact = norm(h.title) === q ? 0 : 1;
    const kind = h.kind === 'lead' ? 0 : h.kind === 'agency' ? 1 : 2;
    return exact * 10 + kind;
  };
  return out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)).slice(0, limit);
}
