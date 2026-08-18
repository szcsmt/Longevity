import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ══════════════════ The six journeys, end to end ══════════════════

   Every other file here tests one rule. This one tests that the rules add up:
   a lead really can travel from a Facebook ad to a signed contract, an agency's
   introduction really does survive a duplicate merge, and a salesperson really
   can leave without taking a customer's history with them.

   These are the acceptance tests for the whole rebuild. They are deliberately
   written as narratives rather than as unit assertions — if one of them starts
   failing, something that a person does every week has stopped working, and the
   test should read enough like that week to say which part. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-flows-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;          // nothing leaves the machine
delete process.env.PARTNER_WEBHOOK_URL;
delete process.env.RESEND_API_KEY;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en;Bence|bence@example.com||hu';

const store = await import('../lib/crm/store');
const partners = await import('../lib/crm/partners');
const { performance } = await import('../lib/crm/performance');
const { creditedClaim, workQueue } = await import('../lib/crm/rules');
const { leadSource } = await import('../lib/crm/sources');

after(() => rmSync(dir, { recursive: true, force: true }));

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const villaRec = async (id: string) => (await store.getVillaData()).villas[id];

/* ────────────────────────────────────────────────────────────────────────── */

describe('FLOW 1 · a Facebook ad becomes a signed contract', () => {
  it('carries the lead the whole way, and the money follows it', async () => {
    // 1. The form on the website. This is exactly what /api/lead posts.
    const { lead, created } = await store.upsertLeadFromPayload({
      name: 'Elena Rossi',
      email: 'elena@example.it',
      phone: '+39 340 111 2222',
      form_type: 'enquiry',
      utm_source: 'FB_Ads',
      utm_campaign: 'spring-launch',
      utm_content: 'pool-video',
      villa: 'Residence XL',
    });
    assert.equal(created, true);

    // 2. Assigned the second it landed — nobody has to remember to do it.
    assert.ok(lead.owner, 'a lead with no owner is a lead nobody is working');
    // Italian number, and Anna is the only English speaker; either is fine,
    // what matters is that somebody owns it.
    assert.ok(['Anna', 'Bence'].includes(lead.owner!));

    // 3. It is the top of somebody's day until they speak to them.
    const first = workQueue([(await store.getLead(lead.id))!]).find((s) => s.leads.length);
    assert.equal(first?.key, 'uncontacted');

    // 4. First contact.
    const contacted = await store.logTouch(lead.id, 'call', 'Wants the XL, cash, viewing in May', 'Anna');
    assert.equal(contacted!.stage, 'contacted', 'reaching somebody moves a new lead by itself');

    // 5. What the conversation established.
    await store.setQualification(lead.id, {
      budget: 12_000_000, currency: 'THB', timeframe: '0-3',
      purpose: 'investment', financing: 'cash', decision: 'sole',
    }, 'Anna');

    // 6. Through the middle of the funnel — the part that did not exist before.
    for (const stage of ['qualified', 'presentation', 'visit', 'negotiation'] as const) {
      const moved = await store.updateLead(lead.id, { stage }, 'Anna');
      assert.equal(moved!.stage, stage);
    }
    const gaps = ((await store.getLead(lead.id))!.history || [])
      .filter((h) => h.kind === 'stage' && h.detail.includes('still unknown'));
    assert.equal(gaps.length, 0, 'a fully qualified lead moves with no gap recorded against it');

    // 7. Reserved — the unit and the lead in step.
    await store.setVillaStatus('C7', 'free');
    await store.updateVillaSale('C7', { op: 'sale', patch: { buyerLeadId: lead.id, contractValue: 11_200_000 } });
    await store.updateVillaSale('C7', {
      op: 'reserve', amount: 784_000, expiresAt: day(30), agreement: 'RES-2026-031.pdf', by: 'Anna',
    });
    await store.updateLead(lead.id, { villa: 'C7', stage: 'reserved', value: 11_200_000 }, 'Anna');
    assert.equal((await villaRec('C7'))!.status, 'reserved');

    // 8. The deposit lands, and the contract goes out.
    await store.updateVillaSale('C7', { op: 'reservationPatch', patch: { paidAt: day(0) } });
    await store.updateVillaSale('C7', { op: 'contract', status: 'sent' });
    await store.updateVillaSale('C7', { op: 'contract', status: 'signed' });
    await store.updateLead(lead.id, { stage: 'contract' }, 'Anna');
    assert.equal((await villaRec('C7'))!.contract!.signed_at, day(0));

    // 9. The money, milestone by milestone, until the unit sells itself.
    for (const key of ['slot', 'foundation', 'build', 'furnish']) {
      await store.updateVillaSale('C7', { op: 'phase', key, paid: true });
    }
    const rec = (await villaRec('C7'))!;
    assert.equal(rec.status, 'sold', 'the whole schedule paid is a sold villa, without anybody saying so');
    await store.updateLead(lead.id, { stage: 'won' }, 'Anna');

    // 10. And marketing can finally see which ad did it.
    const p = performance(await store.listLeads());
    const campaign = p.byCampaign.find((c) => c.campaign === 'spring-launch')!;
    assert.equal(campaign.won, 1);
    assert.equal(campaign.wonValue, 11_200_000);
    assert.equal(p.byAd.find((a) => a.ad === 'pool-video')!.won, 1);
    assert.equal(leadSource((await store.getLead(lead.id))!), 'facebook', 'FB_Ads is Facebook');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe('FLOW 2 · an agency introduces a buyer, and still gets the credit', () => {
  it('survives a second enquiry, a merge, and a rival registration', async () => {
    const agency = (await partners.createAgency({
      name: 'Milan Overseas', country: 'IT', status: 'active',
      commission_model: 'percent', commission_pct: 4,
    }))!;
    const rival = (await partners.createAgency({ name: 'Rival Realty', status: 'active' }))!;

    // 1. The agency sends us a name.
    const intro = await store.createManualLead(
      { name: 'Giulia Bianchi', email: 'giulia@example.it', source: 'agent' },
      'Anna',
    );
    await store.registerAgency(intro.id, agency, partners.protectionDays(agency), {
      note: 'Met at the Milan show',
    }, 'Anna');

    // 2. A fortnight later the same person fills in the website form. The
    //    intake recognises them and appends rather than creating a twin.
    const again = await store.upsertLeadFromPayload({
      name: 'Giulia Bianchi', email: 'giulia@example.it', form_type: 'reserve', utm_source: 'google',
    });
    assert.equal(again.created, false, 'one person, one lead');
    assert.equal(again.lead.id, intro.id);

    // 3. Meanwhile another agency tries to claim her. Refused, with the reason.
    await assert.rejects(
      () => store.registerAgency(intro.id, rival, 90, {}, 'Bence'),
      (err: Error) => {
        assert.equal(err.name, 'ClaimConflict');
        assert.match(err.message, /Milan Overseas registered this buyer/);
        return true;
      },
    );

    // 4. She had also filled in a brochure form months earlier under a second
    //    e-mail, which is the duplicate nobody noticed. Folding it in must not
    //    lose the introduction.
    const stray = await store.createManualLead(
      { name: 'G. Bianchi', email: 'g.bianchi@example.it', phone: '+39 333 444 5555' },
      'Anna',
    );
    const merged = await store.mergeLeads(intro.id, stray.id, 'Anna');
    assert.equal(creditedClaim(merged!)!.agencyId, agency.id, 'the introduction survives the merge');

    // 5. Through to a sale.
    await store.setVillaStatus('C8', 'free');
    await store.updateVillaSale('C8', { op: 'sale', patch: { buyerLeadId: intro.id, contractValue: 8_050_000 } });
    await store.updateLead(intro.id, { villa: 'C8', value: 8_050_000, stage: 'won' }, 'Anna');

    // 6. And the agency's figures say so, commission and all.
    const perf = partners.performanceFor(
      (await partners.getAgency(agency.id))!,
      await store.listLeads(),
    );
    assert.equal(perf.won, 1);
    assert.equal(perf.wonValue, 8_050_000);
    assert.equal(perf.commission, Math.round(8_050_000 * 0.04));
    assert.equal(perf.commissionPaid, 0);
    assert.equal(perf.commissionOutstanding, perf.commission);

    // 7. Paying them is a record, not a calculation.
    await partners.addPayment(agency.id, { amount: 322_000, at: day(0), reference: 'TT-4410' }, 'Anna');
    const settled = partners.performanceFor((await partners.getAgency(agency.id))!, await store.listLeads());
    assert.equal(settled.commissionOutstanding, 0);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe('FLOW 3 · a customer comes back through another channel', () => {
  it('lands on the record that already exists, and nothing is lost', async () => {
    const first = await store.upsertLeadFromPayload({
      name: 'Tomas Berg', email: 'tomas@example.se', phone: '+46 70 111 2222',
      form_type: 'brochure_request', utm_source: 'google',
    });
    await store.addNote(first.lead.id, 'Downloaded the brochure, no reply to the welcome', 'Anna');

    // Months later, on WhatsApp, from the same number with no e-mail at all.
    const back = await store.upsertLeadFromPayload(
      { phone: '+46 70 111 2222', form_type: 'enquiry', utm_source: 'whatsapp' },
      'Still interested — is the XL gone?',
    );

    assert.equal(back.created, false, 'the phone number alone is enough to recognise somebody');
    assert.equal(back.lead.id, first.lead.id);
    assert.equal(back.lead.email, 'tomas@example.se', 'the original contact details survive');
    assert.ok(back.lead.notes.some((n) => n.body.includes('Downloaded the brochure')));
    assert.ok(back.lead.notes.some((n) => n.body.includes('Still interested')));
    assert.equal(back.lead.utm_source, 'google', 'the FIRST source is the attribution, not the latest');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe('FLOW 4 · a salesperson leaves', () => {
  it('takes nothing with them', async () => {
    const lead = await store.createManualLead({ name: 'Held By Bence', email: 'hb@example.com' }, 'Bence');
    await store.updateLead(lead.id, { owner: 'Bence' }, 'Bence');
    await store.addNote(lead.id, 'Bence: they want the corner plot', 'Bence');
    await store.logTouch(lead.id, 'video', 'Zoom, showed the masterplan', 'Bence');
    await store.setQualification(lead.id, { budget: 9_000_000, currency: 'THB', timeframe: '3-6' }, 'Bence');

    const before = (await store.getLead(lead.id))!;
    const historyBefore = (before.history || []).length;

    // Bence leaves; the head of sales moves the lead to Anna.
    const moved = await store.updateLead(lead.id, { owner: 'Anna' }, 'Head');

    assert.equal(moved!.owner, 'Anna');
    assert.equal(moved!.notes.length, before.notes.length, 'his notes stay');
    assert.deepEqual(moved!.qualification, before.qualification, 'what he learned stays');
    assert.ok((moved!.history || []).length > historyBefore, 'and the handover is itself on the record');

    const handover = (moved!.history || []).at(-1)!;
    assert.equal(handover.kind, 'assigned');
    assert.match(handover.detail, /Assigned to Anna/);
    assert.equal(handover.by, 'Head', 'who moved it, not just that it moved');

    // Everything Bence ever did is still attributed to Bence.
    assert.ok((moved!.history || []).some((h) => h.by === 'Bence'));
    assert.ok(moved!.notes.some((n) => n.by === 'Bence'));
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe('FLOW 5 · two salespeople reach for the same villa', () => {
  it('refuses the second one, and says who has it', async () => {
    await store.setVillaStatus('D4', 'free');
    const anna = await store.createManualLead({ name: 'Anna Buyer', email: 'ab@example.com' }, 'Anna');
    const bence = await store.createManualLead({ name: 'Bence Buyer', email: 'bb@example.com' }, 'Bence');

    await store.updateVillaSale('D4', { op: 'sale', patch: { buyerLeadId: anna.id } });
    await store.updateVillaSale('D4', { op: 'reserve', amount: 500_000, by: 'Anna' });

    // Bence tries to link his buyer to the same plot.
    await assert.rejects(
      () => store.updateVillaSale('D4', { op: 'sale', patch: { buyerLeadId: bence.id } }),
      (err: Error) => {
        assert.equal(err.name, 'VillaConflict');
        assert.match(err.message, /already linked to Anna Buyer/);
        return true;
      },
    );

    // And to reserve it out from under her.
    await assert.rejects(() => store.setVillaStatus('D4', 'reserved', { seller: 'Bence' }));

    const rec = (await villaRec('D4'))!;
    assert.equal(rec.buyerLeadId, anna.id, 'the first reservation stands');
    assert.equal(rec.reservation!.by, 'Anna');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe('FLOW 6 · the head of sales opens the CRM', () => {
  it('can see, in one screen each, everything the morning turns on', async () => {
    const leads = await store.listLeads();
    const p = performance(leads);
    const counts = await store.attentionCounts();

    // New leads, and who is working them.
    assert.ok(p.total > 0);
    assert.ok(p.bySalesperson.length > 0, 'production by salesperson');

    // Who needs contacting, and what is stuck — the same numbers the queue
    // shows, because they are computed by the same rules.
    const queued = workQueue(leads).reduce((n, s) => n + s.leads.length, 0);
    assert.equal(counts.actionable, queued, 'the badge and the page can never disagree');
    for (const key of ['uncontacted', 'overdue', 'nonext', 'stalled'] as const) {
      const listed = (await store.listLeads({ flag: key })).length;
      const shown = { uncontacted: p.attention.uncontacted, overdue: p.attention.overdue,
                      nonext: p.attention.noNext, stalled: p.attention.stalled }[key];
      assert.equal(shown, listed, `the ${key} figure opens a list of exactly that many`);
    }

    // Which deals are close, where they die, and what has been sold.
    assert.ok(p.funnel.length >= 9, 'the funnel has the stages the sales actually has');
    assert.ok(p.wonValue > 0, 'sales value');
    assert.equal(typeof p.cycleDays, 'number');

    // Which agencies produce, and which villas are still free.
    const agencies = await partners.agencyPerformance(leads);
    assert.ok(agencies.some((a) => a.won > 0), 'at least one agency has sold something');
    const { villas } = await store.getVillaData();
    assert.ok(Object.values(villas).some((v) => v.status === 'sold'));

    // And nothing quietly broken underneath any of it.
    assert.deepEqual(await store.integrityIssues(), [], 'no unit pointing at a buyer who is not there');
  });
});
