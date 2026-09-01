import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Sessions, password hashing and the access log.

   The three things being pinned here are the three that were wrong before.

   A session used to be sha256(name : password : a-salt-in-the-repository).
   It never expired, it was identical on every device, and it could be
   computed rather than only obtained — so "sign out" was advisory, "sign this
   laptop out" was impossible, and a leaked cookie was a permanent key. The
   tests below say: the token is random, the store keeps only its hash, ending
   a session ends it, and both clocks actually stop it.

   A password used to be readable in the environment, which is fine until the
   environment is a screenshot. Hashing is optional on purpose — nobody should
   be locked out of their own CRM by a migration — so plaintext has to keep
   working, and a HALF-migrated value has to fail closed rather than fall
   through to comparing the hash as if it were the password. That last one is
   the test worth having.

   The log is here because after something goes wrong it is the only thing
   that can say whose account it went wrong through. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-sec-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_SESSION_DAYS = '7';
process.env.CRM_SESSION_IDLE_HOURS = '12';
/* A known set of accounts, one of each kind: hashed, plaintext, read-only. */
process.env.CRM_PASSWORD = 'owner-secret';
process.env.CRM_USER = 'owner';

const auth = await import('../lib/crm/auth');
const sessions = await import('../lib/crm/sessions');
const audit = await import('../lib/crm/audit');
const { getBackend } = await import('../lib/crm/backend');

const HASHED = auth.hashPassword('hashed-secret');
process.env.CRM_USERS = `Jani:${HASHED}:admin,Plain:plain-secret:agent`;
process.env.CRM_VIEWERS = 'vendeg:guest-secret';

after(() => rmSync(dir, { recursive: true, force: true }));

describe('passwords', () => {
  it('accepts the right one, hashed or not', () => {
    assert.deepEqual(auth.verifyCredentials('Jani', 'hashed-secret'), { name: 'Jani', role: 'admin' });
    assert.deepEqual(auth.verifyCredentials('Plain', 'plain-secret'), { name: 'Plain', role: 'agent' });
    assert.deepEqual(auth.verifyCredentials('vendeg', 'guest-secret'), { name: 'vendeg', role: 'viewer' });
  });

  it('refuses the wrong one', () => {
    assert.equal(auth.verifyCredentials('Jani', 'plain-secret'), null);
    assert.equal(auth.verifyCredentials('Jani', ''), null);
    assert.equal(auth.verifyCredentials('nobody', 'hashed-secret'), null);
  });

  it('never accepts the hash itself as the password', () => {
    /* The failure that would make hashing worse than useless: if the stored
       value were compared as plaintext too, then anyone who read the
       environment could sign in by pasting what they read. */
    assert.equal(auth.verifyCredentials('Jani', HASHED), null);
  });

  it('fails closed on a malformed hash rather than comparing it literally', () => {
    const before = process.env.CRM_USERS;
    process.env.CRM_USERS = 'Broken:scrypt$notahash:admin';
    assert.equal(auth.verifyCredentials('Broken', 'scrypt$notahash'), null);
    assert.equal(auth.verifyCredentials('Broken', 'anything'), null);
    process.env.CRM_USERS = before;
  });

  it('takes an owner from its own variable, so adding one cannot erase the others', () => {
    /* CRM_USERS is stored as a sensitive value and cannot be read back —
       rightly. Adding one account to it therefore means retyping every account
       it already holds, from memory, and a slip costs somebody their login.
       One short variable per kind of account is what makes that safe. */
    const before = process.env.CRM_ADMINS;
    process.env.CRM_ADMINS = `boss:${auth.hashPassword('owner-pw-2')}`;
    assert.deepEqual(auth.verifyCredentials('boss', 'owner-pw-2'), { name: 'boss', role: 'admin' });
    assert.equal(auth.verifyCredentials('boss', 'wrong'), null);
    /* And the accounts in the other variables are untouched by its presence. */
    assert.deepEqual(auth.verifyCredentials('Jani', 'hashed-secret'), { name: 'Jani', role: 'admin' });
    assert.deepEqual(auth.verifyCredentials('vendeg', 'guest-secret'), { name: 'vendeg', role: 'viewer' });
    if (before === undefined) delete process.env.CRM_ADMINS; else process.env.CRM_ADMINS = before;
  });

  it('reports which accounts are still readable in the environment', () => {
    const list = auth.listAccounts();
    assert.equal(list.find((a) => a.name === 'Jani')?.hashed, true);
    assert.equal(list.find((a) => a.name === 'Plain')?.hashed, false);
  });
});

describe('sessions', () => {
  it('mints a token that is not stored anywhere', async () => {
    const { token, id } = await sessions.startSession('Jani', { ip: '1.2.3.4', agent: 'Chrome' });
    assert.ok(token.length >= 40);
    const stored = await (await getBackend()).getSetting<{ hash: string }[]>('crm_sessions');
    assert.ok(stored!.every((s) => s.hash !== token), 'the raw token must never be written down');
    assert.ok(await sessions.sessionFor(token));
    await sessions.revokeSession(id);
  });

  it('does not recognise a token it never issued', async () => {
    assert.equal(await sessions.sessionFor('made-up-token'), null);
    assert.equal(await sessions.sessionFor(undefined), null);
    assert.equal(await sessions.sessionFor(''), null);
  });

  it('ends when told to, and the token stops working', async () => {
    const { token } = await sessions.startSession('Jani');
    assert.ok(await sessions.sessionFor(token));
    await sessions.endSession(token);
    assert.equal(await sessions.sessionFor(token), null);
  });

  it('cuts off every device belonging to one person', async () => {
    const a = await sessions.startSession('Plain');
    const b = await sessions.startSession('Plain');
    const other = await sessions.startSession('Jani');
    const count = await sessions.revokeAllFor('plain');   // name match is case-insensitive
    assert.equal(count, 2);
    assert.equal(await sessions.sessionFor(a.token), null);
    assert.equal(await sessions.sessionFor(b.token), null);
    assert.ok(await sessions.sessionFor(other.token), 'somebody else must be left alone');
    await sessions.endSession(other.token);
  });

  it('expires on both clocks', async () => {
    const backend = await getBackend();
    const { token } = await sessions.startSession('Jani');
    const list = await backend.getSetting<Record<string, string>[]>('crm_sessions');
    const row = list!.find((s) => s.user === 'Jani')!;

    /* Idle: signed in an hour ago, untouched for a day. */
    const idle = { ...row, started: new Date(Date.now() - 3600_000).toISOString(),
      seen: new Date(Date.now() - 26 * 3600_000).toISOString() };
    await backend.setSetting('crm_sessions', [idle]);
    assert.equal(await sessions.sessionFor(token), null, 'idle sessions must not survive');

    /* Absolute: used a minute ago, but issued a month back. A token still
       working four weeks later is not a session, it is a second password. */
    const old = { ...row, started: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      seen: new Date().toISOString() };
    await backend.setSetting('crm_sessions', [old]);
    assert.equal(await sessions.sessionFor(token), null, 'old sessions must not survive');

    await backend.setSetting('crm_sessions', []);
  });

  it('prunes what has expired instead of hoarding it', async () => {
    const backend = await getBackend();
    await backend.setSetting('crm_sessions', [
      { id: 'dead', hash: 'x', user: 'Jani',
        started: new Date(Date.now() - 40 * 86_400_000).toISOString(),
        seen: new Date(Date.now() - 40 * 86_400_000).toISOString() },
    ]);
    const { token } = await sessions.startSession('Jani');
    const live = await sessions.listSessions();
    assert.equal(live.length, 1);
    assert.equal(live[0].user, 'Jani');
    await sessions.endSession(token);
  });
});

describe('the access log', () => {
  it('records what left, and reads back newest first', async () => {
    await audit.audit({ actor: 'Jani', action: 'login', ip: '1.2.3.4' });
    await audit.audit({ actor: 'Jani', action: 'export.csv', detail: '25 leads' });
    const log = await audit.readAudit(10);
    assert.equal(log[0].action, 'export.csv');
    assert.equal(log[0].detail, '25 leads');
    assert.equal(log[1].action, 'login');
    assert.equal(log[1].ip, '1.2.3.4');
  });

  it('counts recent failures, and only the recent ones', async () => {
    await audit.audit({ actor: 'Jani', action: 'login.failed', ip: '9.9.9.9' });
    await audit.audit({
      actor: 'Jani', action: 'login.failed', ip: '9.9.9.9',
      at: new Date(Date.now() - 48 * 3600_000).toISOString(),
    });
    const recent = await audit.recentFailures(24);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].ip, '9.9.9.9');
  });

  it('reads the caller address through the proxy, taking the client hop', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.9, 70.41.3.18', 'user-agent': 'Mozilla/5.0' },
    });
    assert.deepEqual(audit.clientInfo(req), { ip: '203.0.113.9', agent: 'Mozilla/5.0' });
  });
});
