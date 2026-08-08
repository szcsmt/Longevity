/* Public intake for the site's forms: stores the lead in the CRM, alerts the
   operator, and sends the minute-0 thank-you that starts the follow-up
   sequence. A store failure never breaks the visitor's submit — the form still
   shows its thank-you. */

import { upsertLeadFromPayload } from '@/lib/crm/store';
import { notifyNewLead } from '@/lib/crm/notify';
import { sendAutoWelcome } from '@/lib/crm/automation';

export const dynamic = 'force-dynamic'; // never cache a POST handler

/* Per-IP rate limit (per serverless instance) — same posture as /api/event.
   Real visitors submit a handful of forms; a script hammering this endpoint
   would otherwise grow the database and burn e-mail quota unboundedly. */
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 5;           // submissions
const WINDOW = 60_000;     // per minute

function allowed(ip: string): boolean {
  const nowT = Date.now();
  const h = hits.get(ip);
  if (!h || nowT - h.t > WINDOW) {
    hits.set(ip, { n: 1, t: nowT });
    if (hits.size > 5000) hits.clear(); // bound memory
    return true;
  }
  h.n += 1;
  return h.n <= LIMIT;
}

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!allowed(ip)) return Response.json({ ok: false }, { status: 429 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // Persist into our own CRM. Best-effort: a store failure must never break
  // the visitor's submit — they filled in a form and deserve the thank-you.
  try {
    if (body && typeof body === 'object') {
      // Free-text message (e.g. the 3D twin's enquiry form) lands as a note on
      // the lead's timeline.
      const b = body as Record<string, unknown>;
      const message = typeof b.message === 'string' && b.message.trim() ? b.message.trim() : undefined;
      // One person = one lead: a repeat enquiry appends to the existing lead.
      const { lead, created } = await upsertLeadFromPayload(b, message);
      if (created) {
        // Instant e-mail alert (no-op unless RESEND_API_KEY + CRM_NOTIFY_TO are set).
        await notifyNewLead(lead).catch(() => {});
        // Minute-0 thank-you to the customer — inert until CRM_AUTO_FROM is set
        // Only for NEW people; a
        // returning contact must never get a second welcome.
        await sendAutoWelcome(lead).catch(() => {});
      }
    }
  } catch {
    /* store failure must not affect the visitor's submit */
  }

  /* Nothing is forwarded anywhere. The make.com/Bigin pipeline was cut on
     2026-08-07 when the agency relationship ended, and the /api/ingest door it
     used was removed on 2026-08-08. This CRM is the only destination a lead
     from this website has. */
  return Response.json({ ok: true });
}
