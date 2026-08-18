import type { AgencyClaim, Lead, Stage, Task } from './types';
import { OPEN_STAGES } from './types';

/* Pure lead-management rules — importable from client components (no Node
   APIs). The structural contract: every active lead has a next step, and no
   lead sits in a stage past its threshold. */

/* How long a deal may sit in a stage before it is asking to be looked at.
   Reserved and Contract have no threshold on purpose: past a reservation the
   payment schedule on the masterplan is the clock, and a second one competing
   with it would only produce flags nobody acts on. */
export const STAGE_MAX_DAYS: Partial<Record<Stage, number>> = {
  new: 1,           // first response within a day
  contacted: 3,     // matches the reply-wait rhythm
  qualified: 7,     // a serious buyer gets weekly movement at minimum
  presentation: 7,  // a presentation with no follow-up inside a week has gone cold
  visit: 10,        // somebody who has stood on the plot is deciding, not forgetting
  negotiation: 14,  // a fortnight of silence mid-negotiation is a deal in trouble
};

/* Every stage where the CRM still expects somebody to be doing something —
   which is every open one. It used to stop at Qualified, so a reservation with
   nothing planned raised no flag at all: precisely the point where a deal is
   most expensive to lose. */
export const ACTIVE_STAGES: Stage[] = OPEN_STAGES;

/** When the lead entered its current stage (last stage change, else creation). */
export function stageEnteredAt(lead: Lead): string {
  const changes = (lead.history || []).filter((h) => h.kind === 'stage');
  return changes.length ? changes[changes.length - 1].at : lead.created_at;
}

/** Days the lead has been sitting in its current stage. */
export function stageAgeDays(lead: Lead): number {
  return Math.floor((Date.now() - new Date(stageEnteredAt(lead)).getTime()) / 86_400_000);
}

/** Over the stage threshold — needs movement. */
export function isStalled(lead: Lead): boolean {
  const max = STAGE_MAX_DAYS[lead.stage];
  return max !== undefined && stageAgeDays(lead) > max;
}

/* ── What is still unknown about a buyer ──

   The four answers that decide whether somebody is a buyer at all: what they
   can spend, when, what for, and whether the money is already theirs. Which
   unit they want is the fifth, and it lives on the lead itself.

   Pure, so the lead page can show the same gaps the stage rules will enforce —
   an operator should never be refused for a reason the screen did not show
   them first. "unknown" counts as unanswered on purpose: it is an honest
   answer to record, and it is still not knowing. */
export const QUALIFYING: { key: 'budget' | 'timeframe' | 'purpose' | 'financing' | 'villa'; label: string }[] = [
  { key: 'budget',    label: 'Budget' },
  { key: 'timeframe', label: 'Timeframe' },
  { key: 'purpose',   label: 'Purpose' },
  { key: 'financing', label: 'Cash or financing' },
  { key: 'villa',     label: 'Residence of interest' },
];

export function missingQualification(lead: Lead): string[] {
  const q = lead.qualification || {};
  const answered: Record<string, boolean> = {
    budget: Boolean(q.budget && q.budget > 0),
    timeframe: Boolean(q.timeframe && q.timeframe !== 'unknown'),
    purpose: Boolean(q.purpose),
    financing: Boolean(q.financing && q.financing !== 'unknown'),
    villa: Boolean((lead.villa || '').trim()),
  };
  return QUALIFYING.filter((f) => !answered[f.key]).map((f) => f.label);
}

/** Active lead with no open task and no reply-timer: nobody owns its next step. */
export function hasNoNextStep(lead: Lead): boolean {
  if (!ACTIVE_STAGES.includes(lead.stage)) return false;
  if (lead.awaiting_reply_since) return false;
  return !lead.tasks.some((t) => !t.done);
}

/* ── The reply timer ──

   Lives here rather than in the store because it is a rule, not a persistence
   detail, and both the masterplan (a client component) and the digest need it.
   Three quiet days after an e-mail went out, the lead — and its plot — start
   asking to be chased. */
export const REPLY_FLAG_DAYS = 3;

/* ══════════════════ The next step ══════════════════

   A lead's next step is its earliest-due open task. Not a separate field: a
   second place to write the same sentence is a second place for it to go
   stale, and the tasks list is already where a salesperson types it. What was
   missing is the reading — the CRM could count open tasks but could not say
   "this one is late", which is the only thing anybody actually wants to know.

   Undated tasks sort last. A task with no date is a note-to-self, and it must
   never push a dated commitment down the list. */

export function nextAction(lead: Lead): Task | undefined {
  const open = lead.tasks.filter((t) => !t.done);
  if (!open.length) return undefined;
  return open.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0];
}

export type NextActionState = 'overdue' | 'today' | 'upcoming' | 'undated' | 'none';

/** Compares CALENDAR DATES. A due date is stored as midnight UTC, so an
    instant comparison would call today's follow-up overdue from the moment the
    UTC day turns over — in Samui, before breakfast. */
export function nextActionState(lead: Lead, today = new Date().toISOString().slice(0, 10)): NextActionState {
  const task = nextAction(lead);
  if (!task) return 'none';
  if (!task.due) return 'undated';
  const day = task.due.slice(0, 10);
  return day < today ? 'overdue' : day === today ? 'today' : 'upcoming';
}

/* ── Has anybody actually talked to them ──

   A conversation, from either end: a salesperson got hold of them and logged
   it, or the customer wrote back. Automated e-mails leaving the building are
   not contact, and neither is a call that rang out — the whole point of the
   distinction is to tell "we have tried" from "we have spoken". */
export function hasConversed(lead: Lead): boolean {
  return (lead.history || []).some(
    (h) => h.reached === true || h.kind === 'message' || (h.kind === 'email' && h.detail.startsWith('Reply received')),
  );
}

/* ══════════════════ Who introduced this buyer ══════════════════

   Two different questions, and conflating them is how commission arguments
   start.

   PROTECTION — "may somebody else register this person right now?" That is
   `activeClaim`: the most recent registration that has neither been released
   nor run past its window. It expires, on purpose, because a claim that never
   expires is a claim on a person forever.

   CREDIT — "who brought us this buyer?" That is `creditedClaim`: the FIRST
   registration that was never released. It does NOT expire. Whoever brought
   the buyer brought them, and a deal that closes thirteen months after the
   introduction was still that agency's introduction. An expired window means
   the next agency may register them too; it does not rewrite history.

   Both are pure and read the append-only `claims` array, so the lead page, the
   agency report and the refusal in the store all answer identically. */

const live = (c: AgencyClaim) => !c.released_at;

/** The registration currently holding protection, if any. */
export function activeClaim(lead: Lead, today = new Date().toISOString().slice(0, 10)): AgencyClaim | undefined {
  const open = (lead.claims || []).filter(
    (c) => live(c) && (!c.expires_at || c.expires_at.slice(0, 10) >= today),
  );
  return open.length ? open[open.length - 1] : undefined;
}

/** The registration credited with the introduction, expired or not. */
export function creditedClaim(lead: Lead): AgencyClaim | undefined {
  return (lead.claims || []).find(live);
}

/** Every agency that has ever registered this person and not withdrawn it —
    the honest answer to "is more than one agency claiming them". */
export function competingClaims(lead: Lead): AgencyClaim[] {
  const seen = new Set<string>();
  return (lead.claims || []).filter((c) => {
    if (!live(c) || seen.has(c.agencyId)) return false;
    seen.add(c.agencyId);
    return true;
  });
}

/* ── Parked until a date ──

   True while the lead is deliberately set aside and the date has not arrived.
   On the day it does, this goes false and the lead reappears — in its own
   queue section, not as a lead that mysteriously started stalling again. */
export function isNurtured(lead: Lead, today = new Date().toISOString().slice(0, 10)): boolean {
  return Boolean(lead.nurture_until && lead.nurture_until.slice(0, 10) > today);
}

/* ══════════════════ The working queue ══════════════════

   "Who should I contact today?" — answered as one ordered list rather than six
   counters an operator has to reconcile in their head.

   Six rules, each a plain predicate. They are read two ways, and both readings
   come from this one definition so they can never drift apart:

     workQueue()   assigns every lead to the FIRST rule it matches, so it
                   appears exactly once. A lead that is uncontacted, stalled
                   AND unplanned is one phone call, and a day-list that says
                   the same name three times is a day-list nobody trusts.

     matchesFlag() asks one rule on its own, for `/admin/leads?flag=stalled` —
                   where the question is "show me ALL of them", and a lead
                   already claimed by a more urgent rule still belongs in the
                   answer. */

export type QueueKey = 'uncontacted' | 'overdue' | 'today' | 'wake' | 'silent' | 'nonext' | 'stalled';

interface QueueContext { today: string; silentCut: string }

const contextFor = (today = new Date().toISOString().slice(0, 10)): QueueContext => ({
  today,
  silentCut: new Date(Date.now() - REPLY_FLAG_DAYS * 86_400_000).toISOString(),
});

/* A closed deal needs nothing, an archived lead is out of every working view by
   definition, and a lead parked until November is not stalling — it is waiting,
   on purpose, with a date. Everything else is fair game for a rule. */
const inPlay = (l: Lead, ctx: QueueContext): boolean =>
  !l.archived_at && l.stage !== 'won' && l.stage !== 'lost' && !isNurtured(l, ctx.today);

export const QUEUE_RULES: Record<QueueKey, (lead: Lead, ctx: QueueContext) => boolean> = {
  uncontacted: (l) => l.stage === 'new' && !hasConversed(l),
  overdue:     (l, c) => nextActionState(l, c.today) === 'overdue',
  today:       (l, c) => nextActionState(l, c.today) === 'today',
  /* `inPlay` has already excluded anything still parked, so reaching this rule
     at all means the date has arrived or passed. */
  wake:        (l) => Boolean(l.nurture_until),
  silent:      (l, c) => Boolean(l.awaiting_reply_since && l.awaiting_reply_since < c.silentCut),
  nonext:      (l) => hasNoNextStep(l),
  stalled:     (l) => isStalled(l),
};

export interface QueueSection {
  key: QueueKey;
  title: string;
  blurb: string;   // what this section means, in one line
  leads: Lead[];
}

/* Order matters: it is both the priority of the day and the tie-break that
   decides which single section a lead lands in. */
export const SECTION_META: { key: QueueKey; title: string; blurb: string }[] = [
  { key: 'uncontacted', title: 'Nobody has spoken to them yet', blurb: 'New leads with no conversation on record. These first, always.' },
  { key: 'overdue',     title: 'Late',                          blurb: 'A follow-up you promised yourself, past its date.' },
  { key: 'today',       title: 'Due today',                     blurb: 'Scheduled for today.' },
  { key: 'wake',        title: 'Back from nurture',             blurb: 'You parked these until a date, and the date has come.' },
  { key: 'silent',      title: 'Gone quiet',                    blurb: `Waiting on a reply for more than ${REPLY_FLAG_DAYS} days.` },
  { key: 'nonext',      title: 'No next step',                  blurb: 'Live deals nobody has decided what to do with.' },
  { key: 'stalled',     title: 'Not moving',                    blurb: 'Sitting in the same stage past its threshold.' },
];

/* Object.hasOwn, not `in`: `'constructor' in QUEUE_RULES` is true, and a
   query string reaching a filter is exactly where that matters. */
export const isQueueKey = (v: string): v is QueueKey => Object.hasOwn(QUEUE_RULES, v);

/** One rule, asked on its own — the lead list's `?flag=` filter. */
export function matchesFlag(lead: Lead, key: QueueKey, today?: string): boolean {
  const ctx = contextFor(today);
  return inPlay(lead, ctx) && QUEUE_RULES[key](lead, ctx);
}

/** Oldest first inside a section: the lead that has been waiting longest is
    the one most likely to be lost. */
const byAge = (a: Lead, b: Lead) => (a.created_at || '').localeCompare(b.created_at || '');

export function workQueue(leads: Lead[], today?: string): QueueSection[] {
  const ctx = contextFor(today);
  const buckets = new Map<QueueKey, Lead[]>(SECTION_META.map((s) => [s.key, []]));

  for (const lead of leads) {
    if (!inPlay(lead, ctx)) continue;
    const hit = SECTION_META.find((s) => QUEUE_RULES[s.key](lead, ctx));
    if (hit) buckets.get(hit.key)!.push(lead);
  }

  return SECTION_META.map((meta) => ({ ...meta, leads: buckets.get(meta.key)!.sort(byAge) }));
}
