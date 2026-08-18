import type { Construction, PhaseKey, VillaRecord } from './types';
import { scheduleFor } from './schedule';
import { phaseAmount, paidTotal } from './villas';

/* ── The money, as a question rather than a record ──

   The masterplan already stores every instalment: what was agreed, what has
   been paid, when. What it cannot answer is the only question anyone actually
   asks about a development, which is "what is owed to us right now, and who is
   late". This module answers that.

   The schedule is governed by progress on site, not by the calendar: the 43%
   falls due when the foundation is finished, whenever that happens to be. So a
   phase is due when its construction gate has been passed and it is still
   unpaid — no date required. An explicit `due` date, when one has actually been
   agreed with a buyer, overrides that and also lets a payment be late before
   the gate is anywhere near. */

/* Which construction stage releases which instalment now travels WITH the step,
   on `PhaseDef.construction`, rather than living in a lookup table here that
   only knew the four keys this project happens to use. A `null` gate means the
   instalment is due from the moment the unit stops being free — the deposit
   that reserves the plot is not waiting for anything to be built. */

const ORDER: Construction[] = ['not_started', 'foundation', 'structure', 'furnishing', 'done'];
const reached = (now: Construction | undefined, gate: Construction) =>
  ORDER.indexOf(now || 'not_started') >= ORDER.indexOf(gate);

export type DueState = 'overdue' | 'due' | 'soon' | 'later' | 'paid';

export interface Instalment {
  villaId: string;
  buyerName?: string;
  buyerLeadId?: string;
  key: PhaseKey;
  label: string;
  amount: number;
  due?: string;        // the agreed date, when there is one
  state: DueState;
  /* Days late. Only meaningful with an agreed date — a gate-driven instalment
     is "due", but we have no honest way to say for how long. */
  daysLate?: number;
  reason: string;      // why it is in this bucket, in words an operator can read
}

export interface FinanceReport {
  contracted: number;   // total value of every unit under contract
  received: number;     // paid across all of them
  outstanding: number;  // contracted minus received
  overdue: number;      // THB past an agreed date
  dueNow: number;       // THB whose gate has been passed, unpaid
  next30: number;       // THB with an agreed date inside 30 days
  instalments: Instalment[];  // everything unpaid, worst first
  units: number;        // units under contract
}

const RANK: Record<DueState, number> = { overdue: 0, due: 1, soon: 2, later: 3, paid: 4 };

export function financeReport(
  villas: Record<string, VillaRecord>,
  now = new Date(),
): FinanceReport {
  const today = now.toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  const r: FinanceReport = {
    contracted: 0, received: 0, outstanding: 0,
    overdue: 0, dueNow: 0, next30: 0, instalments: [], units: 0,
  };

  for (const [villaId, rec] of Object.entries(villas)) {
    // Only units actually sold or reserved carry money. A free plot with a
    // stale contract value on it is not revenue.
    if (rec.status === 'free' || !rec.contractValue) continue;
    r.units++;
    r.contracted += rec.contractValue;
    r.received += paidTotal(rec);

    for (const phase of scheduleFor(rec)) {
      const stored = rec.phases?.[phase.key];
      if (stored?.paid) continue;

      const amount = phaseAmount(rec, phase.key);
      if (!amount) continue;

      const due = stored?.due;
      const gate = phase.construction;
      const gateOpen = gate === null ? true : reached(rec.construction, gate);

      let state: DueState;
      let daysLate: number | undefined;
      let reason: string;

      if (due && due.slice(0, 10) < today) {
        state = 'overdue';
        daysLate = Math.floor((now.getTime() - new Date(due).getTime()) / 86_400_000);
        reason = `agreed for ${due.slice(0, 10)}, ${daysLate} day${daysLate === 1 ? '' : 's'} late`;
        r.overdue += amount;
      } else if (due && due.slice(0, 10) <= in30) {
        state = 'soon';
        reason = `agreed for ${due.slice(0, 10)}`;
        r.next30 += amount;
      } else if (gateOpen) {
        state = 'due';
        reason = gate === null
          ? 'reserved, deposit not received'
          : `${phase.gate.toLowerCase()} — this instalment has been released`;
        r.dueNow += amount;
      } else {
        state = 'later';
        reason = `waiting on: ${phase.gate.toLowerCase()}`;
      }

      r.instalments.push({
        villaId,
        buyerName: rec.buyerName,
        buyerLeadId: rec.buyerLeadId,
        key: phase.key,
        label: phase.label,
        amount, due, state, daysLate, reason,
      });
    }
  }

  r.outstanding = r.contracted - r.received;
  /* Worst first, then biggest: an operator reading top-down should be working
     in the order that costs the most to leave alone. */
  r.instalments.sort((a, b) => RANK[a.state] - RANK[b.state] || b.amount - a.amount);
  return r;
}
