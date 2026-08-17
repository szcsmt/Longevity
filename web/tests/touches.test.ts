import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Logging the contact a salesperson actually made.

   The distinction everything here turns on: reaching somebody is the same event
   as them writing to us, seen from the other end — a human now owns the
   conversation. A call that rang out is worth recording and must change
   nothing. Getting that backwards means either a customer who spoke to us this
   morning still receives the day-3 automated nudge, or a lead nobody has
   managed to reach quietly counts as contacted. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-touches-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { sequenceState } = await import('../lib/crm/sequence');
const { TOUCHES, touchByKey } = await import('../lib/crm/types');

after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const fresh = () => store.createManualLead({ name: `Lead ${++n}`, email: `l${n}@example.com` });

/** A lead mid-sequence: welcomed, still quiet, still being followed up. */
async function inSequence() {
  const lead = await fresh();
  await store.recordSentEmail(lead.id, {
    id: `e${n}`, step: 'welcome', subject: 'Welcome',
    at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  });
  return (await store.getLead(lead.id))!;
}

describe('the list of things that can be logged', () => {
  it('has a unique key for every button, including both kinds of call', () => {
    const keys = TOUCHES.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length, 'the UI sends the key, so it must be unique');
    assert.equal(TOUCHES.filter((t) => t.kind === 'call').length, 2, 'reached and not reached');
  });

  it('refuses a key it does not know', async () => {
    const lead = await fresh();
    assert.equal(await store.logTouch(lead.id, 'lunch', 'nice place', 'Anna'), null);
    assert.equal(touchByKey('lunch'), undefined);
  });
});

describe('a call that got through', () => {
  it('lands on the timeline with the note, the person and the channel', async () => {
    const lead = await fresh();
    const after = await store.logTouch(lead.id, 'call', 'Wants two bedrooms, budget around 9M', 'Anna');
    const entry = (after!.history || []).find((h) => h.kind === 'call');
    assert.ok(entry, 'a call must be its own kind of event, not a note');
    assert.match(entry!.detail, /Spoke by phone — Wants two bedrooms/);
    assert.equal(entry!.by, 'Anna');
    assert.equal(entry!.reached, true);
  });

  it('moves a new lead to contacted', async () => {
    const lead = await fresh();
    assert.equal(lead.stage, 'new');
    const after = await store.logTouch(lead.id, 'call', undefined, 'Anna');
    assert.equal(after!.stage, 'contacted');
  });

  it('counts as the first human response', async () => {
    const lead = await fresh();
    const after = await store.logTouch(lead.id, 'call', undefined, 'Anna');
    assert.ok(after!.first_response_at, 'speed-to-lead must see it');
  });

  it('clears the reply timer and ticks its chase task', async () => {
    const lead = await fresh();
    await store.setAwaitingReply(lead.id, true);
    const armed = (await store.getLead(lead.id))!;
    assert.ok(armed.awaiting_reply_since);

    const after = await store.logTouch(lead.id, 'call', 'Reached them at last', 'Anna');
    assert.equal(after!.awaiting_reply_since, undefined);
    assert.ok(
      after!.tasks.filter((t) => t.title.startsWith('Follow up')).every((t) => t.done),
      'the chase has served its purpose',
    );
  });

  it('stops the automated e-mails', async () => {
    const lead = await inSequence();
    assert.equal(sequenceState(lead).active, true, 'it was running');

    const after = await store.logTouch(lead.id, 'call', undefined, 'Anna');
    const state = sequenceState(after!);
    assert.equal(state.active, false, 'somebody they spoke to must not get the day-3 nudge');
    assert.match((state as { reason: string }).reason, /Spoke by phone/);
  });
});

describe('a call that rang out', () => {
  it('is recorded, so "nobody has tried" and "tried twice" are different', async () => {
    const lead = await fresh();
    await store.logTouch(lead.id, 'call-missed', 'Rang twice, no voicemail', 'Anna');
    const after = await store.logTouch(lead.id, 'call-missed', 'Again, nothing', 'Anna');
    const calls = (after!.history || []).filter((h) => h.kind === 'call');
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.reached === false));
  });

  it('leaves the lead new, because nobody was contacted', async () => {
    const lead = await fresh();
    const after = await store.logTouch(lead.id, 'call-missed', undefined, 'Anna');
    assert.equal(after!.stage, 'new', 'trying is not contact');
  });

  it('leaves the reply timer running', async () => {
    const lead = await fresh();
    await store.setAwaitingReply(lead.id, true);
    const after = await store.logTouch(lead.id, 'call-missed', undefined, 'Anna');
    assert.ok(after!.awaiting_reply_since, 'they still owe us an answer');
  });

  it('does not stop the automated e-mails', async () => {
    const lead = await inSequence();
    const after = await store.logTouch(lead.id, 'call-missed', undefined, 'Anna');
    assert.equal(sequenceState(after!).active, true, 'the sequence is the only thing still reaching them');
  });

  it('still counts as the salesperson having acted', async () => {
    const lead = await fresh();
    const after = await store.logTouch(lead.id, 'call-missed', undefined, 'Anna');
    assert.ok(after!.first_response_at, 'they did pick up the phone, and that is the measure');
  });
});

describe('an outbound WhatsApp', () => {
  it('is recorded but is not contact, because they have not answered', async () => {
    const lead = await inSequence();
    const after = await store.logTouch(lead.id, 'whatsapp', 'Sent the brochure', 'Anna');
    assert.equal((after!.history || []).find((h) => h.kind === 'whatsapp')?.reached, false);
    assert.equal(after!.stage, 'new');
    assert.equal(sequenceState(after!).active, true);
  });
});

describe('meetings and site visits', () => {
  for (const key of ['video', 'meeting', 'visit']) {
    it(`${key} counts as a real conversation`, async () => {
      const lead = await inSequence();
      const after = await store.logTouch(lead.id, key, undefined, 'Anna');
      assert.equal(after!.stage, 'contacted');
      assert.equal(sequenceState(after!).active, false);
    });
  }
});

describe('a customer writing still wins', () => {
  it('reports the reply rather than an earlier missed call', async () => {
    const lead = await inSequence();
    await store.logTouch(lead.id, 'call-missed', undefined, 'Anna');
    await store.recordInboundReply(lead.id, { message: 'Sorry, was travelling', channel: 'email' });
    const after = (await store.getLead(lead.id))!;
    const state = sequenceState(after);
    assert.equal(state.active, false);
    assert.match((state as { reason: string }).reason, /customer replied/);
  });
});
