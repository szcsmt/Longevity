/* ══════════════════ Telling somebody when it breaks ══════════════════

   The CRM went down twice this month, and both times the way anybody found
   out was by trying to use it. There is a daily digest and there is an access
   log; neither says a word about the system failing. The errors were in
   Vercel's logs the whole time, and nobody reads Vercel's logs — that is not a
   criticism of anyone, it is what logs are.

   Worse, a failure can look like success. The audit log deliberately swallows
   its own errors so that a failed write never fails a request, which is right
   — and it means a total database outage presents as a login endpoint
   answering 401 quite normally. Something has to say so out loud.

   ── Two rules this is built on ──

   IT MUST NOT NEED THE DATABASE. The single most important thing to report is
   the database being unreachable, so nothing here reads or writes one. The
   throttle lives in memory, which on a serverless deployment means per
   instance — a few instances may each send one mail about the same outage,
   and that is a far better failure than a throttle that cannot run.

   IT MUST NOT FLOOD. An alert that arrives fourteen thousand times is an alert
   people filter into a folder, and then it is worse than nothing: the next
   real one is filed away unread. So the same problem is reported once an hour
   with a count of how often it happened, and there is a hard ceiling on
   distinct problems per hour as well. Being told about six things and told
   plainly that there were more beats being told about all of them. */

/* Sent straight through Resend rather than through lib/crm/mailer, on purpose.
   That module is the CUSTOMER mail engine: it refuses to send unless
   CRM_AUTO_FROM is configured, and it stops entirely when somebody sets
   CRM_AUTO_EMAILS=off. Both are correct for letters to buyers and both would
   silently disable the alarm — and the moment somebody reaches for the
   customer-mail kill switch is not the moment to stop being told the system is
   on fire. */

const QUIET_MS = Number(process.env.CRM_ALERT_QUIET_MIN || 60) * 60_000;
const MAX_PER_WINDOW = Number(process.env.CRM_ALERT_MAX || 6);

interface Seen { first: number; last: number; count: number; sent: number }

const seen = new Map<string, Seen>();
let windowStart = 0;
let sentThisWindow = 0;
let suppressed = 0;

/** The site, for links in the mail. */
const SITE = 'https://longevitysamui.com';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* One line that identifies the PROBLEM rather than the occurrence, so a
   thousand identical failures collapse to one. The message is trimmed of the
   parts that differ between occurrences — ids, timestamps, row counts — or
   nothing would ever match anything. */
function signature(where: string, message: string): string {
  const shape = message
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 120);
  return `${where} :: ${shape}`;
}

/** Report a failure. Never throws, never blocks the caller for long. */
export async function alertFailure(where: string, err: unknown, extra?: string): Promise<void> {
  try {
    const to = process.env.CRM_ALERT_TO || process.env.CRM_NOTIFY_TO;
    if (!to || !process.env.RESEND_API_KEY) return;

    const message = err instanceof Error ? err.message : String(err);
    const key = signature(where, message);
    const now = Date.now();

    /* A fresh window resets the ceiling, and reports what was held back in the
       last one — a number that is itself worth seeing. */
    if (now - windowStart > QUIET_MS) {
      windowStart = now;
      sentThisWindow = 0;
      suppressed = 0;
    }

    const prev = seen.get(key);
    const rec: Seen = prev
      ? { ...prev, last: now, count: prev.count + 1 }
      : { first: now, last: now, count: 1, sent: 0 };
    seen.set(key, rec);
    /* The map only ever grows on distinct failures. A thousand different
       messages is itself a broken deployment, but it should not also be a
       memory leak. */
    if (seen.size > 200) seen.clear();

    // Same problem, already reported recently: count it and stay quiet.
    if (rec.sent && now - rec.sent < QUIET_MS) return;
    if (sentThisWindow >= MAX_PER_WINDOW) { suppressed += 1; return; }

    rec.sent = now;
    sentThisWindow += 1;

    const since = prev ? new Date(prev.first).toISOString().replace('T', ' ').slice(0, 16) : null;
    const stack = err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 6).join('\n') : '';

    const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">
        <p><b>${esc(where)}</b> elszállt.</p>
        <p style="background:#f6f6f4;padding:12px;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;white-space:pre-wrap">${esc(message)}</p>
        ${extra ? `<p>${esc(extra)}</p>` : ''}
        ${rec.count > 1 ? `<p><b>${rec.count}×</b> fordult elő${since ? ` ${since} óta` : ''}.</p>` : ''}
        ${stack ? `<details><summary style="cursor:pointer;color:#888">Részletek</summary><pre style="font-size:11.5px;white-space:pre-wrap;color:#555">${esc(stack)}</pre></details>` : ''}
        ${suppressed ? `<p style="color:#888;font-size:12px">További ${suppressed} másfajta hibáról nem szólt ez az óra — a levélözön elkerülése végett.</p>` : ''}
        <p style="color:#888;font-size:12px">
          Ugyanerről a hibáról legkorábban ${Math.round(QUIET_MS / 60_000)} perc múlva jön újabb levél.<br>
          <a href="${SITE}/admin">CRM megnyitása</a>
        </p>
      </div>`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CRM_NOTIFY_FROM || 'Longevity CRM <onboarding@resend.dev>',
        to: [to],
        subject: `⚠ CRM hiba — ${where}`,
        html,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    /* An alert that fails must not become the thing that breaks the request it
       was reporting on. This is the one place in the system where silence is
       the right answer, because there is nobody left to tell. */
  }
}

/** For tests and for the cron's own report: what has been seen this window. */
export function alertState(): { tracked: number; sentThisWindow: number; suppressed: number } {
  return { tracked: seen.size, sentThisWindow, suppressed };
}

/** Tests only — the module keeps state across calls by design. */
export function resetAlerts(): void {
  seen.clear();
  windowStart = 0;
  sentThisWindow = 0;
  suppressed = 0;
}
