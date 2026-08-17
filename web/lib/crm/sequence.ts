import type { EmailStep, Lead } from './types';

/* The sequence timetable — pure data, no Node APIs, so the admin UI can show
   an operator exactly where a lead stands without importing the mail engine.
   automation.ts attaches the actual letters to these steps. */

export interface SequenceStepMeta {
  step: EmailStep;
  day: number;
  label: string;
  note: string; // what this letter is for, in one line
  /* Which document this letter carries, if any (an id from documents.ts).
     The escalation is deliberate: the 12-page overview opens instantly on a
     phone and is what a stranger will actually read, so it goes first; the
     52-page brochure is held back for someone who has already shown interest.
     Steps with no document are the ones whose job is to ask, not to give. */
  doc?: string;
}

export const SEQUENCE_STEPS: SequenceStepMeta[] = [
  { step: 'welcome',  day: 0,  label: 'Welcome',        note: 'Instant thank-you, personalised to the form',   doc: 'overview' },
  { step: 'reminder', day: 3,  label: 'Gentle nudge',   note: 'One follow-up if they never replied' },
  { step: 'story',    day: 10, label: 'The story',      note: 'What Longevity is — a reason to care again',    doc: 'brochure' },
  { step: 'viewing',  day: 24, label: 'Viewing invite', note: 'Come and see it, in person or by video',        doc: 'overview' },
  { step: 'terms',    day: 45, label: 'Terms',          note: 'Pricing and the 4-step payment schedule',       doc: 'brochure' },
  { step: 'closing',  day: 60, label: 'Closing note',   note: 'A graceful last word — then we stop' },
];

export const stepLabel = (s: EmailStep) => SEQUENCE_STEPS.find((x) => x.step === s)?.label || s;

/* Which channel a step would go out on. E-mail carries the designed letter and
   is always preferred; WhatsApp is the fallback for the leads that arrive with
   a number and no address — until now those got nothing at all. */
export type SequenceChannel = 'email' | 'whatsapp';

export const channelFor = (l: Lead): SequenceChannel | null =>
  l.email ? 'email' : (l.whatsapp || l.phone) ? 'whatsapp' : null;

/* Why a lead is not (or no longer) in the sequence — the same conditions the
   engine applies, so what the operator reads is what actually happens. */
export type SequenceState =
  | { active: true; sent: number; next?: SequenceStepMeta; nextDate?: string }
  | { active: false; sent: number; reason: string };

export function sequenceState(l: Lead): SequenceState {
  const box = l.outbox || [];
  const sent = box.length;
  const started = box.find((e) => e.step === 'welcome');

  if (l.unsubscribed) return { active: false, sent, reason: 'The customer opted out' };
  if (!channelFor(l)) return { active: false, sent, reason: 'No e-mail address or WhatsApp number on file' };
  if (!['new', 'contacted', 'qualified'].includes(l.stage))
    return { active: false, sent, reason: 'The deal has moved on — a person is handling it' };
  /* Engagement means a person now owns the conversation, whichever direction it
     came from: the customer wrote, or a salesperson got hold of them and logged
     it. A call that rang out is not engagement, which is why `reached` is a
     field rather than something read out of the text. */
  const wrote = (l.history || []).some(
    (h) => h.kind === 'message' || (h.kind === 'email' && h.detail.startsWith('Reply received')),
  );
  if (wrote) return { active: false, sent, reason: 'The customer replied — over to you' };
  const spoke = (l.history || []).find((h) => h.reached);
  if (spoke) return { active: false, sent, reason: `${spoke.detail.split(' — ')[0]} — over to you` };
  if (!started) return { active: false, sent, reason: 'Predates the automatic sequence' };

  const done = new Set(box.map((e) => e.step));
  const next = SEQUENCE_STEPS.find((s) => !done.has(s.step));
  if (!next) return { active: false, sent, reason: 'Sequence finished — all six sent' };

  const nextDate = new Date(new Date(started.at).getTime() + next.day * 86_400_000).toISOString();
  return { active: true, sent, next, nextDate };
}

/* The engine's decision for one lead, in pure form: which letter (if any) goes
   out right now. Day 0 is sent by the intake, never by the sweep. When several
   steps have come due — after a cron outage, say — only the LATEST one is
   returned, so a lead never wakes up to four e-mails in one morning. */
export function dueStep(l: Lead, now = Date.now()): SequenceStepMeta | null {
  if (!sequenceState(l).active) return null;
  const box = l.outbox || [];
  const started = box.find((e) => e.step === 'welcome')!; // guaranteed by the active check
  const day = Math.floor((now - new Date(started.at).getTime()) / 86_400_000);
  const sent = new Set(box.map((e) => e.step));
  let due: SequenceStepMeta | null = null;
  for (const s of SEQUENCE_STEPS) {
    if (s.step !== 'welcome' && s.day <= day && !sent.has(s.step)) due = s;
  }
  return due;
}
