import { randomUUID } from 'node:crypto';
import type {
  Activity, AgencyClaim, CardColor, CardItem, Construction, ContractStatus, CrmEvent, Lead, LeadPatch,
  Note, PhaseDef, PhaseKey, ProjectNote, Score, Stage, Task, Qualification, VillaHistoryEntry,
  VillaRecord, VillaStatus,
} from './types';
import {
  CARD_COLORS, CONTRACT_STEPS, CURRENCIES, DECISION, FINANCING, MOTIVATIONS, NURTURE_REASONS,
  OBJECTIONS, PURPOSES, SCORES, STAGES, TIMEFRAMES, VISITS, atOrBeyond, isOpenStage, touchByKey,
} from './types';
import { DEFAULT_SCHEDULE, houseSchedule, scheduleFor, scheduleProblem, toSchedule } from './schedule';
import { scoreFor } from './scoring';
import { pickOwner } from './agents';
import { guessLanguage, languageLabel, leadCountry } from './language';
import {
  ACTIVE_STAGES, REPLY_FLAG_DAYS, STAGE_MAX_DAYS, activeClaim, matchesFlag, missingQualification,
  workQueue, type QueueKey,
} from './rules';
import { fmtTHB, phaseAmount, priceForSize, villaByName } from './villas';
import unitCatalog from '../villas.json';
export {
  STAGE_MAX_DAYS, REPLY_FLAG_DAYS, SECTION_META, stageAgeDays, stageEnteredAt, isStalled,
  hasNoNextStep, nextAction, nextActionState, hasConversed, isNurtured, isQueueKey, matchesFlag,
  workQueue, activeClaim, creditedClaim, competingClaims,
} from './rules';
export type { QueueKey, QueueSection } from './rules';
import { getBackend } from './backend';
import { leadSource } from './sources';
import { fxRates, toBase } from './money';
export type { VillaHistoryEntry, VillaRecord, VillaStatus } from './types';

/* Domain layer of the CRM store. Persistence is pluggable: with a DATABASE_URL
   (production / Vercel + Neon) it uses Postgres; otherwise a local JSON file
   (dev). Starts EMPTY — only real form submissions and real site clicks land
   here. All CRM code talks to these functions only. */

const backend = getBackend;

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/* Strip what Postgres jsonb cannot store (NUL, lone surrogates) and other
   control characters — a crafted payload would otherwise make the production
   insert throw while the dev file backend accepts it. */
export function cleanText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/* ── A refusal, as opposed to a failure ──

   Two people each believing something is theirs to claim — a villa, a buyer —
   is not a race the revision guard can settle. It is a business rule, and it
   has to be a refusal rather than a warning, because a warning in a drawer is
   a warning nobody reads.

   Thrown rather than returned: it is exceptional, every caller wants it
   surfaced rather than folded into a null, and throwing inside a transaction
   body means nothing is persisted and no audit line is written. Subclassed per
   aggregate below (VillaConflict, ClaimConflict) so a caller can tell what it
   collided with. */
export class CrmConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmConflict';
  }
}

// ── Lead queries ──

export interface LeadFilter {
  stage?: Stage;
  score?: string;
  form_type?: string;
  /** A canonical channel id from `sources.ts`, not a raw value — so filtering
      on `facebook` catches `fb`, `FB_ads` and `l.facebook.com` too. */
  source?: string;
  q?: string;
  /** Restrict to one salesperson's leads. With several people selling, "all
      leads" stops being a worklist and starts being a directory. */
  owner?: string;
  /** Archived leads are excluded unless asked for. `include` is for the backup,
      which must hold everything or it is not a backup; `only` is the operator
      looking through what was set aside. */
  archived?: 'exclude' | 'include' | 'only';
  /** One of the six working-queue rules, applied on its own: the answer to
      "show me every stalled lead" rather than "show me today's list". Until
      this existed the CRM could say there were seven leads with no next step
      and could not name one of them. */
  flag?: QueueKey;
  /** ISO 3166-1 alpha-2. Matches what `leadCountry()` answers, so a lead with
      no stored country is still filed under what its phone number says. */
  country?: string;
  /** A `TIMEFRAMES` id — the qualification answer, not a date. */
  timeframe?: string;
  /** Minimum budget, in `budgetCurrency` (default THB). A budget recorded in
      another currency only matches when an exchange rate is configured; see
      money.ts for why no rate is ever invented. */
  minBudget?: number;
  budgetCurrency?: string;
}

export const isArchived = (l: Lead): boolean => Boolean(l.archived_at);

/* ── The working set ──

   Every count, report, worklist and automated decision must be computed from
   live leads only. Getting this wrong is quiet: an archived lead left in the
   numbers inflates a conversion rate, and one left in the sequence keeps
   e-mailing somebody the operator deliberately set aside.

   So the filtering lives HERE, in one function, and the aggregates call it
   rather than the backend. `backend.allLeads()` still returns everything, on
   purpose — the backup depends on it. */
async function liveLeads(): Promise<Lead[]> {
  return (await (await backend()).allLeads()).filter((l) => !isArchived(l));
}

export async function listLeads(filter: LeadFilter = {}): Promise<Lead[]> {
  const leads = await (await backend()).allLeads();
  const q = filter.q?.trim().toLowerCase();
  const archived = filter.archived || 'exclude';
  const rates = fxRates();
  return leads
    .filter((l) => {
      if (archived === 'exclude' && isArchived(l)) return false;
      if (archived === 'only' && !isArchived(l)) return false;
      if (filter.stage && l.stage !== filter.stage) return false;
      if (filter.score && l.score !== filter.score) return false;
      if (filter.form_type && l.form_type !== filter.form_type) return false;
      if (filter.source && leadSource(l) !== filter.source) return false;
      if (filter.owner && (l.owner || '') !== filter.owner) return false;
      if (filter.flag && !matchesFlag(l, filter.flag)) return false;
      if (filter.country && leadCountry(l) !== filter.country) return false;
      if (filter.timeframe && (l.qualification?.timeframe || '') !== filter.timeframe) return false;
      if (filter.minBudget) {
        const q = l.qualification;
        if (!q?.budget) return false;
        /* Converted only where a rate exists. A budget in a currency nobody has
           configured a rate for is excluded rather than compared as if it were
           baht — see money.ts. */
        const inBase = toBase(q.budget, q.currency, rates);
        const wanted = toBase(filter.minBudget, filter.budgetCurrency, rates);
        if (inBase === undefined || wanted === undefined || inBase < wanted) return false;
      }
      if (q) {
        const hay = `${l.name || ''} ${l.email || ''} ${l.phone || ''} ${l.villa || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function getLead(id: string): Promise<Lead | null> {
  return (await backend()).getLead(id);
}

/* Other leads from the same person — matching email or phone digits. Surfaces
   returning contacts (someone who downloaded the brochure and later reserved)
   without merging anything automatically. */
export async function relatedLeads(lead: Lead): Promise<Lead[]> {
  const email = (lead.email || '').trim().toLowerCase();
  const phone = (lead.phone || lead.whatsapp || '').replace(/[^\d]/g, '');
  if (!email && !phone) return [];
  /* Live records only. This panel offers a one-click merge, and an archived
     duplicate has already been dealt with — a husk folded in by an earlier
     merge would otherwise offer itself again for ever. Intake still finds
     archived contacts by e-mail and phone, which is where it matters. */
  const leads = await liveLeads();
  return leads
    .filter((l) => {
      if (l.id === lead.id) return false;
      if (email && (l.email || '').trim().toLowerCase() === email) return true;
      if (phone && phone.length >= 6) {
        const p = (l.phone || l.whatsapp || '').replace(/[^\d]/g, '');
        // Both sides need real length — a stored fragment like "66" must not
        // suffix-match half the database (the panel offers one-click merge).
        if (p.length >= 6 && (p.endsWith(phone) || phone.endsWith(p))) return true;
      }
      return false;
    })
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// ── Lead mutations ──

/* Speed-to-lead: every lead gets a human owner the second it lands, so the
   automatic reply can be signed by a real person and there is never a lead
   nobody is responsible for. Silent no-op while no roster is configured. */
async function assignOwner(lead: Lead): Promise<void> {
  const lang = guessLanguage(lead);
  // Round-robin over live leads: an archived one is not somebody's workload.
  const owner = pickOwner(await liveLeads(), lang.language);
  if (!owner) return;
  lead.owner = owner;
  logActivity(lead, 'assigned', `Assigned to ${owner} (${languageLabel(lang)})`);
}

export async function createLeadFromPayload(p: Record<string, unknown>): Promise<Lead> {
  // Cap and clean every incoming string — same defensive posture as addEvent.
  const s = (k: string) =>
    typeof p[k] === 'string' ? cleanText(p[k] as string).slice(0, 300) : undefined;
  const lead: Lead = {
    id: randomUUID(),
    name: s('name'),
    email: s('email'),
    phone: s('phone'),
    whatsapp: s('whatsapp'),
    form_type: s('form_type'),
    form_origin: s('form_origin'),
    villa: s('villa'),
    gdpr_consent: p['gdpr_consent'] === true,
    locale: s('locale'),
    utm_source: s('utm_source'),
    utm_medium: s('utm_medium'),
    utm_campaign: s('utm_campaign'),
    utm_term: s('utm_term'),
    utm_content: s('utm_content'),
    source: s('source'),
    page_url: s('page_url'),
    submitted_at: s('submitted_at') || now(),
    stage: 'new',
    score: scoreFor(s('form_type'), s('form_origin')),
    notes: [],
    tasks: [],
    history: [{ id: randomUUID(), kind: 'created', detail: 'Lead received from the website', at: now() }],
    created_at: now(),
    updated_at: now(),
    rev: 0,
  };
  lead.value = villaByName(lead.villa)?.price;
  await assignOwner(lead);
  await (await backend()).insertLead(lead);
  return lead;
}

/* ── One person = one lead ──
   Contact matching so a returning enquirer or a new WhatsApp message lands ON
   the existing lead instead of creating another one. */

/** Comparable phone key: last 9 digits, only when there are enough of them. */
const phoneKey = (s?: string): string => {
  const d = (s || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-9) : '';
};

export async function findLeadByContact(email?: string, phone?: string, whatsapp?: string): Promise<Lead | null> {
  const e = (email || '').trim().toLowerCase();
  const pk = phoneKey(phone) || phoneKey(whatsapp);
  if (!e && !pk) return null;
  /* Archived leads are deliberately INCLUDED here, and this is the one place
     they are. Somebody the operator set aside who writes to us again is a real
     enquiry, and the upsert revives their record rather than starting a second
     one beside it — which is exactly the duplicate this function exists to
     prevent. "Never again" is the blocklist's job, not the archive's. */
  const leads = await (await backend()).allLeads();
  const matches = leads.filter((l) =>
    (e && (l.email || '').trim().toLowerCase() === e) ||
    (pk && (phoneKey(l.phone) === pk || phoneKey(l.whatsapp) === pk)),
  );
  if (!matches.length) return null;
  // The person's most recently active lead is the conversation to continue.
  return matches.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
}

/** Contact keys of a lead/payload, in blocklist format. */
function contactKeys(email?: string, phone?: string, whatsapp?: string): string[] {
  const e = (email || '').trim().toLowerCase();
  return [
    e && `e:${e}`,
    phoneKey(phone) && `p:${phoneKey(phone)}`,
    phoneKey(whatsapp) && `p:${phoneKey(whatsapp)}`,
  ].filter(Boolean) as string[];
}

/** True when any contact key of this sender is on the blocklist. */
export async function isBlockedContact(email?: string, phone?: string, whatsapp?: string): Promise<boolean> {
  const keys = contactKeys(email, phone, whatsapp);
  if (!keys.length) return false;
  const blocked = new Set(await (await backend()).getBlocklist());
  return keys.some((k) => blocked.has(k));
}

/** Put a lead's contact details on the blocklist (used by "Delete & block"). */
export async function blockContactOf(lead: Lead): Promise<void> {
  const keys = contactKeys(lead.email, lead.phone, lead.whatsapp);
  if (keys.length) await (await backend()).addToBlocklist(keys);
}

export interface UpsertResult { lead: Lead; created: boolean }

const SCORE_RANK: Record<Score, number> = { hot: 0, warm: 1, cold: 2 };

/* The intake used by every automated channel (website forms, WhatsApp,
   WhatsApp): a NEW person gets a new lead; a KNOWN person gets the message and
   context appended to their existing lead. An inbound message also counts as a
   reply (clears the waiting flag) and revives a lost lead. */
export async function upsertLeadFromPayload(
  p: Record<string, unknown>,
  message?: string,
): Promise<UpsertResult> {
  const s = (k: string) =>
    typeof p[k] === 'string' ? cleanText(p[k] as string).slice(0, 300) : undefined;

  const existing = await findLeadByContact(s('email'), s('phone'), s('whatsapp'));
  if (!existing) {
    const lead = await createLeadFromPayload(p);
    const withNote = message ? await addNote(lead.id, message) : null;
    return { lead: withNote || lead, created: true };
  }

  const channel = (s('form_type') || 'message').replace('_', ' ');
  const source = s('source');
  const newScore = scoreFor(s('form_type'), s('form_origin'));
  // A lead from before the roster existed picks up an owner on its next contact.
  const missingOwner = existing.owner
    ? undefined
    : pickOwner(await liveLeads(), guessLanguage({ ...existing, phone: s('phone') || existing.phone }).language);
  const updated = await mutate(existing.id, (lead) => {
    if (!lead.owner && missingOwner) {
      lead.owner = missingOwner;
      logActivity(lead, 'assigned', `Assigned to ${missingOwner}`);
    }
    /* Somebody the operator set aside has written to us again. That is a live
       enquiry, so the record comes back rather than a second one appearing
       beside it. A contact who must never return is on the blocklist and never
       reaches this far. */
    if (isArchived(lead)) {
      lead.archived_at = undefined;
      lead.archived_by = undefined;
      lead.archive_reason = undefined;
      logActivity(lead, 'archived', `Restored from the archive — they made contact again`);
    }
    // Fill blanks only — never overwrite what the operator curated.
    for (const k of ['name', 'email', 'phone', 'whatsapp', 'villa'] as const) {
      const v = s(k);
      if (!lead[k] && v) lead[k] = v;
    }
    if (!lead.value) lead.value = villaByName(lead.villa)?.price;
    // Hotter signal upgrades the score; a cooler one never downgrades it.
    if (SCORE_RANK[newScore] < SCORE_RANK[lead.score]) {
      logActivity(lead, 'score', `Score ${cap(lead.score)} → ${cap(newScore)} (new ${channel})`);
      lead.score = newScore;
    }
    if (message) {
      lead.notes.unshift({ id: randomUUID(), body: cleanText(message).trim().slice(0, 4000), at: now() });
    }
    logActivity(lead, 'message', `New ${channel} received${source ? ` via ${source}` : ''}`);
    // The customer spoke — the reply-timer has done its job.
    if (lead.awaiting_reply_since) {
      lead.awaiting_reply_since = undefined;
      logActivity(lead, 'email', 'Reply received (inbound message)');
      const chase = lead.tasks.find((t) => t.title === REPLY_TASK_TITLE && !t.done);
      if (chase) chase.done = true;
    }
    // Someone we lost writing again is a second chance, not history.
    if (lead.stage === 'lost') {
      logActivity(lead, 'stage', `${stageLabel('lost')} → ${stageLabel('new')} (re-engaged)`);
      lead.stage = 'new';
      lead.lost_reason = undefined;
    }
  });
  return { lead: updated || existing, created: false };
}

/* A lead entered by hand — a phone call, a walk-in, a broker referral. Same
   shape as a website lead so every view treats them identically. */
export interface ManualLeadInput {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  villa?: string;
  source?: string;  // phone | walk-in | referral | email | other
  score?: string;
  value?: number;
  note?: string;
}

export async function createManualLead(input: ManualLeadInput, actor?: string): Promise<Lead> {
  const t = (v?: string) => (typeof v === 'string' ? cleanText(v).trim().slice(0, 300) : undefined) || undefined;
  const source = t(input.source) || 'manual';
  const score = (SCORES as string[]).includes(input.score || '') ? (input.score as Score) : 'warm';
  const value =
    typeof input.value === 'number' && isFinite(input.value) && input.value > 0
      ? Math.round(input.value)
      : villaByName(t(input.villa))?.price;
  const lead: Lead = {
    id: randomUUID(),
    name: t(input.name),
    email: t(input.email),
    phone: t(input.phone),
    whatsapp: t(input.whatsapp),
    villa: t(input.villa),
    form_type: 'manual',
    form_origin: source,
    source,
    value,
    submitted_at: now(),
    stage: 'new',
    score,
    notes: [],
    tasks: [],
    history: [{ id: randomUUID(), kind: 'created', detail: `Added manually (${source})`, at: now(), ...(actor ? { by: actor } : {}) }],
    created_at: now(),
    updated_at: now(),
    rev: 0,
  };
  const note = t(input.note);
  if (note) lead.notes.push({ id: randomUUID(), body: note, at: now(), ...(actor ? { by: actor } : {}) });
  await assignOwner(lead);
  await (await backend()).insertLead(lead);
  return lead;
}

const stageLabel = (id?: string) => STAGES.find((s) => s.id === id)?.label || id || '?';
const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : '?');

/* `by` is the signed-in operator, when there is one. Automatic entries (the
   sequence, an inbound reply, a tracked click) leave it unset, which is how the
   timeline tells "Anna moved this to Qualified" apart from "the CRM did". */
function logActivity(lead: Lead, kind: Activity['kind'], detail: string, by?: string) {
  (lead.history ??= []).push({ id: randomUUID(), kind, detail, at: now(), ...(by ? { by } : {}) });
}

/* Speed-to-lead measurement: the first moment a HUMAN acted on this lead — a
   note, a task, a stage move, or arming the reply timer. Automatic e-mails
   deliberately don't count; the point is how fast a person got involved. */
function markFirstResponse(lead: Lead) {
  if (!lead.first_response_at) lead.first_response_at = now();
}

/* Read-modify-write with optimistic concurrency: if another request saved the
   lead between our read and write, the conditional save fails and we retry on
   the fresh copy — concurrent edits interleave instead of overwriting. */
async function mutate(id: string, fn: (lead: Lead) => void): Promise<Lead | null> {
  const be = await backend();
  for (let attempt = 0; attempt < 4; attempt++) {
    const lead = await be.getLead(id);
    if (!lead) return null;
    const expectedRev = lead.rev || 0;
    fn(lead);
    lead.updated_at = now();
    lead.rev = expectedRev + 1;
    if (await be.saveLead(lead, expectedRev)) return lead;
  }
  throw new Error(`lead ${id}: too many concurrent updates`);
}

/* ── The one stage rule worth refusing over ──

   Reserved, Contract and Won all assert that a specific villa is involved.
   A lead in one of them with no unit named is not a deal, it is a hole in the
   inventory: the masterplan cannot show who is holding the plot, the sales
   value has nothing behind it, and nobody notices until somebody tries to sell
   the same villa twice.

   Everything else about a stage is judgement, and judgement is not something to
   refuse. Moving to Qualified without knowing the budget is recorded, loudly,
   on the timeline — see below — but it is never blocked. A CRM that argues with
   a salesperson about what a conversation established is a CRM they stop
   updating, and then it knows nothing at all. */
export class StageConflict extends CrmConflict {
  constructor(message: string) {
    super(message);
    this.name = 'StageConflict';
  }
}

const NEEDS_A_UNIT: Stage[] = ['reserved', 'contract', 'won'];

export async function updateLead(id: string, patch: LeadPatch, actor?: string): Promise<Lead | null> {
  let refusal: string | null = null;
  const result = await mutate(id, (lead) => {
    refusal = null;
    if (patch.stage && patch.stage !== lead.stage && NEEDS_A_UNIT.includes(patch.stage)) {
      const villa = (('villa' in patch ? patch.villa : lead.villa) || '').trim();
      if (!villa) {
        refusal =
          `${stageLabel(patch.stage)} needs a residence on the lead — ` +
          'without one the masterplan cannot show who is holding the plot.';
        return;
      }
    }
    if (patch.stage && patch.stage !== lead.stage) {
      /* Moving past Qualified on answers nobody has is allowed, and it is
         written down. The gap is on the stage entry itself rather than in a
         separate note, so anyone reading the timeline later sees the claim and
         its evidence in the same line. */
      const gaps = atOrBeyond(patch.stage, 'qualified') ? missingQualification({ ...lead, ...patch }) : [];
      logActivity(
        lead,
        'stage',
        `${stageLabel(lead.stage)} → ${stageLabel(patch.stage)}` +
          (gaps.length ? ` — still unknown: ${gaps.join(', ').toLowerCase()}` : ''),
        actor,
      );
    }
    if (patch.score && patch.score !== lead.score)
      logActivity(lead, 'score', `Score ${cap(lead.score)} → ${cap(patch.score)}`, actor);
    const contactKeys = ['name', 'email', 'phone', 'whatsapp', 'villa', 'country'] as const;
    const edited = contactKeys.filter((k) => k in patch && (patch[k] || '') !== (lead[k] || ''));
    if (edited.length) logActivity(lead, 'contact', `Contact details updated (${edited.join(', ')})`, actor);
    if ('value' in patch && patch.value !== lead.value)
      logActivity(lead, 'value', patch.value ? `Deal value set to ${fmtTHB(patch.value)}` : 'Deal value cleared', actor);
    if (patch.owner && patch.owner !== lead.owner)
      logActivity(lead, 'assigned', `Assigned to ${patch.owner}`, actor);
    if (patch.stage || patch.score || edited.length) markFirstResponse(lead);
    /* Moving the stage means somebody is working this lead now, so a parking
       date set weeks ago is stale by definition. Silently leaving it would
       hide the lead from the queue for a month after real movement. */
    if (patch.stage && patch.stage !== lead.stage && lead.nurture_until) {
      logActivity(lead, 'nurture', `Back in play (was parked until ${lead.nurture_until})`, actor);
      lead.nurture_until = undefined;
      lead.nurture_reason = undefined;
    }
    /* Where the deal was when it died. Captured before the assignment, because
       a moment later `lead.stage` is 'lost' and the answer is gone. */
    if (patch.stage === 'lost' && lead.stage !== 'lost') lead.lost_from = lead.stage;
    Object.assign(lead, patch);
    // A revived deal is no longer lost — drop the stale reason.
    if (patch.stage && patch.stage !== 'lost') {
      lead.lost_reason = undefined;
      lead.lost_from = undefined;
    }
  });
  if (refusal) throw new StageConflict(refusal);
  return result;
}

/* Fold a duplicate into the primary lead: fill blank contact/attribution
   fields, carry over consent, notes, tasks and history, then delete the
   duplicate. Nothing on the primary is ever overwritten, and appends are
   deduped by id so a retried merge (e.g. after a failed delete) stays
   idempotent instead of double-appending. */
export async function mergeLeads(primaryId: string, otherId: string, actor?: string): Promise<Lead | null> {
  if (primaryId === otherId) return null;
  const be = await backend();
  const other = await be.getLead(otherId);
  if (!other) return null;

  const merged = await mutate(primaryId, (primary) => {
    const fillable = [
      'name', 'email', 'phone', 'whatsapp', 'villa',
      'source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'page_url', 'form_origin',
    ] as const;
    for (const k of fillable) {
      if (!primary[k] && other[k]) primary[k] = other[k];
    }
    if (!primary.value && other.value) primary.value = other.value;
    // Consent is evidence — never lose it in a merge.
    if (other.gdpr_consent) primary.gdpr_consent = true;

    const appendNew = <T extends { id: string }>(base: T[], extra: T[]) => {
      const seen = new Set(base.map((x) => x.id));
      return [...base, ...extra.filter((x) => !seen.has(x.id))];
    };
    primary.notes = appendNew(primary.notes, other.notes);
    primary.tasks = appendNew(primary.tasks, other.tasks);
    primary.history = appendNew(primary.history || [], other.history || []);
    /* Registrations move with the person, and they are the reason a merge must
       never be a delete: an agency that registered the duplicate introduced
       this buyer, and folding the records together cannot be what quietly
       loses their claim. Sorted by date afterwards, because "who was first"
       is the whole question a claim answers. */
    primary.claims = appendNew(primary.claims || [], other.claims || [])
      .sort((a, b) => a.at.localeCompare(b.at));

    const when = other.submitted_at || other.created_at;
    const detail = `Merged duplicate ${(other.form_type || 'enquiry').replace('_', ' ')} from ${when.slice(0, 10)}`;
    // A retried merge logs the event only once.
    if (!(primary.history || []).some((h) => h.kind === 'merged' && h.detail === detail)) {
      logActivity(primary, 'merged', detail);
    }
  });
  if (!merged) return null;

  /* If the duplicate was the one holding a unit, the unit moves with it. The
     two records are the same person, so this is not a competing claim and the
     ordinary "already linked to somebody else" refusal does not apply — which
     is why this goes through its own path rather than updateVillaSale. Without
     it, a merge would simply fail on any buyer who had reserved something. */
  const held = await unitHeldBy(otherId);
  if (held) {
    await villaTxn(held, (rec, from, t) => {
      rec.buyerLeadId = merged.id;
      rec.buyerName = merged.name || merged.email || 'Unknown';
      t.log(from, rec.status, undefined, `Buyer record merged: now ${rec.buyerName}`);
    });
  }

  /* The husk is archived, not deleted. Everything on it was copied across, so
     it holds nothing unique — but the fact that a second record existed, and
     what it was folded into, is part of the history a merge must not erase.
     Archived records are excluded from duplicate detection, so it will not
     present itself for merging again. */
  await archiveLead(otherId, `Merged into ${merged.name || merged.email || merged.id}`, actor);
  return merged;
}

/* ── Duplicate cleanup ──
   Groups leads that belong to the same person (shared email OR shared phone,
   linked transitively) and folds each group into its OLDEST lead — the first
   enquiry keeps the original attribution; everything else (notes, tasks,
   history, consent) is carried over by mergeLeads. */

export interface DedupeReport {
  groups: number;      // people with more than one lead
  extras: number;      // leads that would be (or were) folded away
  sample: string[];    // a few affected names for the confirmation dialog
}

async function duplicateGroups(): Promise<Lead[][]> {
  // Archived excluded: a husk folded in by an earlier merge is not a duplicate
  // waiting to be found all over again.
  const leads = await liveLeads();
  // Union-find over contact keys so email- and phone-matches chain together.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const keyOwner = new Map<string, string>(); // contact key -> lead id
  for (const l of leads) {
    const keys = [
      (l.email || '').trim().toLowerCase() && `e:${(l.email || '').trim().toLowerCase()}`,
      phoneKey(l.phone) && `p:${phoneKey(l.phone)}`,
      phoneKey(l.whatsapp) && `p:${phoneKey(l.whatsapp)}`,
    ].filter(Boolean) as string[];
    if (!parent.has(l.id)) parent.set(l.id, l.id);
    for (const k of keys) {
      const owner = keyOwner.get(k);
      if (owner) union(l.id, owner);
      else keyOwner.set(k, l.id);
    }
  }
  const byRoot = new Map<string, Lead[]>();
  for (const l of leads) {
    if (!parent.has(l.id)) continue;
    const r = find(l.id);
    byRoot.set(r, [...(byRoot.get(r) || []), l]);
  }
  return [...byRoot.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
}

export async function dedupeReport(): Promise<DedupeReport> {
  const groups = await duplicateGroups();
  return {
    groups: groups.length,
    extras: groups.reduce((n, g) => n + g.length - 1, 0),
    sample: groups.slice(0, 5).map((g) => g[0].name || g[0].email || g[0].phone || 'Unknown'),
  };
}

export async function dedupeMerge(): Promise<{ groups: number; merged: number }> {
  const groups = await duplicateGroups();
  let merged = 0;
  for (const g of groups) {
    const primary = g[0]; // oldest — the original enquiry
    for (const other of g.slice(1)) {
      try {
        if (await mergeLeads(primary.id, other.id)) merged++;
      } catch { /* keep folding the rest */ }
    }
  }
  return { groups: groups.length, merged };
}

/* Bulk operations for the list view. One failing lead must not abort the rest
   of the batch — each item is attempted independently and the counts report
   what actually happened. */
export async function bulkUpdate(
  ids: string[],
  patch: LeadPatch,
  actor?: string,
): Promise<{ done: number; failed: number; refused: string[] }> {
  let done = 0, failed = 0;
  /* A refusal carries a reason, and the operator needs it: "3 leads could not
     be moved" with no explanation is indistinguishable from a broken button.
     Deduped, because forty leads refused for the same reason is one sentence. */
  const refused = new Set<string>();
  for (const id of ids) {
    try {
      if (await updateLead(id, patch, actor)) done++;
      else failed++;
    } catch (err) {
      failed++;
      if (err instanceof CrmConflict) {
        const lead = await getLead(id);
        refused.add(`${lead?.name || 'A lead'}: ${err.message}`);
      }
    }
  }
  return { done, failed, refused: [...refused].slice(0, 8) };
}



// ── Tasks across all leads ──

export interface GlobalTask {
  leadId: string;
  leadName: string;
  leadStage: Stage;
  task: Task;
}

export async function allTasks(): Promise<GlobalTask[]> {
  const leads = await liveLeads();
  return leads.flatMap((l) =>
    l.tasks.map((task) => ({ leadId: l.id, leadName: l.name || 'Unknown', leadStage: l.stage, task })),
  );
}

export async function addNote(id: string, body: string, actor?: string): Promise<Lead | null> {
  const note: Note = { id: randomUUID(), body: cleanText(body).trim().slice(0, 4000), at: now(), ...(actor ? { by: actor } : {}) };
  return mutate(id, (lead) => {
    lead.notes.unshift(note);
    markFirstResponse(lead);
  });
}

export async function addTask(id: string, title: string, due?: string, actor?: string): Promise<Lead | null> {
  const task: Task = { id: randomUUID(), title: cleanText(title).trim().slice(0, 300), due, done: false, at: now(), ...(actor ? { by: actor } : {}) };
  return mutate(id, (lead) => {
    lead.tasks.push(task);
    markFirstResponse(lead);
  });
}

export async function toggleTask(id: string, taskId: string): Promise<Lead | null> {
  let found = false;
  const lead = await mutate(id, (l) => {
    const task = l.tasks.find((t) => t.id === taskId);
    if (task) {
      task.done = !task.done;
      found = true;
    }
  });
  return found ? lead : null;
}

/* ── What the conversation established ──

   Written field by field rather than as a blob, so the timeline says what
   changed and when. "Budget set to EUR 250,000" three weeks after "Budget set
   to EUR 180,000" is a fact about the deal, and a wholesale overwrite would
   hide it.

   Every value is checked against its list. These arrive from a form, and a
   stage rule is about to depend on them: a typo silently stored would make a
   lead look qualified when nobody answered anything. */
const QUAL_OPTIONS: Record<string, readonly { id: string }[]> = {
  timeframe: TIMEFRAMES,
  purpose: PURPOSES,
  financing: FINANCING,
  decision: DECISION,
  visit: VISITS,
  motivation: MOTIVATIONS,
  objection: OBJECTIONS,
};

const QUAL_LABELS: Record<string, string> = {
  budget: 'Budget', timeframe: 'Timeframe', purpose: 'Purpose',
  financing: 'Funding', decision: 'Decision maker', visit: 'Samui visit',
  motivation: 'Motivation', objection: 'Objection',
};

const labelOf = (field: string, id?: string) =>
  !id ? 'cleared' : (QUAL_OPTIONS[field]?.find((o) => o.id === id) as { label?: string })?.label || id;

export async function setQualification(
  id: string,
  patch: Qualification,
  actor?: string,
): Promise<Lead | null> {
  return mutate(id, (lead) => {
    const q = (lead.qualification ??= {});

    if ('currency' in patch) {
      const cur = String(patch.currency || '').toUpperCase();
      if ((CURRENCIES as readonly string[]).includes(cur)) q.currency = cur;
    }

    if ('budget' in patch) {
      const raw = patch.budget;
      const next = typeof raw === 'number' && isFinite(raw) && raw > 0 ? Math.round(raw) : undefined;
      if (next !== q.budget) {
        logActivity(
          lead, 'value',
          next ? `Budget set to ${q.currency || 'THB'} ${next.toLocaleString('en-US')}` : 'Budget cleared',
          actor,
        );
        q.budget = next;
      }
    }

    for (const field of Object.keys(QUAL_OPTIONS)) {
      if (!(field in patch)) continue;
      const raw = patch[field as keyof Qualification];
      const value = raw ? String(raw) : undefined;
      // An unrecognised value is dropped, not stored — see above.
      if (value && !QUAL_OPTIONS[field].some((o) => o.id === value)) continue;
      const current = q[field as keyof Qualification] as string | undefined;
      if (value === current) continue;
      logActivity(lead, 'contact', `${QUAL_LABELS[field]}: ${labelOf(field, value)}`, actor);
      (q as Record<string, unknown>)[field] = value;
    }

    // Learning any of this is a person doing the work of selling.
    markFirstResponse(lead);
  });
}

/* ── Logging the contact a person actually made ──

   Until now a phone call could only exist as a free-text note, which meant the
   single most important thing that happens to a lead was the one thing the CRM
   could not see. It could not count calls, could not tell "nobody has tried"
   from "tried twice, no luck", and kept sending automated e-mails to somebody a
   salesperson had spoken to that morning.

   Reaching somebody has the same consequences as them writing to us, because it
   is the same event from the other end: a human now owns the conversation. So a
   reached touch clears the reply timer, ticks its chase task, moves a new lead
   to Contacted, and stops the sequence. A call that rang out does none of that —
   it is worth recording, but it is not contact. */
export async function logTouch(
  id: string,
  key: string,
  note?: string,
  actor?: string,
): Promise<Lead | null> {
  const touch = touchByKey(key);
  if (!touch) return null;
  const said = cleanText(note || '').trim().slice(0, 2000);

  return mutate(id, (lead) => {
    (lead.history ??= []).push({
      id: randomUUID(),
      kind: touch.kind,
      detail: `${touch.past}${said ? ` — ${said}` : ''}`,
      at: now(),
      reached: touch.reached,
      ...(actor ? { by: actor } : {}),
    });

    // Any logged touch is a person acting, which is what speed-to-lead measures.
    markFirstResponse(lead);

    if (!touch.reached) return;

    if (lead.awaiting_reply_since) {
      lead.awaiting_reply_since = undefined;
      const chase = lead.tasks.find((t) => t.title === REPLY_TASK_TITLE && !t.done);
      if (chase) chase.done = true;
    }
    if (lead.stage === 'new') {
      logActivity(lead, 'stage', `${stageLabel('new')} → ${stageLabel('contacted')} (spoke with them)`, actor);
      lead.stage = 'contacted';
    }
  });
}

/* ══════════════════ An agency registering a buyer ══════════════════

   The argument this exists to end: "we introduced that buyer to you in March."
   Until now the answer lived in somebody's inbox, because an introducing
   agency was a free-text word in `source` with no date attached.

   A registration is append-only. It is never edited, never deleted, and a
   second agency registering the same person adds a claim rather than replacing
   one — which is exactly what makes it evidence.

   The refusal is the point. While one agency's protection window is open, a
   different agency cannot simply register over the top of it: the call fails
   with a sentence naming who holds the claim and until when. It CAN be done
   deliberately, with `override`, and then the new claim carries the id of the
   one it went over and the timeline says who decided.

   The Agency is passed in rather than looked up here, so this module never has
   to import the partner module that imports it. */

export class ClaimConflict extends CrmConflict {
  /* A plain field rather than a constructor parameter property: the test
     runner strips types without transforming, and `public readonly` in a
     signature is syntax rather than a type annotation. */
  readonly claim: AgencyClaim;

  constructor(claim: AgencyClaim) {
    super(
      `${claim.agencyName} registered this buyer on ${claim.at.slice(0, 10)}` +
      (claim.expires_at ? ` and holds the claim until ${claim.expires_at.slice(0, 10)}.` : '.'),
    );
    this.name = 'ClaimConflict';
    this.claim = claim;
  }
}

export interface RegistrationInput {
  brokerId?: string;
  brokerName?: string;
  note?: string;
  /** Register over a live claim from another agency, deliberately. */
  override?: boolean;
}

export async function registerAgency(
  leadId: string,
  agency: { id: string; name: string },
  protectionDays: number,
  input: RegistrationInput = {},
  actor?: string,
): Promise<Lead | null> {
  const said = cleanText(input.note || '').trim().slice(0, 1000);
  const brokerName = cleanText(input.brokerName || '').trim().slice(0, 120) || undefined;

  let conflict: AgencyClaim | null = null;
  const lead = await mutate(leadId, (l) => {
    conflict = null;
    const held = activeClaim(l);
    /* The same agency registering again is not a conflict — it is a renewal,
       and it should reset their window rather than be refused. */
    if (held && held.agencyId !== agency.id && !input.override) {
      conflict = held;
      return;
    }
    const at = now();
    const expires = new Date(Date.now() + protectionDays * 86_400_000).toISOString().slice(0, 10);
    const claim: AgencyClaim = {
      id: randomUUID(),
      agencyId: agency.id,
      agencyName: agency.name,
      brokerId: input.brokerId,
      brokerName,
      at,
      expires_at: expires,
      ...(said ? { note: said } : {}),
      ...(actor ? { by: actor } : {}),
      ...(held && held.agencyId !== agency.id ? { overrode: held.id } : {}),
    };
    (l.claims ??= []).push(claim);
    logActivity(
      l,
      'registered',
      `${agency.name} registered this buyer${brokerName ? ` (${brokerName})` : ''}` +
        `, protected to ${expires}` +
        (claim.overrode ? ` — recorded over ${held!.agencyName}'s claim` : '') +
        (said ? ` — ${said}` : ''),
      actor,
    );
  });
  if (conflict) throw new ClaimConflict(conflict);
  return lead;
}

/* Withdrawn, not erased. A registration that turns out to be wrong — the buyer
   was already ours, the agency sent the wrong name — stops counting for both
   protection and credit, and stays on the record with the reason. */
export async function releaseClaim(
  leadId: string,
  claimId: string,
  reason: string,
  actor?: string,
): Promise<Lead | null> {
  const why = cleanText(reason || '').trim().slice(0, 500);
  if (!why) return null;
  let found = false;
  const lead = await mutate(leadId, (l) => {
    found = false;
    const claim = (l.claims || []).find((c) => c.id === claimId && !c.released_at);
    if (!claim) return;
    found = true;
    claim.released_at = now();
    claim.release_reason = why;
    logActivity(l, 'registered', `${claim.agencyName}'s registration withdrawn — ${why}`, actor);
  });
  return found ? lead : null;
}

/* ── Parking a lead until a date ──

   The alternative to the two wrong answers. Closed Lost meant nobody looked
   again and the lost-reason report filled with deals that were never lost;
   left in Qualified they sat being flagged as stalled every day, which is how
   a team learns to ignore its own flags.

   A date and a reason. The stage does not change — a qualified buyer waiting
   on a house sale is still a qualified buyer — but the lead leaves the working
   queue, the automated sequence and every stall rule until the date arrives.
   Then it comes back, in its own section, with the reason still attached. */

export async function setNurture(
  id: string,
  until: string,
  reason?: string,
  note?: string,
  actor?: string,
): Promise<Lead | null> {
  const day = String(until || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // A date in the past would park the lead and wake it in the same breath.
  if (day <= now().slice(0, 10)) return null;
  const picked = NURTURE_REASONS.find((r) => r.id === reason);
  const said = cleanText(note || '').trim().slice(0, 2000);

  return mutate(id, (lead) => {
    lead.nurture_until = day;
    lead.nurture_reason = picked?.id;
    logActivity(
      lead,
      'nurture',
      `Parked until ${day}${picked ? ` — ${picked.label.toLowerCase()}` : ''}${said ? ` — ${said}` : ''}`,
      actor,
    );
    /* Whatever we were waiting on them for, we are not any more. Leaving the
       reply timer running would have the lead flagged the moment it wakes,
       for a silence we chose. */
    lead.awaiting_reply_since = undefined;
    markFirstResponse(lead);
  });
}

/** Back into the working queue, whether or not the date has arrived. */
export async function endNurture(id: string, actor?: string): Promise<Lead | null> {
  return mutate(id, (lead) => {
    if (!lead.nurture_until) return;
    const until = lead.nurture_until;
    lead.nurture_until = undefined;
    lead.nurture_reason = undefined;
    logActivity(lead, 'nurture', `Back in play (was parked until ${until})`, actor);
  });
}

/* ── Reaching for the phone, or the keyboard ──

   The two most-used buttons on the lead page open a `mailto:` and a `wa.me`
   link, and until now the CRM saw nothing at all when they were pressed. The
   two commonest sales channels in the building were its blind spot: "what
   happened last?" simply could not answer for either of them.

   What is recorded is what actually happened — the salesperson OPENED the
   channel. Not "sent an e-mail": a mail client opening is not a message
   leaving, and writing down something we do not know would be worse than the
   silence it replaces. So the timeline says "Opened the mail client to write
   to them", `reached` stays unset, nothing downstream treats it as contact,
   and the sequence keeps running until somebody says otherwise.

   Deduped inside a short window, because a double-click, a bounce back to the
   tab and a second attempt are one intention, and a timeline that logs three
   is a timeline people stop reading. */

export type OutreachChannel = 'email' | 'whatsapp' | 'phone';

const OUTREACH: Record<OutreachChannel, { kind: Activity['kind']; detail: string }> = {
  email:    { kind: 'email',    detail: 'Opened the mail client to write to them' },
  whatsapp: { kind: 'whatsapp', detail: 'Opened WhatsApp to write to them' },
  phone:    { kind: 'call',     detail: 'Dialled their number' },
};

export const OUTREACH_WINDOW_MIN = 10;

export function isOutreachChannel(v: string): v is OutreachChannel {
  return Object.hasOwn(OUTREACH, v);
}

export async function logOutreach(
  id: string,
  channel: OutreachChannel,
  actor?: string,
): Promise<Lead | null> {
  const entry = OUTREACH[channel];
  const cut = new Date(Date.now() - OUTREACH_WINDOW_MIN * 60_000).toISOString();
  return mutate(id, (lead) => {
    const repeat = (lead.history || []).some((h) => h.detail === entry.detail && h.at >= cut);
    if (repeat) return;
    logActivity(lead, entry.kind, entry.detail, actor);
    // Somebody went to write or call. That is a person acting on the lead,
    // which is exactly what speed-to-lead measures — even if the message
    // itself never left.
    markFirstResponse(lead);
  });
}

/* ── Setting a lead aside, and the one way to really destroy it ──

   Until now the only way to get rid of a lead was a real DELETE, which took the
   timeline, the source attribution and the ownership history with it. That is
   the opposite of the developer owning the database: a wrong number and a
   customer's entire history were one click apart, and the only recovery was
   last night's backup.

   Archiving replaces it. The lead leaves every view, count, report and the
   automated sequence, and everything about it survives. */
/* ── The unit a lead is holding ──

   `VillaRecord.buyerLeadId` is a reference with nothing enforcing it, so the
   two records can drift apart in silence. The worst version: archive the buyer
   and the unit still points at them, while they are gone from every list —
   including the masterplan's own buyer picker, which would then show an empty
   box as though the buyer had been unlinked.

   Free units are ignored on purpose: sale data lingers on a released unit by
   design, and a lead that once looked at something is not holding it. */
export async function unitHeldBy(leadId: string): Promise<string | null> {
  const villas = await (await backend()).getVillas();
  for (const [villaId, rec] of Object.entries(villas)) {
    if (rec.buyerLeadId === leadId && rec.status !== 'free') return villaId;
  }
  return null;
}

export async function archiveLead(id: string, reason?: string, actor?: string): Promise<Lead | null> {
  /* A buyer who holds a reserved or sold unit is a live customer, whatever the
     lead list looks like. Setting them aside would leave the unit pointing at
     somebody nobody can see, which is exactly how a sold villa ends up with an
     "Unnamed buyer" against eight million baht. */
  const unit = await unitHeldBy(id);
  if (unit) {
    throw new CrmConflict(
      `This lead is the buyer of ${unit}. Unlink them on the masterplan first, or release the unit.`,
    );
  }
  const why = cleanText(reason || '').trim().slice(0, 300) || undefined;
  return mutate(id, (lead) => {
    if (isArchived(lead)) return; // already set aside; keep the first record of why
    lead.archived_at = now();
    lead.archived_by = actor;
    lead.archive_reason = why;
    logActivity(lead, 'archived', `Archived${why ? `: ${why}` : ''}`, actor);
  });
}

export async function unarchiveLead(id: string, actor?: string): Promise<Lead | null> {
  return mutate(id, (lead) => {
    if (!isArchived(lead)) return;
    lead.archived_at = undefined;
    lead.archived_by = undefined;
    lead.archive_reason = undefined;
    logActivity(lead, 'archived', 'Restored from the archive', actor);
  });
}

export async function bulkArchive(
  ids: string[], reason?: string, actor?: string,
): Promise<{ done: number; failed: number; refused: string[] }> {
  let done = 0, failed = 0;
  /* A lead holding a unit is refused, and the caller is told which — a silent
     "3 of 5 archived" leaves the operator guessing which two, and why. */
  const refused: string[] = [];
  for (const id of ids) {
    try {
      if (await archiveLead(id, reason, actor)) done++; else failed++;
    } catch (err) {
      failed++;
      if (err instanceof CrmConflict) refused.push(err.message);
    }
  }
  return { done, failed, refused };
}

/* The real deletion, for a genuine erasure request. Two deliberate steps: a
   lead has to be archived first, so the destructive act can never be the same
   click as the tidy-up one. Returns 'not-archived' rather than throwing so the
   route can say why instead of failing blankly. */
export async function purgeLead(
  id: string,
): Promise<'purged' | 'not-found' | 'not-archived' | 'holds-unit'> {
  const lead = await (await backend()).getLead(id);
  if (!lead) return 'not-found';
  if (!isArchived(lead)) return 'not-archived';
  /* Belt and braces: archiving already refuses a lead holding a unit, so this
     should be unreachable. It is checked anyway, because a reference left
     pointing at a row that no longer exists is unrecoverable, and a record
     imported or edited outside the normal path could still get here. */
  if (await unitHeldBy(id)) return 'holds-unit';
  return (await (await backend()).removeLead(id)) ? 'purged' : 'not-found';
}

/** Log an automated e-mail on the lead: outbox entry (drives the sequence)
    plus a timeline activity (visible history). */
export async function recordSentEmail(id: string, email: import('./types').SentEmail): Promise<Lead | null> {
  return mutate(id, (lead) => {
    (lead.outbox ??= []).push(email);
    logActivity(lead, 'email', `Auto-email sent: ${email.subject}`);
  });
}

/* ── A customer replied ──

   The single most important event in the whole system: it means a human is on
   the other end. Filing it does four things, and the first three need no
   intelligence at all:

     1. the message lands on the timeline as a note, in full;
     2. a `message` activity is logged, which is what stops the automated
        sequence — from here a person owns the conversation;
     3. the reply timer is cleared and its chase task ticked off;
     4. if the reading engine is configured, its brief is filed as a second
        note and the score is updated from what the customer actually said.

   A lost lead who writes again is a second chance, not history — same revival
   rule as the inbound-message path. */
export interface InboundReply {
  message: string;
  channel?: string;                       // "email", "whatsapp"… for the timeline line
  reading?: { score: Score; note: string; urgency: string } | null;
}

export async function recordInboundReply(id: string, r: InboundReply): Promise<Lead | null> {
  const channel = r.channel || 'email';
  return mutate(id, (lead) => {
    lead.notes.unshift({ id: randomUUID(), body: cleanText(r.message).trim().slice(0, 8000), at: now() });
    logActivity(lead, 'message', `Reply received by ${channel}`);

    if (lead.awaiting_reply_since) {
      lead.awaiting_reply_since = undefined;
      const chase = lead.tasks.find((t) => t.title === REPLY_TASK_TITLE && !t.done);
      if (chase) chase.done = true;
    }

    if (lead.stage === 'lost') {
      logActivity(lead, 'stage', `${stageLabel('lost')} → ${stageLabel('new')} (re-engaged)`);
      lead.stage = 'new';
      lead.lost_reason = undefined;
    }

    if (r.reading) {
      lead.notes.unshift({ id: randomUUID(), body: r.reading.note, at: now() });
      if (r.reading.score !== lead.score) {
        logActivity(lead, 'score', `Score ${cap(lead.score)} → ${cap(r.reading.score)} (read from their reply)`);
        lead.score = r.reading.score;
      }
      // A reply that needs answering today gets a dated task, so it can't sink.
      if (r.reading.urgency === 'today' && !lead.tasks.some((t) => t.title === REPLY_NOW_TASK && !t.done)) {
        lead.tasks.push({
          id: randomUUID(), title: REPLY_NOW_TASK,
          due: now(), done: false, at: now(),
        });
      }
    }
  });
}

const REPLY_NOW_TASK = 'Answer today — they are waiting';

/* ── A call was booked ──

   Someone picking a slot out of the calendar is the strongest signal short of
   money: they are hot, the deal is at least Contacted, and there is now a
   fixed time a human must show up for. The video link goes on the timeline so
   the operator never has to dig for it. */
export interface BookingEvent {
  action: 'booked' | 'rescheduled' | 'cancelled';
  at?: string;         // ISO start time
  timeZone?: string;
  title?: string;
  videoUrl?: string;
  note?: string;       // what they wrote when booking, or why they cancelled
}

const BOOKED_CALL_TASK = 'Call booked — be there';

export async function recordBooking(id: string, b: BookingEvent): Promise<Lead | null> {
  const when = b.at ? new Date(b.at) : null;
  const whenText = when
    ? `${when.toISOString().slice(0, 16).replace('T', ' ')} UTC${b.timeZone ? ` (their time: ${b.timeZone})` : ''}`
    : 'time unknown';

  return mutate(id, (lead) => {
    if (b.action === 'cancelled') {
      logActivity(lead, 'message', `Call cancelled${b.note ? ` — ${b.note}` : ''}`);
      const task = lead.tasks.find((t) => t.title === BOOKED_CALL_TASK && !t.done);
      if (task) task.done = true;
      return;
    }

    logActivity(lead, 'message', `Call ${b.action} for ${whenText}`);
    lead.notes.unshift({
      id: randomUUID(),
      body: [
        `📞 Call ${b.action}: ${whenText}`,
        b.title ? `About: ${b.title}` : '',
        b.videoUrl ? `Join: ${b.videoUrl}` : '',
        b.note ? `\nThey wrote: ${b.note}` : '',
      ].filter(Boolean).join('\n'),
      at: now(),
    });

    // Booking a call is engagement — it ends the automated sequence too.
    if (lead.awaiting_reply_since) {
      lead.awaiting_reply_since = undefined;
      const chase = lead.tasks.find((t) => t.title === REPLY_TASK_TITLE && !t.done);
      if (chase) chase.done = true;
    }
    if (SCORE_RANK.hot < SCORE_RANK[lead.score]) {
      logActivity(lead, 'score', `Score ${cap(lead.score)} → Hot (booked a call)`);
      lead.score = 'hot';
    }
    if (lead.stage === 'new' || lead.stage === 'lost') {
      logActivity(lead, 'stage', `${stageLabel(lead.stage)} → ${stageLabel('contacted')} (call booked)`);
      lead.stage = 'contacted';
      lead.lost_reason = undefined;
    }
    const open = lead.tasks.find((t) => t.title === BOOKED_CALL_TASK && !t.done);
    if (open) open.due = b.at || open.due;
    else lead.tasks.push({ id: randomUUID(), title: BOOKED_CALL_TASK, due: b.at, done: false, at: now() });
  });
}

/* A lead opened one of our documents (the tracked /d/<id> link). Recorded on
   the timeline, which is the whole point: an operator can see that the person
   who went quiet did in fact read the brochure twice.

   Deduped within the hour, because a PDF viewer commonly re-requests the file
   (range requests, reload, a second tab) and three identical lines in a row
   would say less than one. */
export async function recordDownload(id: string, title: string): Promise<void> {
  const cut = new Date(Date.now() - 3_600_000).toISOString();
  await mutate(id, (lead) => {
    const detail = `Opened: ${title}`;
    const repeat = (lead.history || []).some(
      (h) => h.kind === 'download' && h.detail === detail && h.at > cut,
    );
    if (repeat) return;
    logActivity(lead, 'download', detail);

    /* Behaviour beats the form. The score a lead arrives with is a guess made
       from which button they pressed; opening what we sent is evidence. One
       open says they are reading — at least warm. Three says they keep coming
       back to it, which in practice is someone building a case for a decision.

       Only ever upgrades: a human who judged a lead cold after a phone call
       knows more than a click does, and this must not overwrite that. */
    const opens = (lead.history || []).filter((h) => h.kind === 'download').length;
    const earned: Score = opens >= 3 ? 'hot' : 'warm';
    if (SCORE_RANK[earned] < SCORE_RANK[lead.score]) {
      logActivity(
        lead, 'score',
        `Score ${cap(lead.score)} → ${cap(earned)} (opened our documents ${opens}×)`,
      );
      lead.score = earned;
    }
  });
}

/* A document was produced for this lead — an offer, most often.

   Deduped within the hour so that opening the offer twice to check a figure
   does not read, later, as two offers having been issued. Marks a first
   response: writing someone an offer is unambiguously a human acting. */
export async function recordDocument(id: string, detail: string, actor?: string): Promise<Lead | null> {
  const cut = new Date(Date.now() - 3_600_000).toISOString();
  return mutate(id, (lead) => {
    const repeat = (lead.history || []).some(
      (h) => h.kind === 'document' && h.detail === detail && h.at > cut,
    );
    if (repeat) return;
    logActivity(lead, 'document', detail, actor);
    markFirstResponse(lead);
  });
}

/* A lead pressed a button in one of our letters (the tracked /c link).

   Opens tell us little — images load themselves and previews fire on their
   own — but a click is a decision. It carries the same weight as opening a
   document, so it earns the same warm score, and "Clicked: Book a call" on the
   timeline is often the first sign that a quiet lead is coming back to life.

   Deduped within the hour for the same reason downloads are: a mail client
   that prefetches links would otherwise write the same line several times. */
export async function recordClick(id: string, label: string): Promise<void> {
  const cut = new Date(Date.now() - 3_600_000).toISOString();
  await mutate(id, (lead) => {
    const detail = `Clicked: ${label}`;
    const repeat = (lead.history || []).some(
      (h) => h.kind === 'click' && h.detail === detail && h.at > cut,
    );
    if (repeat) return;
    logActivity(lead, 'click', detail);

    // Only ever upgrades cold → warm. A human who judged this lead cold after
    // a phone call knows more than a tap does, and must not be overruled.
    if (SCORE_RANK.warm < SCORE_RANK[lead.score]) {
      logActivity(lead, 'score', `Score ${cap(lead.score)} → Warm (clicked "${label}")`);
      lead.score = 'warm';
    }
  });
}

/* The opt-out link at the foot of every automated e-mail. Ends the sequence
   for good; a person writing to them by hand is unaffected. Idempotent, so a
   double click (or a mail client prefetching the link) is harmless. */
export async function unsubscribeLead(id: string): Promise<Lead | null> {
  return mutate(id, (lead) => {
    if (lead.unsubscribed) return;
    lead.unsubscribed = true;
    logActivity(lead, 'email', 'Customer opted out of the automated e-mails');
  });
}

/* ── Awaiting-reply tracking ──
   The operator marks "email sent" on a lead; after REPLY_FLAG_DAYS quiet days
   (the threshold lives in rules.ts, where the masterplan can read it too) the
   lead and its plot show a red flag. Marking it also drops a follow-up task
   the same distance out, so the chase never relies on memory. */

const REPLY_TASK_TITLE = 'Follow up — no reply yet';

export async function setAwaitingReply(id: string, on: boolean): Promise<Lead | null> {
  return mutate(id, (lead) => {
    if (on) {
      lead.awaiting_reply_since = now();
      markFirstResponse(lead);
      logActivity(lead, 'email', 'Email sent — awaiting reply');
      const due = new Date(Date.now() + REPLY_FLAG_DAYS * 86_400_000).toISOString().slice(0, 10);
      if (!lead.tasks.some((t) => t.title === REPLY_TASK_TITLE && !t.done)) {
        lead.tasks.push({
          id: randomUUID(), title: REPLY_TASK_TITLE,
          due: new Date(due).toISOString(), done: false, at: now(),
        });
      }
    } else {
      lead.awaiting_reply_since = undefined;
      logActivity(lead, 'email', 'Reply received');
      // The chase task has served its purpose — tick it off automatically.
      const task = lead.tasks.find((t) => t.title === REPLY_TASK_TITLE && !t.done);
      if (task) task.done = true;
    }
  });
}

/* What needs a human RIGHT NOW — shown as red badges in the nav on every admin
   page (re-read on each auto-refresh, so it is always current). The rules
   themselves live in rules.ts (pure, shared with client components). */
/* ── The numbers on the dashboard ──

   Every count here except `overdueTasks` is a LEAD count, produced by the same
   six rules as the Today queue and the `?flag=` filter. That is the whole
   point: a capsule reading "7 without a next step" now opens a list of exactly
   those seven. Before, the capsule and the page it pointed at were computed
   from different definitions, and nobody could tell which was right. */
export interface AttentionCounts {
  overdue: number;      // leads whose next step is past its date
  untouched: number;    // new leads nobody has had a conversation with
  awaiting: number;     // leads silent past the reply threshold
  stalled: number;      // sitting in a stage past its max days
  noNext: number;       // live leads with no next step at all
  /** Open TASKS past their date — the Follow-ups badge, which points at a page
      that lists tasks rather than leads. The only count here that is not a
      lead count, and it is labelled that way for exactly that reason. */
  overdueTasks: number;
  /** DISTINCT leads the working queue would put in front of somebody — the
      total of the Today screen, computed by calling it. */
  actionable: number;
}

export async function attentionCounts(): Promise<AttentionCounts> {
  const leads = await liveLeads();
  const today = now().slice(0, 10);
  const count = (key: QueueKey) => leads.filter((l) => matchesFlag(l, key, today)).length;
  const overdueTasks = leads.reduce(
    (n, l) => n + l.tasks.filter((t) => !t.done && t.due && t.due.slice(0, 10) < today).length,
    0,
  );
  return {
    overdue: count('overdue'),
    untouched: count('uncontacted'),
    awaiting: count('silent'),
    stalled: count('stalled'),
    noNext: count('nonext'),
    overdueTasks,
    actionable: workQueue(leads, today).reduce((n, sec) => n + sec.leads.length, 0),
  };
}

// ── Villa availability & sales (masterplan) ──

const VALID_STATUS: VillaStatus[] = ['free', 'reserved', 'sold'];

export interface VillaData {
  villas: Record<string, VillaRecord>;
  history: VillaHistoryEntry[];
}

export async function getVillaData(): Promise<VillaData> {
  const be = await backend();
  const [villas, history] = await Promise.all([be.getVillas(), be.getVillaHistory(400)]);
  return { villas, history };
}

/* List price of a specific plot from its size (M/L/XL) in the unit catalogue —
   the default contract value the moment a unit is reserved/sold, so nobody
   has to type it. Stays editable on the masterplan (double-click). */
const UNIT_SIZE: Record<string, string> = Object.fromEntries(
  (unitCatalog.villas as { id: string; size?: string }[]).map((v) => [v.id, v.size || '']),
);

export function unitListPrice(id: string): number | undefined {
  return priceForSize(UNIT_SIZE[id]);
}

/** The tier a unit belongs to, or '' for the A block, which has none. */
export const unitSize = (id: string): string => UNIT_SIZE[id] || '';

/** Fill the contract value from the list price when a deal starts and none is
    set yet. Returns true when it defaulted (caller logs it). */
function defaultContractValue(id: string, rec: VillaRecord): boolean {
  if (rec.contractValue) return false;
  const lp = unitListPrice(id);
  if (!lp) return false;
  rec.contractValue = lp;
  return true;
}

/** True when the record carries sales data worth keeping even at status 'free'. */
function hasSaleData(rec: VillaRecord): boolean {
  return Boolean(
    rec.buyerLeadId || rec.buyerName || rec.contractValue || rec.promisedDate ||
    (rec.construction && rec.construction !== 'not_started') ||
    Object.values(rec.phases || {}).some((p) => p?.paid) ||
    (rec.extras || []).length,
  );
}

async function persistVilla(id: string, rec: VillaRecord, expectedRev: number): Promise<boolean> {
  const be = await backend();
  if (rec.status === 'free' && !hasSaleData(rec)) return be.setVilla(id, null, expectedRev);
  return be.setVilla(id, rec, expectedRev);
}

/* ── Refusing to sell the same villa twice ──

   The revision guard above stops a write being lost. It does not stop somebody
   deliberately reserving a unit that another salesperson reserved an hour ago,
   because that is not a race — it is two people who each believe the unit is
   theirs to sell. Only a business rule catches that, and it has to be a refusal
   rather than a warning: a warning in a drawer is a warning nobody reads. */
export class VillaConflict extends CrmConflict {
  constructor(message: string) {
    super(message);
    this.name = 'VillaConflict';
  }
}

/** The buyer already on a unit, for a conflict message. */
const heldBy = (rec: VillaRecord): string | undefined => rec.buyerName || rec.buyerLeadId;

/* ── One unit, one writer at a time ──

   A villa is the single record two salespeople can genuinely reach for in the
   same second, and until this existed the second write simply overwrote the
   first: two reservations taken, one kept, and no trace that the other ever
   happened. Leads have been guarded by a revision since v3; this brings units
   up to the same standard.

   Read, change, save conditionally, and if somebody saved in between, read
   again and redo the whole change on the fresh record.

   The reason this needs a helper rather than a loop at each call site is the
   side effects. Both write paths log to the villa history as they go and push
   to the Google Sheet and the 3D twin at the end. Redoing a change that has
   already written half its audit trail would double it, so `t.log` and
   `t.after` QUEUE those and they are flushed only once the save has won. A
   retried attempt throws its queue away with the attempt. */
interface VillaTxn {
  /** Queue an audit line. Written only after the save wins. */
  log(from: VillaStatus, to: VillaStatus, seller?: string, note?: string): void;
  /** Queue an outward sync. Run only after the save wins, best-effort. */
  after(fn: () => Promise<void>): void;
}

async function villaTxn(
  id: string,
  body: (rec: VillaRecord, from: VillaStatus, t: VillaTxn) => Promise<'abort' | void> | 'abort' | void,
): Promise<VillaData | null> {
  const be = await backend();
  for (let attempt = 0; attempt < 4; attempt++) {
    const stored = (await be.getVillas())[id];
    const expectedRev = stored?.rev || 0;
    const from: VillaStatus = stored?.status || 'free';
    // Work on a copy: an aborted or lost attempt must leave nothing behind.
    const rec: VillaRecord = stored
      ? (JSON.parse(JSON.stringify(stored)) as VillaRecord)
      : { status: 'free', updatedAt: '' };

    const logs: VillaHistoryEntry[] = [];
    const afters: (() => Promise<void>)[] = [];
    const t: VillaTxn = {
      log: (f, to, seller, note) =>
        logs.push({ id: randomUUID(), villaId: id, from: f, to, seller, note, at: now() }),
      after: (fn) => afters.push(fn),
    };

    if ((await body(rec, from, t)) === 'abort') return null;

    rec.updatedAt = now();
    rec.rev = expectedRev + 1;
    if (!(await persistVilla(id, rec, expectedRev))) continue; // lost the race — redo

    for (const entry of logs) await be.addVillaHistory(entry).catch(() => {});
    for (const fn of afters) await fn().catch(() => {});
    return getVillaData();
  }
  throw new Error(`villa ${id}: too many concurrent updates`);
}

/* Mirror a status change to the Google Sheet — unless the change CAME from the
   sheet (silent), which would loop. Best-effort, never blocks the save. */
async function sheetSync(id: string, status: VillaStatus, seller?: string, note?: string) {
  if (!process.env.SHEET_WEBHOOK || !process.env.SHEET_SECRET) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    await fetch(process.env.SHEET_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.SHEET_SECRET, id, status, seller: seller || '', note: note || '' }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch { /* sheet sync is best-effort */ }
}

/* Push a unit change to the integration partner (3DEstate Smart Model), so
   the 3D twin updates instantly instead of waiting for its next poll. Only
   active when PARTNER_WEBHOOK_URL is set; never exposes buyer identity. */
async function partnerPush(id: string, status: VillaStatus, rec?: VillaRecord) {
  const url = process.env.PARTNER_WEBHOOK_URL;
  if (!url) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'unit.updated',
        id,
        status: status === 'free' ? 'available' : status,
        price: rec?.contractValue ?? null,
        at: now(),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch { /* partner push is best-effort */ }
}

export async function setVillaStatus(
  id: string,
  status: VillaStatus,
  meta?: { seller?: string; note?: string },
  opts?: { silent?: boolean },
): Promise<VillaData | null> {
  if (!VALID_STATUS.includes(status)) return null;
  const seller = meta?.seller?.trim().slice(0, 120) || undefined;
  const note = meta?.note?.trim().slice(0, 500) || undefined;

  return villaTxn(id, (rec, from, t) => {
    /* Starting a reservation on a unit that is already reserved or sold to
       somebody is the mistake this exists to prevent. Releasing it to free
       first is the deliberate act that makes it available again, and
       reserved → sold is ordinary progress, so neither is blocked. */
    if (status === 'reserved' && (from === 'reserved' || from === 'sold') && heldBy(rec)) {
      throw new VillaConflict(
        `${id} is already ${from} for ${heldBy(rec)}. Release it to free first if that reservation is over.`,
      );
    }

    rec.status = status;
    rec.seller = seller;
    rec.note = note;

    if (status === 'free') {
      /* Back to free = the deal is off. Clear the sales data; the audit trail
         keeps what it was. persistVilla drops the row entirely once nothing
         worth keeping is left on it. */
      delete rec.buyerLeadId; delete rec.buyerName; delete rec.contractValue;
      delete rec.promisedDate; delete rec.construction; delete rec.phases; delete rec.extras;
    } else if (defaultContractValue(id, rec)) {
      // A deal just started — price it from the list automatically.
      t.log(from, status, seller, `Contract value set from list price (${fmtTHB(rec.contractValue!)})`);
    }

    t.log(from, status, seller, note);
    if (!opts?.silent) t.after(() => sheetSync(id, status, seller, note));
    t.after(() => partnerPush(id, status, rec));
  });
}

export type VillaSaleOp =
  | { op: 'sale'; patch: {
      buyerLeadId?: string | null; buyerName?: string;
      contractValue?: number | null; promisedDate?: string | null;
      construction?: Construction;
    } }
  | { op: 'phase'; key: PhaseKey; paid: boolean; amount?: number }
  | { op: 'extraAdd'; label: string; price?: number }
  | { op: 'extraRemove'; extraId: string }
  /* ── The reservation as a process ──
     `reserve` takes the villa off the market AND records the agreement behind
     it; `reservationPatch` fills in what was not known at the time (the deposit
     landing, the signed agreement); `releaseReservation` is the hold lapsing or
     being cancelled, which puts the villa back on the market and says why. */
  | { op: 'reserve'; amount?: number; expiresAt?: string; agreement?: string; note?: string; by?: string }
  | { op: 'reservationPatch'; patch: { amount?: number | null; paidAt?: string | null; expiresAt?: string | null; agreement?: string | null; note?: string } }
  | { op: 'releaseReservation'; reason: string }
  | { op: 'contract'; status: ContractStatus; note?: string }
  /* This unit's own payment terms. `null` puts it back on the standard ones.
     Refused once money has been taken against the schedule — changing the
     split under a paid instalment silently rewrites what was received. */
  | { op: 'schedule'; phases: PhaseDef[] | null };

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : undefined;

/* ── Freezing the terms a unit was sold on ──

   Called the first time money is agreed on a unit. It writes nothing while the
   project sells on the standard schedule — `scheduleFor` already answers
   DEFAULT_SCHEDULE for a unit with no stamp, so storing it would only make
   every record bigger for no change in behaviour.

   Once the project sells on something else, the stamp is what stops next
   year's change of terms from retroactively rewriting a deal already struck. */
function stampSchedule(rec: VillaRecord): void {
  if (rec.schedule?.length) return;
  const house = houseSchedule();
  if (house === DEFAULT_SCHEDULE) return;
  rec.schedule = house;
}

export async function updateVillaSale(id: string, action: VillaSaleOp): Promise<VillaData | null> {
  const be = await backend();
  return villaTxn(id, async (rec, from, t) => {
  switch (action.op) {
    case 'sale': {
      const p = action.patch;
      if ('buyerLeadId' in p) {
        if (p.buyerLeadId) {
          // Linking a second buyer over the first is the same mistake as
          // reserving a reserved unit, and is refused for the same reason.
          if (rec.buyerLeadId && rec.buyerLeadId !== p.buyerLeadId) {
            throw new VillaConflict(
              `${id} is already linked to ${heldBy(rec)}. Unlink that buyer first.`,
            );
          }
          const lead = await be.getLead(p.buyerLeadId);
          if (lead) {
            rec.buyerLeadId = lead.id;
            rec.buyerName = lead.name || lead.email || 'Unknown';
            rec.contractValue ||= lead.value || villaByName(lead.villa)?.price || unitListPrice(id);
            t.log(from, rec.status, undefined, `Buyer linked: ${rec.buyerName}`);
          }
        } else {
          rec.buyerLeadId = undefined;
          rec.buyerName = undefined;
          t.log(from, rec.status, undefined, 'Buyer unlinked');
        }
      }
      if ('buyerName' in p && p.buyerName !== undefined) rec.buyerName = p.buyerName.trim().slice(0, 120) || undefined;
      if ('contractValue' in p) {
        rec.contractValue = p.contractValue === null ? undefined : num(p.contractValue) ?? rec.contractValue;
        if (rec.contractValue) stampSchedule(rec);
      }
      if ('promisedDate' in p) rec.promisedDate = p.promisedDate ? String(p.promisedDate).slice(0, 10) : undefined;
      if ('construction' in p && p.construction) {
        const valid = ['not_started', 'foundation', 'structure', 'furnishing', 'done'];
        if (valid.includes(p.construction)) {
          if (p.construction !== rec.construction)
            t.log(from, rec.status, undefined, `Construction: ${p.construction.replace('_', ' ')}`);
          rec.construction = p.construction;
        }
      }
      break;
    }
    case 'phase': {
      const def = scheduleFor(rec).find((ph) => ph.key === action.key);
      if (!def) return 'abort';
      // Money arriving without a price on record: default from the list so the
      // 7/43/40/10 amounts compute immediately.
      stampSchedule(rec);
      if (action.paid && defaultContractValue(id, rec))
        t.log(from, rec.status, undefined, `Contract value set from list price (${fmtTHB(rec.contractValue!)})`);
      rec.phases ??= {};
      const amount = num(action.amount);
      rec.phases[action.key] = action.paid
        ? { paid: true, at: now(), amount }
        : { paid: false };
      const amt = phaseAmount(rec, action.key);
      t.log(from, rec.status, undefined,
        action.paid ? `${def.label} paid${amt ? ` (${fmtTHB(amt)})` : ''}` : `${def.label} unmarked`);
      // Money changes availability: first payment reserves, full schedule = sold.
      if (action.paid && rec.status === 'free') rec.status = 'reserved';
      if (scheduleFor(rec).every((ph) => rec.phases?.[ph.key]?.paid)) rec.status = 'sold';
      if (rec.status !== from) {
        t.log(from, rec.status, rec.seller, 'Status advanced by payment');
        const advanced = rec.status;
        t.after(() => sheetSync(id, advanced, rec.seller, rec.note));
        t.after(() => partnerPush(id, advanced, rec));
      }
      break;
    }
    /* ── Reserving ──

       Refused without a buyer on the record. A held villa nobody can name is
       the reservation equivalent of a sold unit still marked free: it looks
       fine on the masterplan and there is no way to answer "held for whom".

       The existing double-reservation guard still applies above this — a unit
       already reserved or sold for somebody else never reaches here. */
    case 'reserve': {
      if (!rec.buyerLeadId && !rec.buyerName) {
        throw new VillaConflict(`Link the buyer to ${id} before reserving it — a hold nobody can name is not a reservation.`);
      }
      const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : undefined);
      rec.reservation = {
        at: now(),
        amount: num(action.amount),
        expires_at: day(action.expiresAt),
        agreement: cleanText(action.agreement || '').trim().slice(0, 300) || undefined,
        note: cleanText(action.note || '').trim().slice(0, 2000) || undefined,
        by: action.by,
      };
      stampSchedule(rec);
      rec.status = 'reserved';
      t.log(from, 'reserved', action.by,
        `Reserved for ${heldBy(rec)}` +
        (rec.reservation.amount ? ` · deposit ${fmtTHB(rec.reservation.amount)}` : '') +
        (rec.reservation.expires_at ? ` · holds to ${rec.reservation.expires_at}` : ''));
      if (from !== 'reserved') {
        t.after(() => sheetSync(id, 'reserved', rec.seller, rec.note));
        t.after(() => partnerPush(id, 'reserved', rec));
      }
      break;
    }
    case 'reservationPatch': {
      const r = rec.reservation;
      if (!r) return 'abort';
      const p = action.patch;
      const day = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : undefined);
      if ('amount' in p) r.amount = p.amount === null ? undefined : num(p.amount);
      if ('paidAt' in p) {
        const was = r.paid_at;
        r.paid_at = p.paidAt === null ? undefined : day(p.paidAt);
        if (r.paid_at && r.paid_at !== was) {
          t.log(from, rec.status, undefined,
            `Reservation deposit received${r.amount ? ` (${fmtTHB(r.amount)})` : ''} on ${r.paid_at}`);
        }
      }
      if ('expiresAt' in p) r.expires_at = p.expiresAt === null ? undefined : day(p.expiresAt);
      if ('agreement' in p) r.agreement = p.agreement === null ? undefined : cleanText(p.agreement || '').trim().slice(0, 300) || undefined;
      if ('note' in p) r.note = cleanText(p.note || '').trim().slice(0, 2000) || undefined;
      break;
    }
    /* The hold lapsing or being cancelled. The villa goes back on the market
       and the reservation record goes — but the villa history keeps the whole
       thing, with the reason, which is what somebody will want in six months
       when the buyer comes back and says they were promised it. */
    case 'releaseReservation': {
      const why = cleanText(action.reason || '').trim().slice(0, 500);
      if (!rec.reservation || !why) return 'abort';
      const held = heldBy(rec);
      rec.reservation = undefined;
      rec.status = 'free';
      t.log(from, 'free', rec.seller, `Reservation released${held ? ` (was ${held})` : ''} — ${why}`);
      t.after(() => sheetSync(id, 'free', rec.seller, rec.note));
      t.after(() => partnerPush(id, 'free', rec));
      break;
    }
    /* ── The SPA ──
       Each step stamps its own date the first time it is reached, so going
       back a step to correct a mis-click never rewrites when the contract
       actually went out. */
    case 'contract': {
      const step = CONTRACT_STEPS.find((c) => c.id === action.status);
      if (!step) return 'abort';
      const c = (rec.contract ??= { status: 'none' });
      const today = now().slice(0, 10);
      if (action.status === 'sent' && !c.sent_at) c.sent_at = today;
      if (action.status === 'review' && !c.reviewed_at) c.reviewed_at = today;
      if (action.status === 'signed' && !c.signed_at) c.signed_at = today;
      if ('note' in action) c.note = cleanText(action.note || '').trim().slice(0, 2000) || undefined;
      if (c.status !== step.id) {
        c.status = step.id;
        t.log(from, rec.status, undefined, `Contract: ${step.label.toLowerCase()}`);
      }
      break;
    }
    case 'schedule': {
      const anyPaid = scheduleFor(rec).some((ph) => rec.phases?.[ph.key]?.paid);
      if (anyPaid) {
        throw new VillaConflict(
          `${id} has instalments already paid against its schedule. Changing the split now would rewrite what was received.`,
        );
      }
      if (action.phases === null) {
        rec.schedule = undefined;
        t.log(from, rec.status, undefined, 'Payment schedule: back to the standard terms');
        break;
      }
      const problem = scheduleProblem(action.phases);
      if (problem) throw new VillaConflict(`That schedule will not do: ${problem}`);
      rec.schedule = toSchedule(action.phases)!;
      t.log(from, rec.status, undefined, `Payment schedule set to ${rec.schedule.map((ph) => ph.pct).join(' / ')}`);
      break;
    }
    case 'extraAdd': {
      const label = action.label.trim().slice(0, 120);
      if (!label) return 'abort';
      (rec.extras ??= []).push({ id: randomUUID(), label, price: num(action.price) });
      t.log(from, rec.status, undefined, `Extra added: ${label}`);
      break;
    }
    case 'extraRemove': {
      const extra = (rec.extras || []).find((e) => e.id === action.extraId);
      rec.extras = (rec.extras || []).filter((e) => e.id !== action.extraId);
      if (extra) t.log(from, rec.status, undefined, `Extra removed: ${extra.label}`);
      break;
    }
  }
  });
}

/* ── Holds that are about to lapse, and holds that already have ──

   A reservation with an expiry date is only useful if somebody is told when it
   passes. Before this, an expired hold looked exactly like a live one on the
   masterplan, and the way anybody found out was by trying to sell the villa to
   somebody else.

   `daysLeft` is negative once the date has passed, which is deliberate: "−9"
   reads as nine days overdue, and a report that clamps it at zero throws away
   how bad the situation is. */

export type HoldState = 'lapsed' | 'due' | 'held';

export interface HeldUnit {
  id: string;
  buyerName?: string;
  buyerLeadId?: string;
  reservedAt: string;
  expiresAt?: string;
  amount?: number;
  depositPaid: boolean;
  daysLeft: number | null;   // null when no expiry was agreed
  state: HoldState;
}

export async function reservationWatch(withinDays = 7): Promise<HeldUnit[]> {
  const { villas } = await getVillaData();
  const today = now().slice(0, 10);
  const out: HeldUnit[] = [];

  for (const [id, rec] of Object.entries(villas)) {
    const r = rec.reservation;
    if (!r || rec.status !== 'reserved') continue;
    const daysLeft = r.expires_at
      ? Math.round((Date.parse(`${r.expires_at}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
      : null;
    const state: HoldState =
      daysLeft === null ? 'held' : daysLeft < 0 ? 'lapsed' : daysLeft <= withinDays ? 'due' : 'held';
    out.push({
      id,
      buyerName: rec.buyerName,
      buyerLeadId: rec.buyerLeadId,
      reservedAt: r.at,
      expiresAt: r.expires_at,
      amount: r.amount,
      depositPaid: Boolean(r.paid_at),
      daysLeft,
      state,
    });
  }

  /* Worst first: lapsed, then closest to lapsing, then the open-ended ones. */
  const rank: Record<HoldState, number> = { lapsed: 0, due: 1, held: 2 };
  return out.sort(
    (a, b) => rank[a.state] - rank[b.state] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999),
  );
}

/* ── Broken references, found before somebody trips over one ──

   Nothing enforces the link between a unit and its buyer, so the checks have to
   be run rather than relied upon. All four of these are silent failures: none
   throws, none shows up as an error, and each one first appears as a number
   that is quietly wrong on a page somebody is making a decision from.

   Read-only by design. It reports; a person decides what to do, because every
   fix here is a business judgement — which of two records is the real buyer,
   whether a unit was actually sold. */
export type IntegrityKind =
  | 'dangling-buyer'      // the unit points at a lead that no longer exists
  | 'archived-buyer'      // the buyer is out of every view while the unit still holds them
  | 'held-without-buyer'  // reserved or sold, and nobody is named
  | 'lead-without-owner'  // an active lead nobody is responsible for
  | 'unit-without-price'; // sold or reserved with no figure attached to it

export interface IntegrityIssue {
  kind: IntegrityKind;
  villaId?: string;
  leadId?: string;
  /** What is wrong, in a sentence the operator can act on. */
  detail: string;
}

export async function integrityIssues(): Promise<IntegrityIssue[]> {
  const be = await backend();
  const [villas, leads] = await Promise.all([be.getVillas(), be.allLeads()]);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const issues: IntegrityIssue[] = [];

  for (const [villaId, rec] of Object.entries(villas)) {
    if (rec.status === 'free') continue; // a released unit keeps its history, and that is fine

    if (rec.buyerLeadId) {
      const lead = byId.get(rec.buyerLeadId);
      if (!lead) {
        issues.push({
          kind: 'dangling-buyer', villaId, leadId: rec.buyerLeadId,
          detail: `${villaId} is ${rec.status} to a lead that no longer exists${rec.buyerName ? ` (recorded as ${rec.buyerName})` : ''}.`,
        });
      } else if (isArchived(lead)) {
        issues.push({
          kind: 'archived-buyer', villaId, leadId: lead.id,
          detail: `${villaId} is ${rec.status} to ${lead.name || lead.email || 'a buyer'}, whose lead is archived.`,
        });
      }
    } else if (!rec.buyerName) {
      issues.push({
        kind: 'held-without-buyer', villaId,
        detail: `${villaId} is ${rec.status} with no buyer named.`,
      });
    }

    /* A unit with neither a contract value nor a list price contributes zero to
       every revenue figure while still counting as sold. The A block is the
       reason this can happen: its units carry no size tier, so there is no list
       price to fall back on, and nothing prompts for one. */
    if (!rec.contractValue && !unitListPrice(villaId)) {
      issues.push({
        kind: 'unit-without-price', villaId,
        detail: `${villaId} is ${rec.status} with no price on it, so it counts as zero revenue.`,
      });
    }
  }

  /* An unowned active lead is nobody's job, and the round-robin only assigns at
     intake — a lead that arrived before a roster existed stays unowned until
     somebody notices. */
  for (const lead of leads) {
    if (isArchived(lead) || !ACTIVE_STAGES.includes(lead.stage) || lead.owner) continue;
    issues.push({
      kind: 'lead-without-owner', leadId: lead.id,
      detail: `${lead.name || lead.email || 'A lead'} is ${lead.stage} with no salesperson responsible for it.`,
    });
  }

  return issues;
}

// ── Interaction events ──

export async function addEvent(e: Omit<CrmEvent, 'id' | 'at'>): Promise<CrmEvent> {
  const ev: CrmEvent = {
    id: randomUUID(),
    type: (e.type || 'click').slice(0, 40),
    label: (e.label || '').slice(0, 120),
    path: e.path?.slice(0, 200),
    source: e.source?.slice(0, 80),
    at: now(),
  };
  // Only a WhatsApp tap carries these, and only then are they written.
  if (e.ref) ev.ref = e.ref.slice(0, 16).toUpperCase();
  if (e.locale) ev.locale = e.locale.slice(0, 10);
  if (e.page_url) ev.page_url = e.page_url.slice(0, 300);
  if (e.utm && Object.keys(e.utm).length) ev.utm = e.utm;
  await (await backend()).insertEvent(ev);
  return ev;
}

export async function listEvents(limit = 40): Promise<CrmEvent[]> {
  return (await backend()).allEvents(limit);
}

/* ── Matching an inbound WhatsApp message back to the tap that started it ──

   The window is deliberately generous: someone taps the icon on a laptop, then
   finds the conversation on their phone that evening and writes then. A day
   covers that without ever reaching back far enough to attach a stranger's
   message to somebody else's browsing — the codes are random, so a wrong match
   would take a collision AND a guess. The newest tap wins, which is the right
   reading of a visitor who came back and tapped again. */
const REF_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function findClickByRef(ref: string): Promise<CrmEvent | null> {
  const code = ref.trim().toUpperCase();
  if (!code) return null;
  const since = new Date(Date.now() - REF_WINDOW_MS).toISOString();
  return (await backend()).findEventByRef(code, since);
}

// ── Reporting ──

export interface Stats {
  total: number;
  openTasks: number;
  byStage: Record<string, number>;
  byScore: Record<string, number>;
  bySource: { source: string; count: number }[];
  byForm: Record<string, number>;
  last7: number;
  events24h: number;
  visits24h: number;
  visits7d: number;
  visitsBySource: { source: string; count: number }[];
  /* v2 additions */
  byDay: { day: string; count: number }[]; // last 30 days, oldest first
  funnel: { stage: Stage; label: string; reached: number; pct: number }[]; // cumulative, lost excluded
  lost: number;
  wonRate: number; // won / (won + lost), 0 when undecided
  /* v3 additions — THB */
  pipelineValue: number; // sum of deal values in Qualified + Reserved
  wonValue: number;
  attention: {
    overdue: { taskId: string; leadId: string; leadName: string; title: string; due: string }[];
    untouched: { leadId: string; leadName: string; score: string; ageDays: number }[];
  };
}

export async function stats(): Promise<Stats> {
  const be = await backend();
  // Live leads only: an archived lead left in the counts inflates every rate
  // computed from them, and does it silently.
  const [leads, events] = await Promise.all([liveLeads(), be.allEvents(500)]);
  const byStage: Record<string, number> = {};
  const byScore: Record<string, number> = {};
  const byForm: Record<string, number> = {};
  const srcMap: Record<string, number> = {};
  let openTasks = 0;
  const weekAgo = daysAgo(7);
  const dayAgo = daysAgo(1);
  const nowIso = now();
  let last7 = 0;

  for (const l of leads) {
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    byScore[l.score] = (byScore[l.score] || 0) + 1;
    if (l.form_type) byForm[l.form_type] = (byForm[l.form_type] || 0) + 1;
    const src = l.source || l.utm_source || 'direct';
    srcMap[src] = (srcMap[src] || 0) + 1;
    openTasks += l.tasks.filter((t) => !t.done).length;
    if ((l.created_at || '') >= weekAgo) last7 += 1;
  }

  const bySource = Object.entries(srcMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // Daily lead counts, last 30 days (zero-filled so the trend reads correctly).
  const byDay: { day: string; count: number }[] = [];
  const dayCounts: Record<string, number> = {};
  for (const l of leads) {
    const day = (l.created_at || '').slice(0, 10);
    if (day) dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  for (let i = 29; i >= 0; i--) {
    const day = daysAgo(i).slice(0, 10);
    byDay.push({ day, count: dayCounts[day] || 0 });
  }

  // Cumulative funnel: how many leads reached each stage or went beyond it.
  // Lost leads are excluded from progression and reported separately.
  const order = STAGES.filter((st) => st.id !== 'lost').map((st) => st.id);
  const lost = byStage.lost || 0;
  const active = leads.filter((l) => l.stage !== 'lost');
  const funnel = order.map((stageId, i) => {
    const reached = active.filter((l) => order.indexOf(l.stage) >= i).length;
    return {
      stage: stageId,
      label: stageLabel(stageId),
      reached,
      pct: active.length ? Math.round((reached / active.length) * 100) : 0,
    };
  });
  const won = byStage.won || 0;
  const wonRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
  /* Everything still open that has been qualified. It used to be the two
     stages `qualified` and `reserved` by name, which meant that adding the
     stages in between would silently have dropped presentations, visits,
     negotiations and contracts out of the pipeline figure. */
  const pipelineValue = leads
    .filter((l) => isOpenStage(l.stage) && atOrBeyond(l.stage, 'qualified'))
    .reduce((n, l) => n + (l.value || 0), 0);
  const wonValue = leads.filter((l) => l.stage === 'won').reduce((n, l) => n + (l.value || 0), 0);

  // What needs a human today: overdue follow-ups and new leads left untouched
  // for more than 48 hours (no note, no task, still in "New").
  // Overdue compares CALENDAR DATES, not instants — a due date is stored as
  // midnight UTC, so an instant comparison would flag today's tasks as overdue
  // the moment the UTC day starts.
  const today = nowIso.slice(0, 10);
  const overdue = leads
    .flatMap((l) =>
      l.tasks
        .filter((t) => !t.done && t.due && t.due.slice(0, 10) < today)
        .map((t) => ({ taskId: t.id, leadId: l.id, leadName: l.name || 'Unknown', title: t.title, due: t.due! })),
    )
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 8);
  const newCut = daysAgo(STAGE_MAX_DAYS.new ?? 1);
  const untouched = leads
    .filter((l) => l.stage === 'new' && (l.created_at || '') < newCut && l.notes.length === 0 && l.tasks.length === 0)
    .map((l) => ({
      leadId: l.id,
      leadName: l.name || 'Unknown',
      score: l.score,
      ageDays: Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 8);

  const clicks = events.filter((e) => e.type !== 'visit');
  const visits = events.filter((e) => e.type === 'visit');
  const events24h = clicks.filter((e) => e.at >= dayAgo).length;
  const visits24h = visits.filter((e) => e.at >= dayAgo).length;
  const visits7d = visits.filter((e) => e.at >= weekAgo).length;

  // Where visitors come from: prefer the campaign source (?source=/utm) when
  // present, else the referrer host captured in the visit label.
  const vSrc: Record<string, number> = {};
  for (const v of visits.filter((e) => e.at >= weekAgo)) {
    const src = v.source || v.label || 'direct';
    vSrc[src] = (vSrc[src] || 0) + 1;
  }
  const visitsBySource = Object.entries(vSrc)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: leads.length, openTasks, byStage, byScore, bySource, byForm, last7,
    events24h, visits24h, visits7d, visitsBySource,
    byDay, funnel, lost, wonRate, attention: { overdue, untouched },
    pipelineValue, wonValue,
  };
}

/* ══════════════════ Project notes ══════════════════

   The board for everything that isn't a lead. Kept deliberately thin: a note is
   a document, and every write replaces it whole. No revision dance like leads —
   two people editing the same card at the same second is not a problem this
   board has, and pretending otherwise would only make it harder to use. */

const noteText = (s: unknown, max: number) => cleanText(String(s ?? '')).trim().slice(0, max);

export interface NoteInput {
  title?: string;
  body?: string;
  items?: { id?: string; text: string; done?: boolean }[];
  color?: CardColor;
  labels?: string[];
  pinned?: boolean;
  archived?: boolean;
  due?: string;
  owner?: string;
}

/** Pinned first, then most recently touched. That ordering IS the board. */
export async function listNotes(): Promise<ProjectNote[]> {
  const notes = await (await backend()).allNotes();
  return notes.sort((a, b) =>
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    (b.updatedAt || b.at || '').localeCompare(a.updatedAt || a.at || ''),
  );
}

function cleanItems(items: NoteInput['items']): CardItem[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const list = items
    .map((it) => ({ id: it.id || randomUUID(), text: noteText(it.text, 500), done: Boolean(it.done) }))
    .filter((it) => it.text);
  return list.length ? list : [];
}

/** Only the fields actually present in the patch are touched — the composer
    sends a whole note, a checkbox tick sends one field. */
function applyInput(note: ProjectNote, input: NoteInput): ProjectNote {
  if ('title' in input)    note.title  = noteText(input.title, 200) || undefined;
  if ('body' in input)     note.body   = noteText(input.body, 8000) || undefined;
  if ('items' in input)    note.items  = cleanItems(input.items);
  if ('color' in input)    note.color  = CARD_COLORS.includes(input.color as CardColor) ? input.color : 'plain';
  if ('labels' in input)   note.labels = (input.labels || []).map((l) => noteText(l, 40)).filter(Boolean).slice(0, 8);
  if ('pinned' in input)   note.pinned = Boolean(input.pinned);
  if ('archived' in input) note.archived = Boolean(input.archived);
  if ('due' in input)      note.due    = noteText(input.due, 30) || undefined;
  if ('owner' in input)    note.owner  = noteText(input.owner, 60) || undefined;
  note.updatedAt = now();
  return note;
}

export async function createNote(input: NoteInput, actor?: string): Promise<ProjectNote> {
  const note = applyInput(
    { id: randomUUID(), at: now(), updatedAt: now(), ...(actor ? { by: actor } : {}) },
    input,
  );
  await (await backend()).saveNote(note);
  return note;
}

export async function updateNote(id: string, input: NoteInput): Promise<ProjectNote | null> {
  const be = await backend();
  const note = (await be.allNotes()).find((n) => n.id === id);
  if (!note) return null;
  const next = applyInput({ ...note }, input);
  await be.saveNote(next);
  return next;
}

/** Tick one checklist line. Its own call so the board can fire it on a tap
    without sending (and risking clobbering) the rest of the note. */
export async function toggleNoteItem(id: string, itemId: string): Promise<ProjectNote | null> {
  const be = await backend();
  const note = (await be.allNotes()).find((n) => n.id === id);
  if (!note?.items) return null;
  const next: ProjectNote = {
    ...note,
    items: note.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
    updatedAt: now(),
  };
  await be.saveNote(next);
  return next;
}

export async function deleteNote(id: string): Promise<boolean> {
  return (await backend()).removeNote(id);
}

/** Every label in use, most-used first — the board's filter bar. */
export async function noteLabels(): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const n of await (await backend()).allNotes()) {
    if (n.archived) continue;
    for (const l of n.labels || []) counts.set(l, (counts.get(l) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
}

/** Attach (or clear) the Google Task this card mirrors to. Deliberately NOT an
    updateNote patch: the link is bookkeeping, and bumping updatedAt for it would
    shuffle the board every time the sync runs. */
export async function linkNoteToTask(id: string, googleTaskId?: string): Promise<void> {
  const be = await backend();
  const note = (await be.allNotes()).find((n) => n.id === id);
  if (!note) return;
  const next = { ...note };
  if (googleTaskId) next.googleTaskId = googleTaskId;
  else delete next.googleTaskId;
  await be.saveNote(next);
}

/** Integration state (tokens, sync marks) lives beside the notes, not in them. */
export async function getSetting<T>(key: string): Promise<T | null> {
  return (await backend()).getSetting<T>(key);
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  return (await backend()).setSetting(key, value);
}
