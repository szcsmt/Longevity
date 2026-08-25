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

describe('two writes landing on the same unit at the same moment', () => {
  const unit = 'A2';

  before(async () => {
    await store.setVillaStatus(unit, 'free');
  });

  /* This used to fire two simultaneous reservations. It cannot any more: a
     unit must name its buyer before it is reserved, and a second reservation
     for a unit somebody already holds is refused outright — which is a
     business rule, and has its own tests below.

     The revision guard is a different thing, and still worth proving: two
     writes that are both perfectly legal, landing on the same record in the
     same instant, must interleave rather than one overwriting the other. */
  it('keeps both, rather than losing whichever lands second', async () => {
    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerName: 'Race Buyer' } });

    await Promise.all([
      store.setVillaStatus(unit, 'reserved', { seller: 'Anna' }),
      store.updateVillaSale(unit, { op: 'sale', patch: { contractValue: 9_000_000 } }),
    ]);

    const rec = (await store.getVillaData()).villas[unit];
    assert.equal(rec.status, 'reserved', 'the reservation survived');
    assert.equal(rec.contractValue, 9_000_000, 'and so did the price written at the same second');
    assert.equal(rec.buyerName, 'Race Buyer', 'and neither write dropped the buyer');
  });

  it('leaves exactly one revision per write, so nothing was silently merged', async () => {
    const rec = (await store.getVillaData()).villas[unit];
    assert.ok((rec.rev || 0) >= 3, `expected a revision per write, got ${rec.rev}`);
  });
});

describe('a unit that is already taken', () => {
  const unit = 'A3';

  before(async () => {
    await store.setVillaStatus(unit, 'free');
    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerName: 'Amanda Hunter' } });
    await store.setVillaStatus(unit, 'reserved', { seller: 'Anna' });
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
    // Releasing clears the sale data, so the next reservation names its own
    // buyer — which is the point of the rule, not an inconvenience of it.
    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerName: 'Second Buyer' } });
    const data = await store.setVillaStatus(unit, 'reserved', { seller: 'Bence' });
    assert.equal(data?.villas[unit].status, 'reserved');
  });
});

describe('linking a buyer', () => {
  const unit = 'A4';

  before(async () => {
    await store.setVillaStatus(unit, 'free');
    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerName: 'Placeholder' } });
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

describe('a unit is never held for nobody', () => {
  /* The masterplan used to let a plot be marked reserved or sold with no buyer
     on it. `integrityIssues` reported those as `held-without-buyer`, which is
     what you do about the rows that already exist; this is what stops
     tomorrow's. */

  it('refuses to reserve a unit with no buyer named', async () => {
    const unit = 'F1';
    await store.setVillaStatus(unit, 'free');
    await assert.rejects(
      () => store.setVillaStatus(unit, 'reserved', { seller: 'Anna' }),
      (err: Error) => {
        assert.equal(err.name, 'VillaConflict');
        assert.match(err.message, /name the buyer first/);
        return true;
      },
    );
    assert.notEqual((await store.getVillaData()).villas[unit]?.status, 'reserved');
  });

  it('refuses to sell one, for the same reason', async () => {
    const unit = 'F2';
    await store.setVillaStatus(unit, 'free');
    await assert.rejects(
      () => store.setVillaStatus(unit, 'sold', { seller: 'Anna' }),
      /cannot be sold for nobody/,
    );
  });

  it('accepts a name typed straight onto the unit', async () => {
    const unit = 'F3';
    await store.setVillaStatus(unit, 'free');
    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerName: 'Walk-in Buyer' } });
    const data = await store.setVillaStatus(unit, 'reserved', { seller: 'Anna' });
    assert.equal(data?.villas[unit].status, 'reserved');
  });

  it('accepts a linked CRM lead just as well', async () => {
    const unit = 'F4';
    await store.setVillaStatus(unit, 'free');
    const lead = await store.createManualLead({ name: 'Linked Buyer', email: 'lb@example.com' });
    await store.updateVillaSale(unit, { op: 'sale', patch: { buyerLeadId: lead.id } });
    const data = await store.setVillaStatus(unit, 'sold', { seller: 'Anna' });
    assert.equal(data?.villas[unit].status, 'sold');
  });

  it('still lets a unit go back to free without one', async () => {
    // Releasing is how a mistake gets undone — it must never need a buyer.
    const unit = 'F3';
    const data = await store.setVillaStatus(unit, 'free');
    assert.notEqual(data?.villas[unit]?.status, 'reserved');
  });
});
