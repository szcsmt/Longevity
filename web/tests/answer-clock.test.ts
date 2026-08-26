import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* The clock that starts when THEY write.

   The reply timer measures their silence after we wrote to them. This is the
   mirror image, and it is the half that costs money: a buyer who writes and
   waits three days for an answer has already started reading somebody else's
   brochure.

   Most of what is worth testing here is restraint. Five e-mails in an
   afternoon is a customer who is keen, not five things to do. And an answer
   given by any means — a reply, a phone call — has to stop it, or the CRM ends
   up nagging somebody about a conversation they already had. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-answer-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { ANSWER_HOURS, workQueue, nextAction } = await import('../lib/crm/rules');

after(() => rmSync(dir, { recursive: true, force: true }));

const TASK = 'Reply — they are waiting on us';
const open = (l: import('../lib/crm/types').Lead) =>
  l.tasks.filter((t) => t.title === TASK && !t.done);

let n = 0;
const fresh = () => store.createManualLead({ name: `A ${++n}`, email: `a${n}@example.com` });

const inbound = (id: string, gmailId: string, at = new Date().toISOString()) =>
  store.recordMailboxMessage(id, {
    gmailId, direction: 'in', body: 'Kérdésem volna a villákról', at, counterpart: 'buyer@example.com',
  });

const outbound = (id: string, gmailId: string) =>
  store.recordMailboxMessage(id, {
    gmailId, direction: 'out', body: 'Kedves…', at: new Date().toISOString(),
    counterpart: 'buyer@example.com', by: 'Anna',
  });

describe('when a customer writes', () => {
  it('gives us a deadline to answer', async () => {
    const lead = await fresh();
    const at = new Date().toISOString();
    await inbound(lead.id, 'm1', at);

    const after = (await store.getLead(lead.id))!;
    const task = open(after)[0];
    assert.ok(task, 'somebody now owes them an answer');
    const hours = (new Date(task.due!).getTime() - new Date(at).getTime()) / 3_600_000;
    assert.equal(Math.round(hours), ANSWER_HOURS);
  });

  it('does not stack one per message', async () => {
    const lead = await fresh();
    await inbound(lead.id, 'a1');
    await inbound(lead.id, 'a2');
    await inbound(lead.id, 'a3');

    assert.equal(open((await store.getLead(lead.id))!).length, 1,
      'five e-mails in an afternoon is one obligation, not five');
  });

  it('keeps the deadline set by the first message', async () => {
    const lead = await fresh();
    const first = new Date(Date.now() - 20 * 3_600_000).toISOString();
    await inbound(lead.id, 'b1', first);
    const due = open((await store.getLead(lead.id))!)[0].due;

    await inbound(lead.id, 'b2', new Date().toISOString());
    assert.equal(open((await store.getLead(lead.id))!)[0].due, due,
      'writing again does not buy us another day');
  });
});

describe('when we answer', () => {
  it('stops by itself when we write back', async () => {
    const lead = await fresh();
    await inbound(lead.id, 'c1');
    await outbound(lead.id, 'c2');

    assert.equal(open((await store.getLead(lead.id))!).length, 0,
      'the reply is proof the task was done — nobody should have to tick it');
  });

  it('stops when we get hold of them instead', async () => {
    // Answering is answering. A lead who was phoned back is not still waiting
    // on an e-mail.
    const lead = await fresh();
    await inbound(lead.id, 'd1');
    await store.logTouch(lead.id, 'call', 'Visszahívtam', 'Anna');

    assert.equal(open((await store.getLead(lead.id))!).length, 0);
  });

  it('does not stop for a call that rang out', async () => {
    const lead = await fresh();
    await inbound(lead.id, 'e1');
    await store.logTouch(lead.id, 'call-missed', undefined, 'Anna');

    assert.equal(open((await store.getLead(lead.id))!).length, 1,
      'trying is not answering');
  });

  it('starts again if they write once more after we answered', async () => {
    const lead = await fresh();
    await inbound(lead.id, 'f1');
    await outbound(lead.id, 'f2');
    await inbound(lead.id, 'f3');

    assert.equal(open((await store.getLead(lead.id))!).length, 1);
  });
});

describe('when the deadline passes', () => {
  it('lands on the day list as late, with no extra rule needed', async () => {
    const lead = await fresh();
    await inbound(lead.id, 'g1', new Date(Date.now() - 3 * 86_400_000).toISOString());
    const fetched = (await store.getLead(lead.id))!;

    assert.equal(nextAction(fetched)!.title, TASK);
    const hit = workQueue([fetched]).find((s) => s.leads.length);
    assert.equal(hit?.key, 'overdue', 'an unanswered customer is simply a late follow-up');
  });
});

describe('a reply arriving any other way', () => {
  it('starts the same clock', async () => {
    // Gmail, the Resend webhook, WhatsApp — one rule, one clock.
    const lead = await fresh();
    await store.recordInboundReply(lead.id, { message: 'Még érdekel', channel: 'email' });
    assert.equal(open((await store.getLead(lead.id))!).length, 1);
  });
});
