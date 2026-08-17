import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Archive, not delete.

   The failure this guards against is quiet rather than loud. Nothing crashes if
   an archived lead is left in a count: a conversion rate is simply wrong, and
   the sequence keeps writing to somebody the operator set aside. So most of
   these tests are about ABSENCE — the lead must be gone from every aggregate —
   plus the two things that must survive: the timeline, and a returning
   contact's own record. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-archive-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.RESEND_API_KEY;      // nothing may leave the machine
delete process.env.CRM_AUTO_FROM;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en;Bence|bence@example.com||en';

const store = await import('../lib/crm/store');

after(() => rmSync(dir, { recursive: true, force: true }));

const mk = (name: string, email: string) =>
  store.createManualLead({ name, email, note: `first contact with ${name}` });

describe('archiving a lead', () => {
  let id = '';

  before(async () => {
    const lead = await mk('Archie Test', 'archie@example.com');
    id = lead.id;
    await store.addNote(id, 'Spoke on the phone, wants a sea view', 'Anna');
    await store.updateLead(id, { stage: 'contacted' }, 'Anna');
    await store.archiveLead(id, 'Wrong number', 'Anna');
  });

  it('records when, who and why', async () => {
    const lead = await store.getLead(id);
    assert.ok(lead?.archived_at, 'archived_at must be set');
    assert.equal(lead?.archived_by, 'Anna');
    assert.equal(lead?.archive_reason, 'Wrong number');
  });

  it('keeps the whole timeline', async () => {
    const lead = await store.getLead(id);
    const bodies = lead!.notes.map((n) => n.body);
    assert.ok(bodies.some((b) => b.includes('sea view')), 'the note must survive');
    assert.ok(bodies.some((b) => b.includes('first contact')), 'the opening note must survive');
    const kinds = (lead!.history || []).map((h) => h.kind);
    assert.ok(kinds.includes('created'), 'creation must survive');
    assert.ok(kinds.includes('stage'), 'the stage move must survive');
    assert.ok(kinds.includes('archived'), 'the archiving itself is on the record');
  });

  it('is still reachable by its own link', async () => {
    assert.ok(await store.getLead(id), 'a direct link must still open it');
  });

  it('is gone from the lead list', async () => {
    const ids = (await store.listLeads()).map((l) => l.id);
    assert.ok(!ids.includes(id));
  });

  it('is gone from the counts', async () => {
    const s = await store.stats();
    const listed = (await store.listLeads()).length;
    assert.equal(s.total, listed, 'stats must count exactly what the list shows');
  });

  it('is gone from the reports', async () => {
    const r = await store.reports();
    const inSources = r.bySource.reduce((n, x) => n + x.total, 0);
    assert.equal(inSources, (await store.listLeads()).length);
  });

  it('is gone from the attention counts', async () => {
    // It was contacted and left with no next step, so a live copy of this lead
    // would appear here. It must not.
    const before = (await store.attentionCounts()).actionable;
    await store.unarchiveLead(id, 'Anna');
    const withIt = (await store.attentionCounts()).actionable;
    await store.archiveLead(id, 'Wrong number', 'Anna');
    assert.ok(withIt > before, 'restoring it must change the badge, proving it was excluded');
  });

  it('is gone from the tasks list', async () => {
    await store.unarchiveLead(id, 'Anna');
    await store.addTask(id, 'Call back', undefined, 'Anna');
    const withIt = (await store.allTasks()).filter((t) => t.leadId === id).length;
    assert.equal(withIt, 1);
    await store.archiveLead(id, 'Wrong number', 'Anna');
    const without = (await store.allTasks()).filter((t) => t.leadId === id).length;
    assert.equal(without, 0, 'an archived lead brings no tasks to the worklist');
  });

  it('is excluded from the sequence, so no further e-mail can go to it', async () => {
    const { dueStep } = await import('../lib/crm/sequence');
    const lead = await store.getLead(id);
    // Belt and braces: the engine reads listLeads, which excludes it, and the
    // timetable itself would refuse a lead with no welcome on file.
    assert.equal(dueStep(lead!), null);
    const ids = (await store.listLeads()).map((l) => l.id);
    assert.ok(!ids.includes(id), 'the engine iterates listLeads');
  });

  it('does not count as somebody’s workload', async () => {
    const { pickOwner } = await import('../lib/crm/agents');
    const live = await store.listLeads();
    assert.ok(!live.some((l) => l.id === id));
    // With the archived lead excluded, both agents are equally free, so the
    // roster order decides — a lead nobody is really working cannot skew this.
    assert.equal(pickOwner(live, 'en'), pickOwner(live.filter((l) => l.id !== id), 'en'));
  });

  it('shows up when the archive is asked for, and only then', async () => {
    // A live lead alongside it, or "include means everything" proves nothing.
    const live = await mk('Live Beside It', 'beside@example.com');

    const only = await store.listLeads({ archived: 'only' });
    assert.deepEqual(only.map((l) => l.id), [id], 'only the archived one');

    const all = await store.listLeads({ archived: 'include' });
    assert.ok(all.some((l) => l.id === id), 'the archived one is in');
    assert.ok(all.some((l) => l.id === live.id), 'and so is the live one');

    const excluded = await store.listLeads();
    assert.equal(all.length, excluded.length + only.length, 'include is exactly live plus archived');
  });

  it('restores completely', async () => {
    await store.unarchiveLead(id, 'Bence');
    const lead = await store.getLead(id);
    assert.equal(lead?.archived_at, undefined);
    assert.equal(lead?.archived_by, undefined);
    assert.equal(lead?.archive_reason, undefined);
    assert.ok((await store.listLeads()).some((l) => l.id === id), 'back in the list');
    assert.ok(
      (lead!.history || []).some((h) => h.detail === 'Restored from the archive'),
      'the restore is on the record too',
    );
    await store.archiveLead(id, 'Wrong number', 'Anna');
  });
});

describe('a returning contact', () => {
  it('comes back out of the archive instead of becoming a second record', async () => {
    const lead = await mk('Returning Buyer', 'returning@example.com');
    await store.archiveLead(lead.id, 'Went quiet', 'Anna');

    const { lead: found, created } = await store.upsertLeadFromPayload(
      { email: 'returning@example.com', form_type: 'enquiry', source: 'website' },
      'Actually, I am interested again',
    );

    assert.equal(created, false, 'no second record may appear');
    assert.equal(found.id, lead.id);
    assert.equal(found.archived_at, undefined, 'writing to us brings them back');
    assert.ok(
      (found.history || []).some((h) => h.detail.includes('they made contact again')),
      'and the revival is on the record',
    );
  });
});

describe('permanent deletion', () => {
  it('refuses a lead that is not archived', async () => {
    const lead = await mk('Still Live', 'live@example.com');
    assert.equal(await store.purgeLead(lead.id), 'not-archived');
    assert.ok(await store.getLead(lead.id), 'and leaves it exactly where it was');
  });

  it('goes through once the lead is archived', async () => {
    const lead = await mk('To Be Erased', 'erase@example.com');
    await store.archiveLead(lead.id, 'Erasure request', 'Anna');
    assert.equal(await store.purgeLead(lead.id), 'purged');
    assert.equal(await store.getLead(lead.id), null);
  });

  it('reports an unknown id rather than pretending', async () => {
    assert.equal(await store.purgeLead('no-such-lead'), 'not-found');
  });
});

describe('merging a duplicate', () => {
  it('archives the husk with a note saying where it went, rather than deleting it', async () => {
    const primary = await mk('Dup Primary', 'dup@example.com');
    const second = await store.upsertLeadFromPayload(
      { email: 'dup+other@example.com', phone: '+66 81 000 1111', name: 'Dup Primary' },
    );
    // Give them a shared phone so they are a genuine duplicate pair.
    await store.updateLead(primary.id, { phone: '+66 81 000 1111' }, 'Anna');
    await store.addNote(second.lead.id, 'Said he saw the listing on a portal', 'Bence');

    const merged = await store.mergeLeads(primary.id, second.lead.id, 'Anna');
    assert.ok(merged, 'the merge must succeed');

    const husk = await store.getLead(second.lead.id);
    assert.ok(husk, 'the husk must still exist');
    assert.ok(husk!.archived_at, 'archived, not deleted');
    assert.match(husk!.archive_reason || '', /Merged into/);

    assert.ok(
      merged!.notes.some((n) => n.body.includes('saw the listing on a portal')),
      'the note moved across',
    );
  });

  it('does not offer the husk up as a duplicate again', async () => {
    /* The husk shares its phone with the lead it was folded into, so before the
       archive existed this pair would be reported as a duplicate for ever, and
       every run of "merge duplicates" would find work to do. */
    const report = await store.dedupeReport();
    assert.equal(report.groups, 0, `expected no duplicates left, got ${report.groups}: ${report.sample.join(', ')}`);
    assert.equal(report.extras, 0);
  });
});
