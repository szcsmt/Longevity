import type { Lead, Stage } from './types';

/* Pure lead-management rules — importable from client components (no Node
   APIs). The structural contract: every active lead has a next step, and no
   lead sits in a stage past its threshold. */

export const STAGE_MAX_DAYS: Partial<Record<Stage, number>> = {
  new: 1,        // first response within a day
  contacted: 3,  // matches the reply-wait rhythm
  qualified: 7,  // a serious buyer gets weekly movement at minimum
};

export const ACTIVE_STAGES: Stage[] = ['new', 'contacted', 'qualified'];

/** When the lead entered its current stage (last stage change, else creation). */
export function stageEnteredAt(lead: Lead): string {
  const changes = (lead.history || []).filter((h) => h.kind === 'stage');
  return changes.length ? changes[changes.length - 1].at : lead.created_at;
}

/** Days the lead has been sitting in its current stage. */
export function stageAgeDays(lead: Lead): number {
  return Math.floor((Date.now() - new Date(stageEnteredAt(lead)).getTime()) / 86_400_000);
}

/** Over the stage threshold — needs movement. */
export function isStalled(lead: Lead): boolean {
  const max = STAGE_MAX_DAYS[lead.stage];
  return max !== undefined && stageAgeDays(lead) > max;
}

/* ── What is still unknown about a buyer ──

   The four answers that decide whether somebody is a buyer at all: what they
   can spend, when, what for, and whether the money is already theirs. Which
   unit they want is the fifth, and it lives on the lead itself.

   Pure, so the lead page can show the same gaps the stage rules will enforce —
   an operator should never be refused for a reason the screen did not show
   them first. "unknown" counts as unanswered on purpose: it is an honest
   answer to record, and it is still not knowing. */
export const QUALIFYING: { key: 'budget' | 'timeframe' | 'purpose' | 'financing' | 'villa'; label: string }[] = [
  { key: 'budget',    label: 'Budget' },
  { key: 'timeframe', label: 'Timeframe' },
  { key: 'purpose',   label: 'Purpose' },
  { key: 'financing', label: 'Cash or financing' },
  { key: 'villa',     label: 'Residence of interest' },
];

export function missingQualification(lead: Lead): string[] {
  const q = lead.qualification || {};
  const answered: Record<string, boolean> = {
    budget: Boolean(q.budget && q.budget > 0),
    timeframe: Boolean(q.timeframe && q.timeframe !== 'unknown'),
    purpose: Boolean(q.purpose),
    financing: Boolean(q.financing && q.financing !== 'unknown'),
    villa: Boolean((lead.villa || '').trim()),
  };
  return QUALIFYING.filter((f) => !answered[f.key]).map((f) => f.label);
}

/** Active lead with no open task and no reply-timer: nobody owns its next step. */
export function hasNoNextStep(lead: Lead): boolean {
  if (!ACTIVE_STAGES.includes(lead.stage)) return false;
  if (lead.awaiting_reply_since) return false;
  return !lead.tasks.some((t) => !t.done);
}
