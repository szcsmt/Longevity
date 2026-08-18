import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';

/* Multi-user auth for the CRM, still env-configured (no user table yet).
   Users come from three places, merged:
     CRM_USER + CRM_PASSWORD  — the original primary account
     CRM_USERS                — extra accounts as "name:password[:role]"
     CRM_VIEWERS              — read-only accounts as "name:password"
   The session cookie is "<base64url(name)>.<sha256(name:password:salt)>", so
   the app always knows WHO is signed in (greeting now, audit trail later).
   In production a missing CRM_PASSWORD fails CLOSED for the primary account;
   the dev fallback admin/longevity exists only locally. */

export const CRM_COOKIE = 'lr_crm';
const SECRET_SUFFIX = 'lr-crm-session-v2';

/* ══════════════════ Roles, and what each one may actually do ══════════════════

   There were three roles and the permissions lived in the call sites: eleven
   different files each asking `isAdmin()` and meaning eleven different things
   by it. That worked while "not an admin" was the only distinction worth
   drawing. It stops working the moment a marketing account exists, because
   what marketing must not see is not what a salesperson must not do.

   So the roles map to CAPABILITIES, in one table, below. A route asks for the
   capability it needs rather than for a role — which is the difference between
   "the owner can do this" and "this is an owner's decision", and it means
   adding a role is editing one table instead of auditing every route.

     admin      the owner of the business. Everything.
     head       head of sales: works leads like an agent, and additionally
                reassigns them, merges duplicates, archives, exports the list
                and sees the money. Not the commission agreements — those are
                what the business is paying out, and they stay with the owner.
     agent      a salesperson. Works leads all day. Cannot delete one, cannot
                take a lead off a colleague, cannot touch the ledger or export
                the list: the irreversible and the exportable stay above them.
     finance    the ledger and nothing else. Sees and records money — payments,
                reservations, contracts, schedules — and does not work leads.
     marketing  attribution and campaigns, deliberately WITHOUT the money. What
                a campaign produced in buyers is their business; what those
                buyers are worth is not.
     viewer     reads everything, changes nothing — guests, investors, auditors.

   Legal is in the specification and is not here, because there is nothing yet
   for it to do that `viewer` does not already cover. A role with no powers of
   its own is a label pretending to be a permission.

   CRM_USERS format: "name:password[:role]". An entry with no role is an admin,
   which keeps every account working exactly as it did before roles existed. */
export type CrmRole = 'admin' | 'head' | 'agent' | 'finance' | 'marketing' | 'viewer';

export const ROLES: { id: CrmRole; label: string; blurb: string }[] = [
  { id: 'admin',     label: 'Owner',          blurb: 'Everything, including the irreversible.' },
  { id: 'head',      label: 'Head of sales',  blurb: 'Works and runs the team\u2019s leads, and sees the money.' },
  { id: 'agent',     label: 'Sales',          blurb: 'Works leads. Cannot delete, reassign, export or touch the ledger.' },
  { id: 'finance',   label: 'Finance',        blurb: 'The ledger. Payments, reservations, contracts \u2014 not the leads.' },
  { id: 'marketing', label: 'Marketing',      blurb: 'Attribution and campaigns, without the money.' },
  { id: 'viewer',    label: 'View only',      blurb: 'Reads everything, changes nothing.' },
];

/* ── The capabilities ──

   Named for the DECISION rather than the screen, so a route asking for one is
   readable without knowing the role table. */
export type Capability =
  | 'leads.write'      // notes, tasks, stages, qualification, logged contact, registrations
  | 'leads.reassign'   // move a lead that already belongs to somebody else
  | 'leads.merge'      // fold two records together, and the duplicate sweep
  | 'leads.archive'    // out of every view — reversible, but not a salesperson's call
  | 'leads.purge'      // the real erasure
  | 'leads.export'     // every contact we hold, in one file, on somebody's laptop
  | 'money.read'       // contract values, payments, commission
  | 'money.write'      // the masterplan ledger: phases, reservations, contracts, schedules
  | 'partners.write';  // agency records, commission terms, and overriding a claim

const CAPABILITIES: Record<CrmRole, Capability[]> = {
  admin: [
    'leads.write', 'leads.reassign', 'leads.merge', 'leads.archive', 'leads.purge',
    'leads.export', 'money.read', 'money.write', 'partners.write',
  ],
  head: ['leads.write', 'leads.reassign', 'leads.merge', 'leads.archive', 'leads.export', 'money.read'],
  agent: ['leads.write'],
  finance: ['money.read', 'money.write'],
  marketing: [],
  /* A viewer sees the money because the people given one are investors and
     auditors, and they already read the masterplan ledger. Marketing is the
     role that does not, and it is the only one. */
  viewer: ['money.read'],
};

/* Fails CLOSED on a role it does not recognise, rather than throwing. This is
   a permission function: an exception here becomes a 500 on a route that
   should simply have said no, and a name arriving from anywhere but the env
   parse is exactly the case worth surviving. */
export const roleCan = (role: CrmRole | undefined, capability: Capability): boolean =>
  Boolean(role && CAPABILITIES[role]?.includes(capability));

interface CrmAccount { name: string; password: string; role: CrmRole }

function accounts(): CrmAccount[] {
  const list: CrmAccount[] = [];
  const primaryPw = process.env.CRM_PASSWORD ||
    (process.env.NODE_ENV === 'production' ? null : 'longevity');
  if (primaryPw) list.push({ name: process.env.CRM_USER || 'admin', password: primaryPw, role: 'admin' });
  for (const entry of (process.env.CRM_USERS || '').split(',')) {
    const parts = entry.split(':');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const password = parts[1].trim();
      const named = parts[2]?.trim().toLowerCase();
      /* An unrecognised role name falls back to admin, exactly as an omitted
         one always has. Silently downgrading somebody because of a typo would
         lock them out of their own CRM with no explanation. */
      const role: CrmRole = ROLES.some((r) => r.id === named) ? (named as CrmRole) : 'admin';
      if (name && password) list.push({ name, password, role });
    }
  }

  /* ── Guests, in their own variable ──

     A guest is read-only by definition, so the role never needs spelling out.
     Keeping them separate from CRM_USERS is also the safer shape in practice:
     adding a guest means writing one short value rather than editing a list
     that holds every working account, where a slip costs somebody their
     login. Format: "name:password,name:password". */
  for (const entry of (process.env.CRM_VIEWERS || '').split(',')) {
    const [rawName, rawPw] = entry.split(':');
    const name = (rawName || '').trim();
    const password = (rawPw || '').trim();
    if (name && password) list.push({ name, password, role: 'viewer' });
  }

  return list;
}

const sha = (s: string) => createHash('sha256').update(s).digest();
const equal = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

function tokenFor(acc: CrmAccount): string {
  return createHash('sha256')
    .update(`${acc.name.trim().toLowerCase()}:${acc.password}:${SECRET_SUFFIX}`)
    .digest('hex');
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => {
  try { return Buffer.from(s, 'base64url').toString('utf8'); } catch { return ''; }
};

/** Check credentials; returns the cookie value to set, or null. */
export function authenticate(username: string, password: string): string | null {
  const uname = String(username || '').trim().toLowerCase();
  let ok: CrmAccount | null = null;
  for (const acc of accounts()) {
    // Constant-time on both fields; keep scanning even after a match.
    const nameOk = equal(sha(uname), sha(acc.name.trim().toLowerCase()));
    const pwOk = equal(sha(String(password || '')), sha(acc.password));
    if (nameOk && pwOk && !ok) ok = acc;
  }
  return ok ? `${b64(ok.name)}.${tokenFor(ok)}` : null;
}

function parseCookie(value: string | undefined): { name: string; token: string } | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const name = unb64(value.slice(0, dot));
  return name ? { name, token: value.slice(dot + 1) } : null;
}

/** True if the current request carries a valid CRM session cookie. */
export async function isAuthed(): Promise<boolean> {
  return (await currentAccount()) !== null;
}

/** The signed-in account (name + role), or null. Role comes from env at
    check time, so an env edit takes effect without re-login. */
export async function currentAccount(): Promise<{ name: string; role: CrmRole } | null> {
  const jar = await cookies();
  const parsed = parseCookie(jar.get(CRM_COOKIE)?.value);
  if (!parsed) return null;
  for (const acc of accounts()) {
    if (acc.name.trim().toLowerCase() === parsed.name.trim().toLowerCase()) {
      if (equal(Buffer.from(parsed.token), Buffer.from(tokenFor(acc)))) {
        return { name: acc.name, role: acc.role };
      }
    }
  }
  return null;
}

/** The signed-in account name, or null. */
export async function currentUser(): Promise<string | null> {
  return (await currentAccount())?.name ?? null;
}

/** The one check every route should be making: may this session do THIS? */
export async function can(capability: Capability): Promise<boolean> {
  return roleCan((await currentAccount())?.role, capability);
}

/** True for the account that owns the business. Only for the handful of things
    that are genuinely the owner's alone rather than a capability somebody else
    could reasonably be given — the maintenance jobs, chiefly. */
export async function isAdmin(): Promise<boolean> {
  return (await currentAccount())?.role === 'admin';
}

/** True when the session may work leads. Kept as a name because it reads
    better than `can('leads.write')` at the top of a route that does nothing
    else, and because every existing call site means exactly this. */
export async function canEdit(): Promise<boolean> {
  return can('leads.write');
}
