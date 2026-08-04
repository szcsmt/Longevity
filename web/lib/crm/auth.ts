import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';

/* Multi-user auth for the CRM, still env-configured (no user table yet).
   Users come from two places, merged:
     CRM_USER + CRM_PASSWORD  — the original primary account
     CRM_USERS                — extra accounts as "name:password,name:password"
   The session cookie is "<base64url(name)>.<sha256(name:password:salt)>", so
   the app always knows WHO is signed in (greeting now, audit trail later).
   In production a missing CRM_PASSWORD fails CLOSED for the primary account;
   the dev fallback admin/longevity exists only locally. */

export const CRM_COOKIE = 'lr_crm';
const SECRET_SUFFIX = 'lr-crm-session-v2';

interface CrmAccount { name: string; password: string }

function accounts(): CrmAccount[] {
  const list: CrmAccount[] = [];
  const primaryPw = process.env.CRM_PASSWORD ||
    (process.env.NODE_ENV === 'production' ? null : 'longevity');
  if (primaryPw) list.push({ name: process.env.CRM_USER || 'admin', password: primaryPw });
  for (const pair of (process.env.CRM_USERS || '').split(',')) {
    const i = pair.indexOf(':');
    if (i > 0) {
      const name = pair.slice(0, i).trim();
      const password = pair.slice(i + 1).trim();
      if (name && password) list.push({ name, password });
    }
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
  return (await currentUser()) !== null;
}

/** The signed-in account name, or null. */
export async function currentUser(): Promise<string | null> {
  const jar = await cookies();
  const parsed = parseCookie(jar.get(CRM_COOKIE)?.value);
  if (!parsed) return null;
  for (const acc of accounts()) {
    if (acc.name.trim().toLowerCase() === parsed.name.trim().toLowerCase()) {
      if (equal(Buffer.from(parsed.token), Buffer.from(tokenFor(acc)))) return acc.name;
    }
  }
  return null;
}
