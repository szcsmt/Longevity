import { randomUUID } from 'node:crypto';
import type { Lead, SentEmail } from './types';
import { autoEmailsEnabled, sendEmail } from './mailer';
import { REPLY_FLAG_DAYS, listLeads, recordSentEmail } from './store';

/* The customer-facing e-mail sequence, mirroring the agreed flow:
     minute 0  — thank-you (brochure requests get the brochure link inline)
     day 3     — ONE polite reminder if the lead never replied
   After that the human takes over (the red awaiting flag suggests a call).
   Everything here is inert until the mailer env is configured. */

const SITE = 'https://longevitysamui.com';
const BROCHURE_URL = `${SITE}/brochure/longevity-brochure-2026.pdf`;

const firstName = (l: Lead) => (l.name || '').trim().split(/\s+/)[0] || 'there';

/* The human behind the automated e-mails. Set in env so it can be changed
   any time (and later become per-salesperson):
     CRM_AGENT_NAME  — e.g. "Máté Szűcs"
     CRM_AGENT_TITLE — e.g. "Sales Director, Longevity Samui"
     CRM_AGENT_PHONE — e.g. "+66 12 345 6789" (also becomes the WhatsApp link)
   Until a name is set, a neutral team signature is used. */
function signature(): string {
  const name = process.env.CRM_AGENT_NAME;
  const title = process.env.CRM_AGENT_TITLE || 'Longevity Samui';
  const phone = process.env.CRM_AGENT_PHONE;
  const wa = phone ? `https://wa.me/${phone.replace(/[^\d]/g, '')}` : null;
  if (!name) {
    return `<p style="margin:26px 0 0">Warm regards,<br/>The Longevity Samui team<br/>
      <a href="${SITE}" style="color:#666">${SITE.replace('https://', '')}</a></p>`;
  }
  return `
    <p style="margin:26px 0 0">Warm regards,</p>
    <p style="margin:14px 0 0"><b>${name}</b><br/>
      <span style="color:#555">${title}</span><br/>
      ${phone ? `${phone}${wa ? ` · <a href="${wa}" style="color:#555">WhatsApp</a>` : ''}<br/>` : ''}
      <a href="${SITE}" style="color:#555">${SITE.replace('https://', '')}</a></p>`;
}

/* Deliberately plain: system font, no banners, no marketing chrome. A short
   first-person note that looks hand-written converts; a designed newsletter
   gets skimmed and archived. */
const wrap = (body: string) => `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222;font-size:15px;line-height:1.6;max-width:540px">
    ${body}
    ${signature()}
  </div>`;

export function welcomeEmail(l: Lead): { subject: string; html: string } {
  const name = firstName(l);
  if (l.form_type === 'brochure_request') {
    return {
      subject: 'Your Longevity Samui brochure',
      html: wrap(`
        <p>Hi ${name},</p>
        <p>Thanks for your interest in Longevity — here's the brochure you asked for:</p>
        <p><a href="${BROCHURE_URL}" style="color:#9a7b3f;font-weight:bold">Download the brochure (PDF)</a></p>
        <p>Have a look, and if any of the residences catches your eye, just hit reply —
        I'm happy to walk you through availability, pricing and how reservation works.</p>`),
    };
  }
  if (l.form_type === 'reserve' || (l.form_origin || '').startsWith('villa')) {
    return {
      subject: `Your reservation enquiry${l.villa ? ` — ${l.villa}` : ''}`,
      html: wrap(`
        <p>Hi ${name},</p>
        <p>Thank you for your enquiry${l.villa ? ` about <b>${l.villa}</b>` : ''} — great choice.
        I'm putting together the details for you now: current availability, exact pricing and
        our simple 4-step payment schedule.</p>
        <p>I'll get back to you personally within a few hours. If you'd rather talk sooner,
        just reply to this e-mail${process.env.CRM_AGENT_PHONE ? ` or call me directly at ${process.env.CRM_AGENT_PHONE}` : ''}.</p>`),
    };
  }
  return {
    subject: 'Thanks for reaching out',
    html: wrap(`
      <p>Hi ${name},</p>
      <p>Thanks for your interest in Longevity Wellness Resort — I've received your enquiry
      and will get back to you personally shortly.</p>
      <p>Meanwhile, feel free to browse the residences at
      <a href="${SITE}" style="color:#9a7b3f">${SITE.replace('https://', '')}</a> — and if you
      already have questions, just reply, this inbox comes straight to me.</p>`),
  };
}

export function reminderEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: `Re: your Longevity enquiry${l.villa ? ` — ${l.villa}` : ''}`,
    html: wrap(`
      <p>Hi ${firstName(l)},</p>
      <p>Just following up on what I sent a few days ago — I know a decision like this
      takes time, so no rush at all.</p>
      <p>If any questions have come up about the residences, pricing or the reservation
      process, just reply — I'm glad to help. And if the timing isn't right, a one-line
      reply saying so is absolutely fine too.</p>`),
  };
}

/** Minute-0 welcome. Called from the public lead intake; no-op while dark. */
export async function sendAutoWelcome(lead: Lead): Promise<void> {
  if (!autoEmailsEnabled() || !lead.email) return;
  const mail = welcomeEmail(lead);
  if (await sendEmail({ to: lead.email, ...mail })) {
    await recordSentEmail(lead.id, { id: randomUUID(), step: 'welcome', subject: mail.subject, at: new Date().toISOString() });
  }
}

/* Day-3 reminders. Exactly ONE per lead, and only while the conversation is
   genuinely stalled: welcome went out, the reply timer has been running past
   the threshold, and the lead is still early-stage. */
export async function runReminders(): Promise<{ checked: number; sent: number }> {
  if (!autoEmailsEnabled()) return { checked: 0, sent: 0 };
  const leads = await listLeads();
  const cut = new Date(Date.now() - REPLY_FLAG_DAYS * 86_400_000).toISOString();
  let sent = 0;
  for (const l of leads) {
    if (!l.email) continue;
    if (!['new', 'contacted', 'qualified'].includes(l.stage)) continue;
    if (!l.awaiting_reply_since || l.awaiting_reply_since > cut) continue;
    const box = l.outbox || [];
    if (box.some((e) => e.step === 'reminder' && e.at > l.awaiting_reply_since!)) continue; // one per wait
    const mail = reminderEmail(l);
    if (await sendEmail({ to: l.email, ...mail })) {
      await recordSentEmail(l.id, { id: randomUUID(), step: 'reminder', subject: mail.subject, at: new Date().toISOString() });
      sent++;
    }
  }
  return { checked: leads.length, sent };
}
