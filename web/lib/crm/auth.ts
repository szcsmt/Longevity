import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';

/* Minimal single-user auth for the CRM. A correct password sets an httpOnly
   cookie holding a token derived from the password; every protected route and
   page checks it. Good enough for a private, single-operator tool — swap for a
   real provider (Auth.js / Supabase) when the team grows. */

export const CRM_COOKIE = 'lr_crm';
const SECRET_SUFFIX = 'lr-crm-session-v1';

/** The configured password. In production a missing CRM_PASSWORD fails CLOSED
    (no default!) — the well-known dev fallback would otherwise let anyone who
    has read this source compute a valid session cookie offline. The
    "longevity" fallback exists only for local development. */
export function crmPassword(): string | null {
  const pw = process.env.CRM_PASSWORD;
  if (pw) return pw;
  return process.env.NODE_ENV === 'production' ? null : 'longevity';
}

/** The configured username (dev fallback: "admin"). Set CRM_USER in env. */
export function crmUser(): string {
  return process.env.CRM_USER || 'admin';
}

/** Username check — case-insensitive, constant-time. */
export function usernameMatches(input: string): boolean {
  const norm = (s: string) => createHash('sha256').update(String(s || '').trim().toLowerCase()).digest();
  const a = norm(input);
  const b = norm(crmUser());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Opaque session token derived from the password; null when auth is unconfigured. */
export function sessionToken(): string | null {
  const pw = crmPassword();
  if (!pw) return null;
  return createHash('sha256').update(pw + SECRET_SUFFIX).digest('hex');
}

export function passwordMatches(input: string): boolean {
  const pw = crmPassword();
  if (!pw) return false;
  const a = createHash('sha256').update(String(input)).digest();
  const b = createHash('sha256').update(pw).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True if the current request carries a valid CRM session cookie. */
export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const tok = jar.get(CRM_COOKIE)?.value;
  const expected = sessionToken();
  if (!tok || !expected) return false;
  const a = Buffer.from(tok);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
