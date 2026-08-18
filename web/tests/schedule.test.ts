import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Payment schedules.

   7 / 43 / 40 / 10 was a constant in the type file, which made it a fact about
   the software rather than a term of a contract — and terms are the sort of
   thing that get negotiated.

   The property worth guarding is the one that is easy to get wrong: a unit
   keeps the schedule it was SOLD on. Changing the house terms next year must
   not retroactively rewrite what a buyer already agreed, and no global constant
   could have prevented that. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-sched-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;
delete process.env.PARTNER_WEBHOOK_URL;
delete process.env.CRM_PAYMENT_SCHEDULE;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const sched = await import('../lib/crm/schedule');
const { phaseAmount, paidTotal, nextPhase } = await import('../lib/crm/villas');
const { financeReport } = await import('../lib/crm/finance');
import type { PhaseDef } from '../lib/crm/types';

after(() => rmSync(dir, { recursive: true, force: true }));

let u = 0;
const unit = () => `S${++u}`;
const rec = async (id: string) => (await store.getVillaData()).villas[id];

const HALVES: PhaseDef[] = [
  { key: 'deposit', pct: 50, label: 'Deposit', gate: 'On signing', construction: null },
  { key: 'balance', pct: 50, label: 'Balance', gate: 'Handover', construction: 'done' },
];

async function sold(id: string, value = 20_000_000) {
  await store.setVillaStatus(id, 'free');
  const lead = await store.createManualLead({ name: `B${id}`, email: `${id.toLowerCase()}@example.com` });
  await store.updateVillaSale(id, { op: 'sale', patch: { buyerLeadId: lead.id, contractValue: value } });
  return lead;
}

describe('validating a schedule', () => {
  it('refuses one that does not add up', () => {
    assert.match(sched.scheduleProblem([
      { key: 'a', pct: 60, label: 'A', gate: '', construction: null },
      { key: 'b', pct: 30, label: 'B', gate: '', construction: null },
    ])!, /add up to 90%/);
  });

  it('accepts a hundredth of a percent of rounding and no more', () => {
    assert.equal(sched.scheduleProblem([
      { key: 'a', pct: 33.33, label: 'A', gate: '', construction: null },
      { key: 'b', pct: 33.33, label: 'B', gate: '', construction: null },
      { key: 'c', pct: 33.34, label: 'C', gate: '', construction: null },
    ]), null);
  });

  it('refuses duplicate keys, empty schedules and impossible gates', () => {
    assert.match(sched.scheduleProblem([
      { key: 'a', pct: 50, label: 'A', gate: '', construction: null },
      { key: 'a', pct: 50, label: 'A', gate: '', construction: null },
    ])!, /share the key/);
    assert.match(sched.scheduleProblem([])!, /at least one step/);
    assert.match(sched.scheduleProblem([
      { key: 'a', pct: 100, label: 'A', gate: '', construction: 'roofing' as never },
    ])!, /does not exist/);
  });

  it('knows when a unit is on terms of its own', () => {
    assert.equal(sched.isCustomSchedule(undefined), false);
    assert.equal(sched.isCustomSchedule({ schedule: sched.DEFAULT_SCHEDULE }), false);
    assert.equal(sched.isCustomSchedule({ schedule: HALVES }), true);
  });
});

describe('a unit on its own terms', () => {
  it('computes every instalment from its own split', async () => {
    const id = unit();
    await sold(id, 20_000_000);
    await store.updateVillaSale(id, { op: 'schedule', phases: HALVES });
    const r = (await rec(id))!;

    assert.equal(sched.scheduleFor(r).length, 2);
    assert.equal(phaseAmount(r, 'deposit'), 10_000_000);
    assert.equal(phaseAmount(r, 'balance'), 10_000_000);
    assert.equal(nextPhase(r)!.key, 'deposit');
  });

  it('counts its own steps towards being sold, not the standard four', async () => {
    const id = unit();
    await sold(id, 10_000_000);
    await store.updateVillaSale(id, { op: 'schedule', phases: HALVES });
    await store.updateVillaSale(id, { op: 'phase', key: 'deposit', paid: true });
    assert.equal((await rec(id))!.status, 'reserved');

    await store.updateVillaSale(id, { op: 'phase', key: 'balance', paid: true });
    const r = (await rec(id))!;
    assert.equal(r.status, 'sold', 'two of two is the whole schedule');
    assert.equal(paidTotal(r), 10_000_000);
  });

  it('drives the money report off its own gates', async () => {
    const id = unit();
    await sold(id, 10_000_000);
    await store.updateVillaSale(id, { op: 'schedule', phases: HALVES });
    await store.updateVillaSale(id, { op: 'phase', key: 'deposit', paid: true });

    const report = financeReport({ [id]: (await rec(id))! });
    const balance = report.instalments.find((i) => i.key === 'balance')!;
    // Gated on 'done', and nothing is built — so it is later, not due.
    assert.equal(balance.state, 'later');
    assert.match(balance.reason, /Handover/i);
  });

  it('goes back to the standard terms when asked', async () => {
    const id = unit();
    await sold(id);
    await store.updateVillaSale(id, { op: 'schedule', phases: HALVES });
    await store.updateVillaSale(id, { op: 'schedule', phases: null });
    assert.equal(sched.isCustomSchedule((await rec(id))!), false);
    assert.equal(sched.scheduleFor((await rec(id))!).length, 4);
  });
});

describe('what a schedule change must never do', () => {
  it('is refused once an instalment has been paid against it', async () => {
    const id = unit();
    await sold(id, 20_000_000);
    await store.updateVillaSale(id, { op: 'phase', key: 'slot', paid: true });

    await assert.rejects(
      () => store.updateVillaSale(id, { op: 'schedule', phases: HALVES }),
      (err: Error) => {
        assert.equal(err.name, 'VillaConflict');
        assert.match(err.message, /already paid/);
        return true;
      },
    );
    assert.equal(sched.isCustomSchedule((await rec(id))!), false, 'and nothing changed');
  });

  it('is refused when the percentages do not add up', async () => {
    const id = unit();
    await sold(id);
    await assert.rejects(
      () => store.updateVillaSale(id, {
        op: 'schedule',
        phases: [{ key: 'all', pct: 90, label: 'All', gate: '', construction: null }],
      }),
      /not 100%/,
    );
  });
});

describe('the house schedule', () => {
  it('is the default until the project says otherwise', () => {
    assert.equal(sched.houseSchedule(), sched.DEFAULT_SCHEDULE);
    assert.equal(sched.houseScheduleProblem(), null);
  });

  it('reports a broken configuration instead of silently ignoring it', () => {
    process.env.CRM_PAYMENT_SCHEDULE = '[{"key":"a","pct":80,"label":"A","gate":"","construction":null}]';
    assert.match(sched.houseScheduleProblem()!, /not 100%/);
    // …and still hands back something arithmetically true to work with.
    assert.equal(sched.houseSchedule(), sched.DEFAULT_SCHEDULE);

    process.env.CRM_PAYMENT_SCHEDULE = 'not json at all';
    assert.match(sched.houseScheduleProblem()!, /not valid JSON/);
    delete process.env.CRM_PAYMENT_SCHEDULE;
  });

  it('does not rewrite a unit already sold on the old terms', async () => {
    /* The whole reason a unit carries its own schedule. Selling on 50/50 next
       year must not turn last year's 7/43/40/10 deal into a 50/50 one. */
    const id = unit();
    await sold(id, 20_000_000);
    await store.updateVillaSale(id, { op: 'phase', key: 'slot', paid: true });
    const before = paidTotal((await rec(id))!);

    process.env.CRM_PAYMENT_SCHEDULE = JSON.stringify(HALVES);
    try {
      assert.equal(sched.houseSchedule().length, 2, 'the house now sells on halves');
      assert.equal(paidTotal((await rec(id))!), before, 'the unit still owes what it always owed');
      assert.equal(phaseAmount((await rec(id))!, 'slot'), 1_400_000);
    } finally {
      delete process.env.CRM_PAYMENT_SCHEDULE;
    }
  });

  it('stamps its terms onto a unit when the project sells on something custom', async () => {
    process.env.CRM_PAYMENT_SCHEDULE = JSON.stringify(HALVES);
    try {
      const id = unit();
      await sold(id, 8_000_000);
      const r = (await rec(id))!;
      assert.equal(sched.isCustomSchedule(r), true, 'the terms are frozen onto the unit, not looked up later');
      assert.equal(phaseAmount(r, 'deposit'), 4_000_000);
    } finally {
      delete process.env.CRM_PAYMENT_SCHEDULE;
    }
  });
});
