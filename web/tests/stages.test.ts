import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* The stages the sales actually has, and the one rule worth refusing over.

   There were six, and three of the things that really happen to a deal — a
   presentation, a viewing, a negotiation — were not among them, so everything
   between Qualified and Reserved looked like a single step and the funnel could
   never say where deals die.

   The tests below guard the two halves of the entry rules, which are
   deliberately different in kind. Reserved / Contract / Won assert that a
   specific villa is involved and are REFUSED without one — a lead in those
   stages with no unit is a hole in the inventory. Everything else is judgement,
   and judgement is recorded rather than blocked. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-stage-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { STAGES, OPEN_STAGES, atOrBeyond, isOpenStage, stageIndex } = await import('../lib/crm/types');
const { ACTIVE_STAGES, hasNoNextStep } = await import('../lib/crm/rules');

after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const fresh = () => store.createManualLead({ name: `S ${++n}`, email: `s${n}@example.com` });

describe('reading the order instead of listing stage names', () => {
  it('keeps lost last, because every report treats it as the exit', () => {
    assert.equal(STAGES.at(-1)!.id, 'lost');
  });

  it('answers "at least this far" by position', () => {
    assert.equal(atOrBeyond('negotiation', 'qualified'), true);
    assert.equal(atOrBeyond('contacted', 'qualified'), false);
    assert.equal(atOrBeyond('won', 'reserved'), true);
  });

  it('never says a lost deal got anywhere', () => {
    // Lost sits last in the array, so a naive index comparison would report it
    // as having reached every stage there is.
    assert.ok(stageIndex('lost') > stageIndex('won'));
    assert.equal(atOrBeyond('lost', 'reserved'), false);
    assert.equal(atOrBeyond('lost', 'new'), false);
  });

  it('counts every stage but the two endings as open', () => {
    assert.equal(OPEN_STAGES.length, STAGES.length - 2);
    assert.equal(isOpenStage('contract'), true);
    assert.equal(isOpenStage('won'), false);
    assert.equal(isOpenStage('lost'), false);
  });

  it('expects somebody to be working every open deal, reservations included', () => {
    // It used to stop at Qualified, so a reservation with nothing planned
    // raised no flag at all — precisely where a deal is most expensive to lose.
    assert.deepEqual(ACTIVE_STAGES, OPEN_STAGES);
  });
});

describe('a stage that asserts a villa', () => {
  it('is refused when the lead names none, and says why', async () => {
    const lead = await fresh();
    await assert.rejects(
      () => store.updateLead(lead.id, { stage: 'reserved' }, 'Anna'),
      (err: Error) => {
        assert.equal(err.name, 'StageConflict');
        assert.match(err.message, /needs a residence/);
        return true;
      },
    );
    assert.equal((await store.getLead(lead.id))!.stage, 'new', 'a refused move leaves no trace');
  });

  it('accepts the unit and the stage in the same change', async () => {
    const lead = await fresh();
    const after = await store.updateLead(lead.id, { villa: 'Residence L', stage: 'reserved' }, 'Anna');
    assert.equal(after!.stage, 'reserved');
  });

  it('leaves a lead already in that stage alone when something else is edited', async () => {
    const lead = await fresh();
    await store.updateLead(lead.id, { villa: 'Residence L', stage: 'won' }, 'Anna');
    // Old rows may have reached a late stage before this rule existed; editing
    // a name must not start refusing them.
    const after = await store.updateLead(lead.id, { name: 'Renamed' }, 'Anna');
    assert.equal(after!.name, 'Renamed');
  });

  it('reports the refusal by name when it happens in bulk', async () => {
    const named = await store.createManualLead({ name: 'Has A Villa', email: 'hv@example.com', villa: 'Residence M' });
    const bare = await store.createManualLead({ name: 'No Villa', email: 'nv@example.com' });

    const result = await store.bulkUpdate([named.id, bare.id], { stage: 'reserved' }, 'Anna');
    assert.equal(result.done, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.refused.length, 1);
    assert.match(result.refused[0], /^No Villa: /);
  });
});

describe('a stage that is judgement', () => {
  it('lets a lead through to Qualified without the answers', async () => {
    const lead = await fresh();
    const after = await store.updateLead(lead.id, { stage: 'qualified' }, 'Anna');
    assert.equal(after!.stage, 'qualified');
  });

  it('writes the gap onto the stage entry itself', async () => {
    const lead = await fresh();
    const after = await store.updateLead(lead.id, { stage: 'presentation' }, 'Anna');
    const entry = (after!.history || []).filter((h) => h.kind === 'stage').at(-1)!;

    assert.match(entry.detail, /New → Presentation/);
    assert.match(entry.detail, /still unknown: budget, timeframe, purpose/);
  });

  it('says nothing when the conversation actually established it', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, {
      budget: 9_000_000, currency: 'THB', timeframe: '0-3', purpose: 'investment', financing: 'cash',
    }, 'Anna');
    const after = await store.updateLead(lead.id, { villa: 'Residence L', stage: 'qualified' }, 'Anna');
    const entry = (after!.history || []).filter((h) => h.kind === 'stage').at(-1)!;

    assert.equal(entry.detail, 'New → Qualified');
  });

  it('does not nag about qualification on the way to Contacted', async () => {
    const lead = await fresh();
    const after = await store.updateLead(lead.id, { stage: 'contacted' }, 'Anna');
    assert.equal((after!.history || []).filter((h) => h.kind === 'stage').at(-1)!.detail, 'New → Contacted');
  });
});

describe('the middle of the funnel', () => {
  it('flags a reservation with nothing planned', async () => {
    const lead = await store.createManualLead({ name: 'Reserved Nobody Chased', email: 'r@example.com', villa: 'Residence L' });
    const after = await store.updateLead(lead.id, { stage: 'reserved' }, 'Anna');
    assert.equal(hasNoNextStep(after!), true);
  });

  it('counts a negotiation in the pipeline value', async () => {
    const lead = await fresh();
    await store.updateLead(lead.id, { stage: 'negotiation', value: 15_000_000 }, 'Anna');
    const s = await store.stats();
    assert.ok(s.pipelineValue >= 15_000_000, 'a deal being negotiated is very much in the pipeline');
  });
});
