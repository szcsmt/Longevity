import { randomUUID } from 'node:crypto';
import type {
  Activity, Construction, CrmEvent, Lead, LeadPatch, Note, PhaseKey, Score, Stage, Task,
  VillaHistoryEntry, VillaRecord, VillaStatus,
} from './types';
import { PHASES, SCORES, STAGES } from './types';
import { scoreFor } from './scoring';
import { fmtTHB, phaseAmount, villaByName } from './villas';
import { hasDatabase, type Backend } from './backend';
import { fileBackend } from './backend-file';
export type { VillaHistoryEntry, VillaRecord, VillaStatus } from './types';

/* Domain layer of the CRM store. Persistence is pluggable: with a DATABASE_URL
   (production / Vercel + Neon) it uses Postgres; otherwise a local JSON file
   (dev). Starts EMPTY — only real form submissions and real site clicks land
   here. All CRM code talks to these functions only. */

let cached: Backend | null = null;
async function backend(): Promise<Backend> {
  if (cached) return cached;
  if (hasDatabase()) {
    const { pgBackend } = await import('./backend-pg');
    cached = pgBackend;
  } else {
    cached = fileBackend;
  }
  return cached;
}

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

// ── Lead queries ──

export interface LeadFilter {
  stage?: Stage;
  score?: string;
  form_type?: string;
  source?: string;
  q?: string;
}

export async function listLeads(filter: LeadFilter = {}): Promise<Lead[]> {
  const leads = await (await backend()).allLeads();
  const q = filter.q?.trim().toLowerCase();
  return leads
    .filter((l) => {
      if (filter.stage && l.stage !== filter.stage) return false;
      if (filter.score && l.score !== filter.score) return false;
      if (filter.form_type && l.form_type !== filter.form_type) return false;
      if (filter.source && (l.source || l.utm_source || '') !== filter.source) return false;
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
  const leads = await (await backend()).allLeads();
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
  await (await backend()).insertLead(lead);
  return lead;
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

export async function createManualLead(input: ManualLeadInput): Promise<Lead> {
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
    history: [{ id: randomUUID(), kind: 'created', detail: `Added manually (${source})`, at: now() }],
    created_at: now(),
    updated_at: now(),
    rev: 0,
  };
  const note = t(input.note);
  if (note) lead.notes.push({ id: randomUUID(), body: note, at: now() });
  await (await backend()).insertLead(lead);
  return lead;
}

const stageLabel = (id?: string) => STAGES.find((s) => s.id === id)?.label || id || '?';
const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : '?');

function logActivity(lead: Lead, kind: Activity['kind'], detail: string) {
  (lead.history ??= []).push({ id: randomUUID(), kind, detail, at: now() });
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

export async function updateLead(id: string, patch: LeadPatch): Promise<Lead | null> {
  return mutate(id, (lead) => {
    if (patch.stage && patch.stage !== lead.stage)
      logActivity(lead, 'stage', `${stageLabel(lead.stage)} → ${stageLabel(patch.stage)}`);
    if (patch.score && patch.score !== lead.score)
      logActivity(lead, 'score', `Score ${cap(lead.score)} → ${cap(patch.score)}`);
    const contactKeys = ['name', 'email', 'phone', 'whatsapp', 'villa'] as const;
    const edited = contactKeys.filter((k) => k in patch && (patch[k] || '') !== (lead[k] || ''));
    if (edited.length) logActivity(lead, 'contact', `Contact details updated (${edited.join(', ')})`);
    if ('value' in patch && patch.value !== lead.value)
      logActivity(lead, 'value', patch.value ? `Deal value set to ${fmtTHB(patch.value)}` : 'Deal value cleared');
    Object.assign(lead, patch);
  });
}

/* Fold a duplicate into the primary lead: fill blank contact/attribution
   fields, carry over consent, notes, tasks and history, then delete the
   duplicate. Nothing on the primary is ever overwritten, and appends are
   deduped by id so a retried merge (e.g. after a failed delete) stays
   idempotent instead of double-appending. */
export async function mergeLeads(primaryId: string, otherId: string): Promise<Lead | null> {
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

    const when = other.submitted_at || other.created_at;
    const detail = `Merged duplicate ${(other.form_type || 'enquiry').replace('_', ' ')} from ${when.slice(0, 10)}`;
    // A retried merge logs the event only once.
    if (!(primary.history || []).some((h) => h.kind === 'merged' && h.detail === detail)) {
      logActivity(primary, 'merged', detail);
    }
  });
  if (!merged) return null;
  await be.removeLead(otherId);
  return merged;
}

/* Bulk operations for the list view. One failing lead must not abort the rest
   of the batch — each item is attempted independently and the counts report
   what actually happened. */
export async function bulkUpdate(ids: string[], patch: LeadPatch): Promise<{ done: number; failed: number }> {
  let done = 0, failed = 0;
  for (const id of ids) {
    try {
      if (await updateLead(id, patch)) done++;
    } catch {
      failed++;
    }
  }
  return { done, failed };
}

export async function bulkDelete(ids: string[]): Promise<{ done: number; failed: number }> {
  const be = await backend();
  let done = 0, failed = 0;
  for (const id of ids) {
    try {
      if (await be.removeLead(id)) done++;
    } catch {
      failed++;
    }
  }
  return { done, failed };
}

// ── Tasks across all leads ──

export interface GlobalTask {
  leadId: string;
  leadName: string;
  leadStage: Stage;
  task: Task;
}

export async function allTasks(): Promise<GlobalTask[]> {
  const leads = await (await backend()).allLeads();
  return leads.flatMap((l) =>
    l.tasks.map((task) => ({ leadId: l.id, leadName: l.name || 'Unknown', leadStage: l.stage, task })),
  );
}

export async function addNote(id: string, body: string): Promise<Lead | null> {
  const note: Note = { id: randomUUID(), body: cleanText(body).trim().slice(0, 4000), at: now() };
  return mutate(id, (lead) => lead.notes.unshift(note));
}

export async function addTask(id: string, title: string, due?: string): Promise<Lead | null> {
  const task: Task = { id: randomUUID(), title: cleanText(title).trim().slice(0, 300), due, done: false, at: now() };
  return mutate(id, (lead) => lead.tasks.push(task));
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

export async function deleteLead(id: string): Promise<boolean> {
  return (await backend()).removeLead(id);
}

/* ── Awaiting-reply tracking ──
   The operator marks "email sent" on a lead; after 3 quiet days the lead (and
   its plot, if linked) shows a red flag. Marking it also drops a follow-up
   task three days out so the chase never relies on memory. */

export const REPLY_FLAG_DAYS = 3;
const REPLY_TASK_TITLE = 'Follow up — no reply yet';

export async function setAwaitingReply(id: string, on: boolean): Promise<Lead | null> {
  return mutate(id, (lead) => {
    if (on) {
      lead.awaiting_reply_since = now();
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
   page (re-read on each auto-refresh, so it is always current). */
export interface AttentionCounts {
  overdue: number;   // open tasks past their calendar due date
  untouched: number; // new leads >48h with no note/task
  awaiting: number;  // leads silent past the reply threshold
}

export async function attentionCounts(): Promise<AttentionCounts> {
  const leads = await (await backend()).allLeads();
  const today = now().slice(0, 10);
  const twoDaysAgo = daysAgo(2);
  const replyCut = daysAgo(REPLY_FLAG_DAYS);
  let overdue = 0, untouched = 0, awaiting = 0;
  for (const l of leads) {
    overdue += l.tasks.filter((t) => !t.done && t.due && t.due.slice(0, 10) < today).length;
    if (l.stage === 'new' && (l.created_at || '') < twoDaysAgo && l.notes.length === 0 && l.tasks.length === 0)
      untouched++;
    if (l.awaiting_reply_since && l.awaiting_reply_since < replyCut && l.stage !== 'lost' && l.stage !== 'won')
      awaiting++;
  }
  return { overdue, untouched, awaiting };
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

/** True when the record carries sales data worth keeping even at status 'free'. */
function hasSaleData(rec: VillaRecord): boolean {
  return Boolean(
    rec.buyerLeadId || rec.buyerName || rec.contractValue || rec.promisedDate ||
    (rec.construction && rec.construction !== 'not_started') ||
    Object.values(rec.phases || {}).some((p) => p?.paid) ||
    (rec.extras || []).length,
  );
}

async function persistVilla(id: string, rec: VillaRecord): Promise<void> {
  const be = await backend();
  if (rec.status === 'free' && !hasSaleData(rec)) await be.setVilla(id, null);
  else await be.setVilla(id, rec);
}

async function logVilla(villaId: string, from: VillaStatus, to: VillaStatus, seller?: string, note?: string) {
  await (await backend()).addVillaHistory({ id: randomUUID(), villaId, from, to, seller, note, at: now() });
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

export async function setVillaStatus(
  id: string,
  status: VillaStatus,
  meta?: { seller?: string; note?: string },
  opts?: { silent?: boolean },
): Promise<VillaData | null> {
  if (!VALID_STATUS.includes(status)) return null;
  const be = await backend();
  const existing = (await be.getVillas())[id];
  const from = existing?.status || 'free';
  const seller = meta?.seller?.trim().slice(0, 120) || undefined;
  const note = meta?.note?.trim().slice(0, 500) || undefined;

  const rec: VillaRecord = { ...(existing || { updatedAt: '' }), status, seller, note, updatedAt: now() };
  if (status === 'free') {
    // Back to free = the deal is off. Clear sales data (the audit trail keeps it).
    delete rec.buyerLeadId; delete rec.buyerName; delete rec.contractValue;
    delete rec.promisedDate; delete rec.construction; delete rec.phases; delete rec.extras;
    await be.setVilla(id, null);
  } else {
    await persistVilla(id, rec);
  }
  await logVilla(id, from, status, seller, note);
  if (!opts?.silent) await sheetSync(id, status, seller, note);
  return getVillaData();
}

export type VillaSaleOp =
  | { op: 'sale'; patch: {
      buyerLeadId?: string | null; buyerName?: string;
      contractValue?: number | null; promisedDate?: string | null;
      construction?: Construction;
    } }
  | { op: 'phase'; key: PhaseKey; paid: boolean; amount?: number }
  | { op: 'extraAdd'; label: string; price?: number }
  | { op: 'extraRemove'; extraId: string };

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : undefined;

export async function updateVillaSale(id: string, action: VillaSaleOp): Promise<VillaData | null> {
  const be = await backend();
  const existing = (await be.getVillas())[id];
  const rec: VillaRecord = existing || { status: 'free', updatedAt: '' };
  const from = rec.status;

  switch (action.op) {
    case 'sale': {
      const p = action.patch;
      if ('buyerLeadId' in p) {
        if (p.buyerLeadId) {
          const lead = await be.getLead(p.buyerLeadId);
          if (lead) {
            rec.buyerLeadId = lead.id;
            rec.buyerName = lead.name || lead.email || 'Unknown';
            rec.contractValue ||= lead.value || villaByName(lead.villa)?.price;
            await logVilla(id, from, rec.status, undefined, `Buyer linked: ${rec.buyerName}`);
          }
        } else {
          rec.buyerLeadId = undefined;
          rec.buyerName = undefined;
          await logVilla(id, from, rec.status, undefined, 'Buyer unlinked');
        }
      }
      if ('buyerName' in p && p.buyerName !== undefined) rec.buyerName = p.buyerName.trim().slice(0, 120) || undefined;
      if ('contractValue' in p) rec.contractValue = p.contractValue === null ? undefined : num(p.contractValue) ?? rec.contractValue;
      if ('promisedDate' in p) rec.promisedDate = p.promisedDate ? String(p.promisedDate).slice(0, 10) : undefined;
      if ('construction' in p && p.construction) {
        const valid = ['not_started', 'foundation', 'structure', 'furnishing', 'done'];
        if (valid.includes(p.construction)) {
          if (p.construction !== rec.construction)
            await logVilla(id, from, rec.status, undefined, `Construction: ${p.construction.replace('_', ' ')}`);
          rec.construction = p.construction;
        }
      }
      break;
    }
    case 'phase': {
      const def = PHASES.find((ph) => ph.key === action.key);
      if (!def) return null;
      rec.phases ??= {};
      const amount = num(action.amount);
      rec.phases[action.key] = action.paid
        ? { paid: true, at: now(), amount }
        : { paid: false };
      const amt = phaseAmount(rec, action.key);
      await logVilla(id, from, rec.status, undefined,
        action.paid ? `${def.label} paid${amt ? ` (${fmtTHB(amt)})` : ''}` : `${def.label} unmarked`);
      // Money changes availability: first payment reserves, full schedule = sold.
      if (action.paid && rec.status === 'free') rec.status = 'reserved';
      if (PHASES.every((ph) => rec.phases?.[ph.key]?.paid)) rec.status = 'sold';
      if (rec.status !== from) {
        await logVilla(id, from, rec.status, rec.seller, 'Status advanced by payment');
        await sheetSync(id, rec.status, rec.seller, rec.note);
      }
      break;
    }
    case 'extraAdd': {
      const label = action.label.trim().slice(0, 120);
      if (!label) return null;
      (rec.extras ??= []).push({ id: randomUUID(), label, price: num(action.price) });
      await logVilla(id, from, rec.status, undefined, `Extra added: ${label}`);
      break;
    }
    case 'extraRemove': {
      const extra = (rec.extras || []).find((e) => e.id === action.extraId);
      rec.extras = (rec.extras || []).filter((e) => e.id !== action.extraId);
      if (extra) await logVilla(id, from, rec.status, undefined, `Extra removed: ${extra.label}`);
      break;
    }
  }

  rec.updatedAt = now();
  await persistVilla(id, rec);
  return getVillaData();
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
  await (await backend()).insertEvent(ev);
  return ev;
}

export async function listEvents(limit = 40): Promise<CrmEvent[]> {
  return (await backend()).allEvents(limit);
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
  const [leads, events] = await Promise.all([be.allLeads(), be.allEvents(500)]);
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
  const pipelineValue = leads
    .filter((l) => l.stage === 'qualified' || l.stage === 'reserved')
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
  const twoDaysAgo = daysAgo(2);
  const untouched = leads
    .filter((l) => l.stage === 'new' && (l.created_at || '') < twoDaysAgo && l.notes.length === 0 && l.tasks.length === 0)
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

// ── Reports ──

export interface SourceReport {
  source: string;
  total: number;
  hot: number;
  won: number;
  lost: number;
  winRate: number;   // of decided
  wonValue: number;  // THB
}

export interface Reports {
  bySource: SourceReport[];
  byMonth: { month: string; label: string; total: number; won: number }[]; // last 6, oldest first
  byVilla: { villa: string; total: number; hot: number; reserved: number; won: number }[];
  lostReasons: { leadId: string; leadName: string; reason: string; at: string }[];
}

export async function reports(): Promise<Reports> {
  const leads = await (await backend()).allLeads();

  // Source performance
  const srcMap = new Map<string, SourceReport>();
  for (const l of leads) {
    const source = l.source || l.utm_source || 'direct';
    const row = srcMap.get(source) || { source, total: 0, hot: 0, won: 0, lost: 0, winRate: 0, wonValue: 0 };
    row.total++;
    if (l.score === 'hot') row.hot++;
    if (l.stage === 'won') { row.won++; row.wonValue += l.value || 0; }
    if (l.stage === 'lost') row.lost++;
    srcMap.set(source, row);
  }
  const bySource = [...srcMap.values()]
    .map((r) => ({ ...r, winRate: r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  // Monthly volume, last 6 calendar months
  const byMonth: Reports['byMonth'] = [];
  const ref = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = leads.filter((l) => (l.created_at || '').startsWith(month));
    byMonth.push({
      month,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      total: inMonth.length,
      won: inMonth.filter((l) => l.stage === 'won').length,
    });
  }

  // Villa interest
  const villaMap = new Map<string, Reports['byVilla'][number]>();
  for (const l of leads) {
    const villa = villaByName(l.villa)?.name || (l.villa ? l.villa : undefined);
    if (!villa) continue;
    const row = villaMap.get(villa) || { villa, total: 0, hot: 0, reserved: 0, won: 0 };
    row.total++;
    if (l.score === 'hot') row.hot++;
    if (l.stage === 'reserved') row.reserved++;
    if (l.stage === 'won') row.won++;
    villaMap.set(villa, row);
  }
  const byVilla = [...villaMap.values()].sort((a, b) => b.total - a.total);

  // Lost reasons — the "Lost: …" notes captured when a deal is marked lost
  const lostReasons = leads
    .flatMap((l) =>
      l.notes
        .filter((n) => n.body.startsWith('Lost:'))
        .map((n) => ({ leadId: l.id, leadName: l.name || 'Unknown', reason: n.body.slice(5).trim(), at: n.at })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  return { bySource, byMonth, byVilla, lostReasons };
}
