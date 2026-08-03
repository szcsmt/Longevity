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

/** Active lead with no open task and no reply-timer: nobody owns its next step. */
export function hasNoNextStep(lead: Lead): boolean {
  if (!ACTIVE_STAGES.includes(lead.stage)) return false;
  if (lead.awaiting_reply_since) return false;
  return !lead.tasks.some((t) => !t.done);
}
