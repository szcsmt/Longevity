import type { PhaseDef, VillaRecord } from './types';

/* ══════════════════ Payment schedules ══════════════════

   7 / 43 / 40 / 10 is what this development sells on. It was a constant in the
   type file, which made it a fact about the software rather than a term of a
   contract — and terms are the sort of thing that get negotiated.

   Three levels, in order of precedence:

     1. The unit's own `schedule`, stamped from the house schedule the first
        time money is agreed on it. A buyer who negotiated 10/40/40/10 carries
        those terms for good.
     2. `CRM_PAYMENT_SCHEDULE`, if the project as a whole sells on something
        else. Read on the server only.
     3. `DEFAULT_SCHEDULE` below.

   Stamping matters more than it looks. Because a unit keeps the schedule it was
   sold on, changing the house terms next year cannot retroactively rewrite what
   a buyer already agreed — which is exactly what a payment schedule must never
   do, and what a single global constant could not have prevented. */

export const DEFAULT_SCHEDULE: PhaseDef[] = [
  { key: 'slot',       pct: 7,  label: 'Slot deposit · 7%', gate: 'Plot transferred to buyer', construction: null },
  { key: 'foundation', pct: 43, label: 'Foundation · 43%',  gate: 'Foundation complete',       construction: 'foundation' },
  { key: 'build',      pct: 40, label: 'Building · 40%',    gate: 'Building complete',         construction: 'structure' },
  { key: 'furnish',    pct: 10, label: 'Furnishing · 10%',  gate: 'Furnishing complete',       construction: 'furnishing' },
];

const STAGES = ['not_started', 'foundation', 'structure', 'furnishing', 'done'];

/* ── Validation ──

   A schedule whose steps do not add up to 100 produces wrong money in every
   figure that touches it, quietly. So an invalid one is REFUSED rather than
   half-accepted, and the caller falls back to something that is at least
   arithmetically true. */
export function scheduleProblem(phases: unknown): string | null {
  if (!Array.isArray(phases) || phases.length === 0) return 'A schedule needs at least one step.';
  const keys = new Set<string>();
  let total = 0;
  for (const p of phases as PhaseDef[]) {
    if (!p || typeof p.key !== 'string' || !p.key.trim()) return 'Every step needs a key.';
    if (keys.has(p.key)) return `Two steps share the key "${p.key}".`;
    keys.add(p.key);
    if (typeof p.pct !== 'number' || !isFinite(p.pct) || p.pct <= 0) return `Step "${p.key}" needs a percentage above zero.`;
    if (p.construction !== null && !STAGES.includes(String(p.construction))) {
      return `Step "${p.key}" is gated on a construction stage that does not exist.`;
    }
    total += p.pct;
  }
  // A hundredth of a percent of a 20M THB villa is 2,000 baht — close enough
  // to call rounding, and far enough from a schedule that does not add up.
  if (Math.abs(total - 100) > 0.01) return `The steps add up to ${Math.round(total * 100) / 100}%, not 100%.`;
  return null;
}

/** Normalise an untrusted list into a schedule, or null if it does not add up. */
export function toSchedule(raw: unknown): PhaseDef[] | null {
  if (scheduleProblem(raw)) return null;
  return (raw as PhaseDef[]).map((p) => ({
    key: String(p.key).trim().slice(0, 40),
    pct: Math.round(p.pct * 100) / 100,
    label: String(p.label || p.key).trim().slice(0, 80),
    gate: String(p.gate || '').trim().slice(0, 120),
    construction: p.construction ?? null,
  }));
}

/* ── The house schedule ──
   `CRM_PAYMENT_SCHEDULE` is JSON, because the shape has five fields and every
   compact string format for five fields becomes unreadable by the third one.
   Server-side only: a client component is handed the schedule it needs rather
   than reading an env var that would not be there. */
export function houseScheduleProblem(): string | null {
  const raw = (process.env.CRM_PAYMENT_SCHEDULE || '').trim();
  if (!raw) return null;
  try {
    return scheduleProblem(JSON.parse(raw));
  } catch {
    return 'CRM_PAYMENT_SCHEDULE is not valid JSON.';
  }
}

export function houseSchedule(): PhaseDef[] {
  const raw = (process.env.CRM_PAYMENT_SCHEDULE || '').trim();
  if (!raw) return DEFAULT_SCHEDULE;
  try {
    return toSchedule(JSON.parse(raw)) || DEFAULT_SCHEDULE;
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

/** The schedule a unit is actually sold on. Pure, so the masterplan and the
    finance report read the same steps without either of them consulting env. */
export const scheduleFor = (rec?: Pick<VillaRecord, 'schedule'>): PhaseDef[] =>
  rec?.schedule?.length ? rec.schedule : DEFAULT_SCHEDULE;

/** True when this unit is on terms of its own rather than the standard ones. */
export const isCustomSchedule = (rec?: Pick<VillaRecord, 'schedule'>): boolean => {
  const s = rec?.schedule;
  if (!s?.length) return false;
  if (s.length !== DEFAULT_SCHEDULE.length) return true;
  return s.some((p, i) => p.key !== DEFAULT_SCHEDULE[i].key || p.pct !== DEFAULT_SCHEDULE[i].pct);
};

/** "7 / 43 / 40 / 10" — for a heading that used to say it in hard-coded text. */
export const scheduleSummary = (phases: PhaseDef[]): string =>
  phases.map((p) => p.pct).join(' / ');
