import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* The next step, and the queue built out of it.

   A CRM that can count open tasks but cannot say which one is late is a list,
   not an operating system. These tests pin the two things the Today screen
   depends on: that a lead's next step is its earliest DATED commitment, and
   that the queue puts every live lead in front of somebody exactly once, under
   the most urgent reason it qualified.

   The "exactly once" part is the one worth guarding. A lead that is
   uncontacted, stalled and has nothing planned is one phone call, and a
   day-list that says the same name three times is a day-list nobody trusts. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-next-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const {
  nextAction, nextActionState, hasConversed, workQueue, REPLY_FLAG_DAYS,
} = await import('../lib/crm/rules');

after(() => rmSync(dir, { recursive: true, force: true }));

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
};
const today = day(0).slice(0, 10);

let n = 0;
const fresh = () => store.createManualLead({ name: `N ${++n}`, email: `n${n}@example.com` });

describe('what happens next', () => {
  it('is the earliest dated task', async () => {
    const lead = await fresh();
    await store.addTask(lead.id, 'Send the price list', day(9), 'Anna');
    await store.addTask(lead.id, 'Call back', day(2), 'Anna');
    const after = await store.addTask(lead.id, 'Post the brochure', day(30), 'Anna');

    assert.equal(nextAction(after!)!.title, 'Call back');
  });

  it('never lets an undated note-to-self outrank a dated commitment', async () => {
    const lead = await fresh();
    // Added FIRST, so insertion order alone would put it in front.
    await store.addTask(lead.id, 'Think about the discount', undefined, 'Anna');
    const after = await store.addTask(lead.id, 'Call back', day(4), 'Anna');

    assert.equal(nextAction(after!)!.title, 'Call back');
    assert.equal(nextActionState(after!, today), 'upcoming');
  });

  it('reads a task due today as due today, not as late', async () => {
    const lead = await fresh();
    const after = await store.addTask(lead.id, 'Call back', day(0), 'Anna');
    assert.equal(nextActionState(after!, today), 'today');
  });

  it('calls yesterday late', async () => {
    const lead = await fresh();
    const after = await store.addTask(lead.id, 'Call back', day(-1), 'Anna');
    assert.equal(nextActionState(after!, today), 'overdue');
  });

  it('says nothing is planned when the only task is ticked off', async () => {
    const lead = await fresh();
    const withTask = await store.addTask(lead.id, 'Call back', day(1), 'Anna');
    const done = await store.toggleTask(lead.id, withTask!.tasks[0].id);
    assert.equal(nextActionState(done!, today), 'none');
  });
});

describe('has anybody actually spoken to them', () => {
  it('is false for a lead that has only been e-mailed', async () => {
    const lead = await fresh();
    await store.setAwaitingReply(lead.id, true);
    assert.equal(hasConversed((await store.getLead(lead.id))!), false);
  });

  it('is false for a call that rang out', async () => {
    const lead = await fresh();
    const after = await store.logTouch(lead.id, 'call-missed', undefined, 'Anna');
    assert.equal(hasConversed(after!), false, 'trying is not the same as reaching');
  });

  it('is true once somebody got hold of them', async () => {
    const lead = await fresh();
    const after = await store.logTouch(lead.id, 'call', 'Talked budget', 'Anna');
    assert.equal(hasConversed(after!), true);
  });
});

describe('the working queue', () => {
  it('puts an untouched new lead first, and only there', async () => {
    const lead = await fresh();
    const q = workQueue([(await store.getLead(lead.id))!], today);
    const inQueue = q.filter((s) => s.leads.length);
    assert.equal(inQueue.length, 1);
    assert.equal(inQueue[0].key, 'uncontacted');
  });

  it('lists a lead exactly once even when three rules apply at the same time', async () => {
    const lead = await fresh();
    // Late follow-up AND nothing else planned AND sitting past the threshold.
    await store.addTask(lead.id, 'Call back', day(-5), 'Anna');
    await store.logTouch(lead.id, 'call', undefined, 'Anna'); // moves it out of "uncontacted"
    const fetched = (await store.getLead(lead.id))!;

    const appearances = workQueue([fetched], today).filter((s) => s.leads.some((l) => l.id === lead.id));
    assert.equal(appearances.length, 1, 'one lead, one row');
    assert.equal(appearances[0].key, 'overdue', 'the most urgent reason wins');
  });

  it('leaves won and lost deals out of the day', async () => {
    const won = await fresh();
    const lost = await fresh();
    await store.updateLead(won.id, { stage: 'won' }, 'Anna');
    await store.updateLead(lost.id, { stage: 'lost', lost_reason: 'price' }, 'Anna');
    const leads = [(await store.getLead(won.id))!, (await store.getLead(lost.id))!];

    const total = workQueue(leads, today).reduce((sum, s) => sum + s.leads.length, 0);
    assert.equal(total, 0);
  });

  it('leaves an archived lead out of the day', async () => {
    const lead = await fresh();
    await store.archiveLead(lead.id, 'Wrong number', 'Anna');
    const archived = (await store.getLead(lead.id))!;

    const total = workQueue([archived], today).reduce((sum, s) => sum + s.leads.length, 0);
    assert.equal(total, 0);
  });

  it('flags a lead that has gone quiet past the reply threshold', async () => {
    const lead = await fresh();
    await store.logTouch(lead.id, 'call', undefined, 'Anna');
    const fetched = (await store.getLead(lead.id))!;
    // Backdate the wait rather than sleeping through it.
    fetched.awaiting_reply_since = day(-(REPLY_FLAG_DAYS + 2));
    // A dated task would outrank it, so make sure the one it has is done.
    fetched.tasks = [];

    const hit = workQueue([fetched], today).find((s) => s.leads.length);
    assert.equal(hit?.key, 'silent');
  });

  it('surfaces a live lead with nothing planned at all', async () => {
    const lead = await fresh();
    await store.logTouch(lead.id, 'call', undefined, 'Anna'); // → Contacted, spoken to
    const fetched = (await store.getLead(lead.id))!;

    const hit = workQueue([fetched], today).find((s) => s.leads.length);
    assert.equal(hit?.key, 'nonext');
  });

  it('agrees with the badge the operator is looking at', async () => {
    // The nav badge is computed from this same function; if the two ever drift,
    // the number points at a screen that does not show it.
    const leads = await store.listLeads();
    const queued = workQueue(leads).reduce((sum, s) => sum + s.leads.length, 0);
    assert.equal((await store.attentionCounts()).actionable, queued);
  });
});
