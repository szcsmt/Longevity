import { getBackend } from './backend';

/* ── Who did what, and from where ──

   The CRM already records what happened to a LEAD: every note, stage change
   and reassignment is on the record itself. What it had no memory of at all
   was access — who signed in, who failed to, who downloaded the whole contact
   list as a CSV, whose backup went out last night. That is the half that
   matters after something goes wrong, and it was the half that was missing:
   if the database turned up somewhere it should not be, there was no way to
   say whose account it left through.

   Kept in the settings key-value corner rather than a table of its own,
   sharded one key per month. A month is a natural retention unit, it keeps
   each stored document small enough that appending an entry is cheap, and old
   months age out by simply never being written to again — no pruning job, and
   nothing silently deleted either. */

export type AuditAction =
  | 'login'              // a session began
  | 'login.failed'       // credentials rejected — the one worth counting
  | 'logout'             // a session ended by choice
  | 'session.revoked'    // an admin cut somebody off
  | 'export.csv'         // the whole contact list, onto somebody's laptop
  | 'backup.mailed'      // the whole database, into a mailbox
  | 'leads.purge'        // the real erasure
  | 'settings.changed';  // integrations, credentials, schedules

export interface AuditEntry {
  at: string;
  actor: string;
  action: AuditAction;
  detail?: string;
  ip?: string;
  agent?: string;
}

/* Entries per monthly shard. High enough that a month of ordinary use never
   reaches it, low enough that the document stays small. */
const MAX_PER_MONTH = Number(process.env.CRM_AUDIT_MAX || 5000);
/* How far back the reader will look when a month is thin. Six months of
   history is well past the point where anybody is still investigating. */
const LOOKBACK_MONTHS = 6;

const shardKey = (d: Date) => `crm_audit_${d.toISOString().slice(0, 7)}`;

function monthsBack(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i += 1) {
    keys.push(shardKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return keys;
}

/** The caller's IP and browser, as far as the proxy will tell us. Vercel sets
    x-forwarded-for; the left-most entry is the client, the rest are hops. */
export function clientInfo(req: Request): { ip?: string; agent?: string } {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const ip = (fwd.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || undefined;
  const ua = req.headers.get('user-agent') || '';
  return { ip, agent: ua ? ua.slice(0, 120) : undefined };
}

/** Append one entry. Never throws: a failure to write the log must not be a
    failure to serve the request, and losing the reason somebody was let in is
    worse than losing the note that they were. */
export async function audit(entry: Omit<AuditEntry, 'at'> & { at?: string }): Promise<void> {
  try {
    const backend = await getBackend();
    const key = shardKey(new Date());
    const existing = (await backend.getSetting<AuditEntry[]>(key)) || [];
    const row: AuditEntry = { at: entry.at || new Date().toISOString(), ...entry };
    /* Newest first, so reading the log never has to sort and the cap drops
       the oldest of the month rather than the newest. */
    const next = [row, ...existing].slice(0, MAX_PER_MONTH);
    await backend.setSetting(key, next);
  } catch (err) {
    console.error('[audit] could not record', entry.action, err);
  }
}

/** The log, newest first, walking back through monthly shards until `limit`
    entries are found or the lookback runs out. */
export async function readAudit(limit = 200): Promise<AuditEntry[]> {
  const backend = await getBackend();
  const out: AuditEntry[] = [];
  for (const key of monthsBack(LOOKBACK_MONTHS)) {
    if (out.length >= limit) break;
    const shard = (await backend.getSetting<AuditEntry[]>(key)) || [];
    out.push(...shard);
  }
  return out.slice(0, limit);
}

/** Failed sign-ins in the last `hours`, newest first. The number that means
    somebody is guessing rather than forgetting. */
export async function recentFailures(hours = 24): Promise<AuditEntry[]> {
  const since = Date.now() - hours * 3600_000;
  const log = await readAudit(1000);
  return log.filter((e) => e.action === 'login.failed' && Date.parse(e.at) >= since);
}
