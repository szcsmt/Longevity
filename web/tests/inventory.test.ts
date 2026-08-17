import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Inventory integrity: the two ways a villa could be sold twice.

   1. A LOST UPDATE. Two writes read the same record and the second overwrites
      the first, so one reservation vanishes with no trace. Prevented by the
      revision guard on every unit write.

   2. A DELIBERATE DOUBLE RESERVATION. Two salespeople each believe the unit is
      theirs to sell. That is not a race and no amount of locking catches it;
      only a refusal does.

   The data directory is a fresh temp folder set before the store is imported,
   so this suite runs on the file backend and never touches real data. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-inventory-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;        // no outward pushes from a test
delete process.env.PARTNER_WEBHOOK_URL;
process.env.CRM_AGENTS = 'Tester|t@example.com||en';

const store = await import('../lib/crm/store');
const { fileBackend } = await import('../lib/crm/backend-file');

const UNIT = 'A1';

after(() => rmSync(dir, { recursive: true, force: true }));

describe('the revision guard on a unit', () => {
  before(async () => {
    await store.setVillaStatus(UNIT, 'free');
  });

  it('accepts a write that carries the current revision', async () => {
    const before = (await store.getVillaData()).villas[UNIT];
    const rev = before?.rev || 0;
    const ok = await fileBackend.setVilla(
      UNIT, { status: 'reserved', updatedAt: new Date().toISOString(), rev: rev + 1 }, rev,
    );
    assert.equal(ok, true);
  });

  it('refuses a write that carries a stale revision', async () => {
    const current = (await store.getVillaData()).villas[UNIT];
    const stale = (current?.rev || 0) - 1;
    const ok = await fileBackend.setVilla(
      UNIT, { status: 'sold', updatedAt: new Date().toISOString(), rev: 99 }, stale,
    );
    assert.equal(ok, false, 'a stale write must not land');
    const after = (await store.getVillaData()).villas[UNIT];
    assert.equal(after.status, 'reserved', 'the earlier write must survive');
  });
});

describe('two people reserving the same villa at the same moment', () => {
  const unit = 'A2';

  before(async () => {
    await store.setVillaStatus(unit, 'free');
  });

  it('keeps both attempts in the audit trail rather than losing one', async () => {
    /* Fired together, on purpose. Whichever loses the revision race re-reads
       and redoes its change, so neither write disappears — which is the whole
       point: an operator must be able to see that both things happened. */
    await Promise.all([
      store.setVillaStatus(unit, 'reserved', { seller: 'Anna' }),
      store.setVillaStatus(unit, 'reserved', { seller: 'Bence' }),
    ]);

    const { villas, history } = await store.getVillaData();
    assert.equal(villas[unit].status, 'reserved');

    const mine = history.filter((h) => h.villaId === unit);
    const sellers = new Set(mine.map((h) => h.seller).filter(Boolean));
    assert.ok(sellers.has('Anna'), 'Anna’s attempt must be on record');
    assert.ok(sellers.has('Bence'), 'Bence’s attempt must be on record');
  });

  it('leaves exactly one revision per write, so nothing was silently merged', async () => {
    const rec = (await store.getVillaData()).villas[unit];
    assert.ok((rec.rev || 0) >= 2, `expected at least two revisions, got ${rec.rev}`);
  });
});

describe('a unit that is already taken', () => {
  const unit = 'A3';

  before(async () => {
    await store.setVillaStatus(unit, 'free');
    await store.setVillaStatus(unit, 'reserved', { seller: 'Anna' });
    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerName: 'Amanda Hunter' } });
  });

  it('refuses a second reservation, and says who holds it', async () => {
    await assert.rejects(
      () => store.setVillaStatus(unit, 'reserved', { seller: 'Bence' }),
      (err: Error) => {
        assert.equal(err.name, 'VillaConflict');
        assert.match(err.message, /already reserved for Amanda Hunter/);
        return true;
      },
    );
  });

  it('does not change the unit when it refuses', async () => {
    const rec = (await store.getVillaData()).villas[unit];
    assert.equal(rec.seller, 'Anna', 'the refused write must not have touched the seller');
    assert.equal(rec.buyerName, 'Amanda Hunter');
  });

  it('writes no audit line for a refused write', async () => {
    const mine = (await store.getVillaData()).history.filter((h) => h.villaId === unit);
    assert.equal(
      mine.filter((h) => h.seller === 'Bence').length, 0,
      'a refusal must leave the history clean',
    );
  });

  it('still allows the ordinary next step, reserved to sold', async () => {
    const data = await store.setVillaStatus(unit, 'sold', { seller: 'Anna' });
    assert.equal(data?.villas[unit].status, 'sold');
  });

  it('allows re-reserving once the unit is deliberately released', async () => {
    await store.setVillaStatus(unit, 'free');
    const data = await store.setVillaStatus(unit, 'reserved', { seller: 'Bence' });
    assert.equal(data?.villas[unit].status, 'reserved');
  });
});

describe('linking a buyer', () => {
  const unit = 'A4';

  before(async () => {
    await store.setVillaStatus(unit, 'free');
    await store.setVillaStatus(unit, 'reserved', { seller: 'Anna' });
  });

  it('refuses to replace a linked buyer with a different one', async () => {
    const first = await store.createManualLead({ name: 'Buyer One', email: 'one@example.com' });
    const second = await store.createManualLead({ name: 'Buyer Two', email: 'two@example.com' });

    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerLeadId: first.id } });
    await assert.rejects(
      () => store.updateVillaSale(unit, { op: 'sale', patch: { buyerLeadId: second.id } }),
      (err: Error) => err.name === 'VillaConflict',
    );

    const rec = (await store.getVillaData()).villas[unit];
    assert.equal(rec.buyerLeadId, first.id, 'the first buyer must still hold the unit');
  });

  it('allows the same buyer again, so a repeated save is harmless', async () => {
    const rec = (await store.getVillaData()).villas[unit];
    const data = await store.updateVillaSale(unit, { op: 'sale', patch: { buyerLeadId: rec.buyerLeadId! } });
    assert.equal(data?.villas[unit].buyerLeadId, rec.buyerLeadId);
  });
});
