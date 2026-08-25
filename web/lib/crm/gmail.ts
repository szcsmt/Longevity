import { findLeadByContact, getSetting, recordMailboxMessage, setSetting } from './store';
import { addressOf, addressesIn, justTheReply, stripHtml } from './email-text';
import { agents } from './agents';

/* ══════════════════ Seeing the mailbox the selling actually happens in ══════════════════

   The CRM could see two kinds of e-mail: the ones it sent itself, and the
   replies that came back through Resend's inbound address. Everything else —
   which is to say almost everything — was invisible. A salesperson writes to a
   buyer from Gmail, the buyer answers, they exchange six messages, and the CRM
   shows a lead nobody has touched in a fortnight.

   This reads the shared sales mailbox and files what belongs to a lead.

   ── What it will not do ──

   Read-only, and narrow on purpose. It never sends, never labels, never
   deletes. And it files a message ONLY when one of the addresses on it matches
   a lead the CRM already knows. Everything else — the accountant, the builder,
   the personal mail that lands in any real mailbox — is looked at, not matched,
   and forgotten. Nothing unmatched is stored, logged, or counted.

   That rule is the whole privacy design, and it is enforced in one place:
   `leadFor()` below. */

const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API       = 'https://gmail.googleapis.com/gmail/v1';
const SCOPES    = 'openid email https://www.googleapis.com/auth/gmail.readonly';
const KEY       = 'google_gmail';

/** Ties the consent redirect to the request that started it. */
export const NONCE_COOKIE = 'lr_gm_nonce';

/* How far back the very first sync reaches. A new connection should bring the
   current conversations with it — a lead whose last three messages are missing
   looks abandoned — without dragging in years of history nobody will read. */
const FIRST_RUN_DAYS = 30;

/* Gmail counts a thread's messages, not ours. A cap keeps one runaway sync from
   spending the whole request budget. */
const MAX_PER_SYNC = 120;

export interface GmailState {
  refreshToken: string;
  account?: string;      // which mailbox is connected, for display
  lastSync?: string;
  lastError?: string;
  /** Epoch seconds of the newest message already filed. The next sync asks
      Gmail for anything after it. */
  cursor?: number;
  lastResult?: { seen: number; filed: number; leads: number };
}

export const gmailConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const state = () => getSetting<GmailState>(KEY);
const saveState = (s: GmailState) => setSetting(KEY, s);

/* ── OAuth ── */

export function authUrl(redirectUri: string, nonce: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: nonce,
  });
  return `${AUTH_URL}?${p}`;
}

function emailFromIdToken(idToken?: string): string | undefined {
  try {
    const payload = idToken?.split('.')[1];
    if (!payload) return undefined;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.email === 'string' ? json.email : undefined;
  } catch { return undefined; }
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      ...body,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `token ${res.status}`);
  return json as { access_token: string; refresh_token?: string; id_token?: string; expires_in: number };
}

export async function connect(code: string, redirectUri: string): Promise<GmailState> {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  if (!t.refresh_token) {
    throw new Error('Google did not return a refresh token — revoke the app in your Google account and connect again.');
  }
  const next: GmailState = { refreshToken: t.refresh_token, account: emailFromIdToken(t.id_token) };
  await saveState(next);
  return next;
}

export async function disconnect(): Promise<void> {
  await setSetting(KEY, null);
}

let cachedToken: { value: string; until: number } | null = null;

async function accessToken(refreshToken: string): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now() + 60_000) return cachedToken.value;
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  cachedToken = { value: t.access_token, until: Date.now() + (t.expires_in || 3600) * 1000 };
  return t.access_token;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/* ── Reading one message ── */

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

const b64 = (d?: string) => (d ? Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : '');

/** Depth-first for the best body part: plain text if it exists, else HTML. */
function bodyOf(payload?: GmailPart): string {
  if (!payload) return '';
  const found: Record<string, string> = {};
  const walk = (p: GmailPart) => {
    if (p.body?.data && p.mimeType && !found[p.mimeType]) found[p.mimeType] = b64(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  if (found['text/plain']) return found['text/plain'];
  if (found['text/html']) return stripHtml(found['text/html']);
  return '';
}

const header = (m: GmailMessage, name: string): string =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

/* ── Whose addresses are ours ──

   The connected mailbox itself, plus everybody on the sales roster. Needed to
   tell a message we sent from one we received, and to make sure an internal
   note between two colleagues never gets filed as a customer conversation. */
function ourAddresses(connected?: string): Set<string> {
  const ours = new Set<string>();
  if (connected) ours.add(connected.toLowerCase());
  for (const a of agents()) if (a.email) ours.add(a.email.toLowerCase());
  for (const extra of (process.env.CRM_MAILBOX_ALIASES || '').split(',')) {
    const v = extra.trim().toLowerCase();
    if (v.includes('@')) ours.add(v);
  }
  return ours;
}

export interface SyncResult {
  ok: boolean;
  seen: number;
  filed: number;
  leads: number;
  error?: string;
  note?: string;
}

/** The one place that decides whether a message concerns a lead at all.
    Everything unmatched is dropped here and never touches the database. */
async function leadFor(addresses: string[]) {
  for (const a of addresses) {
    const lead = await findLeadByContact(a, undefined, undefined);
    if (lead) return lead;
  }
  return null;
}

/* ── Not more often than this ──

   Every open CRM tab asks for a sync every few minutes, and there may be four
   of them. The throttle lives on the server so the answer does not depend on
   how many browsers are pointed at it. Module-level, which on a serverless
   instance means "per warm instance" — the worst case is a handful of extra
   syncs after a cold start, which is cheap and harmless. */
const MIN_GAP_MS = 90_000;
let lastRun = 0;

export function syncDue(): boolean {
  return Date.now() - lastRun > MIN_GAP_MS;
}

export async function syncIfDue(): Promise<SyncResult | null> {
  if (!syncDue()) return null;
  return syncNow(true);
}

export async function syncNow(quiet = false): Promise<SyncResult> {
  lastRun = Date.now();
  const st = await state();
  if (!gmailConfigured()) return { ok: false, seen: 0, filed: 0, leads: 0, note: 'GOOGLE_CLIENT_ID/SECRET not set' };
  if (!st?.refreshToken) return { ok: false, seen: 0, filed: 0, leads: 0, note: 'no mailbox connected' };

  try {
    const token = await accessToken(st.refreshToken);
    const ours = ourAddresses(st.account);

    /* Ask for everything since the last message we filed, with a minute of
       overlap — a sync that starts exactly where the last one stopped will miss
       anything that arrived in the same second. Duplicates are cheap; a lost
       customer e-mail is not. */
    const since = st.cursor
      ? st.cursor - 60
      : Math.floor((Date.now() - FIRST_RUN_DAYS * 86_400_000) / 1000);
    const q = `after:${since} -in:chats -in:spam -in:trash`;

    const list = await api<{ messages?: { id: string }[] }>(
      token, `/users/me/messages?maxResults=${MAX_PER_SYNC}&q=${encodeURIComponent(q)}`,
    );
    const ids = (list.messages || []).map((m) => m.id);

    let filed = 0;
    let newest = st.cursor || 0;
    const touched = new Set<string>();

    /* Oldest first, so a thread files in the order it happened: our message
       arms the reply timer, and their answer clears it. The other way round
       leaves every answered lead marked as waiting. */
    for (const id of ids.reverse()) {
      const m = await api<GmailMessage>(token, `/users/me/messages/${id}?format=full`);
      const at = Number(m.internalDate || 0);
      const seconds = Math.floor(at / 1000);
      if (seconds > newest) newest = seconds;

      // A draft is not a conversation; it is a thought somebody had.
      if ((m.labelIds || []).includes('DRAFT')) continue;

      const from = addressOf(header(m, 'From'));
      const to = [...addressesIn(header(m, 'To')), ...addressesIn(header(m, 'Cc'))];
      const outgoing = ours.has(from);

      /* The lead is whoever is at the other end. On an outgoing message that is
         a recipient; on an incoming one it is the sender. Our own addresses are
         removed either way, so two colleagues writing to each other match
         nothing. */
      const others = (outgoing ? to : [from, ...to]).filter((a) => !ours.has(a));
      if (!others.length) continue;

      const lead = await leadFor(others);
      if (!lead) continue;   // ← every unmatched message stops here, unstored

      const result = await recordMailboxMessage(lead.id, {
        gmailId: m.id,
        direction: outgoing ? 'out' : 'in',
        subject: header(m, 'Subject').slice(0, 300) || undefined,
        body: justTheReply(bodyOf(m.payload)).slice(0, 8000),
        at: new Date(at || Date.now()).toISOString(),
        counterpart: others[0],
        by: outgoing ? agents().find((a) => a.email?.toLowerCase() === from)?.name : undefined,
      });
      if (result === 'filed') {
        filed++;
        touched.add(lead.id);
      }
    }

    const next: GmailState = {
      ...st,
      cursor: newest || st.cursor,
      lastSync: new Date().toISOString(),
      lastError: undefined,
      lastResult: { seen: ids.length, filed, leads: touched.size },
    };
    await saveState(next);
    return { ok: true, seen: ids.length, filed, leads: touched.size };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed';
    await saveState({ ...st, lastSync: new Date().toISOString(), lastError: message });
    if (!quiet) throw err;
    return { ok: false, seen: 0, filed: 0, leads: 0, error: message };
  }
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  account?: string;
  lastSync?: string;
  lastError?: string;
  lastResult?: GmailState['lastResult'];
}

export async function status(): Promise<GmailStatus> {
  const st = await state();
  return {
    configured: gmailConfigured(),
    connected: Boolean(st?.refreshToken),
    account: st?.account,
    lastSync: st?.lastSync,
    lastError: st?.lastError,
    lastResult: st?.lastResult,
  };
}
