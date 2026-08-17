import { randomUUID } from 'node:crypto';
import type { EmailStep, Lead } from './types';
import { autoEmailsEnabled, sendEmail } from './mailer';
import {
  closingEmail, plainReminderEmail, plainWelcomeEmail, storyEmail, termsEmail,
  viewingEmail, whatsappMessage,
} from './letters';
import { channelFor, dueStep, stepLabel } from './sequence';
import { listLeads, recordSentEmail } from './store';
import { sendWhatsApp, whatsappEnabled } from './whatsapp';

/* ── The customer-facing e-mail sequence: minute 0 → day 60 ──

     minute 0   welcome   thank-you, personalised to what they filled in
     day 3      reminder  one gentle nudge if they never replied
     day 10     story     what Longevity actually is — the reason to care
     day 24     viewing   invitation to see it (in person or by video)
     day 45     terms     pricing and the 4-step payment schedule
     day 60     closing   a graceful last note, then we stop

   Rules that keep this from ever feeling like spam:
     · a step goes out at most ONCE per lead;
     · the whole sequence stops the moment the customer says anything,
       opts out, or the deal moves to reserved/won/lost;
     · nothing is sent to a lead that never received the minute-0 welcome, so
       switching the engine on can't blast the back catalogue;
     · at most one e-mail per lead per run, no catch-up bursts.
   Everything here is inert until the mailer env is configured. */

/* The timetable and the "is this lead still in the sequence?" decision live in
   sequence.ts (pure, shared with the admin UI, so the screen and the engine can
   never disagree); here we only attach the letters to it. */
type Letter = (l: Lead) => { subject: string; html: string };

const LETTERS: Record<EmailStep, Letter> = {
  welcome: plainWelcomeEmail,
  reminder: plainReminderEmail,
  story: storyEmail,
  viewing: viewingEmail,
  terms: termsEmail,
  closing: closingEmail,
};

/* ── Which steps are a mailing, and which are a reply ──

   The welcome answers a form the customer submitted minutes earlier, and the
   day-3 note is a single follow-up to it. Neither is a mailing, so neither
   carries the List-Unsubscribe headers — those are what mark a message as bulk,
   and bulk is what lands a letter in the Promotions tab. From day 10 the
   sequence is genuinely marketing and is treated as such. */
const TRANSACTIONAL: EmailStep[] = ['welcome', 'reminder'];

/* ── Sending one step, on whichever channel the lead can be reached on ──

   E-mail is always preferred: it carries the designed letter, it can be read
   later, and it is what most enquiries arrive with. WhatsApp is the fallback
   for the leads that give us a number and no address — until now those got
   nothing at all, which is the gap this closes.

   Returns the subject recorded in the outbox, or null when nothing went out.
   A WhatsApp send that Meta refuses (the 24-hour window, most often) returns
   null, so nothing is recorded and the step comes due again the next day. */
async function deliver(l: Lead, step: EmailStep): Promise<string | null> {
  const channel = channelFor(l);

  if (channel === 'email' && autoEmailsEnabled()) {
    const mail = LETTERS[step](l);
    const bulk = !TRANSACTIONAL.includes(step);
    return (await sendEmail({ to: l.email!, leadId: bulk ? l.id : undefined, ...mail }))
      ? mail.subject : null;
  }

  if (channel === 'whatsapp' && whatsappEnabled()) {
    const text = whatsappMessage(step, l);
    if (!text) return null;
    const to = l.whatsapp || l.phone!;
    return (await sendWhatsApp(to, text)) ? `WhatsApp: ${stepLabel(step)}` : null;
  }

  return null;
}

/** Minute-0 welcome. Called from the public lead intake; no-op while dark. */
export async function sendAutoWelcome(lead: Lead): Promise<void> {
  if (lead.unsubscribed) return;
  const subject = await deliver(lead, 'welcome');
  if (subject) {
    await recordSentEmail(lead.id, { id: randomUUID(), step: 'welcome', subject, at: new Date().toISOString() });
  }
}

export interface SequenceResult {
  checked: number;
  sent: number;
  steps: Partial<Record<EmailStep, number>>;
}

/** Daily sweep: advances every quiet lead by at most one step. */
export async function runSequence(): Promise<SequenceResult> {
  if (!autoEmailsEnabled() && !whatsappEnabled()) return { checked: 0, sent: 0, steps: {} };
  const leads = await listLeads();
  const steps: Partial<Record<EmailStep, number>> = {};
  let sent = 0;
  for (const l of leads) {
    const due = dueStep(l);
    if (!due) continue;
    const subject = await deliver(l, due.step);
    if (subject) {
      await recordSentEmail(l.id, { id: randomUUID(), step: due.step, subject, at: new Date().toISOString() });
      steps[due.step] = (steps[due.step] || 0) + 1;
      sent++;
    }
  }
  return { checked: leads.length, sent, steps };
}
