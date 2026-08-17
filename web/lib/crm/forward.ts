import type { Lead } from './types';

/* ── Putting an inbound message in front of a human ──

   Filing a reply in the CRM is not the same as someone reading it. The
   operator lives in their mailbox and on their phone, so every inbound
   message — e-mail or WhatsApp — is forwarded there with the AI brief on
   top and Reply-To pointing at the customer, which means a reply from the
   phone still reaches the right person.

   Best-effort throughout: the message is already safely on the timeline by
   the time this runs, so a forwarding failure must never surface as an error
   to Resend or to Meta (either would retry and double-file the message). */

const SITE = 'https://longevitysamui.com';

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ForwardInput {
  lead: Pick<Lead, 'id' | 'name' | 'email' | 'phone' | 'whatsapp'>;
  channel: 'email' | 'whatsapp';
  subject?: string;
  body: string;
  brief?: string | null; // the reading, when the triage engine is configured
}

/* Built without touching the network, so the wording can be rendered and
   reviewed on its own — the same separation the customer letters keep. */
export function forwardEmail(input: ForwardInput): { subject: string; html: string } {
  const { lead, channel, subject, body, brief } = input;
  const who = lead.name || lead.email || lead.whatsapp || lead.phone || 'Someone';
  const via = channel === 'whatsapp' ? 'on WhatsApp' : 'by e-mail';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">
      <p style="margin:0 0 4px"><b>${esc(who)}</b> replied ${via}${subject ? ` — ${esc(subject)}` : ''}</p>
      <p style="margin:0 0 16px"><a href="${SITE}/admin/leads/${lead.id}">Open the lead in the CRM</a></p>
      ${brief ? `<pre style="white-space:pre-wrap;background:#F6F4EF;padding:14px;border-radius:4px;margin:0 0 16px">${esc(brief)}</pre>` : ''}
      <hr style="border:none;border-top:1px solid #E4DED2;margin:16px 0">
      <pre style="white-space:pre-wrap;margin:0">${esc(body)}</pre>
      ${channel === 'whatsapp'
        ? `<p style="margin:16px 0 0;color:#666">Answer in the CRM or on WhatsApp — replying to this e-mail will not reach them.</p>`
        : ''}
    </div>`;

  return { subject: `${channel === 'whatsapp' ? 'WhatsApp' : 'Reply'} — ${who}`, html };
}

export async function forwardToOperator(input: ForwardInput): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.CRM_NOTIFY_TO;
  const from = process.env.CRM_NOTIFY_FROM || process.env.CRM_AUTO_FROM;
  if (!key || !to || !from) return;

  const { subject, html } = forwardEmail(input);

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        /* Only an e-mail reply can be answered by replying. For WhatsApp the
           customer has no mailbox in this conversation, so Reply-To is left
           off rather than pointing somewhere that silently goes nowhere. */
        reply_to: input.channel === 'email' ? input.lead.email || undefined : undefined,
        html,
      }),
    });
  } catch {
    /* The message is already filed; forwarding is a convenience. */
  }
}
