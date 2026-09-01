import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getBackend } from './backend';

/* ── Sessions that are actually sessions ──

   The cookie used to be sha256(name : password : a-salt-in-this-file). It
   identified the account, which was all it was asked to do, and it had three
   properties nobody wanted: it never changed, so it never expired; it was the
   same value on every device, so one person could not be signed out without
   changing their password and signing everybody out; and the salt was in the
   source, so the value could be computed by anyone who had the password and a
   copy of the repository rather than only by someone who had signed in.

   Now a sign-in mints a random token. The token goes to the browser and
   nowhere else: what is stored here is its SHA-256, the same way the partner
   portal already holds its links, so a copy of the database is not a set of
   working logins. Each one carries when it began, when it was last used, and
   from where, which is what makes "sign this device out" a thing an owner can
   do, and what makes the session list on the security page worth looking at.

   Two clocks, because they answer different questions. The idle clock ends a
   session somebody walked away from — the laptop in the sales office that
   nobody locked. The absolute clock ends a session nobody walked away from,
   because a token that is still valid four months after it was issued is not
   a session, it is a password with extra steps. Both are configuration: an
   office with a locked door has a different answer than a laptop on a plane. */

const KEY = 'crm_sessions';

const MAX_DAYS = Number(process.env.CRM_SESSION_DAYS || 7);
const IDLE_HOURS = Number(process.env.CRM_SESSION_IDLE_HOURS || 12);
/* Writing "last seen" on every request would be a database write per page
   view for no gain — nobody needs the minute, only the afternoon. */
const TOUCH_EVERY_MS = 5 * 60_000;

export interface StoredSession {
  /** Public handle, safe to put in a revoke button. Not the token. */
  id: string;
  /** SHA-256 of the token. The token itself is never written down. */
  hash: string;
  user: string;
  started: string;
  seen: string;
  ip?: string;
  agent?: string;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const equal = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function alive(s: StoredSession, now: number): boolean {
  const started = Date.parse(s.started);
  const seen = Date.parse(s.seen);
  if (!Number.isFinite(started) || !Number.isFinite(seen)) return false;
  if (now - started > MAX_DAYS * 86_400_000) return false;
  if (now - seen > IDLE_HOURS * 3_600_000) return false;
  return true;
}

async function load(): Promise<StoredSession[]> {
  const backend = await getBackend();
  return (await backend.getSetting<StoredSession[]>(KEY)) || [];
}

/* Every write prunes. Expired sessions are not evidence of anything — the
   audit log is where the history lives — so there is no reason to keep them
   and every reason not to grow this document without bound. */
async function save(list: StoredSession[]): Promise<void> {
  const backend = await getBackend();
  const now = Date.now();
  await backend.setSetting(KEY, list.filter((s) => alive(s, now)));
}

/** Mint a session. Returns the token to put in the cookie — this is the only
    moment it exists in readable form. */
export async function startSession(
  user: string,
  info: { ip?: string; agent?: string } = {},
): Promise<{ token: string; id: string }> {
  const token = randomBytes(32).toString('base64url');
  const at = new Date().toISOString();
  const session: StoredSession = {
    id: randomBytes(8).toString('hex'),
    hash: sha(token),
    user,
    started: at,
    seen: at,
    ip: info.ip,
    agent: info.agent,
  };
  await save([session, ...(await load())]);
  return { token, id: session.id };
}

/** The session this token belongs to, or null if it is unknown or expired.
    Refreshes the idle clock, at most once every few minutes. */
export async function sessionFor(token: string | undefined): Promise<StoredSession | null> {
  if (!token) return null;
  const wanted = sha(token);
  const list = await load();
  const now = Date.now();
  const found = list.find((s) => equal(s.hash, wanted));
  if (!found || !alive(found, now)) return null;

  if (now - Date.parse(found.seen) > TOUCH_EVERY_MS) {
    found.seen = new Date(now).toISOString();
    /* Deliberately not awaited into the caller's critical path, and harmless
       if it loses a race: the only field at stake is a timestamp that is
       allowed to be a few minutes stale. */
    void save(list).catch((err) => console.error('[sessions] touch failed', err));
  }
  return found;
}

/** End the session this token belongs to. Used by sign-out. */
export async function endSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const wanted = sha(token);
  await save((await load()).filter((s) => !equal(s.hash, wanted)));
}

/** Cut off one device by its public id. */
export async function revokeSession(id: string): Promise<boolean> {
  const list = await load();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  await save(next);
  return true;
}

/** Cut off every device belonging to one account — the thing to do the hour
    somebody leaves, or the hour a laptop does. Returns how many went. */
export async function revokeAllFor(user: string): Promise<number> {
  const list = await load();
  const key = user.trim().toLowerCase();
  const next = list.filter((s) => s.user.trim().toLowerCase() !== key);
  await save(next);
  return list.length - next.length;
}

/** Live sessions, newest first. What the security page shows. */
export async function listSessions(): Promise<StoredSession[]> {
  const now = Date.now();
  return (await load())
    .filter((s) => alive(s, now))
    .sort((a, b) => b.seen.localeCompare(a.seen));
}

/** The configured limits, so the security page can state them rather than
    repeat them. */
export const sessionPolicy = () => ({ maxDays: MAX_DAYS, idleHours: IDLE_HOURS });
