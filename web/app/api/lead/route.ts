/* Receives a lead from the site's forms and forwards it to the make.com webhook
   server-side, so the webhook URL never appears in client code (can't be scraped or
   spammed). Set MAKE_WEBHOOK in the Vercel project env to activate; until then leads
   are accepted (the form still shows its thank-you) but not forwarded. */

import { createLeadFromPayload } from '@/lib/crm/store';
import { notifyNewLead } from '@/lib/crm/notify';

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

  // Persist into our own CRM first (best-effort — never break the form on error),
  // then still forward to make.com for any existing automations.
  try {
    if (body && typeof body === 'object') {
      const lead = await createLeadFromPayload(body as Record<string, unknown>);
      // Instant e-mail alert (no-op unless RESEND_API_KEY + CRM_NOTIFY_TO are set).
      await notifyNewLead(lead).catch(() => {});
    }
  } catch {
    /* store failure must not affect the visitor's submit */
  }

  const webhook = process.env.MAKE_WEBHOOK;
  if (!webhook) {
    // Not wired yet — accept the lead so the UX works; nothing to forward to.
    return Response.json({ ok: true, forwarded: false });
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return Response.json({ ok: res.ok, forwarded: true });
  } catch {
    return Response.json({ ok: false, forwarded: false }, { status: 502 });
  }
}
