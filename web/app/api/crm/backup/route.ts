import { isAdmin } from '@/lib/crm/auth';
import { getVillaData, listEvents, listLeads } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* Daily full backup, mailed as a JSON attachment to CRM_NOTIFY_TO. Triggered
   by Vercel Cron (Authorization: Bearer CRON_SECRET) or manually by an admin.
   A deleted lead or a bad merge stops being fatal the day this runs first:
   yesterday's snapshot is always sitting in the mailbox. */
export async function GET(req: Request) {
  const bearer = req.headers.get('authorization');
  const cronOk = Boolean(process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`);
  if (!cronOk && !(await isAdmin())) return Response.json({ ok: false }, { status: 401 });

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CRM_NOTIFY_TO;
  if (!key || !to) {
    return Response.json({ ok: false, error: 'mailer not configured' }, { status: 503 });
  }

  const [leads, villaData, events] = await Promise.all([
    listLeads(),
    getVillaData(),
    listEvents(500),
  ]);
  const snapshot = {
    taken_at: new Date().toISOString(),
    counts: { leads: leads.length, villas: Object.keys(villaData.villas).length, events: events.length },
    leads,
    villas: villaData.villas,
    villa_history: villaData.history,
    events,
  };
  const json = JSON.stringify(snapshot, null, 1);
  const day = snapshot.taken_at.slice(0, 10);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CRM_NOTIFY_FROM || 'Longevity CRM <onboarding@resend.dev>',
      to: [to],
      subject: `CRM backup — ${day} (${leads.length} leads)`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">
        <p>Daily CRM snapshot attached.</p>
        <p>${leads.length} leads · ${Object.keys(villaData.villas).length} villa records · ${events.length} events</p>
        <p style="color:#888;font-size:12px">Keep a few of these — any one of them can restore the CRM.</p>
      </div>`,
      attachments: [
        {
          filename: `crm-backup-${day}.json`,
          content: Buffer.from(json, 'utf8').toString('base64'),
        },
      ],
    }),
  });

  return Response.json({
    ok: res.ok,
    sent_to: res.ok ? to : undefined,
    bytes: json.length,
    counts: snapshot.counts,
  }, { status: res.ok ? 200 : 502 });
}
