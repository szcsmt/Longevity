import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* The head of sales' figures.

   Most of this was already being computed and thrown away: the store worked out
   source-by-source win rates on every call and no page rendered them, and the
   funnel counted stages but never the drop between them — the only part anybody
   acts on.

   The tests that matter here are the ones about honesty. A lost deal reached
   the stages it passed through, so it must not evaporate out of the funnel. A
   source with nothing decided yet has no win rate, and printing 0% would libel
   a campaign that is simply young. And the lost-stage column under-counts for
   everything lost before the CRM recorded it, which the screen has to say out
   loud rather than quietly. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-perf-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');
const { performance, UNASSIGNED } = await import('../lib/crm/performance');
import type { Lead } from '../lib/crm/types';

after(() => rmSync(dir, { recursive: true, force: true }));

const today = new Date().toISOString().slice(0, 10);
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

/* Hand-built leads rather than the store: these tests are about arithmetic over
   a known shape, and a fixture that says exactly what it contains beats one
   assembled by twenty mutations. */
let n = 0;
const lead = (over: Partial<Lead> = {}): Lead => ({
  id: `p${++n}`,
  stage: 'new',
  score: 'warm',
  notes: [],
  tasks: [],
  created_at: at(30),
  updated_at: at(1),
  ...over,
});

describe('the funnel', () => {
  it('counts reaching a stage, not sitting in it', () => {
    const p = performance([
      lead({ stage: 'new' }),
      lead({ stage: 'negotiation' }),
      lead({ stage: 'won' }),
    ], today);

    const reached = (id: string) => p.funnel.find((f) => f.stage === id)!.reached;
    assert.equal(reached('new'), 3);
    assert.equal(reached('qualified'), 2, 'the negotiation and the sale both got past qualification');
    assert.equal(reached('won'), 1);
  });

  it('does not let a lost deal evaporate out of the stages it passed through', () => {
    const p = performance([
      lead({ stage: 'lost', lost_from: 'presentation', lost_reason: 'price' }),
      lead({ stage: 'presentation' }),
    ], today);

    assert.equal(p.funnel.find((f) => f.stage === 'presentation')!.reached, 2);
    assert.equal(p.funnel.find((f) => f.stage === 'visit')!.reached, 0);
    assert.equal(p.funnel.find((f) => f.stage === 'presentation')!.lostHere, 1);
  });

  it('reports the drop from the previous stage, which is the number worth acting on', () => {
    const p = performance([
      lead({ stage: 'qualified' }),
      lead({ stage: 'qualified' }),
      lead({ stage: 'qualified' }),
      lead({ stage: 'presentation' }),
    ], today);

    assert.equal(p.funnel.find((f) => f.stage === 'qualified')!.reached, 4);
    assert.equal(p.funnel.find((f) => f.stage === 'presentation')!.ofPrevious, 25);
    assert.equal(p.funnel[0].ofPrevious, null, 'nothing comes before the first stage');
  });

  it('says how much of the lost-stage column it cannot account for', () => {
    const p = performance([
      lead({ stage: 'lost', lost_from: 'visit' }),
      lead({ stage: 'lost' }), // lost before the CRM recorded where
    ], today);

    assert.equal(p.lost, 2);
    assert.equal(p.lostStageKnown, 1);
  });
});

describe('time', () => {
  it('measures the cycle from arriving to sold', async () => {
    const sold = await store.createManualLead({ name: 'Cycle', email: 'cycle@example.com', villa: 'Residence L' });
    await store.updateLead(sold.id, { stage: 'won' }, 'Anna');
    const fetched = (await store.getLead(sold.id))!;
    fetched.created_at = at(40);

    const p = performance([fetched], today);
    assert.equal(p.cycleDays, 40);
  });

  it('measures first contact from arriving to a real conversation, not an automatic e-mail', async () => {
    const l = await store.createManualLead({ name: 'Speed', email: 'speed@example.com' });
    await store.setAwaitingReply(l.id, true);      // an e-mail went out — not contact
    await store.logTouch(l.id, 'call-missed', undefined, 'Anna'); // tried — not contact
    await store.logTouch(l.id, 'call', undefined, 'Anna');        // spoke to them
    const fetched = (await store.getLead(l.id))!;
    fetched.created_at = at(0.5); // twelve hours before the conversation

    const p = performance([fetched], today);
    assert.ok(p.firstContactHours !== null && p.firstContactHours >= 11 && p.firstContactHours <= 13);
  });

  it('has no answer rather than a wrong one when nobody has spoken to anybody', () => {
    const p = performance([lead(), lead()], today);
    assert.equal(p.firstContactHours, null);
    assert.equal(p.cycleDays, null);
  });
});

describe('who is producing', () => {
  it('gives the leads nobody owns their own row', () => {
    const p = performance([lead({ owner: 'Anna' }), lead()], today);
    assert.ok(p.bySalesperson.some((r) => r.name === UNASSIGNED));
  });

  it('counts only open qualified deals as pipeline', () => {
    const p = performance([
      lead({ owner: 'Anna', stage: 'negotiation', value: 10 }),
      lead({ owner: 'Anna', stage: 'contacted', value: 99 }),   // not qualified yet
      lead({ owner: 'Anna', stage: 'won', value: 50, villa: 'L' }), // no longer pipeline
      lead({ owner: 'Anna', stage: 'lost', value: 77 }),
    ], today);

    const anna = p.bySalesperson.find((r) => r.name === 'Anna')!;
    assert.equal(anna.pipelineValue, 10);
    assert.equal(anna.wonValue, 50);
    assert.equal(anna.conversion, 25);
  });
});

describe('which marketing produces buyers', () => {
  it('credits a source with a deal that qualified and was then lost', () => {
    const p = performance([
      lead({ source: 'meta', stage: 'lost', lost_from: 'negotiation' }),
      lead({ source: 'meta', stage: 'new' }),
    ], today);

    const meta = p.bySource.find((r) => r.source === 'meta')!;
    assert.equal(meta.leads, 2);
    assert.equal(meta.qualified, 1, 'it got all the way to a negotiation before it died');
  });

  it('has no win rate for a source with nothing decided, rather than 0%', () => {
    const p = performance([lead({ source: 'tiktok', stage: 'qualified' })], today);
    assert.equal(p.bySource.find((r) => r.source === 'tiktok')!.winRate, null);
  });

  it('files a lead with no source under direct', () => {
    const p = performance([lead()], today);
    assert.equal(p.bySource[0].source, 'direct');
  });

  it('folds the spellings of one channel into one row', () => {
    /* Four rows in a report with room for eight is how the channel producing
       the most stays invisible. */
    const p = performance([
      lead({ source: 'fb' }),
      lead({ source: 'Facebook' }),
      lead({ utm_source: 'FB_Ads' }),
      lead({ source: 'l.facebook.com' }),
    ], today);

    assert.equal(p.bySource.length, 1);
    assert.equal(p.bySource[0].source, 'facebook');
    assert.equal(p.bySource[0].label, 'Facebook');
    assert.equal(p.bySource[0].leads, 4);
  });

  it('says which raw values it folded in, so nothing hides inside Other', () => {
    const p = performance([lead({ source: 'samui-times' }), lead({ source: 'villa-collective' })], today);
    const other = p.bySource.find((r) => r.source === 'other')!;
    assert.deepEqual(other.raw, ['samui-times', 'villa-collective']);
  });
});

describe('why we lose', () => {
  it('reads the structured reason, not the note text', async () => {
    /* This used to be scraped out of "Lost: …" notes. A report that parses
       prose breaks the first time somebody types the note by hand. */
    const l = await store.createManualLead({ name: 'Gone', email: 'gone@example.com' });
    await store.updateLead(l.id, { stage: 'lost', lost_reason: 'price' }, 'Anna');
    await store.addNote(l.id, 'Lost: something a person typed by hand', 'Anna');
    const fetched = (await store.getLead(l.id))!;

    const p = performance([fetched], today);
    assert.equal(p.lostReasons.length, 1);
    assert.equal(p.lostReasons[0].reason, 'price');
    assert.equal(p.lostReasons[0].ofLost, 100);
  });

  it('shows the deals lost with no reason on record as exactly that', () => {
    const p = performance([lead({ stage: 'lost' })], today);
    assert.equal(p.lostReasons[0].reason, 'unrecorded');
    assert.equal(p.lostReasons[0].label, 'No reason recorded');
  });
});

describe('the archive', () => {
  it('is outside every figure', () => {
    const p = performance([
      lead({ stage: 'won', value: 100, villa: 'L' }),
      lead({ stage: 'won', value: 100, villa: 'M', archived_at: at(1) }),
    ], today);

    assert.equal(p.total, 1);
    assert.equal(p.wonValue, 100);
  });
});

describe('one level down — campaigns and ads', () => {
  it('groups by campaign and says which channels it ran on', () => {
    const p = performance([
      lead({ source: 'fb', utm_campaign: 'spring-launch', stage: 'won', value: 12, villa: 'L' }),
      lead({ source: 'instagram', utm_campaign: 'spring-launch', stage: 'qualified' }),
      lead({ source: 'google', utm_campaign: 'search-brand' }),
    ], today);

    const spring = p.byCampaign.find((c) => c.campaign === 'spring-launch')!;
    assert.equal(spring.leads, 2);
    assert.equal(spring.won, 1);
    assert.equal(spring.wonValue, 12);
    assert.deepEqual(spring.channels, ['Facebook', 'Instagram']);
  });

  it('leaves untagged traffic out instead of inventing an "unknown" campaign', () => {
    /* A lead with no utm_campaign is not a campaign that performed badly, it is
       traffic nobody tagged. Mixing the two is how a report starts lying. */
    const p = performance([lead({ source: 'fb' }), lead({ source: 'fb', utm_campaign: 'x' })], today);
    assert.equal(p.byCampaign.length, 1);
    assert.equal(p.byCampaign[0].campaign, 'x');
  });

  it('has no campaign or ad tables at all until the links carry the tags', () => {
    const p = performance([lead(), lead()], today);
    assert.deepEqual(p.byCampaign, []);
    assert.deepEqual(p.byAd, []);
  });

  it('groups ads by utm_content and names the campaign behind them', () => {
    const p = performance([
      lead({ utm_campaign: 'spring-launch', utm_content: 'pool-video' }),
      lead({ utm_campaign: 'spring-launch', utm_content: 'pool-video', stage: 'won', value: 30, villa: 'L' }),
      lead({ utm_campaign: 'spring-launch', utm_content: 'sunset-still' }),
    ], today);

    assert.equal(p.byAd.length, 2);
    const best = p.byAd[0];
    assert.equal(best.ad, 'pool-video', 'the one that sold sorts first');
    assert.equal(best.campaign, 'spring-launch');
    assert.equal(best.wonValue, 30);
  });

  it('credits a source with a reservation that was later lost', () => {
    const p = performance([lead({ source: 'portal', stage: 'lost', lost_from: 'reserved' })], today);
    const row = p.bySource.find((r) => r.source === 'portal')!;
    assert.equal(row.reserved, 1, 'it did produce a reservation, whatever happened afterwards');
    assert.equal(row.winRate, 0, 'and it was decided, so the win rate is a real zero');
  });
});

describe('where the buyers are from', () => {
  it('reads the country off the dialling code when nobody has recorded one', () => {
    const p = performance([lead({ phone: '+36 30 111 2222' })], today);
    assert.equal(p.byCountry[0].code, 'HU');
    assert.equal(p.byCountry[0].name, 'Hungary');
  });

  it('lets a recorded country beat the phone number', () => {
    /* A British buyer calling from a Dubai number is not an Emirati, and the
       dialling code is exactly what gets that wrong. */
    const p = performance([lead({ phone: '+971 50 111 2222', country: 'GB' })], today);
    assert.equal(p.byCountry[0].code, 'GB');
  });

  it('leaves out a lead it cannot place, rather than inventing an "unknown" row', () => {
    const p = performance([lead({ email: 'someone@gmail.com' }), lead({ phone: '+36 30 111 2222' })], today);
    assert.equal(p.byCountry.length, 1, 'a row of leads we know nothing about tells nobody anything');
  });
});
