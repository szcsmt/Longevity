import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Structured qualification.

   All of this used to live in free-text notes, so it could not be filtered,
   counted, or depended on — and "Qualified" was a stage anybody could click
   without knowing a single thing about the buyer. A stage rule is about to read
   these fields, which is why the validation matters as much as the storing:
   a value nobody offered must never be accepted, or a lead could look qualified
   on answers that were never given. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-qual-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { missingQualification, QUALIFYING } = await import('../lib/crm/rules');

after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const fresh = () => store.createManualLead({ name: `Q ${++n}`, email: `q${n}@example.com` });

describe('recording what the conversation established', () => {
  it('stores each answer', async () => {
    const lead = await fresh();
    const after = await store.setQualification(lead.id, {
      budget: 9_000_000, currency: 'THB', timeframe: '0-3',
      purpose: 'investment', financing: 'cash',
    }, 'Anna');

    assert.deepEqual(after!.qualification, {
      currency: 'THB', budget: 9_000_000, timeframe: '0-3',
      purpose: 'investment', financing: 'cash',
    });
  });

  it('puts every change on the timeline, so a moving budget stays visible', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, { currency: 'EUR', budget: 180_000 }, 'Anna');
    const after = await store.setQualification(lead.id, { budget: 250_000 }, 'Anna');

    const money = (after!.history || []).filter((h) => h.detail.startsWith('Budget'));
    assert.equal(money.length, 2, 'both figures must be on the record, not just the latest');
    assert.match(money[0].detail, /EUR 180,000/);
    assert.match(money[1].detail, /EUR 250,000/);
    assert.equal(money[1].by, 'Anna');
  });

  it('says nothing when a field is set to what it already was', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, { purpose: 'lifestyle' }, 'Anna');
    const before = ((await store.getLead(lead.id))!.history || []).length;
    const after = await store.setQualification(lead.id, { purpose: 'lifestyle' }, 'Anna');
    assert.equal((after!.history || []).length, before, 'a no-op must not fill the timeline');
  });

  it('leaves untouched fields alone', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, { purpose: 'mixed', timeframe: '6-12' }, 'Anna');
    const after = await store.setQualification(lead.id, { financing: 'cash' }, 'Anna');
    assert.equal(after!.qualification?.purpose, 'mixed', 'a partial save must not clear the rest');
    assert.equal(after!.qualification?.timeframe, '6-12');
  });

  it('counts as the salesperson having acted', async () => {
    const lead = await fresh();
    const after = await store.setQualification(lead.id, { purpose: 'investment' }, 'Anna');
    assert.ok(after!.first_response_at, 'learning this is the work of selling');
  });
});

describe('values nobody offered', () => {
  it('are dropped rather than stored', async () => {
    const lead = await fresh();
    const after = await store.setQualification(lead.id, {
      timeframe: 'tomorrow', purpose: 'speculation', financing: 'crypto',
    } as never, 'Anna');
    assert.equal(after!.qualification?.timeframe, undefined);
    assert.equal(after!.qualification?.purpose, undefined);
    assert.equal(after!.qualification?.financing, undefined);
  });

  it('cannot make a lead look qualified on answers that were never given', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, { timeframe: 'soon', purpose: 'x' } as never, 'Anna');
    const after = (await store.getLead(lead.id))!;
    assert.ok(missingQualification(after).includes('Timeframe'));
    assert.ok(missingQualification(after).includes('Purpose'));
  });

  it('refuses a currency that is not on the list', async () => {
    const lead = await fresh();
    const after = await store.setQualification(lead.id, { currency: 'BTC', budget: 1 } as never, 'Anna');
    assert.notEqual(after!.qualification?.currency, 'BTC');
  });

  it('refuses a budget that is not a positive number', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, { budget: 5_000_000 }, 'Anna');
    for (const bad of [-1, 0, NaN, Infinity, '9000000' as never]) {
      const after = await store.setQualification(lead.id, { budget: bad as number }, 'Anna');
      assert.equal(after!.qualification?.budget, undefined, `${bad} must clear rather than store`);
      await store.setQualification(lead.id, { budget: 5_000_000 }, 'Anna');
    }
  });
});

describe('what is still unknown', () => {
  it('lists all five on a lead nobody has spoken to', async () => {
    const lead = await fresh();
    assert.deepEqual(missingQualification(lead), QUALIFYING.map((f) => f.label));
  });

  it('treats "not known yet" as still not knowing', async () => {
    const lead = await fresh();
    const after = await store.setQualification(lead.id, {
      timeframe: 'unknown', financing: 'unknown',
    }, 'Anna');
    const missing = missingQualification(after!);
    assert.ok(missing.includes('Timeframe'), 'an honest "unknown" is still unanswered');
    assert.ok(missing.includes('Cash or financing'));
  });

  it('empties out once all five are answered', async () => {
    const lead = await store.createManualLead({
      name: 'Fully Qualified', email: 'fq@example.com', villa: 'Residence L',
    });
    await store.setQualification(lead.id, {
      budget: 9_000_000, timeframe: '0-3', purpose: 'investment', financing: 'cash',
    }, 'Anna');
    assert.deepEqual(missingQualification((await store.getLead(lead.id))!), []);
  });

  it('counts the residence of interest, which lives on the lead itself', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, {
      budget: 9_000_000, timeframe: '0-3', purpose: 'investment', financing: 'cash',
    }, 'Anna');
    assert.deepEqual(missingQualification((await store.getLead(lead.id))!), ['Residence of interest']);

    await store.updateLead(lead.id, { villa: 'Residence XL' }, 'Anna');
    assert.deepEqual(missingQualification((await store.getLead(lead.id))!), []);
  });
});
