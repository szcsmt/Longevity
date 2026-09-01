import type { Lead, VillaRecord } from './types';
import { extraState } from './types';
import { competingClaims } from './rules';
import type { HeldUnit, IntegrityIssue } from './store';

/* ══════════════════ What is waiting on the owner ══════════════════

   The CRM had grown several things that need a person to decide something, and
   each of them lived on whichever screen happened to produce it: an extra a
   buyer asked for sat on a villa, a hold that had run out sat on Payments, two
   agencies claiming the same buyer sat on that buyer's page. Every one of them
   is invisible unless somebody happens to open the right screen.

   A decision nobody is shown is a decision nobody makes. This gathers them.

   Deliberately only things that need a HUMAN CHOICE — not work, not chasing.
   "Ring this lead" belongs on Today; "do we build them a podcast studio, and
   for how much" belongs here, because until somebody says yes or no the
   answer is neither. */

export type DecisionKind =
  | 'extra'            // a buyer asked for something; nobody has said yes or no
  | 'lapsed-hold'      // the reservation ran out — extend it or let the villa go
  | 'competing-claim'  // two agencies say they introduced the same buyer
  | 'integrity';       // a figure that is quietly wrong until somebody says which record is right

export interface Decision {
  kind: DecisionKind;
  /** What has to be decided, in the words the person deciding would use. */
  title: string;
  detail: string;
  /** Where the decision gets made. */
  href: string;
  /** How long it has been waiting, in days. Null when there is no start date. */
  waitingDays: number | null;
  /** THB, when the decision has a number attached to it. */
  amount?: number;
}

const daysSince = (iso?: string): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

export interface DecisionInput {
  villas: Record<string, VillaRecord>;
  leads: Lead[];
  holds: HeldUnit[];
  issues: IntegrityIssue[];
}

/* The issue kinds are internal names — 'held-without-buyer' — and they were
   being printed straight onto the screen. */
const ISSUE_LABEL: Record<string, string> = {
  'dangling-buyer':     'a vevő leadje eltűnt',
  'archived-buyer':     'a vevő leadje archiválva',
  'held-without-buyer': 'nincs megnevezve a vevő',
  'lead-without-owner': 'nincs felelős értékesítő',
  'unit-without-price': 'nincs ár a lakáson',
};

export function decisions({ villas, leads, holds, issues }: DecisionInput): Decision[] {
  const out: Decision[] = [];

  /* Extras nobody has answered. The oldest first, because an extra that has sat
     for three weeks is one somebody has already been promised verbally. */
  for (const [id, rec] of Object.entries(villas)) {
    for (const x of rec.extras || []) {
      if (extraState(x) !== 'pending') continue;
      out.push({
        kind: 'extra',
        title: `${id} · ${x.label}`,
        detail: `${rec.buyerName || 'A vevő'} kérte${x.price ? '' : ' — árazatlan'}`,
        href: '/admin/masterplan',
        waitingDays: daysSince(x.requested_at),
        amount: x.price,
      });
    }
  }

  /* A hold that has run out is a villa that is neither sold nor on the market.
     Every day it sits there is a day nobody can sell it. */
  for (const h of holds) {
    if (h.state !== 'lapsed') continue;
    out.push({
      kind: 'lapsed-hold',
      title: `${h.id} · lejárt foglalás`,
      detail: `${h.buyerName || 'Névtelen vevő'} · ${h.depositPaid ? 'előleg megérkezett' : 'előleg nem érkezett meg'}`,
      href: '/admin/finance',
      waitingDays: h.daysLeft === null ? null : Math.abs(h.daysLeft),
      amount: h.amount,
    });
  }

  /* Two agencies claiming one buyer. Whoever decides this decides who gets
     paid, and it does not decide itself. */
  for (const l of leads) {
    const claims = competingClaims(l);
    if (claims.length < 2) continue;
    out.push({
      kind: 'competing-claim',
      title: `${l.name || 'Névtelen lead'} · két ügynökség`,
      detail: claims.map((c) => c.agencyName).join(' vs '),
      href: `/admin/leads/${l.id}`,
      waitingDays: daysSince(claims[claims.length - 1].at),
    });
  }

  for (const i of issues) {
    out.push({
      kind: 'integrity',
      title: i.villaId ? `${i.villaId} · ${ISSUE_LABEL[i.kind] || i.kind}` : (ISSUE_LABEL[i.kind] || i.kind),
      detail: i.detail,
      href: i.leadId ? `/admin/leads/${i.leadId}` : '/admin/masterplan',
      waitingDays: null,
    });
  }

  /* Longest-waiting first. Something that has sat for a month is not more
     important than something from this morning — it is more embarrassing, and
     that is the better sort of ordering for a list of things nobody has
     answered. */
  return out.sort((a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1));
}
