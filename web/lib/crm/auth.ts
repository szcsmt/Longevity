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

/* Roles, from most to least power:

     admin   everything — including deleting leads, editing the masterplan and
             its money, exporting the database, and running the maintenance jobs
     agent   a salesperson: works leads all day (notes, tasks, stages, scores,
             owners) but cannot delete a lead, touch the sales ledger or export
             the list. The things that are irreversible or that walk out of the
             building stay with the owner of the business.
     viewer  reads everything, changes nothing — guests, investors, auditors

   CRM_USERS format: "name:password", "name:password:agent", "name:password:viewer".
   An entry with no role is an admin, which keeps every existing account working
   exactly as it did before this role existed. */
export type CrmRole = 'admin' | 'agent' | 'viewer';

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
      const role: CrmRole = named === 'viewer' ? 'viewer' : named === 'agent' ? 'agent' : 'admin';
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

/** True for the account that owns the business. Guards the irreversible and
    the exportable: deleting leads, the sales ledger, exports, maintenance. */
export async function isAdmin(): Promise<boolean> {
  return (await currentAccount())?.role === 'admin';
}

/** True when the session may MUTATE lead data — admins and agents both. This
    is the check every day-to-day write endpoint wants; `isAdmin` is for the
    handful of operations a salesperson should not be able to perform. */
export async function canEdit(): Promise<boolean> {
  const role = (await currentAccount())?.role;
  return role === 'admin' || role === 'agent';
}
