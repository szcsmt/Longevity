import type { Lead } from './types';

/* Optional instant e-mail alert when a new lead arrives, via the Resend HTTP
   API (no SDK needed). Activates only when both env vars are set — otherwise a
   silent no-op, so local dev and un-configured deploys are unaffected:

     RESEND_API_KEY   — API key from resend.com
     CRM_NOTIFY_TO    — recipient, e.g. sales@longevity-resort.com
     CRM_NOTIFY_FROM  — optional sender (default onboarding@resend.dev)      */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function notifyNewLead(lead: Lead): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.CRM_NOTIFY_TO;
  if (!key || !to) return;

  const kind = (lead.form_type || 'enquiry').replace('_', ' ');
  const rows: [string, string | undefined][] = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['WhatsApp', lead.whatsapp],
    ['Villa', lead.villa],
    ['Origin', lead.form_origin],
    ['Source', lead.source || lead.utm_source],
    ['Campaign', lead.utm_campaign],
  ];
  const table = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#888">${k}</td><td style="padding:4px 0"><strong>${esc(v!)}</strong></td></tr>`)
    .join('');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CRM_NOTIFY_FROM || 'Longevity CRM <onboarding@resend.dev>',
      to: [to],
      subject: `New ${kind} — ${lead.name || 'Unknown'}${lead.score === 'hot' ? ' 🔥' : ''}`,
      html: `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.5">
        <p>A new <strong>${esc(kind)}</strong> just landed in the CRM (score: <strong>${lead.score}</strong>).</p>
        <table style="border-collapse:collapse">${table}</table>
        <p style="margin-top:18px"><a href="https://longevitysamui.com/admin/leads/${lead.id}">Open in the CRM →</a></p>
      </div>`,
    }),
  });
}
