import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Who the API actually lets in.

   The domain layer is thoroughly tested and the API routes were not tested at
   all — and the routes are where the permissions live. Fifty-three checks
   across nineteen of them, every one of them one deleted line away from
   handing the whole contact list to anybody who can sign in, with nothing to
   say so. `roleCan` has a unit test; that the export route ASKS it did not.

   The failure this guards against is not somebody writing a bad permission.
   It is somebody refactoring a route, dropping a guard by accident, and every
   existing test staying green — because every existing test talks to the store
   directly and never goes through the door.

   What follows drives the real handlers: it signs in as each role by minting a
   real session, puts the token in the cookie jar the route reads, and checks
   the number that comes back. 401 means "not signed in", 403 means "signed in,
   not allowed", and telling those two apart is most of the point. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-perm-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;          // nothing leaves the machine
delete process.env.PARTNER_WEBHOOK_URL;
delete process.env.RESEND_API_KEY;
/* One account per role, so a test can say "as an agent" and mean it. */
process.env.CRM_USER = 'owner';
process.env.CRM_PASSWORD = 'owner-pw';
process.env.CRM_USERS = 'boss:pw:head,sales:pw:agent,money:pw:finance,ads:pw:marketing';
process.env.CRM_VIEWERS = 'guest:pw';

const sessions = await import('../lib/crm/sessions');
const store = await import('../lib/crm/store');

const exportRoute = await import('../app/api/crm/export/route');
const backupRoute = await import('../app/api/crm/backup/route');
const sessionsRoute = await import('../app/api/crm/sessions/route');
const leadRoute = await import('../app/api/crm/leads/[id]/route');
const bulkRoute = await import('../app/api/crm/leads/bulk/route');
const villaRoute = await import('../app/api/crm/villas/route');
const dedupeRoute = await import('../app/api/crm/dedupe/route');
const notesRoute = await import('../app/api/crm/notes/route');
const agenciesRoute = await import('../app/api/crm/agencies/route');
const gmailConnect = await import('../app/api/crm/gmail/connect/route');
const gmailRoute = await import('../app/api/crm/gmail/route');
const googleRoute = await import('../app/api/crm/google/route');
const agencyRoute = await import('../app/api/crm/agencies/[id]/route');
const leadsRoute = await import('../app/api/crm/leads/route');
const offerRoute = await import('../app/api/crm/leads/[id]/offer/route');

after(() => rmSync(dir, { recursive: true, force: true }));

type Role = 'owner' | 'boss' | 'sales' | 'money' | 'ads' | 'guest' | null;

const jar = () => (globalThis as unknown as { __lrCookies?: Record<string, string> });

/** Sign the next call in as this account — or as nobody. */
async function as(who: Role): Promise<void> {
  if (!who) { jar().__lrCookies = {}; return; }
  const { token } = await sessions.startSession(who);
  jar().__lrCookies = { lr_crm: token };
}

const req = (url: string, init?: RequestInit) => new Request(`http://test${url}`, init);
const json = (url: string, body: unknown, method = 'POST') =>
  req(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

let leadId = '';
before(async () => {
  const lead = await store.createManualLead({ name: 'Perm Teszt', email: 'perm@example.com' });
  leadId = lead.id;
});
const params = () => ({ params: Promise.resolve({ id: leadId }) });

/** Run one call as each role and collect the status codes. */
async function statuses(call: () => Promise<Response>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const role of ['owner', 'boss', 'sales', 'money', 'ads', 'guest'] as const) {
    await as(role);
    out[role] = (await call()).status;
  }
  return out;
}

describe('nobody signed in', () => {
  it('is turned away from every route that touches customer data', async () => {
    await as(null);
    const calls: [string, () => Promise<Response>][] = [
      ['export',   () => exportRoute.GET(req('/api/crm/export'))],
      ['backup',   () => backupRoute.GET(req('/api/crm/backup'))],
      ['sessions', () => sessionsRoute.POST(json('/api/crm/sessions', { user: 'boss' }))],
      ['lead',     () => leadRoute.PATCH(json(`/api/crm/leads/${leadId}`, { op: 'addNote', body: 'x' }, 'PATCH'), params())],
      ['bulk',     () => bulkRoute.POST(json('/api/crm/leads/bulk', { ids: [leadId], action: 'archive' }))],
      ['villas',   () => villaRoute.PATCH(json('/api/crm/villas', { id: 'A1', status: 'free' }, 'PATCH'))],
      ['dedupe',   () => dedupeRoute.POST()],
      ['notes',    () => notesRoute.POST(json('/api/crm/notes', { title: 'x' }))],
    ];
    for (const [name, call] of calls) {
      assert.equal((await call()).status, 401, `${name} must refuse an anonymous caller`);
    }
  });
});

describe('the whole contact list, in one file', () => {
  it('is the owner and the head of sales, and nobody else', async () => {
    /* The export is the single most dangerous button in the CRM: every name,
       every phone number, on somebody's laptop, out of the building. Hiding it
       is not a control — this is. */
    const s = await statuses(() => exportRoute.GET(req('/api/crm/export')));
    assert.equal(s.owner, 200);
    assert.equal(s.boss, 200);
    assert.equal(s.sales, 403, 'a salesperson may work leads, not take them home');
    assert.equal(s.money, 403);
    assert.equal(s.ads, 403);
    assert.equal(s.guest, 403);
  });
});

describe("the owner's alone", () => {
  it('mails the entire database only for the owner', async () => {
    /* Without a mailer configured the route answers 503 — which is past the
       permission gate, and that is exactly what is being tested. Anyone else
       must not get that far. */
    const s = await statuses(() => backupRoute.GET(req('/api/crm/backup')));
    assert.equal(s.owner, 503, 'through the gate, stopped by the missing mailer');
    for (const role of ['boss', 'sales', 'money', 'ads', 'guest']) {
      assert.equal(s[role], 403, `${role} is signed in and still must not reach the backup`);
    }
  });

  it('cuts other people off only for the owner', async () => {
    const s = await statuses(() => sessionsRoute.POST(json('/api/crm/sessions', { user: 'nobody' })));
    assert.equal(s.owner, 200);
    for (const role of ['boss', 'sales', 'money', 'ads', 'guest']) {
      assert.equal(s[role], 403, `${role} must not sign other people out`);
    }
  });

  it('destroys a lead only for the owner', async () => {
    const s = await statuses(() =>
      leadRoute.DELETE(req(`/api/crm/leads/${leadId}?purge=1`, { method: 'DELETE' }), params()));
    assert.equal(s.boss, 403, 'even the head of sales cannot erase the record');
    assert.equal(s.sales, 403);
    assert.equal(s.guest, 403);
  });
});

describe('working a lead', () => {
  it('is the salespeople, and not the ones kept away from leads', async () => {
    const s = await statuses(() =>
      leadRoute.PATCH(json(`/api/crm/leads/${leadId}`, { op: 'addNote', body: 'hívtam' }, 'PATCH'), params()));
    assert.equal(s.owner, 200);
    assert.equal(s.boss, 200);
    assert.equal(s.sales, 200, 'this is the job');
    assert.equal(s.money, 403, 'finance keeps the ledger, not the conversation');
    assert.equal(s.ads, 403);
    assert.equal(s.guest, 403, 'a viewer changes nothing');
  });

  it('archiving is not a salesperson’s call', async () => {
    const s = await statuses(() =>
      bulkRoute.POST(json('/api/crm/leads/bulk', { ids: [leadId], action: 'archive' })));
    assert.equal(s.owner, 200);
    assert.equal(s.boss, 200);
    assert.equal(s.sales, 403, 'reversible, but still not theirs');
    assert.equal(s.guest, 403);
  });

  it('folding duplicates together is not either', async () => {
    const s = await statuses(() => dedupeRoute.POST());
    assert.equal(s.owner, 200);
    assert.equal(s.boss, 200);
    assert.equal(s.sales, 403);
    assert.equal(s.guest, 403);
  });
});

describe('the masterplan ledger', () => {
  it('is finance and the owner — not the people selling', async () => {
    /* money.write, deliberately: what a unit was sold for is a different
       question from who is talking to the buyer. */
    const s = await statuses(() => villaRoute.PATCH(json('/api/crm/villas', { id: 'A1', status: 'free' }, 'PATCH')));
    assert.equal(s.owner, 200);
    assert.equal(s.money, 200);
    assert.equal(s.boss, 403, 'the head of sales reads the money, and does not write it');
    assert.equal(s.sales, 403);
    assert.equal(s.ads, 403);
    assert.equal(s.guest, 403);
  });
});

describe('the agencies, and what they are paid', () => {
  it('is the owner alone — everyone else reads the list', async () => {
    /* Commission terms are what the business pays out. A head of sales who can
       reassign leads and export the list still does not set them. */
    const read = await statuses(() => agenciesRoute.GET(req('/api/crm/agencies')));
    assert.equal(read.boss, 200, 'reading who introduced whom is ordinary work');
    assert.equal(read.sales, 200);

    const write = await statuses(() =>
      agenciesRoute.POST(json('/api/crm/agencies', { name: `Teszt ${Math.random()}` })));
    assert.equal(write.owner, 200);
    assert.equal(write.boss, 403, 'not even the head of sales');
    assert.equal(write.sales, 403);
    assert.equal(write.money, 403);
    assert.equal(write.guest, 403);
  });
});

describe('connecting the sales mailbox', () => {
  it('is the owner’s, because it hands over every conversation in it', async () => {
    /* This route redirects rather than answering with a status, so the place
       it sends you IS the refusal — and the two refusals go to different
       places, which is the distinction worth keeping. */
    const where = async (role: Role) => {
      await as(role);
      const res = await gmailConnect.GET(req('/api/crm/gmail/connect'));
      return res.headers.get('location') || '';
    };
    assert.match(await where(null), /\/admin\/login/, 'not signed in → sign in');
    assert.match(await where('sales'), /gmail=denied/, 'signed in, and not theirs to connect');
    assert.match(await where('boss'), /gmail=denied/);
    assert.match(await where('guest'), /gmail=denied/);
    /* The owner gets past the gate and is stopped by the missing Google
       credentials instead, which is the next thing in the way. */
    assert.match(await where('owner'), /gmail=unconfigured/);
  });
});

describe('the project board', () => {
  it('is anybody who works leads, and not a viewer', async () => {
    const s = await statuses(() => notesRoute.POST(json('/api/crm/notes', { title: 'Teszt kártya' })));
    assert.equal(s.owner, 200);
    assert.equal(s.sales, 200, 'the board is shared work');
    assert.equal(s.guest, 403, 'a viewer changes nothing, here either');
  });
});

describe('the rest of the doors', () => {
  it('creating a lead by hand is for the people who take the calls', async () => {
    const s = await statuses(() =>
      leadsRoute.POST(json('/api/crm/leads', { name: 'Telefonos érdeklődő', phone: '+66812345678' })));
    assert.equal(s.owner, 200);
    assert.equal(s.sales, 200, 'a phone enquiry is a salesperson’s to record');
    assert.equal(s.money, 403);
    assert.equal(s.guest, 403);
  });

  it('the offer document needs the same right as working the lead', async () => {
    const s = await statuses(() =>
      offerRoute.GET(req(`/api/crm/leads/${leadId}/offer`), params()));
    assert.equal(s.sales, 200);
    assert.equal(s.guest, 403, 'a viewer does not issue offers');
  });

  it('disconnecting the mailbox is the owner’s, syncing it is not', async () => {
    /* Two different rights on one integration, and the difference is the
       point: pulling messages in is ordinary work, and cutting the CRM off
       from the mailbox — or connecting a new one — is not. */
    const sync = await statuses(() => gmailRoute.POST());
    assert.equal(sync.sales, 200, 'anyone working leads may pull the mailbox');
    assert.equal(sync.guest, 403);

    const cut = await statuses(() => gmailRoute.DELETE());
    assert.equal(cut.owner, 200);
    assert.equal(cut.boss, 403, 'disconnecting is not the head of sales’ call');
    assert.equal(cut.sales, 403);
  });

  it('the task list syncs for anybody who works leads', async () => {
    const s = await statuses(() => googleRoute.POST(json('/api/crm/google', {})));
    assert.equal(s.sales, 200);
    assert.equal(s.guest, 403);
  });

  it('changing an agency’s terms stays with the owner', async () => {
    const agency = await (await import('../lib/crm/partners')).createAgency({ name: `Perm ${Math.random()}` } as never);
    assert.ok(agency, 'the fixture agency has to exist for the test to mean anything');
    const p = () => ({ params: Promise.resolve({ id: agency.id }) });
    const s = await statuses(() =>
      agencyRoute.PATCH(json(`/api/crm/agencies/${agency.id}`, { op: 'update', patch: { commission_pct: 4 } }, 'PATCH'), p()));
    assert.equal(s.owner, 200);
    assert.equal(s.boss, 403);
    assert.equal(s.sales, 403);
    assert.equal(s.money, 403);
  });
});
