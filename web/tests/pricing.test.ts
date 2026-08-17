import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* One price table, and one pass over the inventory.

   Both failures here were silent. The prices existed twice — in villas.ts and
   again in analytics.ts — so changing one would have left every financial chart
   reporting the old figure with nothing to show for it. And the money was
   counted over the 58 units that carry a size tier while the status was counted
   over all 69, so selling an A-block villa moved one number and not the other.

   The A block is real: A1 to A11 have no tier and therefore no list price. That
   is business data nobody can invent, so the job here is to make sure it is
   counted honestly and reported rather than quietly dropped. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-pricing-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;
delete process.env.PARTNER_WEBHOOK_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const villas = await import('../lib/crm/villas');
const { analytics } = await import('../lib/crm/analytics');
const catalogue = (await import('../lib/villas.json', { with: { type: 'json' } })).default as {
  villas: { id: string; block: string; size?: string }[];
};

after(() => rmSync(dir, { recursive: true, force: true }));

describe('the price table', () => {
  it('is the only place a price is written down', () => {
    // Every tier the catalogue uses must resolve through villas.ts alone.
    const tiers = new Set(catalogue.villas.map((v) => v.size).filter(Boolean) as string[]);
    for (const tier of tiers) {
      assert.equal(typeof villas.priceForSize(tier), 'number', `${tier} must have a price`);
    }
    assert.deepEqual([...tiers].sort(), [...villas.SIZES].sort(), 'the tiers must match the table');
  });

  it('agrees with itself whichever way it is asked', () => {
    for (const v of villas.VILLAS) {
      assert.equal(villas.priceForSize(v.size), v.price);
      assert.equal(villas.villaByName(v.name)?.price, v.price);
    }
  });

  it('gives a unit the price of its tier', () => {
    const sized = catalogue.villas.find((v) => v.size)!;
    assert.equal(store.unitListPrice(sized.id), villas.priceForSize(sized.size));
  });

  it('refuses to invent a price for a unit with no tier', () => {
    const unsized = catalogue.villas.find((v) => !v.size)!;
    assert.equal(store.unitListPrice(unsized.id), undefined);
    assert.equal(villas.priceForSize(undefined), undefined);
    assert.equal(villas.priceForSize('XXL'), undefined);
  });
});

describe('the A block, which carries no tier', () => {
  it('is exactly the units without a size', () => {
    const unsized = catalogue.villas.filter((v) => !v.size).map((v) => v.id);
    assert.ok(unsized.length > 0, 'this test is meaningless if the catalogue changes');
    assert.ok(unsized.every((id) => id.startsWith('A')), `expected only A-block units, got ${unsized}`);
  });
});

describe('selling an unpriced unit', () => {
  const unit = 'A5';
  const AGREED = 9_400_000;

  before(async () => {
    await store.setVillaStatus(unit, 'sold', { seller: 'Anna' });
  });

  it('counts in the sold total, not only in the status count', async () => {
    const a = await analytics('all');
    assert.equal(a.villaStatus.sold, 1, 'the status count sees it');
    assert.equal(a.financial.soldCount, 1, 'and so does the money count — these used to disagree');
  });

  it('is reported as unpriced rather than dropped', async () => {
    const a = await analytics('all');
    assert.ok(a.financial.unpricedCount > 0, 'the tile must be able to say what it excludes');
    const issues = await store.integrityIssues();
    assert.ok(
      issues.some((i) => i.villaId === unit && i.kind === 'unit-without-price'),
      'and it must be on the list of things needing a decision',
    );
  });

  it('brings its real revenue in once a figure is agreed', async () => {
    await store.updateVillaSale(unit, { op: 'sale', patch: { contractValue: AGREED } });
    const a = await analytics('all');
    assert.equal(a.financial.soldRevenue, AGREED, 'the agreed price is the revenue');
    assert.equal(a.financial.avgDealSize, AGREED);
    const issues = await store.integrityIssues();
    assert.ok(
      !issues.some((i) => i.villaId === unit && i.kind === 'unit-without-price'),
      'and it stops being an issue',
    );
  });

  it('credits the salesperson with the agreed figure', async () => {
    const a = await analytics('all');
    const anna = a.agents.find((x) => x.seller === 'Anna');
    assert.equal(anna?.sold, 1);
    assert.equal(anna?.revenue, AGREED);
  });
});

describe('a priced unit', () => {
  const unit = 'B7';

  it('uses its list price until a contract value is recorded', async () => {
    const list = store.unitListPrice(unit)!;
    assert.ok(list > 0);
    await store.setVillaStatus(unit, 'reserved', { seller: 'Anna' });

    const a = await analytics('all');
    assert.equal(a.financial.reservedCount, 1);
    // setVillaStatus fills the contract value from the list price when a deal
    // starts, so the reserved value is the list price either way.
    assert.equal(a.financial.reservedValue, list);
  });

  it('prefers the agreed figure over the list price', async () => {
    const negotiated = 7_000_000;
    await store.updateVillaSale(unit, { op: 'sale', patch: { contractValue: negotiated } });
    const a = await analytics('all');
    assert.equal(a.financial.reservedValue, negotiated, 'a discount must show as the discount');
  });
});

describe('the two inventory counts', () => {
  it('always add up to the same set of units', async () => {
    const a = await analytics('all');
    const { free, reserved, sold, total } = a.villaStatus;
    assert.equal(free + reserved + sold, total, 'status must cover every unit');
    assert.equal(total, catalogue.villas.length, 'and every unit means all of them');

    // The money side covers the same units, split into priced and not.
    const priced = a.financial.bySize.reduce((n, x) => n + x.total, 0);
    assert.equal(priced + a.financial.unpricedCount, total,
      'priced plus unpriced must be the whole development, with nothing quietly missing');
  });
});
