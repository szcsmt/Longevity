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

const wrap = (body: string) => `
  <div style="font-family:Georgia,serif;color:#1c1c1c;font-size:16px;line-height:1.65;max-width:560px">
    ${body}
    <p style="margin-top:28px">Warm regards,<br/>The Longevity Samui team</p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:24px">
      Longevity Wellness Resort · Koh Samui, Thailand · <a href="${SITE}" style="color:#8a8a8a">${SITE.replace('https://', '')}</a><br/>
      If you'd rather not hear from us, just reply and let us know.
    </p>
  </div>`;

export function welcomeEmail(l: Lead): { subject: string; html: string } {
  const name = firstName(l);
  if (l.form_type === 'brochure_request') {
    return {
      subject: 'Your Longevity Samui brochure',
      html: wrap(`
        <p>Dear ${name},</p>
        <p>Thank you for your interest in Longevity Wellness Resort. Your brochure is ready:</p>
        <p><a href="${BROCHURE_URL}" style="color:#9a7b3f;font-weight:bold">Download the brochure (PDF)</a></p>
        <p>If any residence catches your eye, reply to this e-mail and we'll gladly walk you
        through availability, pricing and the reservation process.</p>`),
    };
  }
  if (l.form_type === 'reserve' || (l.form_origin || '').startsWith('villa')) {
    return {
      subject: `Your reservation enquiry${l.villa ? ` — ${l.villa}` : ''} · Longevity Samui`,
      html: wrap(`
        <p>Dear ${name},</p>
        <p>Thank you for your reservation enquiry${l.villa ? ` for <b>${l.villa}</b>` : ''}. We've
        received it and are preparing the details for you — availability, the exact pricing and
        the simple 4-step payment schedule.</p>
        <p>We'll be in touch personally within a few hours.</p>`),
    };
  }
  return {
    subject: 'Thank you for your enquiry · Longevity Samui',
    html: wrap(`
      <p>Dear ${name},</p>
      <p>Thank you for reaching out about Longevity Wellness Resort. We've received your enquiry
      and will get back to you personally shortly with everything you asked for.</p>
      <p>In the meantime, feel free to browse the residences at
      <a href="${SITE}" style="color:#9a7b3f">${SITE.replace('https://', '')}</a>.</p>`),
  };
}

export function reminderEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: `Still here to help${l.villa ? ` with ${l.villa}` : ''} · Longevity Samui`,
    html: wrap(`
      <p>Dear ${firstName(l)},</p>
      <p>Just a gentle follow-up on the information we sent a few days ago — we know these
      decisions take time.</p>
      <p>If you have any questions about the residences, pricing or the reservation process,
      simply reply to this e-mail; we're happy to help. And if now isn't the right moment,
      that's perfectly fine too.</p>`),
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
