import { randomUUID } from 'node:crypto';
import type { EmailStep, Lead } from './types';
import { autoEmailsEnabled, sendEmail } from './mailer';
import {
  closingEmail, reminderEmail, storyEmail, termsEmail, viewingEmail, welcomeEmail,
} from './letters';
import { dueStep } from './sequence';
import { listLeads, recordSentEmail } from './store';

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
  welcome: welcomeEmail,
  reminder: reminderEmail,
  story: storyEmail,
  viewing: viewingEmail,
  terms: termsEmail,
  closing: closingEmail,
};

/** Minute-0 welcome. Called from the public lead intake; no-op while dark. */
export async function sendAutoWelcome(lead: Lead): Promise<void> {
  if (!autoEmailsEnabled() || !lead.email || lead.unsubscribed) return;
  const mail = welcomeEmail(lead);
  if (await sendEmail({ to: lead.email, ...mail })) {
    await recordSentEmail(lead.id, { id: randomUUID(), step: 'welcome', subject: mail.subject, at: new Date().toISOString() });
  }
}

export interface SequenceResult {
  checked: number;
  sent: number;
  steps: Partial<Record<EmailStep, number>>;
}

/** Daily sweep: advances every quiet lead by at most one step. */
export async function runSequence(): Promise<SequenceResult> {
  if (!autoEmailsEnabled()) return { checked: 0, sent: 0, steps: {} };
  const leads = await listLeads();
  const steps: Partial<Record<EmailStep, number>> = {};
  let sent = 0;
  for (const l of leads) {
    const due = dueStep(l);
    if (!due) continue;
    const mail = LETTERS[due.step](l);
    if (await sendEmail({ to: l.email!, ...mail })) {
      await recordSentEmail(l.id, { id: randomUUID(), step: due.step, subject: mail.subject, at: new Date().toISOString() });
      steps[due.step] = (steps[due.step] || 0) + 1;
      sent++;
    }
  }
  return { checked: leads.length, sent, steps };
}
