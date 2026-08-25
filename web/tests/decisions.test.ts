import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Extras need an answer, and answers need somewhere to be asked for.

   Somebody typing "podcast studio, 400,000" into a villa is a REQUEST. It used
   to read as though it were settled — a line on the unit with a price beside
   it and nothing saying whether anybody had agreed to build it, which is how a
   promise nobody made ends up in a handover.

   The second half matters as much: a decision nobody is shown is a decision
   nobody makes. Every one of these used to live on whichever screen happened
   to produce it. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-dec-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;
delete process.env.PARTNER_WEBHOOK_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const partners = await import('../lib/crm/partners');
const { decisions } = await import('../lib/crm/decisions');
const { extraState } = await import('../lib/crm/types');
const { roleCan } = await import('../lib/crm/auth');

after(() => rmSync(dir, { recursive: true, force: true }));

const rec = async (id: string) => (await store.getVillaData()).villas[id];
const extras = async (id: string) => (await rec(id))!.extras || [];

async function unitWithBuyer(id: string, name = 'Buyer') {
  await store.setVillaStatus(id, 'free');
  await store.updateVillaSale(id, { op: 'sale', patch: { buyerName: name, contractValue: 9_000_000 } });
  await store.setVillaStatus(id, 'reserved', { seller: 'Anna' });
}

const gather = async () => decisions({
  villas: (await store.getVillaData()).villas,
  leads: await store.listLeads(),
  holds: await store.reservationWatch(),
  issues: await store.integrityIssues(),
});

describe('an extra a buyer asked for', () => {
  it('starts unanswered, and says who asked', async () => {
    await unitWithBuyer('G1');
    await store.updateVillaSale('G1', { op: 'extraAdd', label: 'Podcast studio', price: 400_000, by: 'Anna' });

    const x = (await extras('G1'))[0];
    assert.equal(extraState(x), 'pending', 'typing it in is a request, not an agreement');
    assert.equal(x.requested_by, 'Anna');
    assert.ok(x.requested_at);
  });

  it('reads as requested on the villa history, not as added', async () => {
    const { history } = await store.getVillaData();
    assert.ok(history.some((h) => h.villaId === 'G1' && /Extra requested: Podcast studio/.test(h.note || '')));
  });

  it('is approved by name and date', async () => {
    await store.updateVillaSale('G1', { op: 'extraDecide', extraId: (await extras('G1'))[0].id, approve: true, by: 'Owner' });
    const x = (await extras('G1'))[0];
    assert.equal(extraState(x), 'approved');
    assert.equal(x.approved_by, 'Owner');
  });

  it('can be refused with a reason, which goes on the record', async () => {
    await unitWithBuyer('G2');
    await store.updateVillaSale('G2', { op: 'extraAdd', label: 'Rooftop jacuzzi', by: 'Anna' });
    const id = (await extras('G2'))[0].id;
    await store.updateVillaSale('G2', { op: 'extraDecide', extraId: id, approve: false, reason: 'Nem fér el a tetőn', by: 'Owner' });

    const x = (await extras('G2'))[0];
    assert.equal(extraState(x), 'refused');
    assert.equal(x.refuse_reason, 'Nem fér el a tetőn');
    const { history } = await store.getVillaData();
    assert.ok(history.some((h) => h.villaId === 'G2' && /Extra refused: Rooftop jacuzzi — Nem fér el a tetőn/.test(h.note || '')));
  });

  it('replaces the previous answer rather than carrying both', async () => {
    const id = (await extras('G2'))[0].id;
    await store.updateVillaSale('G2', { op: 'extraDecide', extraId: id, approve: true, by: 'Owner' });
    const x = (await extras('G2'))[0];
    assert.equal(extraState(x), 'approved');
    assert.equal(x.refused_at, undefined, 'a refusal that was overturned is not still a refusal');
    assert.equal(x.refuse_reason, undefined);
  });

  it('reads an extra recorded before any of this as pending, which is honest', () => {
    assert.equal(extraState({ id: 'x', label: 'Old extra' }), 'pending');
  });
});

describe('who may answer', () => {
  it('is the owner, and only the owner', () => {
    assert.equal(roleCan('admin', 'deals.approve'), true);
    for (const r of ['head', 'agent', 'finance', 'marketing', 'viewer'] as const) {
      assert.equal(roleCan(r, 'deals.approve'), false, `${r} must not approve what a buyer asked for`);
    }
  });
});

describe('the decisions list', () => {
  it('carries an unanswered extra and drops it once answered', async () => {
    await unitWithBuyer('G3');
    await store.updateVillaSale('G3', { op: 'extraAdd', label: 'Office setup', price: 120_000, by: 'Anna' });

    let list = await gather();
    const mine = list.find((d) => d.kind === 'extra' && d.title.startsWith('G3'));
    assert.ok(mine, 'an unanswered extra is waiting on somebody');
    assert.equal(mine!.amount, 120_000);

    await store.updateVillaSale('G3', { op: 'extraDecide', extraId: (await extras('G3'))[0].id, approve: true, by: 'Owner' });
    list = await gather();
    assert.equal(list.some((d) => d.kind === 'extra' && d.title.startsWith('G3')), false);
  });

  it('carries a hold that has run out', async () => {
    await store.setVillaStatus('G4', 'free');
    const lead = await store.createManualLead({ name: 'Lapsed', email: 'lap@example.com' });
    await store.updateVillaSale('G4', { op: 'sale', patch: { buyerLeadId: lead.id } });
    await store.updateVillaSale('G4', { op: 'reserve', amount: 500_000, expiresAt: '2020-01-01', by: 'Anna' });

    const list = await gather();
    assert.ok(list.some((d) => d.kind === 'lapsed-hold' && d.title.startsWith('G4')));
  });

  it('carries two agencies claiming one buyer', async () => {
    const a = (await partners.createAgency({ name: 'First Agency', status: 'active' }))!;
    const b = (await partners.createAgency({ name: 'Second Agency', status: 'active' }))!;
    const lead = await store.createManualLead({ name: 'Contested Buyer', email: 'cb@example.com' });
    await store.registerAgency(lead.id, a, 90, {}, 'Anna');
    await store.registerAgency(lead.id, b, 90, { override: true }, 'Anna');

    const list = await gather();
    const row = list.find((d) => d.kind === 'competing-claim');
    assert.ok(row, 'whoever decides this decides who gets paid');
    assert.match(row!.detail, /First Agency vs Second Agency/);
  });

  it('puts the longest-waiting first', async () => {
    const list = await gather();
    const waits = list.map((d) => d.waitingDays ?? -1);
    assert.deepEqual(waits, [...waits].sort((x, y) => y - x));
  });

  it('is empty when nothing is waiting', () => {
    assert.deepEqual(decisions({ villas: {}, leads: [], holds: [], issues: [] }), []);
  });
});
