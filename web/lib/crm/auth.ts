import { cache } from 'react';
import { cookies } from 'next/headers';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { sessionFor } from './sessions';

/* Multi-user auth for the CRM, still env-configured (no user table yet).
   Users come from three places, merged:
     CRM_USER + CRM_PASSWORD  — the original primary account
     CRM_USERS                — extra accounts as "name:password[:role]"
     CRM_VIEWERS              — read-only accounts as "name:password"
   In production a missing CRM_PASSWORD fails CLOSED for the primary account;
   the dev fallback admin/longevity exists only locally.

   The password field may hold either the password itself or an scrypt hash of
   it (see `hashPassword`). Both work, deliberately: an account whose password
   is written out in the environment still signs in exactly as it did, and
   hashing is something the owner does one account at a time rather than a
   migration that locks the team out of their own CRM on a Tuesday. What
   hashing buys is that a copy of the environment — a screenshot of the Vercel
   settings, a pasted .env, a chat message — stops being a set of working
   logins, which matters because people reuse passwords elsewhere.

   The session cookie is an opaque random token; what it means lives in
   ./sessions, and the reasons it is no longer derived from the password are
   written down there. */

export const CRM_COOKIE = 'lr_crm';

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
  { id: 'admin',     label: 'Tulajdonos',    blurb: 'Minden, a visszafordíthatatlant is beleértve.' },
  { id: 'head',      label: 'Sales vezető',  blurb: 'Dolgozik a leadeken és irányítja a csapatot, és látja a pénzt.' },
  { id: 'agent',     label: 'Értékesítő',    blurb: 'Leadeken dolgozik. Nem törölhet, nem oszthat át, nem exportálhat, a főkönyvhöz nem nyúl.' },
  { id: 'finance',   label: 'Pénzügy',       blurb: 'A főkönyv. Fizetések, foglalások, szerződések \u2014 leadek nem.' },
  { id: 'marketing', label: 'Marketing',     blurb: 'Attribúció és kampányok, pénzügyi adatok nélkül.' },
  { id: 'viewer',    label: 'Csak olvas',    blurb: 'Mindent lát, semmit nem változtat.' },
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
  | 'partners.write'   // agency records, commission terms, and overriding a claim
  | 'deals.approve';   // saying yes to what a buyer asked for, and what it costs

const CAPABILITIES: Record<CrmRole, Capability[]> = {
  admin: [
    'leads.write', 'leads.reassign', 'leads.merge', 'leads.archive', 'leads.purge',
    'leads.export', 'money.read', 'money.write', 'partners.write', 'deals.approve',
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

/* ── Passwords, hashed or not ──

   scrypt rather than bcrypt because it is in Node already: a security fix
   whose first step is "add a dependency" is a security fix with a supply
   chain, and this one does not need one. The parameters are the Node
   defaults, which cost roughly a tenth of a second per check — invisible at a
   sign-in, and a wall to anything trying passwords in bulk.

   Format: scrypt$<salt-hex>$<hash-hex>. The separator is a dollar rather than
   a colon because CRM_USERS splits its entries on colons, and a hash that
   silently ate the role field would be a very confusing afternoon. */
const SCRYPT_PREFIX = 'scrypt$';
const KEY_LEN = 32;

/** Hash a password for CRM_USERS / CRM_PASSWORD. Used by scripts/crm-hash.mjs. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LEN);
  return `${SCRYPT_PREFIX}${salt.toString('hex')}$${key.toString('hex')}`;
}

/** True if this configured password field is a hash rather than the password. */
export const isHashed = (stored: string): boolean => stored.startsWith(SCRYPT_PREFIX);

/** Constant-time check of a supplied password against a stored field, which
    may be a hash or the password itself. A malformed hash fails closed rather
    than falling through to a plaintext comparison — a typo in a hash must not
    quietly turn into "the password is literally this string". */
function passwordMatches(supplied: string, stored: string): boolean {
  if (isHashed(stored)) {
    const [, saltHex, keyHex] = stored.split('$');
    if (!saltHex || !keyHex) return false;
    try {
      const key = scryptSync(supplied, Buffer.from(saltHex, 'hex'), KEY_LEN);
      return equal(key, Buffer.from(keyHex, 'hex'));
    } catch {
      return false;
    }
  }
  return equal(sha(supplied), sha(stored));
}

/** Check credentials. Returns the account, or null — starting the session is
    the caller's job, because that is where the request (and so the IP, and so
    the audit entry) is. */
export function verifyCredentials(username: string, password: string): { name: string; role: CrmRole } | null {
  const uname = String(username || '').trim().toLowerCase();
  const pw = String(password || '');
  let ok: CrmAccount | null = null;
  for (const acc of accounts()) {
    // Constant-time on both fields; keep scanning even after a match.
    const nameOk = equal(sha(uname), sha(acc.name.trim().toLowerCase()));
    const pwOk = passwordMatches(pw, acc.password);
    if (nameOk && pwOk && !ok) ok = acc;
  }
  return ok ? { name: ok.name, role: ok.role } : null;
}

/** True if the current request carries a valid CRM session cookie. */
export async function isAuthed(): Promise<boolean> {
  return (await currentAccount()) !== null;
}

/* Memoised for the length of one request. A page render asks who is signed in
   several times over — the layout, the nav, the page, each route it calls —
   and every one of those used to be pure arithmetic. Now it is a lookup in
   the session store, so asking four times would be four round trips to answer
   a question whose answer cannot change mid-request. */
export const currentAccount = cache(async (): Promise<{ name: string; role: CrmRole } | null> => {
  const jar = await cookies();
  const session = await sessionFor(jar.get(CRM_COOKIE)?.value);
  if (!session) return null;
  /* The role is read from the environment at check time, not stored on the
     session: demoting somebody should take effect on their next click rather
     than on their next sign-in. An account that has since been removed
     entirely resolves to null, which is the right answer — the session
     outlived the person's right to it. */
  const wanted = session.user.trim().toLowerCase();
  const acc = accounts().find((a) => a.name.trim().toLowerCase() === wanted);
  return acc ? { name: acc.name, role: acc.role } : null;
});

/** Every configured account, without its password — for the security page,
    which needs to say who can sign in and whether their password is written
    out in the environment in readable form. */
export function listAccounts(): { name: string; role: CrmRole; hashed: boolean }[] {
  return accounts().map((a) => ({ name: a.name, role: a.role, hashed: isHashed(a.password) }));
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
