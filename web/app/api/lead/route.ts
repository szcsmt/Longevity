/* Receives a lead from the site's forms and forwards it to the make.com webhook
   server-side, so the webhook URL never appears in client code (can't be scraped or
   spammed). Set MAKE_WEBHOOK in the Vercel project env to activate; until then leads
   are accepted (the form still shows its thank-you) but not forwarded. */

import { createLeadFromPayload } from '@/lib/crm/store';

export const dynamic = 'force-dynamic'; // never cache a POST handler

export async function POST(request: Request) {
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
      await createLeadFromPayload(body as Record<string, unknown>);
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
