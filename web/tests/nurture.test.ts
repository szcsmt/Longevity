import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* "Not now" — the third answer.

   In this business the six-to-eighteen-month wait is normal, and until now
   there were only two places to put such a lead, both wrong. Closed Lost meant
   nobody ever looked again and the lost-reason report filled with deals that
   were never lost. Left in Qualified it was flagged as stalled every single
   day, which is how a team learns to ignore its own flags.

   What these tests pin is mostly the silence: a parked lead must ask for
   nothing — no queue row, no stall flag, no automated e-mail — and must come
   back, by itself, on the day it said. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-nurture-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { isNurtured, workQueue, matchesFlag, isStalled } = await import('../lib/crm/rules');
const { sequenceState } = await import('../lib/crm/sequence');

after(() => rmSync(dir, { recursive: true, force: true }));

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const today = day(0);

let n = 0;
const fresh = () => store.createManualLead({ name: `P ${++n}`, email: `p${n}@example.com` });

describe('parking a lead', () => {
  it('records the date, the reason and a line on the timeline', async () => {
    const lead = await fresh();
    const after = await store.setNurture(lead.id, day(90), 'visit', 'Coming out in November', 'Anna');

    assert.equal(after!.nurture_until, day(90));
    assert.equal(after!.nurture_reason, 'visit');
    const entry = (after!.history || []).at(-1)!;
    assert.equal(entry.kind, 'nurture');
    assert.match(entry.detail, /Coming out in November/);
    assert.equal(entry.by, 'Anna');
  });

  it('keeps the stage — a qualified buyer waiting on a house sale is still qualified', async () => {
    const lead = await fresh();
    await store.updateLead(lead.id, { stage: 'qualified' }, 'Anna');
    const after = await store.setNurture(lead.id, day(60), 'funds', undefined, 'Anna');
    assert.equal(after!.stage, 'qualified');
  });

  it('refuses a date that is not in the future', async () => {
    const lead = await fresh();
    assert.equal(await store.setNurture(lead.id, day(0), 'later', undefined, 'Anna'), null);
    assert.equal(await store.setNurture(lead.id, day(-5), 'later', undefined, 'Anna'), null);
    assert.equal(await store.setNurture(lead.id, 'next tuesday', 'later', undefined, 'Anna'), null);
    assert.equal((await store.getLead(lead.id))!.nurture_until, undefined);
  });

  it('drops a reason nobody offered rather than storing it', async () => {
    const lead = await fresh();
    const after = await store.setNurture(lead.id, day(30), 'because-i-said-so', undefined, 'Anna');
    assert.equal(after!.nurture_until, day(30));
    assert.equal(after!.nurture_reason, undefined);
  });

  it('stops the reply timer, so it does not wake up flagged for a silence we chose', async () => {
    const lead = await fresh();
    await store.setAwaitingReply(lead.id, true);
    const after = await store.setNurture(lead.id, day(45), 'later', undefined, 'Anna');
    assert.equal(after!.awaiting_reply_since, undefined);
  });
});

describe('while it is parked', () => {
  it('asks for nothing at all', async () => {
    const lead = await fresh();
    await store.updateLead(lead.id, { stage: 'contacted' }, 'Anna');
    await store.setNurture(lead.id, day(120), 'visit', undefined, 'Anna');
    const parked = (await store.getLead(lead.id))!;
    // Backdate the stage move far enough that it would certainly read as stalled.
    parked.history = (parked.history || []).map((h) => (h.kind === 'stage' ? { ...h, at: day(-40) } : h));

    assert.equal(isNurtured(parked, today), true);
    assert.equal(isStalled(parked), true, 'the underlying rule still says stalled…');
    const total = workQueue([parked], today).reduce((sum, s) => sum + s.leads.length, 0);
    assert.equal(total, 0, '…but the queue must not show it, and neither must any flag');
    assert.equal(matchesFlag(parked, 'stalled', today), false);
    assert.equal(matchesFlag(parked, 'nonext', today), false);
  });

  it('gets no automated e-mail', async () => {
    const lead = await fresh();
    await store.recordSentEmail(lead.id, { id: 'n1', step: 'welcome', subject: 'Welcome', at: new Date().toISOString() });
    await store.setNurture(lead.id, day(200), 'later', undefined, 'Anna');
    const parked = (await store.getLead(lead.id))!;

    const state = sequenceState(parked);
    assert.equal(state.active, false);
    assert.match((state as { reason: string }).reason, /Parked until/);
  });
});

describe('coming back', () => {
  it('reappears in its own section on the day', async () => {
    const lead = await fresh();
    // Parking follows a conversation — you cannot agree to come back in
    // November with somebody nobody has spoken to. Without this the lead
    // wakes into "nobody has spoken to them yet", which is a louder rule and
    // the right answer for a lead in that state.
    await store.logTouch(lead.id, 'call', 'Coming out in November', 'Anna');
    await store.setNurture(lead.id, day(30), 'visit', undefined, 'Anna');
    const parked = (await store.getLead(lead.id))!;

    // The same lead, read on the day it was due back.
    const arrival = day(30);
    assert.equal(isNurtured(parked, arrival), false);
    const hit = workQueue([parked], arrival).find((s) => s.leads.length);
    assert.equal(hit?.key, 'wake');
  });

  it('drops the call-back it booked, and postpones the one a person wrote', async () => {
    /* Logging a call now books the next one, so parking has to overrule it —
       otherwise the lead surfaces as overdue for the whole month it is
       supposed to be asleep. The two kinds of task part company: the CRM's own
       guess goes, because carrying it over would invent a promise nobody made;
       what somebody typed is theirs and only moves far enough not to go off
       while the lead is parked. */
    const lead = await fresh();
    await store.logTouch(lead.id, 'call', 'Coming out in November', 'Anna');
    await store.addTask(lead.id, 'Send the floor plans', day(2), 'Anna');

    const parked = (await store.setNurture(lead.id, day(30), 'visit', undefined, 'Anna'))!;
    const open = parked.tasks.filter((t) => !t.done);

    assert.equal(open.length, 1, 'the booked call-back is gone, the typed task is not');
    assert.equal(open[0].title, 'Send the floor plans');
    assert.equal(open[0].due, day(30), 'moved to the day it wakes, not left to fire while asleep');
  });

  it('can be pulled back early, and says so on the timeline', async () => {
    const lead = await fresh();
    await store.setNurture(lead.id, day(75), 'partner', undefined, 'Anna');
    const back = await store.endNurture(lead.id, 'Anna');

    assert.equal(back!.nurture_until, undefined);
    assert.equal(back!.nurture_reason, undefined);
    assert.match((back!.history || []).at(-1)!.detail, /Back in play/);
  });

  it('un-parks itself when somebody moves the stage', async () => {
    const lead = await fresh();
    await store.setNurture(lead.id, day(150), 'funds', undefined, 'Anna');
    const moved = await store.updateLead(lead.id, { stage: 'qualified' }, 'Anna');

    assert.equal(moved!.nurture_until, undefined, 'real movement beats a parking date set weeks ago');
    assert.ok((moved!.history || []).some((h) => h.kind === 'nurture' && h.detail.startsWith('Back in play')));
  });
});
