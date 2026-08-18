import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* The partner portal.

   A partner is not staff. They are a third party with a commercial interest in
   our customer list, and the portal has to be useful to them without becoming a
   window into it. Nearly every test here is about what it must NOT do.

   The credential design is the other half: one code per agency, stored only as
   a hash, and the session signed against that hash — so re-issuing a code
   invalidates every session opened with the old one without a session store to
   sweep. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-portal-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const partners = await import('../lib/crm/partners');
const portal = await import('../lib/crm/portal');
const { creditedClaim } = await import('../lib/crm/rules');

after(() => rmSync(dir, { recursive: true, force: true }));

const milan = (await partners.createAgency({ name: 'Milan Overseas', status: 'active' }))!;
const rival = (await partners.createAgency({ name: 'Rival Realty', status: 'active' }))!;
const credited = (l: import('../lib/crm/types').Lead) => creditedClaim(l)?.agencyId;

describe('the access code', () => {
  it('is shown once and stored only as a hash', async () => {
    const opened = (await portal.openPortal(milan.id))!;
    assert.ok(opened.token.length > 20);
    assert.notEqual(opened.agency.portal_token_hash, opened.token, 'never the code itself');
    assert.equal(opened.agency.portal_token_hash, portal.tokenHash(opened.token));
    assert.ok(opened.agency.portal_opened_at);
  });

  it('identifies its own agency and nobody else', async () => {
    const a = (await portal.openPortal(milan.id))!;
    const b = (await portal.openPortal(rival.id))!;
    assert.equal((await portal.agencyForToken(a.token))!.id, milan.id);
    assert.equal((await portal.agencyForToken(b.token))!.id, rival.id);
  });

  it('refuses a code nobody issued, and an empty one', async () => {
    assert.equal(await portal.agencyForToken('not-a-real-code'), null);
    assert.equal(await portal.agencyForToken(''), null);
    assert.equal(await portal.agencyForToken('   '), null);
  });

  it('stops working the moment a new one is issued', async () => {
    const first = (await portal.openPortal(milan.id))!;
    const second = (await portal.openPortal(milan.id))!;
    assert.equal(await portal.agencyForToken(first.token), null, 'the old code is dead');
    assert.equal((await portal.agencyForToken(second.token))!.id, milan.id);
  });

  it('takes every open session with it, without a session store to sweep', async () => {
    const first = (await portal.openPortal(milan.id))!;
    const cookie = portal.sessionValue(first.agency);
    // Re-issuing changes the hash the signature was derived from.
    const second = (await portal.openPortal(milan.id))!;
    assert.notEqual(cookie, portal.sessionValue(second.agency));
  });

  it('dies when the relationship does', async () => {
    const doomed = (await partners.createAgency({ name: 'Ended Partner' }))!;
    const opened = (await portal.openPortal(doomed.id))!;
    assert.ok(await portal.agencyForToken(opened.token));

    await partners.archiveAgency(doomed.id, 'Anna');
    assert.equal(await portal.agencyForToken(opened.token), null, 'ending a relationship ends the access');
  });

  it('cannot be opened for an agency we no longer work with', async () => {
    const doomed = (await partners.createAgency({ name: 'Also Ended' }))!;
    await partners.archiveAgency(doomed.id, 'Anna');
    assert.equal(await portal.openPortal(doomed.id), null);
  });

  it('is revoked outright by closing access', async () => {
    const opened = (await portal.openPortal(rival.id))!;
    await portal.closePortal(rival.id);
    assert.equal(await portal.agencyForToken(opened.token), null);
    assert.equal((await partners.getAgency(rival.id))!.portal_token_hash, undefined);
  });
});

describe('what a partner may see', () => {
  it('only the buyers it introduced', async () => {
    const ours = await store.createManualLead({ name: 'Ours', email: 'ours@example.com' }, 'Anna');
    await store.registerAgency(ours.id, milan, 90, {}, 'Anna');

    const theirs = await store.createManualLead({ name: 'Theirs', email: 'theirs@example.com' }, 'Anna');
    await store.registerAgency(theirs.id, rival, 90, {}, 'Anna');

    const direct = await store.createManualLead({ name: 'Direct', email: 'direct@example.com' }, 'Anna');

    const view = portal.portalLeads(milan, await store.listLeads(), credited);
    const names = view.map((v) => v.name);
    assert.deepEqual(names, ['Ours']);
    assert.equal(names.includes('Theirs'), false, 'never another agency’s buyer');
    assert.equal(names.includes('Direct'), false, 'never a buyer who came to us directly');
    assert.ok(direct.id);
  });

  it('a status in five words, not our pipeline', async () => {
    const l = await store.createManualLead({ name: 'Staged', email: 'st@example.com', villa: 'Residence L' }, 'Anna');
    await store.registerAgency(l.id, milan, 90, {}, 'Anna');

    const seen = async () => portal.partnerStatus((await store.getLead(l.id))!);
    assert.equal(await seen(), 'registered');
    await store.updateLead(l.id, { stage: 'presentation' }, 'Anna');
    assert.equal(await seen(), 'in progress', 'not "Presentation" — how we work a deal is ours');
    await store.updateLead(l.id, { stage: 'contract' }, 'Anna');
    assert.equal(await seen(), 'reserved');
    await store.updateLead(l.id, { stage: 'won' }, 'Anna');
    assert.equal(await seen(), 'completed');
  });

  it('nothing at all about a lead we archived', async () => {
    const l = await store.createManualLead({ name: 'Set Aside', email: 'sa@example.com' }, 'Anna');
    await store.registerAgency(l.id, milan, 90, {}, 'Anna');
    await store.archiveLead(l.id, 'Wrong number', 'Anna');

    const view = portal.portalLeads(milan, await store.listLeads({ archived: 'include' }), credited);
    assert.equal(view.some((v) => v.name === 'Set Aside'), false);
  });

  it('nothing it did not introduce, even where it recorded a claim over somebody else', async () => {
    /* A claim recorded over another agency's introduction is on our timeline.
       It is not their buyer, and showing it here would say we agree it is. */
    const contested = await store.createManualLead({ name: 'Contested', email: 'con@example.com' }, 'Anna');
    await store.registerAgency(contested.id, rival, 90, {}, 'Anna');
    await store.registerAgency(contested.id, milan, 90, { override: true }, 'Anna');

    const theirs = portal.portalLeads(milan, await store.listLeads(), credited);
    assert.equal(theirs.some((v) => v.name === 'Contested'), false);
    const first = portal.portalLeads(rival, await store.listLeads(), credited);
    assert.equal(first.some((v) => v.name === 'Contested'), true, 'it stays with whoever introduced them');
  });

  it('the fields it gave us, and no others', async () => {
    const view = portal.portalLeads(milan, await store.listLeads(), credited);
    for (const row of view) {
      assert.deepEqual(
        Object.keys(row).sort(),
        ['broker', 'name', 'protectedUntil', 'registeredAt', 'status', 'villa'].sort(),
        'adding a field to the portal has to be a decision somebody makes',
      );
    }
  });
});
