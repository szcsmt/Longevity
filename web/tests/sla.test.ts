import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* The thresholds are defaults, not laws.

   A business that answers enquiries within the hour and one that answers them
   within the day are both real, and a number in the code says the second one is
   wrong. What matters as much as the configurability is that the SAME number
   answers on the server and in the browser: the leads table decides what is
   stalled without asking anybody, and a rule that disagreed with the report
   would flag a lead in one place and not the other. */

process.env.NEXT_PUBLIC_CRM_STAGE_DAYS = 'new:2,contacted:5,visit:0,nonsense:4,qualified:-1';
process.env.NEXT_PUBLIC_CRM_REPLY_DAYS = '7';

const { STAGE_MAX_DAYS, REPLY_FLAG_DAYS, isStalled, SECTION_META } = await import('../lib/crm/rules');

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const lead = (stage: string, ageDays: number) => ({
  id: 'x', stage, score: 'warm', notes: [], tasks: [],
  created_at: at(ageDays), updated_at: at(0),
} as never);

describe('configuring the stage thresholds', () => {
  it('takes the values it was given', () => {
    assert.equal(STAGE_MAX_DAYS.new, 2);
    assert.equal(STAGE_MAX_DAYS.contacted, 5);
  });

  it('reads zero as "this stage has no clock", which is a real answer', () => {
    assert.equal(STAGE_MAX_DAYS.visit, undefined);
    assert.equal(isStalled(lead('visit', 400)), false);
  });

  it('keeps the default for anything left out', () => {
    assert.equal(STAGE_MAX_DAYS.presentation, 7);
    assert.equal(STAGE_MAX_DAYS.negotiation, 14);
  });

  it('ignores a stage that does not exist and a number that cannot be days', () => {
    assert.equal((STAGE_MAX_DAYS as Record<string, number>).nonsense, undefined);
    assert.equal(STAGE_MAX_DAYS.qualified, 7, 'a negative value leaves the default alone');
  });

  it('actually changes what counts as stalled', () => {
    assert.equal(isStalled(lead('new', 3)), true);
    assert.equal(isStalled(lead('new', 1)), false, 'inside the configured two days');
  });
});

describe('configuring the reply timer', () => {
  it('takes the value it was given', () => {
    assert.equal(REPLY_FLAG_DAYS, 7);
  });

  it('is the number the queue tells the operator about', () => {
    // The section blurb is built from the same constant, so the screen can
    // never quote a threshold the rule is not using.
    assert.match(SECTION_META.find((s) => s.key === 'silent')!.blurb, /more than 7 days/);
  });
});
