import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Writing to a buyer on WhatsApp, from inside the CRM.

   The inbound half had worked for months; the outbound half did not exist. A
   salesperson wanting to answer picked up their own phone, and that
   conversation — the one right after a real call, the one where the price gets
   agreed — was the one nobody else could ever read, and the one that left the
   company when they did. That is the whole gap in "nothing gets lost", and the
   messages falling through it were not the automated nudges. They were the
   negotiation.

   Two things are worth pinning down. A message that did NOT go must leave no
   trace saying it did: a timeline claiming a buyer was answered is worse than
   an empty one, because somebody reads it and moves on. And a message that
   DID go has to do everything a sent e-mail does, because it is the same event
   through a different pipe. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-wa-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { waWindowOpen } = await import('../lib/crm/rules');

after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const fresh = (over: Record<string, unknown> = {}) =>
  store.createManualLead({ name: `W ${++n}`, phone: '+66812345678', ...over });

/** Meta, replaced. The real one is a network call we must not make in a test. */
function meta(accepts: boolean) {
  const sent: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (String(url).includes('graph.facebook.com')) sent.push(body?.text?.body || '');
    return { ok: accepts, status: accepts ? 200 : 400, json: async () => ({}) } as Response;
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = real; } };
}

const configured = () => {
  process.env.WHATSAPP_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_ID = '1234567890';
  delete process.env.WHATSAPP_MESSAGES;
};
const unconfigured = () => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
};

describe("Meta's twenty-four hours", () => {
  it('is shut until they write, and shut again a day later', () => {
    const now = Date.parse('2026-09-01T12:00:00Z');
    assert.equal(waWindowOpen({ } as never, now), false, 'nobody has written to us');
    assert.equal(waWindowOpen({ wa_last_inbound: '2026-09-01T11:00:00Z' } as never, now), true);
    assert.equal(waWindowOpen({ wa_last_inbound: '2026-08-31T11:00:00Z' } as never, now), false);
  });

  it('is opened by a WhatsApp reply and not by an e-mail one', async () => {
    const byMail = await fresh();
    await store.recordInboundReply(byMail.id, { message: 'Hi', channel: 'email' } as never);
    assert.equal(waWindowOpen((await store.getLead(byMail.id))!), false);

    const byWa = await fresh();
    await store.recordInboundReply(byWa.id, { message: 'Hi', channel: 'whatsapp' } as never);
    assert.equal(waWindowOpen((await store.getLead(byWa.id))!), true);
  });
});

describe('sending', () => {
  it('does everything a sent e-mail does', async () => {
    configured();
    const m = meta(true);
    try {
      const lead = await fresh();
      assert.equal(lead.stage, 'new');
      const { result } = await store.sendWhatsAppToLead(lead.id, 'Küldöm a brossúrát.', 'Anna');
      assert.equal(result, 'sent');
      assert.deepEqual(m.sent, ['Küldöm a brossúrát.'], 'it actually went to Meta');

      const after = (await store.getLead(lead.id))!;
      const entry = (after.history || []).find((h) => h.kind === 'whatsapp');
      assert.ok(entry, 'the message is on the timeline');
      assert.match(entry!.detail, /Küldöm a brossúrát/);
      assert.equal(entry!.by, 'Anna');
      assert.ok(after.awaiting_reply_since, 'the reply timer started');
      assert.equal(after.stage, 'contacted', 'a lead we have written to is not untouched');
    } finally { m.restore(); }
  });

  it('writes nothing at all when Meta refuses it', async () => {
    /* The 24-hour rule is the usual reason. A timeline that says a buyer was
       answered when they were not is worse than one that says nothing:
       somebody reads it, believes it, and moves on to the next lead. */
    configured();
    const m = meta(false);
    try {
      const lead = await fresh();
      const { result } = await store.sendWhatsAppToLead(lead.id, 'Megvan még?', 'Anna');
      assert.equal(result, 'refused');

      const after = (await store.getLead(lead.id))!;
      assert.equal((after.history || []).some((h) => h.kind === 'whatsapp'), false);
      assert.equal(after.awaiting_reply_since, undefined, 'nothing is being waited on');
      assert.equal(after.stage, 'new', 'and the stage did not move');
    } finally { m.restore(); }
  });

  it('refuses before the network when there is no number', async () => {
    configured();
    const m = meta(true);
    try {
      const lead = await fresh({ phone: '', whatsapp: '' });
      const { result } = await store.sendWhatsAppToLead(lead.id, 'Szia', 'Anna');
      assert.equal(result, 'no-number');
      assert.deepEqual(m.sent, [], 'nothing was attempted');
    } finally { m.restore(); }
  });

  it('says it is switched off rather than failing obscurely', async () => {
    unconfigured();
    const m = meta(true);
    try {
      const lead = await fresh();
      const { result } = await store.sendWhatsAppToLead(lead.id, 'Szia', 'Anna');
      assert.equal(result, 'disabled');
      assert.deepEqual(m.sent, []);
    } finally { m.restore(); configured(); }
  });

  it('will not send an empty message', async () => {
    configured();
    const m = meta(true);
    try {
      const lead = await fresh();
      assert.equal((await store.sendWhatsAppToLead(lead.id, '   ', 'Anna')).result, 'refused');
      assert.deepEqual(m.sent, []);
    } finally { m.restore(); }
  });
});
