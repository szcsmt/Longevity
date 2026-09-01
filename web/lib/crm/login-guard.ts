import { getBackend } from './backend';

/* ══════════════════ Slowing down somebody guessing ══════════════════

   The login had a brake: eight failures from one address and it stopped
   looking, held in a module-level Map. That was honest about what it was —
   the comment said "a brake, not a lock" — and on a serverless deployment it
   is weaker than it sounds. Every instance keeps its own count, so an attacker
   spreading requests across them gets eight tries per instance, and the number
   of instances is decided by how hard they are hitting the site. The busier
   the attack, the more attempts it earns.

   So the count is shared now, through the settings store the rest of the CRM
   already uses. That is a database read per attempt, which is affordable
   because the login writes to the database anyway — a successful one has to
   record a session. Nothing is gained by protecting a door that cannot open
   without the same database.

   ── Two counters, not one ──

   By ADDRESS, because one machine working through a password list is the
   ordinary case. And by ACCOUNT, because the dangerous case for a five-person
   CRM is the other shape: a thousand addresses trying `owner` once each, which
   no per-address counter will ever notice. Either one locks.

   ── Failing open ──

   If the store is unreachable the check gives up and lets the attempt through.
   That looks wrong for a security control and is not: the login cannot succeed
   without the same store, because it has to write a session. Failing closed
   would lock everybody out of a CRM that was already down, and would protect
   nothing that was not already unreachable. */

const KEY = 'crm_login_guard';

const num = (v: string | undefined, fallback: number) => {
  const n = Number((v || '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/** Failures from one address before it is locked out. */
const IP_MAX = num(process.env.CRM_LOGIN_MAX_FAILS, 8);
/** Failures against one account name, whatever the address. */
const ACCOUNT_MAX = num(process.env.CRM_LOGIN_ACCOUNT_MAX, 12);
/** How long failures are remembered, in minutes. */
const WINDOW_MIN = num(process.env.CRM_LOGIN_WINDOW_MIN, 10);
/** The first lockout. It doubles each time, up to a day. */
const LOCK_MIN = num(process.env.CRM_LOGIN_LOCK_MIN, 15);
const LOCK_CAP_MS = 24 * 3_600_000;

interface Strike { n: number; first: number; until?: number; locks: number }
type Book = Record<string, Strike>;

export interface Verdict {
  allowed: boolean;
  /** Seconds until the next attempt is worth making. */
  retryAfter?: number;
  /** Which counter stopped it — the address, or the account being guessed. */
  reason?: 'address' | 'account';
}

const ipKey = (ip: string) => `a:${ip}`;
const userKey = (u: string) => `u:${u.trim().toLowerCase()}`;

async function read(): Promise<Book> {
  return (await (await getBackend()).getSetting<Book>(KEY)) || {};
}

/* Every write prunes. A strike nobody has repeated for a window is not
   evidence of anything, and the audit log is where the history lives. */
async function write(book: Book): Promise<void> {
  const now = Date.now();
  const keep: Book = {};
  for (const [k, s] of Object.entries(book)) {
    if ((s.until && s.until > now) || now - s.first < WINDOW_MIN * 60_000) keep[k] = s;
  }
  await (await getBackend()).setSetting(KEY, keep);
}

/** May this attempt be made at all? */
export async function checkLogin(ip: string, username: string): Promise<Verdict> {
  try {
    const book = await read();
    const now = Date.now();
    for (const [key, reason] of [[ipKey(ip), 'address'], [userKey(username), 'account']] as const) {
      const s = book[key];
      if (s?.until && s.until > now) {
        return { allowed: false, retryAfter: Math.ceil((s.until - now) / 1000), reason };
      }
    }
    return { allowed: true };
  } catch {
    /* See the note at the top: the login cannot succeed without this store
       either, so letting the attempt through protects nothing less. */
    return { allowed: true };
  }
}

/** Record a rejected attempt, and lock out if it has gone far enough. */
export async function noteFailure(ip: string, username: string): Promise<{ locked: boolean; count: number }> {
  try {
    const book = await read();
    const now = Date.now();
    let locked = false;
    let worst = 0;

    for (const [key, max] of [[ipKey(ip), IP_MAX], [userKey(username), ACCOUNT_MAX]] as const) {
      const prev = book[key];
      /* A stale strike starts a fresh count rather than adding to one from
         last week — otherwise a mistyped password every Monday eventually
         locks somebody out of their own CRM. */
      const fresh = !prev || (now - prev.first > WINDOW_MIN * 60_000 && !(prev.until && prev.until > now));
      const s: Strike = fresh
        ? { n: 1, first: now, locks: prev?.locks || 0 }
        : { ...prev, n: prev.n + 1 };

      if (s.n >= max) {
        /* Doubling, because somebody who comes back after a lockout and keeps
           guessing is not making a typo. */
        s.locks += 1;
        s.until = now + Math.min(LOCK_MIN * 60_000 * 2 ** (s.locks - 1), LOCK_CAP_MS);
        s.n = 0;
        s.first = now;
        locked = true;
      }
      book[key] = s;
      worst = Math.max(worst, s.n);
    }

    await write(book);
    return { locked, count: worst };
  } catch {
    return { locked: false, count: 0 };
  }
}

/** A correct password clears the slate for that address and that account. */
export async function noteSuccess(ip: string, username: string): Promise<void> {
  try {
    const book = await read();
    delete book[ipKey(ip)];
    delete book[userKey(username)];
    await write(book);
  } catch {
    /* Nothing to do about it, and nothing broken by it: the strikes expire. */
  }
}

/** The configured limits, so a screen can state them rather than repeat them. */
export const loginPolicy = () => ({
  ipMax: IP_MAX, accountMax: ACCOUNT_MAX, windowMin: WINDOW_MIN, lockMin: LOCK_MIN,
});
