import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Filtering on what the conversation established.

   "Show me the twelve people with a six-month timeframe and a budget over
   10M THB" was a question the CRM held every answer to and could not be asked.

   The interesting part is the money. A budget is stored in the currency the
   buyer actually said, because converting it at the moment they said it would
   lose what they told us — which is right for the record and awkward for a
   comparison. There are no default exchange rates: with none configured the
   CRM compares within a single currency and says so, because an invented rate
   would make a filter look complete while quietly hiding buyers. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-filter-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.CRM_FX;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { leadCountry, countryName } = await import('../lib/crm/language');
const { toBase, hasRates, fxRates } = await import('../lib/crm/money');

after(() => rmSync(dir, { recursive: true, force: true }));

const hu = await store.createManualLead({ name: 'Hungarian Soon', email: 'hu@example.com', phone: '+36 30 111 2222' });
const de = await store.createManualLead({ name: 'German Later', email: 'de@example.com', phone: '+49 170 111 2222' });
const gb = await store.createManualLead({ name: 'Brit In Dubai', email: 'gb@example.com', phone: '+971 50 111 2222' });

await store.setQualification(hu.id, { budget: 12_000_000, currency: 'THB', timeframe: '0-3' }, 'Anna');
await store.setQualification(de.id, { budget: 300_000, currency: 'EUR', timeframe: '12+' }, 'Anna');
await store.setQualification(gb.id, { budget: 4_000_000, currency: 'THB', timeframe: '0-3' }, 'Anna');
await store.updateLead(gb.id, { country: 'GB' }, 'Anna');

describe('country', () => {
  it('comes off the dialling code with nothing recorded', () => {
    assert.equal(leadCountry({ phone: '+36 30 111 2222' }), 'HU');
    assert.equal(countryName('HU'), 'Hungary');
  });

  it('is overridden by what a person recorded', async () => {
    const lead = (await store.getLead(gb.id))!;
    assert.equal(leadCountry(lead), 'GB', 'a British buyer on a Dubai number is not an Emirati');
  });

  it('filters on the same answer the report groups by', async () => {
    const found = await store.listLeads({ country: 'GB' });
    assert.deepEqual(found.map((l) => l.id), [gb.id]);
    assert.equal((await store.listLeads({ country: 'HU' })).length, 1);
  });

  it('is cleared back to the phone reading by an empty value', async () => {
    const cleared = await store.updateLead(gb.id, { country: undefined }, 'Anna');
    assert.equal(leadCountry(cleared!), 'AE');
    await store.updateLead(gb.id, { country: 'GB' }, 'Anna');
  });
});

describe('timeframe', () => {
  it('finds the buyers who said the same thing', async () => {
    const soon = await store.listLeads({ timeframe: '0-3' });
    assert.equal(soon.length, 2);
    assert.equal((await store.listLeads({ timeframe: '12+' })).length, 1);
  });
});

describe('budget, with no exchange rates configured', () => {
  it('compares within one currency and excludes the rest', async () => {
    assert.equal(hasRates(fxRates()), false);
    const rich = await store.listLeads({ minBudget: 10_000_000, budgetCurrency: 'THB' });
    assert.deepEqual(rich.map((l) => l.id), [hu.id], 'the €300k buyer is excluded, not guessed at');
  });

  it('refuses to treat a foreign amount as if it were baht', () => {
    assert.equal(toBase(300_000, 'EUR'), undefined);
    assert.equal(toBase(300_000, 'THB'), 300_000);
  });

  it('leaves out anybody whose budget nobody asked for', async () => {
    const nobody = await store.createManualLead({ name: 'No Budget', email: 'nb@example.com' });
    const rich = await store.listLeads({ minBudget: 1, budgetCurrency: 'THB' });
    assert.equal(rich.some((l) => l.id === nobody.id), false);
  });
});

describe('budget, with rates configured', () => {
  it('converts and says the rates are configuration, not a market feed', async () => {
    process.env.CRM_FX = 'EUR:38,USD:35,GBP:44';
    try {
      assert.equal(hasRates(fxRates()), true);
      assert.equal(toBase(300_000, 'EUR'), 11_400_000);

      const rich = await store.listLeads({ minBudget: 10_000_000, budgetCurrency: 'THB' });
      assert.equal(rich.length, 2, 'the €300k buyer is now comparable, and clears the bar');
      assert.equal(rich.some((l) => l.id === de.id), true);
    } finally {
      delete process.env.CRM_FX;
    }
  });

  it('ignores a rate for a currency the CRM does not hold budgets in', () => {
    process.env.CRM_FX = 'XYZ:99,EUR:38';
    try {
      const rates = fxRates();
      assert.equal(rates.XYZ, undefined);
      assert.equal(rates.EUR, 38);
    } finally {
      delete process.env.CRM_FX;
    }
  });

  it('ignores a rate that is not a positive number', () => {
    process.env.CRM_FX = 'EUR:zero,USD:-3,GBP:0';
    try {
      assert.equal(hasRates(fxRates()), false);
    } finally {
      delete process.env.CRM_FX;
    }
  });
});

describe('the filters together', () => {
  it('answers the question that started this', async () => {
    // "Everyone buying within three months with 10M THB or more."
    const found = await store.listLeads({ timeframe: '0-3', minBudget: 10_000_000, budgetCurrency: 'THB' });
    assert.deepEqual(found.map((l) => l.name), ['Hungarian Soon']);
  });
});
