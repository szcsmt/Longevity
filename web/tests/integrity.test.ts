import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Referential integrity between a unit and its buyer.

   `VillaRecord.buyerLeadId` is a reference with nothing enforcing it. The two
   records can drift apart without anything failing: the first sign is a figure
   on the Payments page that is quietly wrong, or a masterplan drawer showing an
   empty buyer box as though somebody had unlinked them.

   So: refuse the two moves that would break the link, carry the link across a
   merge rather than dropping it, and report what is already broken. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-integrity-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;
delete process.env.PARTNER_WEBHOOK_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { fileBackend } = await import('../lib/crm/backend-file');

after(() => rmSync(dir, { recursive: true, force: true }));

/** A lead holding a reserved unit — the shape most of these tests need. */
async function buyerHolding(unit: string, name: string, email: string) {
  const lead = await store.createManualLead({ name, email });
  await store.setVillaStatus(unit, 'reserved', { seller: 'Anna' });
  await store.updateVillaSale(unit, { op: 'sale', patch: { buyerLeadId: lead.id } });
  return lead;
}

describe('a lead that holds a unit', () => {
  let leadId = '';

  before(async () => {
    const lead = await buyerHolding('B1', 'Holder One', 'holder1@example.com');
    leadId = lead.id;
  });

  it('is reported as holding it', async () => {
    assert.equal(await store.unitHeldBy(leadId), 'B1');
  });

  it('cannot be archived, and the refusal names the unit', async () => {
    await assert.rejects(
      () => store.archiveLead(leadId, 'tidying up', 'Anna'),
      (err: Error) => {
        assert.equal(err.name, 'CrmConflict');
        assert.match(err.message, /buyer of B1/);
        return true;
      },
    );
  });

  it('is left completely untouched by the refusal', async () => {
    const lead = await store.getLead(leadId);
    assert.equal(lead?.archived_at, undefined);
    assert.ok((await store.listLeads()).some((l) => l.id === leadId), 'still in the list');
  });

  it('can be archived once the unit is released', async () => {
    await store.setVillaStatus('B1', 'free');
    assert.equal(await store.unitHeldBy(leadId), null);
    assert.ok(await store.archiveLead(leadId, 'now genuinely done', 'Anna'));
    await store.unarchiveLead(leadId, 'Anna');
  });

  it('is not counted as holding a unit that was released', async () => {
    // Sale data lingers on a released unit by design; that is history, not a hold.
    assert.equal(await store.unitHeldBy(leadId), null);
  });
});

describe('merging a buyer', () => {
  it('carries the unit across instead of failing or dropping it', async () => {
    const primary = await store.createManualLead({ name: 'Real Buyer', email: 'real@example.com', phone: '+66 81 222 3333' });
    const duplicate = await buyerHolding('B2', 'Real Buyer', 'real.buyer@example.com');
    await store.updateLead(duplicate.id, { phone: '+66 81 222 3333' }, 'Anna');

    // Before this worked, the merge would have thrown: the husk holds B2, and
    // archiving a holder is refused.
    const merged = await store.mergeLeads(primary.id, duplicate.id, 'Anna');
    assert.ok(merged, 'the merge must go through');

    const { villas, history } = await store.getVillaData();
    assert.equal(villas.B2.buyerLeadId, primary.id, 'the unit now points at the surviving record');
    assert.equal(villas.B2.buyerName, 'Real Buyer');
    assert.ok(
      history.some((h) => h.villaId === 'B2' && (h.note || '').includes('Buyer record merged')),
      'and the unit’s own history says why it changed hands',
    );

    const husk = await store.getLead(duplicate.id);
    assert.ok(husk?.archived_at, 'the duplicate is archived, as usual');
    assert.equal(await store.unitHeldBy(duplicate.id), null, 'and no longer holds anything');
  });
});

describe('permanent deletion of a holder', () => {
  it('is refused even if the lead somehow got archived', async () => {
    const lead = await buyerHolding('B3', 'Ghost Buyer', 'ghost@example.com');
    // Reach past the archive guard the way a bad import or an old record could.
    const raw = (await store.getLead(lead.id))!;
    await fileBackend.saveLead(
      { ...raw, archived_at: new Date().toISOString(), rev: (raw.rev || 0) + 1 },
      raw.rev || 0,
    );
    assert.equal(await store.purgeLead(lead.id), 'holds-unit');
    assert.ok(await store.getLead(lead.id), 'the record survives the refusal');
  });
});

describe('the integrity report', () => {
  it('finds a unit pointing at a lead that no longer exists', async () => {
    await store.setVillaStatus('C1', 'reserved', { seller: 'Anna' });
    await store.updateVillaSale('C1', {
      op: 'sale', patch: { buyerName: 'Vanished Person' },
    });
    // Write a reference by hand to the id of a lead that was never created —
    // the state left behind by a delete from before any of this existed.
    const villas = await fileBackend.getVillas();
    const rec = villas.C1;
    await fileBackend.setVilla('C1', { ...rec, buyerLeadId: 'lead-that-is-gone', rev: (rec.rev || 0) + 1 }, rec.rev || 0);

    const issues = await store.integrityIssues();
    const found = issues.find((i) => i.villaId === 'C1' && i.kind === 'dangling-buyer');
    assert.ok(found, `expected a dangling-buyer issue, got ${JSON.stringify(issues)}`);
    assert.match(found!.detail, /no longer exists/);
  });

  it('finds a reserved unit with nobody named on it', async () => {
    await store.setVillaStatus('C2', 'reserved', { seller: 'Anna' });
    const issues = await store.integrityIssues();
    assert.ok(issues.some((i) => i.villaId === 'C2' && i.kind === 'held-without-buyer'));
  });

  it('ignores a released unit, whose leftover sale data is history', async () => {
    await store.setVillaStatus('C3', 'reserved', { seller: 'Anna' });
    await store.updateVillaSale('C3', { op: 'sale', patch: { buyerName: 'Someone' } });
    await store.setVillaStatus('C3', 'free');
    const issues = await store.integrityIssues();
    assert.ok(!issues.some((i) => i.villaId === 'C3'), 'a free unit is never an issue');
  });

  it('finds an active lead nobody is responsible for', async () => {
    const lead = await store.createManualLead({ name: 'Unowned', email: 'unowned@example.com' });
    await store.updateLead(lead.id, { owner: undefined }, 'Anna');
    // updateLead only applies keys present in the patch, so clear it directly.
    const raw = (await store.getLead(lead.id))!;
    await fileBackend.saveLead({ ...raw, owner: undefined, rev: (raw.rev || 0) + 1 }, raw.rev || 0);

    const issues = await store.integrityIssues();
    assert.ok(
      issues.some((i) => i.leadId === lead.id && i.kind === 'lead-without-owner'),
      'an unowned active lead must be reported',
    );
  });

  it('says nothing about an archived lead with no owner', async () => {
    const lead = await store.createManualLead({ name: 'Unowned Archived', email: 'ua@example.com' });
    const raw = (await store.getLead(lead.id))!;
    await fileBackend.saveLead({ ...raw, owner: undefined, rev: (raw.rev || 0) + 1 }, raw.rev || 0);
    await store.archiveLead(lead.id, 'not a real enquiry', 'Anna');

    const issues = await store.integrityIssues();
    assert.ok(
      !issues.some((i) => i.leadId === lead.id),
      'an archived lead is nobody’s outstanding job',
    );
  });
});
