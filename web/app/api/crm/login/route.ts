import { cookies } from 'next/headers';
import { CRM_COOKIE, verifyCredentials } from '@/lib/crm/auth';
import { startSession } from '@/lib/crm/sessions';
import { audit, clientInfo } from '@/lib/crm/audit';
import { checkLogin, noteFailure, noteSuccess } from '@/lib/crm/login-guard';

export const dynamic = 'force-dynamic';

/* ── A brake that every instance shares ──

   This used to count failures in a module-level Map, which on a serverless
   deployment means one count per instance: an attacker spreading requests
   across them earned eight tries each, and the harder they hit the site the
   more instances — and the more attempts — they were given. The count lives in
   the store now (lib/crm/login-guard.ts), which every instance reads.

   Two counters, and either one locks: by address, for the ordinary case of one
   machine working through a password list, and by account name, for the shape
   that matters more in a five-person CRM — a thousand addresses each trying
   `owner` once, which no per-address counter would ever see. */
export async function POST(req: Request) {
  const { ip, agent } = clientInfo(req);
  const from = ip || 'unknown';

  const { username, password } = await req.json().catch(() => ({ username: '', password: '' }));
  const name = String(username || '');

  const verdict = await checkLogin(from, name);
  if (!verdict.allowed) {
    /* Said in seconds rather than as "wait a few minutes", because somebody
       who mistyped their own password deserves to know when to come back —
       and somebody guessing learns nothing from it they could not measure. */
    return Response.json(
      {
        ok: false,
        error: verdict.reason === 'account'
          ? 'Túl sok sikertelen próbálkozás ezzel a felhasználónévvel. Próbáld újra később.'
          : 'Túl sok sikertelen próbálkozás erről a gépről. Próbáld újra később.',
        retryAfter: verdict.retryAfter,
      },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfter ?? 60) } },
    );
  }

  const account = verifyCredentials(name, password || '');

  if (!account) {
    const { locked, count } = await noteFailure(from, name);
    /* The attempted username is recorded, the attempted password is not.
       Knowing somebody tried to sign in as "Jani" from an address in another
       country is the useful half; the other half is a password that may well
       be a real one belonging to a real person who mistyped the field. */
    await audit({
      actor: name.slice(0, 60) || '(üres)',
      action: 'login.failed',
      detail: locked
        ? 'zárolva — túl sok sikertelen próbálkozás'
        : count > 1 ? `${count}. sikertelen próbálkozás egymás után` : undefined,
      ip, agent,
    });
    return Response.json({ ok: false, error: 'invalid credentials' }, { status: 401 });
  }

  await noteSuccess(from, name);
  const { token } = await startSession(account.name, { ip, agent });
  await audit({ actor: account.name, action: 'login', detail: account.role, ip, agent });

  const jar = await cookies();
  jar.set(CRM_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    /* The cookie outlives nothing: the session store decides when this stops
       working, and it is stricter than any number here. The max-age is only
       so the browser eventually cleans up a value that has long since become
       meaningless. */
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ ok: true });
}
