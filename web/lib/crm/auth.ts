import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';

/* Minimal single-user auth for the CRM. A correct password sets an httpOnly
   cookie holding a token derived from the password; every protected route and
   page checks it. Good enough for a private, single-operator tool — swap for a
   real provider (Auth.js / Supabase) when the team grows. */

export const CRM_COOKIE = 'lr_crm';
const SECRET_SUFFIX = 'lr-crm-session-v1';

/** The configured password (dev fallback: "longevity"). Set CRM_PASSWORD in env. */
export function crmPassword(): string {
  return process.env.CRM_PASSWORD || 'longevity';
}

/** Opaque session token derived from the password. */
export function sessionToken(): string {
  return createHash('sha256').update(crmPassword() + SECRET_SUFFIX).digest('hex');
}

export function passwordMatches(input: string): boolean {
  const a = createHash('sha256').update(String(input)).digest();
  const b = createHash('sha256').update(crmPassword()).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True if the current request carries a valid CRM session cookie. */
export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const tok = jar.get(CRM_COOKIE)?.value;
  if (!tok) return false;
  const expected = sessionToken();
  const a = Buffer.from(tok);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
