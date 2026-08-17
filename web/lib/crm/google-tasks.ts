import type { ProjectNote } from './types';
import { getSetting, linkNoteToTask, listNotes, setSetting, updateNote } from './store';

/* ── Google Tasks, two ways ──

   The project board mirrors into a Google Tasks list, so the cards are on the
   phone (Tasks app, Gmail sidebar, Calendar) with the reminders Google already
   knows how to send. Ticking a task there archives the card here; archiving a
   card here completes the task there.

   Google Keep would have been the obvious home for this and is not possible:
   its only API is a Workspace-admin one, with nothing for personal accounts.
   Tasks is the closest thing that has a real, supported API.

   Everything is inert until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set and
   someone has connected an account, exactly like the mailer and WhatsApp. */

const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API       = 'https://tasks.googleapis.com/tasks/v1';
const SCOPES    = 'openid email https://www.googleapis.com/auth/tasks';
const KEY       = 'google_tasks';
const LIST_NAME = 'Longevity Resort';
const SITE      = 'https://longevitysamui.com';

/** Ties the consent redirect to the request that started it. */
export const NONCE_COOKIE = 'lr_gt_nonce';

export interface GoogleTasksState {
  refreshToken: string;
  listId?: string;
  account?: string;      // which Google account is connected, for display
  lastSync?: string;
  lastError?: string;
  lastResult?: { pushed: number; pulled: number };
}

export interface GoogleTask {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
  deleted?: boolean;
}

export const googleConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const state = () => getSetting<GoogleTasksState>(KEY);
const saveState = (s: GoogleTasksState) => setSetting(KEY, s);

/* ── OAuth ── */

export function authUrl(redirectUri: string, nonce: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    // Google only hands out a refresh token when it is asked to, and only the
    // first time an account approves — `prompt=consent` makes reconnecting work.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: nonce,
  });
  return `${AUTH_URL}?${p}`;
}

/** Read the e-mail out of the id_token. It came straight from Google over TLS
    and is only used as a label, so it is decoded rather than verified. */
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

/** Finish the consent redirect: swap the code for a refresh token and keep it. */
export async function connect(code: string, redirectUri: string): Promise<GoogleTasksState> {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  if (!t.refresh_token) {
    throw new Error('Google did not return a refresh token — revoke the app in your Google account and connect again.');
  }
  const next: GoogleTasksState = {
    refreshToken: t.refresh_token,
    account: emailFromIdToken(t.id_token),
  };
  await saveState(next);
  return next;
}

export async function disconnect(): Promise<void> {
  await setSetting(KEY, null);
}

/* Access tokens last an hour; cached in module memory so a burst of syncs on one
   warm instance doesn't re-mint one per call. */
let cachedToken: { value: string; until: number } | null = null;

async function accessToken(refreshToken: string): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now() + 60_000) return cachedToken.value;
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  cachedToken = { value: t.access_token, until: Date.now() + (t.expires_in || 3600) * 1000 };
  return t.access_token;
}

/* ── Tasks API ── */

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Google Tasks ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? ({} as T) : ((await res.json()) as T);
}

/** Our own list, found by name or created. Never the user's default list — the
    board should not pour eighteen cards into someone's personal to-dos. */
async function ensureList(token: string, known?: string): Promise<string> {
  if (known) {
    try {
      const l = await api<{ id: string }>(token, `/users/@me/lists/${known}`);
      if (l.id) return l.id;
    } catch { /* deleted on the Google side — fall through and make a new one */ }
  }
  const lists = await api<{ items?: { id: string; title: string }[] }>(token, '/users/@me/lists?maxResults=100');
  const found = lists.items?.find((l) => l.title === LIST_NAME);
  if (found) return found.id;
  const made = await api<{ id: string }>(token, '/users/@me/lists', {
    method: 'POST', body: JSON.stringify({ title: LIST_NAME }),
  });
  return made.id;
}

async function allTasks(token: string, listId: string): Promise<GoogleTask[]> {
  const out: GoogleTask[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({
      maxResults: '100', showCompleted: 'true', showHidden: 'true', showDeleted: 'true',
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await api<{ items?: GoogleTask[]; nextPageToken?: string }>(token, `/lists/${listId}/tasks?${p}`);
    out.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 500);
  return out;
}

/* ── What a card looks like as a task ── */

const firstLine = (s?: string) => (s || '').split('\n').find((l) => l.trim())?.trim() || '';

function desired(note: ProjectNote) {
  const title = (note.title?.trim() || firstLine(note.body) || 'Jegyzet').slice(0, 200);
  const parts: string[] = [];
  if (note.title && note.body) parts.push(note.body.trim());
  else if (!note.title && note.body) {
    const rest = note.body.split('\n').slice(1).join('\n').trim();
    if (rest) parts.push(rest);
  }
  for (const it of note.items || []) parts.push(`${it.done ? '☑' : '☐'} ${it.text}`);
  if (note.owner) parts.push(`Kire vár: ${note.owner}`);
  parts.push(`${SITE}/admin/notes`);
  return {
    title,
    notes: parts.join('\n').slice(0, 8000),
    // Tasks stores a full timestamp but only ever honours the date part.
    due: note.due ? `${note.due.slice(0, 10)}T00:00:00.000Z` : undefined,
    status: (note.archived ? 'completed' : 'needsAction') as 'completed' | 'needsAction',
  };
}

const sameDay = (a?: string, b?: string) => (a || '').slice(0, 10) === (b || '').slice(0, 10);

function differs(task: GoogleTask, want: ReturnType<typeof desired>): boolean {
  return (task.title || '') !== want.title
    || (task.notes || '') !== want.notes
    || !sameDay(task.due, want.due)
    || (task.status || 'needsAction') !== want.status;
}

/* ── The sync ── */

export interface SyncResult {
  ok: boolean;
  skipped?: boolean;
  pushed?: number;
  pulled?: number;
  error?: string;
}

/** Both directions in one pass. Google wins on completion (a tick on the phone
    is the most recent human act); the CRM wins on content, because that is where
    the cards are actually written. */
export async function syncNow(force = false): Promise<SyncResult> {
  if (!googleConfigured()) return { ok: false, error: 'not configured' };
  const st = await state();
  if (!st?.refreshToken) return { ok: false, error: 'not connected' };
  if (!force && st.lastSync && Date.now() - Date.parse(st.lastSync) < 30_000) {
    return { ok: true, skipped: true };
  }

  try {
    const token  = await accessToken(st.refreshToken);
    const listId = await ensureList(token, st.listId);
    const tasks  = await allTasks(token, listId);
    const byId   = new Map(tasks.map((t) => [t.id, t]));

    let pushed = 0, pulled = 0;

    for (const note of await listNotes()) {
      const task = note.googleTaskId ? byId.get(note.googleTaskId) : undefined;

      // Deleted on the phone: treat as done, and drop the link so an un-archived
      // card can start a fresh task instead of chasing a tombstone.
      if (task?.deleted) {
        if (!note.archived) { await updateNote(note.id, { archived: true }); pulled++; }
        await linkNoteToTask(note.id);
        continue;
      }

      // Ticked on the phone → the card leaves the wall.
      if (task && task.status === 'completed' && !note.archived) {
        await updateNote(note.id, { archived: true });
        pulled++;
        continue;
      }

      const want = desired(note);

      if (!task) {
        if (note.archived) continue;   // nothing worth creating for a card already put away
        const made = await api<{ id: string }>(token, `/lists/${listId}/tasks`, {
          method: 'POST', body: JSON.stringify(want),
        });
        await linkNoteToTask(note.id, made.id);
        pushed++;
      } else if (differs(task, want)) {
        await api(token, `/lists/${listId}/tasks/${task.id}`, {
          method: 'PATCH', body: JSON.stringify(want),
        });
        pushed++;
      }
    }

    await saveState({ ...st, listId, lastSync: new Date().toISOString(), lastError: undefined, lastResult: { pushed, pulled } });
    return { ok: true, pushed, pulled };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await saveState({ ...st, lastSync: new Date().toISOString(), lastError: error });
    return { ok: false, error };
  }
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  account?: string;
  lastSync?: string;
  lastError?: string;
  lastResult?: { pushed: number; pulled: number };
}

export async function status(): Promise<GoogleStatus> {
  const st = await state();
  return {
    configured: googleConfigured(),
    connected: Boolean(st?.refreshToken),
    account: st?.account,
    lastSync: st?.lastSync,
    lastError: st?.lastError,
    lastResult: st?.lastResult,
  };
}
