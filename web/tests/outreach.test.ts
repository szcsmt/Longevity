import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Pressing Email, WhatsApp or Call.

   These two buttons open a mail client and a wa.me link, and the CRM used to
   see nothing when they were pressed — the two commonest sales channels in the
   building were its blind spot.

   What is recorded is deliberately narrow: the channel was OPENED. A mail
   client opening is not a message leaving, and the tests below exist mostly to
   pin what this must NOT do — claim contact, stop the automated sequence, or
   fill the timeline with one line per impatient click. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-out-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { hasConversed } = await import('../lib/crm/rules');
const { sequenceState } = await import('../lib/crm/sequence');

after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const fresh = () => store.createManualLead({ name: `O ${++n}`, email: `o${n}@example.com` });

describe('opening a channel', () => {
  it('lands on the timeline as what actually happened', async () => {
    const lead = await fresh();
    const after = await store.logOutreach(lead.id, 'whatsapp', 'Anna');
    const entry = (after!.history || []).at(-1)!;

    assert.equal(entry.kind, 'whatsapp');
    assert.equal(entry.detail, 'Opened WhatsApp to write to them');
    assert.equal(entry.by, 'Anna');
  });

  it('never claims a conversation happened', async () => {
    const lead = await fresh();
    await store.logOutreach(lead.id, 'email', 'Anna');
    await store.logOutreach(lead.id, 'phone', 'Anna');
    const after = (await store.getLead(lead.id))!;

    assert.equal(hasConversed(after), false, 'opening a channel is not reaching somebody');
    assert.ok((after.history || []).every((h) => h.reached === undefined));
  });

  it('does not stop the automated sequence', async () => {
    const lead = await fresh();
    await store.recordSentEmail(lead.id, { id: 'x1', step: 'welcome', subject: 'Welcome', at: new Date().toISOString() });
    await store.logOutreach(lead.id, 'email', 'Anna');
    const after = (await store.getLead(lead.id))!;

    assert.equal(sequenceState(after).active, true, 'we do not know the message was ever sent');
  });

  it('counts as a person acting, for speed-to-lead', async () => {
    const lead = await fresh();
    assert.equal(lead.first_response_at, undefined);
    const after = await store.logOutreach(lead.id, 'phone', 'Anna');
    assert.ok(after!.first_response_at, 'somebody picked up the phone about this lead');
  });

  it('writes one line for an impatient double-click', async () => {
    const lead = await fresh();
    await store.logOutreach(lead.id, 'whatsapp', 'Anna');
    await store.logOutreach(lead.id, 'whatsapp', 'Anna');
    const after = await store.logOutreach(lead.id, 'whatsapp', 'Anna');

    const opens = (after!.history || []).filter((h) => h.detail === 'Opened WhatsApp to write to them');
    assert.equal(opens.length, 1);
  });

  it('keeps the channels apart', async () => {
    const lead = await fresh();
    await store.logOutreach(lead.id, 'whatsapp', 'Anna');
    const after = await store.logOutreach(lead.id, 'email', 'Anna');

    assert.equal((after!.history || []).filter((h) => h.detail.startsWith('Opened')).length, 2);
  });

  it('refuses a channel nobody defined', () => {
    assert.equal(store.isOutreachChannel('whatsapp'), true);
    assert.equal(store.isOutreachChannel('constructor'), false);
    assert.equal(store.isOutreachChannel('carrier-pigeon'), false);
  });
});
