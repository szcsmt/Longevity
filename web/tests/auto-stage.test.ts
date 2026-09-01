import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* The pipeline moving itself.

   Moving a lead through the stages was entirely manual, and manual means it
   drifts. The villa ledger would say a unit was reserved, signed and paid for
   while the buyer sat in "Contacted", because reserving the plot is the thing
   somebody remembers to do and dragging a card is the thing they do not. Every
   report reading the pipeline then described the paperwork rather than the
   business.

   These tests fix the line between what the CRM may conclude and what it may
   not. It may conclude what it already knows as fact: a message left, the
   qualification has no gaps, a unit is held in somebody's name, the contract
   is signed, the money is in. It may not conclude Presentation, Visit or
   Negotiation, because nothing in the database knows whether a call was a
   presentation or a chat — and a wrong stage is believed, where an unmoved one
   is merely noticed.

   The three invariants at the bottom are the ones that make the feature safe
   rather than annoying: forward only, closed leads left alone, and every move
   written on the timeline with its reason. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-stage-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;          // nothing leaves the machine
delete process.env.PARTNER_WEBHOOK_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');

after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const fresh = (over: Record<string, unknown> = {}) =>
  store.createManualLead({ name: `S ${++n}`, email: `s${n}@example.com`, ...over });

let u = 0;
const unit = () => `AS${++u}`;

/** A free unit with a buyer linked — where a reservation starts. */
async function withBuyer(id: string) {
  await store.setVillaStatus(id, 'free');
  const lead = await fresh();
  await store.updateVillaSale(id, { op: 'sale', patch: { buyerLeadId: lead.id } });
  return lead;
}

const reload = async (id: string) => (await store.getLead(id))!;
const stages = (l: { history?: { kind: string; detail: string }[] }) =>
  (l.history || []).filter((h) => h.kind === 'stage').map((h) => h.detail);

/* Everything "qualified" is made of. Four answers live in the qualification;
   the fifth — which residence they are after — lives on the lead itself, which
   is why completing the set can happen through either call. */
const FULL = { budget: 20_000_000, currency: 'THB', timeframe: '0-3', purpose: 'investment', financing: 'cash' } as const;

/** Answer everything, including the residence on the lead. */
async function qualifyFully(id: string) {
  await store.updateLead(id, { villa: 'B12' } as never, 'Anna');
  await store.setQualification(id, FULL as never, 'Anna');
}

describe('what the CRM may conclude by itself', () => {
  it('an e-mail that actually left means they have been contacted', async () => {
    const lead = await fresh();
    assert.equal(lead.stage, 'new');
    await store.recordMailboxMessage(lead.id, {
      gmailId: `g${lead.id}`, direction: 'out', at: new Date().toISOString(),
      subject: 'The brochure you asked for', body: 'Attached.',
    } as never);
    assert.equal((await reload(lead.id)).stage, 'contacted');
  });

  it('a qualification with no gaps left means qualified', async () => {
    const lead = await fresh();
    await qualifyFully(lead.id);
    assert.equal((await reload(lead.id)).stage, 'qualified');
  });

  it('and the last answer counts whichever call supplies it', async () => {
    /* The residence is the one answer that is not part of the qualification
       form, so completing the set from the other side has to work too. */
    const lead = await fresh();
    await store.setQualification(lead.id, FULL as never, 'Anna');
    assert.equal((await reload(lead.id)).stage, 'new', 'no residence named yet');
    await store.updateLead(lead.id, { villa: 'B12' } as never, 'Anna');
    assert.equal((await reload(lead.id)).stage, 'qualified');
  });

  it('half a qualification concludes nothing', async () => {
    const lead = await fresh();
    await store.setQualification(lead.id, { budget: 20_000_000, currency: 'THB' } as never, 'Anna');
    assert.equal((await reload(lead.id)).stage, 'new');
  });

  it('a unit held in their name means reserved — and names the unit on the lead', async () => {
    const id = unit();
    const lead = await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_000_000, by: 'Anna' });
    const after = await reload(lead.id);
    assert.equal(after.stage, 'reserved');
    /* Reserved and beyond require a residence on the lead. Coming from the
       masterplan we know which one, so the rule is satisfied rather than
       quietly broken. */
    assert.equal(after.villa, id);
  });

  it('a signed contract means contract, and the earlier steps mean nothing', async () => {
    const id = unit();
    const lead = await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_000_000, by: 'Anna' });

    await store.updateVillaSale(id, { op: 'contract', status: 'sent' });
    assert.equal((await reload(lead.id)).stage, 'reserved', 'sending a document is not signing it');

    await store.updateVillaSale(id, { op: 'contract', status: 'signed' });
    assert.equal((await reload(lead.id)).stage, 'contract');
  });

  it('the unit going to sold means won', async () => {
    const id = unit();
    const lead = await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_000_000, by: 'Anna' });
    await store.setVillaStatus(id, 'sold');
    assert.equal((await reload(lead.id)).stage, 'won');
  });
});

describe('what makes it safe rather than annoying', () => {
  it('only ever goes forward', async () => {
    const id = unit();
    const lead = await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_000_000, by: 'Anna' });
    await store.updateVillaSale(id, { op: 'contract', status: 'signed' });
    assert.equal((await reload(lead.id)).stage, 'contract');

    /* A late instalment being recorded must not drag a signed deal back out of
       Contract, and answering a qualification question late must not either. */
    await qualifyFully(lead.id);
    assert.equal((await reload(lead.id)).stage, 'contract');
  });

  it('leaves a finished deal alone', async () => {
    const id = unit();
    const lead = await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_000_000, by: 'Anna' });
    await store.setVillaStatus(id, 'sold');
    assert.equal((await reload(lead.id)).stage, 'won');

    await qualifyFully(lead.id);
    assert.equal((await reload(lead.id)).stage, 'won', 'won is finished');
  });

  it('leaves a lost lead alone — coming back is the customer’s move, not ours', async () => {
    const lead = await fresh();
    await store.updateLead(lead.id, { stage: 'lost', lost_reason: 'bought elsewhere' } as never, 'Anna');
    await qualifyFully(lead.id);
    assert.equal((await reload(lead.id)).stage, 'lost');
  });

  it('writes down every move it makes, with the reason', async () => {
    const id = unit();
    const lead = await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_000_000, by: 'Anna' });
    const moves = stages(await reload(lead.id));
    assert.equal(moves.length, 1);
    assert.match(moves[0], /Lefoglalva/);
    assert.match(moves[0], new RegExp(id), 'the reason names the unit that caused it');
  });

  it('never guesses Presentation, Visit or Negotiation', async () => {
    const lead = await fresh();
    await qualifyFully(lead.id);
    await store.logTouch(lead.id, 'call', 'Long chat about the site', 'Anna');
    const after = await reload(lead.id);
    assert.ok(
      !['presentation', 'visit', 'negotiation'].includes(after.stage),
      'nothing in the database knows what a conversation was about',
    );
  });
});
