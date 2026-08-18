import { cookies } from 'next/headers';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Agency, Lead } from './types';
import { STAGES, atOrBeyond } from './types';
import { getBackend } from './backend';
import { isAgencyArchived } from './partners';

/* ══════════════════ The partner portal ══════════════════

   A way for an introducing agency to register a buyer themselves, and to see
   what happened to the ones they registered — WITHOUT giving them a CRM login.

   Everything here is written from one assumption: a partner is not staff. They
   are a third party with a commercial interest in our customer list, and the
   portal must be useful to them without becoming a window into it. So:

     · an agency sees only the buyers IT introduced, never anybody else's;
     · it sees a coarse status, not our pipeline — "in discussion" rather than
       which of six stages a deal sits in, because that is our sales process
       and not theirs;
     · when a buyer is already registered to somebody else the portal says so
       and does NOT say by whom. That is the other agency's business, and a
       portal that names them turns a protection window into a leak;
     · nothing here can edit, delete or reassign anything.

   ── The credential ──

   One token per agency rather than an account per person. An agency is a firm
   we have an agreement with; the people at it change, and issuing logins to
   each of them would be a user directory we would then have to run.

   The token is generated once, shown once, and stored only as a SHA-256. The
   session signature is derived from that hash, so REGENERATING THE TOKEN
   INVALIDATES EVERY SESSION opened with the old one — revoking a partner's
   access is one click and needs no session store to sweep. */

export const PORTAL_COOKIE = 'lr_partner';
const SECRET_SUFFIX = 'lr-partner-session-v1';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => {
  try { return Buffer.from(s, 'base64url').toString('utf8'); } catch { return ''; }
};
const equal = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** A fresh token. Returned in the clear exactly once — the caller shows it to
    the operator and it is unrecoverable afterwards. */
export function mintToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: sha(token) };
}

export const tokenHash = (token: string): string => sha(String(token || '').trim());

/* The session value: the agency id, and a signature over the id plus the
   CURRENT token hash. Nothing in the cookie is secret on its own, and it stops
   being valid the moment the token is regenerated. */
const signature = (agency: Agency) =>
  sha(`${agency.id}:${agency.portal_token_hash || ''}:${SECRET_SUFFIX}`);

export const sessionValue = (agency: Agency): string => `${b64(agency.id)}.${signature(agency)}`;

async function agencies(): Promise<Agency[]> {
  return (await getBackend()).allAgencies();
}

/** The agency this token belongs to, or null. Archived agencies are refused:
    ending a relationship has to end the access that came with it. */
export async function agencyForToken(token: string): Promise<Agency | null> {
  const hash = tokenHash(token);
  if (!hash || !String(token || '').trim()) return null;
  for (const a of await agencies()) {
    if (a.portal_token_hash && equal(a.portal_token_hash, hash) && !isAgencyArchived(a)) return a;
  }
  return null;
}

/** The agency behind the current portal session, or null. */
export async function currentAgency(): Promise<Agency | null> {
  const raw = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const id = unb64(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  const agency = (await agencies()).find((a) => a.id === id);
  if (!agency || isAgencyArchived(agency) || !agency.portal_token_hash) return null;
  return equal(sig, signature(agency)) ? agency : null;
}

/* ── What a partner is allowed to see about a buyer ──

   Our pipeline has ten stages and they are our business: how we work a deal is
   not something a partner needs, and publishing it invites arguments about why
   their buyer is "only" at Presentation. Five words, each of which answers the
   only question they actually have — is anything happening, and did it sell. */
export type PartnerStatus = 'registered' | 'in progress' | 'reserved' | 'completed' | 'closed';

export function partnerStatus(lead: Lead): PartnerStatus {
  if (lead.stage === 'won') return 'completed';
  if (lead.stage === 'lost') return 'closed';
  if (atOrBeyond(lead.stage, 'reserved')) return 'reserved';
  if (atOrBeyond(lead.stage, 'contacted')) return 'in progress';
  return 'registered';
}

/* Deliberately NOT exported to the portal: the lead's own stage label, its
   value, its owner, its notes, its other claims. This function exists so that
   adding a field to the portal is a decision somebody has to make here. */
export interface PartnerLeadView {
  name: string;
  registeredAt: string;
  protectedUntil?: string;
  status: PartnerStatus;
  /** The residence they registered an interest in, when there was one. */
  villa?: string;
  /** Their own agent, if they named one at registration. */
  broker?: string;
}

export const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label || id;

/* ── Granting and revoking ──

   Kept here rather than in partners.ts so the token never travels through the
   ordinary agency-editing path by accident: there is exactly one function that
   can produce one, and it returns it exactly once. */

async function save(agency: Agency): Promise<Agency> {
  const next: Agency = { ...agency, updated_at: new Date().toISOString() };
  await (await getBackend()).saveAgency(next);
  return next;
}

/** Grant (or re-grant) portal access. The plain token is returned ONCE and is
    unrecoverable afterwards; re-granting invalidates the previous one and every
    session opened with it. */
export async function openPortal(agencyId: string): Promise<{ agency: Agency; token: string } | null> {
  const agency = (await agencies()).find((a) => a.id === agencyId);
  if (!agency || isAgencyArchived(agency)) return null;
  const { token, hash } = mintToken();
  const next = await save({
    ...agency,
    portal_token_hash: hash,
    portal_opened_at: agency.portal_opened_at || new Date().toISOString(),
  });
  return { agency: next, token };
}

/** Revoke it. Every open session dies with the hash it was signed against. */
export async function closePortal(agencyId: string): Promise<Agency | null> {
  const agency = (await agencies()).find((a) => a.id === agencyId);
  if (!agency) return null;
  const next = { ...agency };
  delete next.portal_token_hash;
  delete next.portal_opened_at;
  delete next.portal_seen_at;
  return save(next);
}

/** Last-seen stamp, so the owner can tell a partner who uses the portal from
    one who was given a token and never opened it. Best-effort: a failure here
    must never stop somebody logging in. */
export async function touchPortal(agency: Agency): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if ((agency.portal_seen_at || '').slice(0, 10) === today) return;
  try {
    await save({ ...agency, portal_seen_at: new Date().toISOString() });
  } catch { /* a missed timestamp is not worth a failed login */ }
}

/* ── What the portal shows ──

   Built from the leads this agency is CREDITED with — its first registration
   that was never withdrawn. A claim it recorded over somebody else's
   introduction does not appear: it is on our timeline, it is not their buyer,
   and showing it here would say we agree that it is. */
export function portalLeads(agency: Agency, leads: Lead[], credited: (l: Lead) => string | undefined): PartnerLeadView[] {
  return leads
    .filter((l) => !l.archived_at && credited(l) === agency.id)
    .map((l) => {
      const claim = (l.claims || []).find((c) => c.agencyId === agency.id && !c.released_at);
      return {
        name: l.name || 'Unnamed',
        registeredAt: claim?.at || l.created_at,
        protectedUntil: claim?.expires_at,
        status: partnerStatus(l),
        villa: l.villa,
        broker: claim?.brokerName,
      };
    })
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
}
