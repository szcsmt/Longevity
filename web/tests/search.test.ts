import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Agency, Lead, VillaRecord } from '../lib/crm/types';

/* One search box, three kinds of answer.

   The sidebar search filtered the lead list — the right answer to "where is
   that buyer" and no answer at all to "which agency was Nok at" or "who is
   holding B12", both of which get asked out loud every week.

   The phone tests are the point of the whole file. The same number arrives
   from a business card, a WhatsApp export and somebody's memory in three
   different shapes, and a search that only matches the shape it was saved in
   is a search people stop using. */

const { search, phoneKey } = await import('../lib/crm/search');

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: over.id || Math.random().toString(36).slice(2),
  stage: 'new', score: 'warm', notes: [], tasks: [],
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const LEADS = [
  lead({ id: 'l1', name: 'Marta Kovács', email: 'marta@example.com', phone: '+66 81 234 5678', villa: 'Residence L' }),
  lead({ id: 'l2', name: 'Pieter de Vries', email: 'pieter@example.nl', whatsapp: '+31 6 1111 2222' }),
  lead({ id: 'l3', name: 'Gone Away', email: 'gone@example.com', archived_at: '2026-03-01T00:00:00.000Z' }),
];

const AGENCIES: Agency[] = [
  {
    id: 'a1', name: 'Bangkok Prime Property', country: 'TH', status: 'active',
    contacts: [{ id: 'c1', name: 'Nok Suwan', email: 'nok@bkk.example', phone: '+66 89 999 0000' }],
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const VILLAS: Record<string, VillaRecord> = {
  B12: { status: 'reserved', updatedAt: '2026-01-01T00:00:00.000Z', buyerName: 'Marta Kovács' },
  A3: { status: 'free', updatedAt: '2026-01-01T00:00:00.000Z' },
};

const all = { leads: LEADS, agencies: AGENCIES, villas: VILLAS };
const ids = (q: string) => search(q, all).map((h) => `${h.kind}:${h.id}`);

describe('finding a buyer', () => {
  it('by name, by e-mail, and by the residence they asked about', () => {
    assert.ok(ids('marta').includes('lead:l1'));
    assert.ok(ids('pieter@example.nl').includes('lead:l2'));
    assert.ok(ids('residence l').includes('lead:l1'));
  });

  it('by a phone number in whatever shape it is read out', () => {
    /* Saved as "+66 81 234 5678". These are the same number off a business
       card, a WhatsApp export and somebody's memory. */
    for (const q of ['+66 81 234 5678', '66812345678', '0812345678', '81 234 5678', '812345678']) {
      assert.ok(ids(q).includes('lead:l1'), `${q} must find the same person`);
    }
  });

  it('by a WhatsApp number, not only a phone one', () => {
    assert.ok(ids('+31 6 1111 2222').includes('lead:l2'));
    assert.ok(ids('0611112222').includes('lead:l2'));
  });

  it('says which field matched, so a phone hit does not look mysterious', () => {
    assert.equal(search('0812345678', all)[0].matched, 'phone');
    assert.equal(search('marta kovács', all).find((h) => h.kind === 'lead')!.matched, 'name');
  });

  it('finds an archived lead and says so', () => {
    const hit = search('gone away', all).find((h) => h.id === 'l3')!;
    assert.ok(hit, 'a search that silently omits them looks like a CRM that lost the record');
    assert.match(hit.subtitle, /archived/);
  });
});

describe('finding an agency', () => {
  it('by its own name', () => {
    assert.ok(ids('bangkok prime').includes('agency:a1'));
  });

  it('by the name of somebody who works there', () => {
    // "Which agency was Nok at" — the question, and the answer is the agency.
    const hit = search('nok', all).find((h) => h.kind === 'agency')!;
    assert.equal(hit.id, 'a1');
    assert.match(hit.matched, /their agent Nok Suwan/);
  });

  it('by their agent&apos;s phone number', () => {
    assert.ok(ids('0899990000').includes('agency:a1'));
  });
});

describe('finding a unit', () => {
  it('by its number', () => {
    assert.ok(ids('b12').includes('unit:B12'));
  });

  it('by who is holding it', () => {
    // "Who is holding B12" from the other end: search the buyer, get the unit.
    assert.ok(ids('marta').includes('unit:B12'));
  });
});

describe('what it refuses to do', () => {
  it('says nothing for a query too short to mean anything', () => {
    assert.deepEqual(search('m', all), []);
    assert.deepEqual(search('', all), []);
  });

  it('does not treat a short number as a phone number', () => {
    // "12" is a unit fragment or a typo, not a number to match on digits.
    assert.equal(search('12', all).some((h) => h.kind === 'lead'), false);
  });

  it('needs enough digits before it compares phone numbers at all', () => {
    assert.equal(phoneKey('+66 81'), '', 'four digits identify nobody');
    assert.equal(phoneKey('+66 81 234 5678'), '812345678');
  });
});

describe('the order of the answers', () => {
  it('puts an exact name first, ahead of a unit that merely mentions it', () => {
    const hits = search('Marta Kovács', all);
    assert.equal(hits[0].kind, 'lead');
    assert.equal(hits[0].id, 'l1');
  });
});
