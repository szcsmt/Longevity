import { randomUUID } from 'node:crypto';
import type { Agency, Broker, CommissionPayment, Lead } from './types';
import { AGENCY_STATUS, COMMISSION_MODELS, atOrBeyond, isOpenStage } from './types';
import { getBackend } from './backend';
import { cleanText } from './store';
import { creditedClaim } from './rules';

/* ══════════════════ Partner agencies ══════════════════

   The firms that introduce buyers to us, and the named people at them. Its own
   module rather than another thousand lines in store.ts: this is a separate
   aggregate with its own lifecycle, and the only thing it shares with a lead is
   the claim recorded on that lead.

   On the word "agent", see the note in types.ts. Here an Agency is the firm and
   a Broker is a person at it; our own salespeople live in agents.ts and are a
   different thing entirely.

   Writes are whole-document, like project notes. An agency record is small and
   edited rarely, by one admin at a time — a revision dance would buy nothing
   and cost the caller a retry loop. */

const now = () => new Date().toISOString();
const text = (v: unknown, max = 200): string | undefined =>
  (typeof v === 'string' ? cleanText(v).trim().slice(0, max) : '') || undefined;

/* ── How long a registration protects a claim ──

   Ninety days is the common market default, and it is deliberately a house
   setting rather than a number in the code: an agency that negotiated 180 days
   carries its own `protection_days`, and the house figure moves with an env
   change rather than a deploy of new logic. */
export const DEFAULT_PROTECTION_DAYS = 90;

export function houseProtectionDays(): number {
  const raw = Number(process.env.CRM_AGENCY_PROTECTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : DEFAULT_PROTECTION_DAYS;
}

export const protectionDays = (a?: Agency): number =>
  a?.protection_days && a.protection_days > 0 ? a.protection_days : houseProtectionDays();

export const isAgencyArchived = (a: Agency): boolean => Boolean(a.archived_at);

export interface AgencyInput {
  name?: string;
  country?: string;
  website?: string;
  status?: string;
  agreement_at?: string;
  commission_model?: string;
  commission_pct?: number;
  commission_fixed?: number;
  protection_days?: number;
  note?: string;
}

/* Only values from the published lists are stored. A status or commission
   model nobody offered would quietly break every report that groups on it. */
function sanitize(input: AgencyInput): Partial<Agency> {
  const out: Partial<Agency> = {};
  if ('name' in input) out.name = text(input.name, 160);
  if ('country' in input) out.country = text(input.country, 80);
  if ('website' in input) out.website = text(input.website, 300);
  if ('note' in input) out.note = text(input.note, 4000);
  if ('status' in input) {
    const s = AGENCY_STATUS.find((x) => x.id === input.status);
    if (s) out.status = s.id;
  }
  if ('commission_model' in input) {
    const m = COMMISSION_MODELS.find((x) => x.id === input.commission_model);
    out.commission_model = m?.id;
  }
  if ('agreement_at' in input) {
    const day = String(input.agreement_at || '').slice(0, 10);
    out.agreement_at = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
  }
  /* Numbers: anything that is not a positive number clears the field rather
     than being stored as NaN. A commission over 100% is a typo, every time. */
  const positive = (v: unknown, max = Infinity, decimals = 0): number | undefined => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > max) return undefined;
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
  };
  if ('commission_pct' in input) out.commission_pct = positive(input.commission_pct, 100, 2);
  if ('commission_fixed' in input) out.commission_fixed = positive(input.commission_fixed);
  if ('protection_days' in input) out.protection_days = positive(input.protection_days, 3650);
  return out;
}

export async function listAgencies(opts: { archived?: 'exclude' | 'include' | 'only' } = {}): Promise<Agency[]> {
  const mode = opts.archived || 'exclude';
  const all = await (await getBackend()).allAgencies();
  return all
    .filter((a) => (mode === 'include' ? true : mode === 'only' ? isAgencyArchived(a) : !isAgencyArchived(a)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAgency(id: string): Promise<Agency | null> {
  return (await (await getBackend()).allAgencies()).find((a) => a.id === id) || null;
}

export async function createAgency(input: AgencyInput): Promise<Agency | null> {
  const clean = sanitize(input);
  if (!clean.name) return null;
  const agency: Agency = {
    id: randomUUID(),
    name: clean.name,
    status: clean.status || 'prospect',
    contacts: [],
    created_at: now(),
    updated_at: now(),
    ...clean,
  };
  await (await getBackend()).saveAgency(agency);
  return agency;
}

export async function updateAgency(id: string, input: AgencyInput): Promise<Agency | null> {
  const agency = await getAgency(id);
  if (!agency) return null;
  const clean = sanitize(input);
  // A blank name would leave the record unnameable in every list it appears in.
  if ('name' in input && !clean.name) delete clean.name;
  const next: Agency = { ...agency, ...clean, updated_at: now() };
  await (await getBackend()).saveAgency(next);
  return next;
}

/* Archived, never deleted: the registrations made under this agency's name
   decide who introduced which buyer, and that has to survive the relationship
   ending. An archived agency is out of every picker and every report, and can
   be restored. */
export async function archiveAgency(id: string, actor?: string): Promise<Agency | null> {
  const agency = await getAgency(id);
  if (!agency || isAgencyArchived(agency)) return agency;
  const next: Agency = { ...agency, archived_at: now(), archived_by: actor, updated_at: now() };
  await (await getBackend()).saveAgency(next);
  return next;
}

export async function unarchiveAgency(id: string): Promise<Agency | null> {
  const agency = await getAgency(id);
  if (!agency) return null;
  const next: Agency = { ...agency, updated_at: now() };
  delete next.archived_at;
  delete next.archived_by;
  await (await getBackend()).saveAgency(next);
  return next;
}

/* ── The people ──
   Nested in the agency document. A contact is deactivated rather than removed,
   because a claim can point at somebody who left last year and must still read
   with their name on it. */

export interface BrokerInput {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
}

export async function addContact(agencyId: string, input: BrokerInput): Promise<Agency | null> {
  const agency = await getAgency(agencyId);
  if (!agency) return null;
  const name = text(input.name, 120);
  if (!name) return null;
  const broker: Broker = {
    id: randomUUID(),
    name,
    email: text(input.email, 200),
    phone: text(input.phone, 60),
    whatsapp: text(input.whatsapp, 60),
  };
  const next: Agency = { ...agency, contacts: [...agency.contacts, broker], updated_at: now() };
  await (await getBackend()).saveAgency(next);
  return next;
}

export async function setContactActive(agencyId: string, contactId: string, active: boolean): Promise<Agency | null> {
  const agency = await getAgency(agencyId);
  if (!agency) return null;
  if (!agency.contacts.some((c) => c.id === contactId)) return null;
  const next: Agency = {
    ...agency,
    contacts: agency.contacts.map((c) => (c.id === contactId ? { ...c, inactive: !active } : c)),
    updated_at: now(),
  };
  await (await getBackend()).saveAgency(next);
  return next;
}

export const findContact = (agency: Agency, id?: string): Broker | undefined =>
  id ? agency.contacts.find((c) => c.id === id) : undefined;

/* ── The commission ledger ──

   Append-only. A payment entered by mistake is corrected with a NEGATIVE entry
   rather than removed — accounting's own answer, and it leaves the trail
   intact. There is deliberately no way to delete one: a money record that can
   quietly disappear is not a record. */

export interface PaymentInput {
  amount?: number;
  at?: string;
  reference?: string;
  against?: string;
  note?: string;
}

export async function addPayment(
  agencyId: string,
  input: PaymentInput,
  actor?: string,
): Promise<Agency | null> {
  const agency = await getAgency(agencyId);
  if (!agency) return null;
  const amount = Number(input.amount);
  // Zero says nothing, and a non-number is a typo somebody will not notice.
  if (!Number.isFinite(amount) || amount === 0) return null;
  const day = String(input.at || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const payment: CommissionPayment = {
    id: randomUUID(),
    amount: Math.round(amount),
    at: day,
    reference: text(input.reference, 120),
    against: text(input.against, 120),
    note: text(input.note, 1000),
    by: actor,
  };
  const next: Agency = {
    ...agency,
    payments: [...(agency.payments || []), payment].sort((a, b) => a.at.localeCompare(b.at)),
    updated_at: now(),
  };
  await (await getBackend()).saveAgency(next);
  return next;
}

export const paidTotal = (agency: Agency): number =>
  (agency.payments || []).reduce((n, p) => n + p.amount, 0);

/* ══════════════════ What each agency has actually produced ══════════════════

   The question the whole module exists to answer: which agencies bring buyers
   who buy, as opposed to buyers who fill in a form.

   Every figure is counted against `creditedClaim` — the first registration
   that was never withdrawn — so an expired protection window never quietly
   moves a sale from the agency that made the introduction to the one that
   registered the same person later.

   Archived leads are excluded, the same as everywhere else. `commission` is
   what the agreement WOULD generate on the won volume — a calculation — while
   `commissionPaid` is what the ledger says actually moved. Outstanding is the
   difference, and is undefined rather than zero when there is no agreement to
   compute the first half from: an unknown minus a known is not a number. */

export interface AgencyPerformance {
  agency: Agency;
  registered: number;    // leads introduced
  live: number;          // still open (not won, not lost)
  qualified: number;     // reached qualification or beyond
  visits: number;        // leads with a logged site visit
  reserved: number;
  won: number;
  lost: number;
  wonValue: number;      // THB
  pipelineValue: number; // THB still open
  conversion: number;    // won / registered, %
  /** What the agreement generates on the won volume, when the agreement says
      enough to compute it. Undefined when nothing is agreed yet. */
  commission?: number;
  /** What has actually been paid — a recorded fact, not a calculation. */
  commissionPaid: number;
  /** Generated minus paid. Undefined when there is no agreement to compute
      what was generated: an unknown minus a known is not zero. */
  commissionOutstanding?: number;
}

export function performanceFor(agency: Agency, leads: Lead[]): AgencyPerformance {
  const mine = leads.filter((l) => !l.archived_at && creditedClaim(l)?.agencyId === agency.id);
  const count = (fn: (l: Lead) => boolean) => mine.filter(fn).length;

  const won = count((l) => l.stage === 'won');
  const wonValue = mine.filter((l) => l.stage === 'won').reduce((n, l) => n + (l.value || 0), 0);
  const open = mine.filter((l) => isOpenStage(l.stage));

  let commission: number | undefined;
  if (agency.commission_model === 'percent' && agency.commission_pct)
    commission = Math.round((wonValue * agency.commission_pct) / 100);
  else if (agency.commission_model === 'fixed' && agency.commission_fixed)
    commission = agency.commission_fixed * won;
  const paid = paidTotal(agency);

  return {
    agency,
    registered: mine.length,
    live: open.length,
    qualified: count((l) => atOrBeyond(l.stage, 'qualified')),
    visits: count((l) => (l.history || []).some((h) => h.kind === 'visit')),
    reserved: count((l) => atOrBeyond(l.stage, 'reserved')),
    won,
    lost: count((l) => l.stage === 'lost'),
    wonValue,
    pipelineValue: open.reduce((n, l) => n + (l.value || 0), 0),
    conversion: mine.length ? Math.round((won / mine.length) * 100) : 0,
    commission,
    commissionPaid: paid,
    commissionOutstanding: commission === undefined ? undefined : commission - paid,
  };
}

/** Every live agency with its figures, best producers first. */
export async function agencyPerformance(leads: Lead[]): Promise<AgencyPerformance[]> {
  const agencies = await listAgencies();
  return agencies
    .map((a) => performanceFor(a, leads))
    .sort((a, b) => b.wonValue - a.wonValue || b.registered - a.registered);
}
