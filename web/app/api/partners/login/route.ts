import { cookies } from 'next/headers';
import { PORTAL_COOKIE, agencyForToken, sessionValue, touchPortal } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

/* Per-IP rate limit, same posture as the public lead form. A single token
   guessed by brute force would hand somebody a partner's view of our customer
   list, so this is the one endpoint on the portal worth slowing down hard. */
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 8;
const WINDOW = 60_000;

function allowed(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW) {
    hits.set(ip, { n: 1, t: now });
    if (hits.size > 5000) hits.clear();
    return true;
  }
  h.n += 1;
  return h.n <= LIMIT;
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allowed(ip)) return Response.json({ ok: false }, { status: 429 });

  const { token } = await req.json().catch(() => ({ token: '' }));
  const agency = await agencyForToken(String(token || ''));
  /* One message for every failure — wrong token, revoked token, archived
     agency. Telling somebody which of those it was tells them whether the
     token ever existed. */
  if (!agency) return Response.json({ ok: false, error: 'That access code is not valid.' }, { status: 401 });

  const jar = await cookies();
  jar.set(PORTAL_COOKIE, sessionValue(agency), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 14, // a fortnight — shorter than a staff session
  });
  await touchPortal(agency);
  return Response.json({ ok: true });
}
