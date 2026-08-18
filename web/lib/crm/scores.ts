import type { Lead } from './types';
import { VILLAS } from './villas';
import { toBase, type Rates } from './money';

/* ══════════════════ Two scores, kept apart ══════════════════

   The CRM has always had one score — hot / warm / cold — set from the form a
   lead arrived on and moved by the AI triage and by behaviour. It is useful and
   it stays: it is the operator's own judgement about a lead, and a person's
   read is worth keeping.

   What it cannot do is separate two questions that pull in opposite directions:

     FIT         can this person buy? Budget, timeframe, purpose, where the
                 money comes from, whether they want a specific villa.
     ENGAGEMENT  are they actually talking to us? Replies, calls, a viewing,
                 documents opened, a call booked.

   Mixing them produces the two most expensive mistakes in a pipeline. A buyer
   with the money and the timing who has gone quiet reads as "cold" and gets
   dropped, when they are the most valuable name on the list. Somebody who
   replies to everything and cannot afford an entry-level villa reads as "hot"
   and eats a fortnight.

   Both are DERIVED — nothing here is stored. There is no migration, nothing to
   backfill, and no second copy to drift: correcting a budget corrects the score
   on the next render. */

export type Band = 'high' | 'medium' | 'low';

export interface Score {
  value: number;
  max: number;
  pct: number;
  band: Band;
  /** What earned it, in the words the screen shows. */
  reasons: string[];
  /** What is still unanswered — the difference between a low score and an
      unknown one, which is the distinction the operator actually needs. */
  missing: string[];
}

/* ── Why the two scales band differently ──

   Fit is additive and roughly linear: every answer moves it a little, and half
   marks really is halfway to being a buyer.

   Engagement is not. Its signals are events, and events are lumpy — somebody
   who flew to Samui and stood on the plot is deeply engaged on one signal,
   while somebody who has clicked three links is barely engaged on three. So its
   bands sit much lower: any TWO of the four real signals (a visit, a
   conversation, a reply, a booked call) is high, and any one of them is at
   least medium. A percentage that treated the two scales alike would call a
   site visit "low engagement", which is nonsense. */
const FIT_BANDS = { high: 60, medium: 30 };
const ENGAGEMENT_BANDS = { high: 35, medium: 12 };

const finish = (
  value: number,
  max: number,
  reasons: string[],
  missing: string[],
  bands: { high: number; medium: number },
): Score => {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const band: Band = pct >= bands.high ? 'high' : pct >= bands.medium ? 'medium' : 'low';
  return { value, max, pct, band, reasons, missing };
};

/* ── Fit ──

   The budget test is the only one with a number in it, and the number is not
   invented: it is the cheapest villa on the price list. Somebody whose budget
   is under the entry price cannot buy here, whatever else is true, and that
   threshold moves by itself when the price list does. */
export const entryPrice = (): number => Math.min(...VILLAS.map((v) => v.price));

export const FIT_SIGNALS: { key: string; label: string; max: number }[] = [
  { key: 'budget',    label: 'Budget covers an entry-level villa', max: 3 },
  { key: 'timeframe', label: 'Buying soon',                        max: 3 },
  { key: 'purpose',   label: 'Knows what it is for',               max: 2 },
  { key: 'financing', label: 'The money is already theirs',        max: 2 },
  { key: 'villa',     label: 'Wants a specific residence',         max: 2 },
  { key: 'decision',  label: 'Decides alone',                      max: 1 },
];

export const FIT_MAX = FIT_SIGNALS.reduce((n, s) => n + s.max, 0);

export function fitScore(lead: Lead, rates?: Rates): Score {
  const q = lead.qualification || {};
  const reasons: string[] = [];
  const missing: string[] = [];
  let value = 0;

  if (q.budget) {
    const inBaht = toBase(q.budget, q.currency, rates);
    if (inBaht === undefined) {
      /* Recorded in a currency nobody has configured a rate for. Neither a
         point nor a gap: we know the number, we cannot compare it, and
         pretending either way would be a guess. */
      reasons.push('Budget recorded, but not comparable without an exchange rate');
    } else if (inBaht >= entryPrice()) {
      value += 3;
      reasons.push('Budget covers an entry-level villa');
    } else {
      reasons.push('Budget is under the entry price');
    }
  } else missing.push('Budget');

  const soon: Record<string, number> = { '0-3': 3, '3-6': 2, '6-12': 1, '12+': 0 };
  if (q.timeframe && q.timeframe !== 'unknown') {
    value += soon[q.timeframe] ?? 0;
    if ((soon[q.timeframe] ?? 0) > 0) reasons.push('Buying within a year');
  } else missing.push('Timeframe');

  if (q.purpose) {
    value += q.purpose === 'lifestyle' ? 1 : 2;
    reasons.push(q.purpose === 'lifestyle' ? 'Buying to live in' : 'Buying as an investment');
  } else missing.push('Purpose');

  if (q.financing && q.financing !== 'unknown') {
    value += q.financing === 'cash' ? 2 : 1;
    if (q.financing === 'cash') reasons.push('Cash buyer');
  } else missing.push('Cash or financing');

  if ((lead.villa || '').trim()) {
    value += 2;
    reasons.push('Has a residence in mind');
  } else missing.push('Residence of interest');

  if (q.decision === 'sole') { value += 1; reasons.push('Decides alone'); }
  else if (!q.decision || q.decision === 'unknown') missing.push('Who decides');

  return finish(value, FIT_MAX, reasons, missing, FIT_BANDS);
}

/* ── Engagement ──

   Only things THEY did, or that a person did with them. An automated e-mail
   leaving the building is not engagement, and neither is a call that rang out —
   counting either would let the CRM's own activity inflate a buyer's score,
   which is exactly the number nobody could then trust.

   Presence-based rather than counted: a lead who opened the brochure nine times
   is interested, not nine times more interested than one who opened it once,
   and a scale that says otherwise puts the wrong name at the top. */
export const ENGAGEMENT_SIGNALS: { key: string; label: string; max: number }[] = [
  { key: 'visit',    label: 'Has seen it',            max: 4 },
  { key: 'spoke',    label: 'Spoke to us',            max: 3 },
  { key: 'replied',  label: 'Wrote back',             max: 3 },
  { key: 'booked',   label: 'Booked a call',          max: 3 },
  { key: 'document', label: 'Opened what we sent',    max: 2 },
  { key: 'click',    label: 'Followed a link',        max: 1 },
];

export const ENGAGEMENT_MAX = ENGAGEMENT_SIGNALS.reduce((n, s) => n + s.max, 0);

export function engagementScore(lead: Lead): Score {
  const h = lead.history || [];
  const has = (fn: (e: (typeof h)[number]) => boolean) => h.some(fn);

  const signals: { key: string; on: boolean; label: string; max: number }[] = [
    { key: 'visit',   on: has((e) => e.kind === 'visit' && e.reached === true), label: 'Has seen it', max: 4 },
    { key: 'spoke',   on: has((e) => e.reached === true && e.kind !== 'visit'), label: 'Spoke to us', max: 3 },
    {
      key: 'replied',
      on: has((e) => (e.kind === 'message' && !e.detail.startsWith('Call ')) ||
                     (e.kind === 'email' && e.detail.startsWith('Reply received'))),
      label: 'Wrote back', max: 3,
    },
    { key: 'booked',   on: has((e) => e.kind === 'message' && e.detail.startsWith('Call ') && !e.detail.startsWith('Call cancelled')), label: 'Booked a call', max: 3 },
    { key: 'document', on: has((e) => e.kind === 'download'), label: 'Opened what we sent', max: 2 },
    { key: 'click',    on: has((e) => e.kind === 'click'), label: 'Followed a link', max: 1 },
  ];

  const on = signals.filter((s) => s.on);
  const value = on.reduce((n, s) => n + s.max, 0);
  const reasons = on.map((s) => s.label);
  /* Nothing is "missing" here in the way a qualification answer is: silence is
     an answer, and it is the one the score is reporting. */
  return finish(value, ENGAGEMENT_MAX, reasons, [], ENGAGEMENT_BANDS);
}

/* ── Reading the two together ──

   The whole reason they are separate. A high fit and a low engagement is the
   most valuable thing on the list precisely BECAUSE nobody is talking to them. */
export function scoreVerdict(fit: Score, engagement: Score): string {
  const f = fit.band, e = engagement.band;
  if (f === 'high' && e === 'high') return 'Ready to be closed';
  if (f === 'high' && e === 'low') return 'Can buy, has gone quiet — chase this one';
  if (f === 'high') return 'Can buy, keep the conversation going';
  if (f === 'low' && e === 'high') return 'Talks to us, may not be able to buy — qualify properly';
  if (fit.missing.length >= 3) return 'Too little known to say — qualify them';
  if (e === 'low') return 'Little to go on either way';
  return 'Worth working';
}
