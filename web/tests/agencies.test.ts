import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Agencies, and the registrations that decide who gets paid.

   Until now an introducing agency was a free-text word in `source`: no date, no
   way to settle who brought a buyer first, no answer to "which agencies produce
   sales". None of that could be reconstructed afterwards.

   The tests below are mostly about refusing and remembering. A registration is
   append-only — never edited, never deleted — and a second agency cannot record
   over a live claim without somebody deciding to. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-agency-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';
process.env.CRM_AGENCY_PROTECTION_DAYS = '90';

const store = await import('../lib/crm/store');
const partners = await import('../lib/crm/partners');
const { activeClaim, creditedClaim, competingClaims } = await import('../lib/crm/rules');

after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const fresh = () => store.createManualLead({ name: `A ${++n}`, email: `a${n}@example.com` });
const register = (leadId: string, agency: { id: string; name: string }, extra = {}) =>
  store.registerAgency(leadId, agency, partners.houseProtectionDays(), extra, 'Anna');

const bangkok = (await partners.createAgency({
  name: 'Bangkok Prime Property', country: 'TH', status: 'active',
  commission_model: 'percent', commission_pct: 5,
}))!;
const berlin = (await partners.createAgency({
  name: 'Berlin Overseas Homes', country: 'DE', status: 'active',
}))!;

describe('the agency record', () => {
  it('needs a name and nothing else', async () => {
    assert.equal(await partners.createAgency({ country: 'TH' }), null);
    const made = await partners.createAgency({ name: 'Minimal Ltd' });
    assert.equal(made!.status, 'prospect', 'an agency starts as a conversation, not a partner');
    assert.deepEqual(made!.contacts, []);
  });

  it('refuses a status or commission model nobody offered', async () => {
    const a = await partners.updateAgency(berlin.id, { status: 'favourite', commission_model: 'handshake' });
    assert.equal(a!.status, 'active', 'the old value stands rather than an invented one');
    assert.equal(a!.commission_model, undefined);
  });

  it('treats a commission over 100% as the typo it is', async () => {
    const a = await partners.updateAgency(berlin.id, { commission_pct: 500 });
    assert.equal(a!.commission_pct, undefined);
  });

  it('uses the house protection window until an agency negotiates its own', async () => {
    assert.equal(partners.protectionDays(bangkok), 90);
    const own = await partners.updateAgency(bangkok.id, { protection_days: 180 });
    assert.equal(partners.protectionDays(own!), 180);
    await partners.updateAgency(bangkok.id, { protection_days: 0 }); // clears it
    assert.equal(partners.protectionDays((await partners.getAgency(bangkok.id))!), 90);
  });

  it('is archived rather than deleted, because its registrations are evidence', async () => {
    const doomed = (await partners.createAgency({ name: 'Short Lived Realty' }))!;
    await partners.archiveAgency(doomed.id, 'Anna');
    assert.equal((await partners.listAgencies()).some((a) => a.id === doomed.id), false);
    assert.equal((await partners.listAgencies({ archived: 'include' })).some((a) => a.id === doomed.id), true);
    await partners.unarchiveAgency(doomed.id);
    assert.equal((await partners.listAgencies()).some((a) => a.id === doomed.id), true);
  });

  it('keeps a contact who left, because a claim still carries their name', async () => {
    const withPeople = (await partners.addContact(bangkok.id, { name: 'Nok', email: 'nok@bkk.example' }))!;
    const nok = withPeople.contacts[0];
    const after = await partners.setContactActive(bangkok.id, nok.id, false);
    assert.equal(after!.contacts.length, 1);
    assert.equal(after!.contacts[0].inactive, true);
  });
});

describe('registering a buyer', () => {
  it('stamps who, when, and how long the claim runs', async () => {
    const lead = await fresh();
    const after = await register(lead.id, bangkok, { note: 'Met them at the Bangkok show' });

    const claim = after!.claims![0];
    assert.equal(claim.agencyId, bangkok.id);
    assert.equal(claim.agencyName, 'Bangkok Prime Property');
    assert.equal(claim.by, 'Anna');
    assert.ok(claim.expires_at! > claim.at.slice(0, 10));
    assert.match((after!.history || []).at(-1)!.detail, /registered this buyer/);
    assert.equal((after!.history || []).at(-1)!.kind, 'registered');
  });

  it('keeps the agency name as it read on the day, even after a rename', async () => {
    const lead = await fresh();
    await register(lead.id, berlin);
    await partners.updateAgency(berlin.id, { name: 'Berlin Overseas Homes GmbH' });
    const after = (await store.getLead(lead.id))!;
    assert.equal(after.claims![0].agencyName, 'Berlin Overseas Homes');
  });

  it('refuses a second agency while the first claim is live, and says who holds it', async () => {
    const lead = await fresh();
    await register(lead.id, bangkok);
    await assert.rejects(
      () => register(lead.id, berlin),
      (err: Error) => {
        assert.equal(err.name, 'ClaimConflict');
        assert.match(err.message, /Bangkok Prime Property registered this buyer/);
        return true;
      },
    );
    const after = (await store.getLead(lead.id))!;
    assert.equal(after.claims!.length, 1, 'a refused registration must leave no trace on the record');
  });

  it('lets the same agency re-register — that is a renewal, not a conflict', async () => {
    const lead = await fresh();
    await register(lead.id, bangkok);
    const after = await register(lead.id, bangkok);
    assert.equal(after!.claims!.length, 2);
    assert.equal(activeClaim(after!)!.agencyId, bangkok.id);
  });

  it('records an override without erasing what it went over', async () => {
    const lead = await fresh();
    const first = await register(lead.id, bangkok);
    const claimId = first!.claims![0].id;
    const after = await register(lead.id, berlin, { override: true });

    assert.equal(after!.claims!.length, 2);
    assert.equal(after!.claims![1].overrode, claimId);
    assert.equal(after!.claims![0].released_at, undefined, 'the first claim is not withdrawn by an override');
    assert.match((after!.history || []).at(-1)!.detail, /recorded over Bangkok Prime Property's claim/);
  });

  it('shows both agencies as claiming, rather than pretending there is one', async () => {
    const lead = await fresh();
    await register(lead.id, bangkok);
    await register(lead.id, berlin, { override: true });
    const after = (await store.getLead(lead.id))!;
    assert.equal(competingClaims(after).length, 2);
  });
});

describe('withdrawing a registration', () => {
  it('needs a reason, and keeps the claim on the record', async () => {
    const lead = await fresh();
    const reg = await register(lead.id, bangkok);
    const claimId = reg!.claims![0].id;

    assert.equal(await store.releaseClaim(lead.id, claimId, '   ', 'Anna'), null);
    const after = await store.releaseClaim(lead.id, claimId, 'Buyer was already ours from March', 'Anna');
    assert.equal(after!.claims!.length, 1, 'withdrawn, not erased');
    assert.equal(after!.claims![0].release_reason, 'Buyer was already ours from March');
    assert.equal(activeClaim(after!), undefined);
    assert.equal(creditedClaim(after!), undefined);
  });

  it('frees the buyer for another agency to register', async () => {
    const lead = await fresh();
    const reg = await register(lead.id, bangkok);
    await store.releaseClaim(lead.id, reg!.claims![0].id, 'Wrong buyer', 'Anna');
    const after = await register(lead.id, berlin);
    assert.equal(activeClaim(after!)!.agencyId, berlin.id);
  });
});

describe('protection expires, credit does not', () => {
  it('lets a new agency register once the window has closed, and still credits the first', async () => {
    const lead = await fresh();
    await register(lead.id, bangkok);
    const parked = (await store.getLead(lead.id))!;
    // Backdate the window rather than waiting ninety days for it.
    parked.claims![0].expires_at = '2020-01-01';

    assert.equal(activeClaim(parked), undefined, 'nobody holds protection any more');
    assert.equal(creditedClaim(parked)!.agencyId, bangkok.id, 'but they still introduced the buyer');
  });
});

/* Its own agency, set up at module level (a describe callback cannot await), so
   the counts in the block below are exact rather than "at least". Four
   registrations: one sold, one lost, one still open, one archived. */
const dubai = (await partners.createAgency({
  name: 'Dubai Gulf Estates', status: 'active', commission_model: 'percent', commission_pct: 5,
}))!;
{
  const sold = await fresh();
  await register(sold.id, dubai);
  await store.updateLead(sold.id, { villa: 'Residence L', value: 20_000_000 }, 'Anna');
  await store.updateLead(sold.id, { stage: 'won' }, 'Anna');

  const lostOne = await fresh();
  await register(lostOne.id, dubai);
  await store.updateLead(lostOne.id, { stage: 'lost', lost_reason: 'price' }, 'Anna');

  const open = await fresh();
  await register(open.id, dubai);
  await store.updateLead(open.id, { stage: 'qualified', value: 14_000_000 }, 'Anna');

  const gone = await fresh();
  await register(gone.id, dubai);
  await store.archiveLead(gone.id, 'Wrong number', 'Anna');
}

describe('what each agency has produced', () => {
  it('counts what it introduced, and leaves the archived one out', async () => {
    const perf = partners.performanceFor(dubai, await store.listLeads({ archived: 'include' }));

    assert.equal(perf.registered, 3, 'four registered, one archived — an archive is not a lead');
    assert.equal(perf.won, 1);
    assert.equal(perf.lost, 1);
    assert.equal(perf.live, 1);
    assert.equal(perf.qualified, 2, 'qualified counts reaching it, so a won deal counts too');
    assert.equal(perf.wonValue, 20_000_000);
    assert.equal(perf.pipelineValue, 14_000_000);
    assert.equal(perf.conversion, 33);
  });

  it('does not credit a deal to the agency that registered it second', async () => {
    const contested = await fresh();
    await register(contested.id, dubai);
    await register(contested.id, berlin, { override: true });
    await store.updateLead(contested.id, { villa: 'Residence M', stage: 'won', value: 9_000_000 }, 'Anna');
    const leads = await store.listLeads();

    assert.equal(partners.performanceFor(dubai, leads).wonValue, 29_000_000, 'they made the introduction');
    assert.equal(partners.performanceFor((await partners.getAgency(berlin.id))!, leads).wonValue, 0);
  });

  it('works the commission out of the agreement, and says nothing when there is none', async () => {
    const leads = await store.listLeads();
    assert.equal(partners.performanceFor(dubai, leads).commission, Math.round(29_000_000 * 0.05));

    const noTerms = (await partners.getAgency(berlin.id))!;
    assert.equal(partners.performanceFor(noTerms, leads).commission, undefined);
  });
});

describe('merging two records for the same person', () => {
  it('keeps the registration, and keeps it first', async () => {
    /* The registration is the reason a merge can never be a delete: an agency
       introduced this buyer, and folding two records together must not be what
       loses their claim. */
    const older = await fresh();
    await register(older.id, dubai);
    const newer = await store.createManualLead({ name: 'Same Person', email: (await store.getLead(older.id))!.email });

    const merged = await store.mergeLeads(newer.id, older.id, 'Anna');
    assert.equal(merged!.claims!.length, 1);
    assert.equal(creditedClaim(merged!)!.agencyId, dubai.id);
  });

  it('puts two agencies in the order they actually registered', async () => {
    const first = await fresh();
    await register(first.id, dubai);
    const second = await store.createManualLead({ name: 'Contested', email: (await store.getLead(first.id))!.email });
    await register(second.id, berlin);

    const merged = await store.mergeLeads(second.id, first.id, 'Anna');
    assert.equal(merged!.claims!.length, 2);
    assert.equal(creditedClaim(merged!)!.agencyId, dubai.id, 'whoever registered first introduced them');
    assert.equal(competingClaims(merged!).length, 2, 'and the second claim is still on the record');
  });
});

describe('the commission ledger', () => {
  it('keeps what was generated and what was paid apart', async () => {
    const before = partners.performanceFor(dubai, await store.listLeads());
    assert.equal(before.commissionPaid, 0);
    assert.equal(before.commissionOutstanding, before.commission);

    await partners.addPayment(dubai.id, { amount: 500_000, at: '2026-05-02', reference: 'TT-9911' }, 'Anna');
    const after = partners.performanceFor((await partners.getAgency(dubai.id))!, await store.listLeads());

    assert.equal(after.commissionPaid, 500_000);
    assert.equal(after.commissionOutstanding, after.commission! - 500_000);
  });

  it('has no outstanding figure when there is no agreement to compute one from', async () => {
    const perf = partners.performanceFor((await partners.getAgency(berlin.id))!, await store.listLeads());
    assert.equal(perf.commission, undefined);
    assert.equal(perf.commissionOutstanding, undefined, 'an unknown minus a known is not zero');
  });

  it('corrects a mistake with a negative entry rather than a delete', async () => {
    /* There is deliberately no removePayment: a money record that can quietly
       disappear is not a record. */
    const agency = (await partners.createAgency({ name: 'Ledger Test', commission_model: 'percent', commission_pct: 3 }))!;
    await partners.addPayment(agency.id, { amount: 200_000, at: '2026-04-01' }, 'Anna');
    const fixed = await partners.addPayment(agency.id, { amount: -200_000, at: '2026-04-02', note: 'Entered twice' }, 'Anna');

    assert.equal(fixed!.payments!.length, 2, 'both entries stay on the record');
    assert.equal(partners.paidTotal(fixed!), 0);
  });

  it('refuses a payment with no amount, a zero amount or no date', async () => {
    const agency = (await partners.createAgency({ name: 'Strict Ledger' }))!;
    assert.equal(await partners.addPayment(agency.id, { amount: 0, at: '2026-04-01' }), null);
    assert.equal(await partners.addPayment(agency.id, { amount: 100, at: 'soon' }), null);
    assert.equal(await partners.addPayment(agency.id, { at: '2026-04-01' }), null);
    assert.equal((await partners.getAgency(agency.id))!.payments, undefined);
  });

  it('keeps the ledger in date order however it is entered', async () => {
    const agency = (await partners.createAgency({ name: 'Out Of Order' }))!;
    await partners.addPayment(agency.id, { amount: 10, at: '2026-06-01' }, 'Anna');
    const after = await partners.addPayment(agency.id, { amount: 10, at: '2026-01-01' }, 'Anna');
    assert.deepEqual(after!.payments!.map((p) => p.at), ['2026-01-01', '2026-06-01']);
  });
});
