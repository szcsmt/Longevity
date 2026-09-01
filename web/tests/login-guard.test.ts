import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Slowing down somebody guessing.

   The login had a brake held in a module-level Map, which on a serverless
   deployment is one count per instance: an attacker spreading requests across
   them earned the limit again on each, and the harder they hit the site the
   more instances they were handed. The count is shared now.

   Two counters, and the second is the one worth having. Counting by address
   catches one machine working through a password list, which is the ordinary
   attack. Counting by account name catches the shape that actually threatens a
   five-person CRM: a thousand addresses trying `owner` once each, which no
   per-address counter will ever notice.

   The other half of the job is not locking out the people who work here. A
   mistyped password on Monday and another on Thursday must not add up. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-guard-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.CRM_LOGIN_MAX_FAILS = '3';
process.env.CRM_LOGIN_ACCOUNT_MAX = '5';
process.env.CRM_LOGIN_WINDOW_MIN = '10';
process.env.CRM_LOGIN_LOCK_MIN = '15';

const guard = await import('../lib/crm/login-guard');
const { getBackend } = await import('../lib/crm/backend');

after(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(async () => { await (await getBackend()).setSetting('crm_login_guard', {}); });

const fail = (ip: string, user: string) => guard.noteFailure(ip, user);
const check = (ip: string, user: string) => guard.checkLogin(ip, user);

describe('one machine working through a list', () => {
  it('is let in three times and then stopped', async () => {
    assert.equal((await check('1.1.1.1', 'owner')).allowed, true);
    await fail('1.1.1.1', 'owner');
    await fail('1.1.1.1', 'owner');
    assert.equal((await check('1.1.1.1', 'owner')).allowed, true, 'two failures is a typo');

    const third = await fail('1.1.1.1', 'owner');
    assert.equal(third.locked, true);

    const v = await check('1.1.1.1', 'owner');
    assert.equal(v.allowed, false);
    assert.equal(v.reason, 'address');
    assert.ok((v.retryAfter ?? 0) > 0, 'and it says when to come back');
  });

  it('does not stop everybody else on the same wifi from signing in', async () => {
    for (let i = 0; i < 3; i += 1) await fail('1.1.1.1', 'sales');
    assert.equal((await check('2.2.2.2', 'sales')).allowed, true);
  });
});

describe('a thousand machines trying one account', () => {
  it('is the attack a per-address counter cannot see, and this one can', async () => {
    /* Five different addresses, one each — under the address limit every time,
       and five failures against the same name. */
    for (let i = 0; i < 5; i += 1) await fail(`10.0.0.${i}`, 'owner');

    const v = await check('10.0.0.99', 'owner');
    assert.equal(v.allowed, false, 'a fresh address gets nowhere against a locked account');
    assert.equal(v.reason, 'account');
  });

  it('locks the account being guessed and not the ones that are not', async () => {
    for (let i = 0; i < 5; i += 1) await fail(`10.0.0.${i}`, 'owner');
    assert.equal((await check('10.0.0.99', 'sales')).allowed, true);
  });

  it('does not care how the name was capitalised', async () => {
    /* Otherwise "Owner", "OWNER" and "owner" are three separate budgets. */
    for (let i = 0; i < 5; i += 1) await fail(`10.1.0.${i}`, i % 2 ? 'Owner' : 'OWNER');
    assert.equal((await check('10.1.0.99', 'owner')).allowed, false);
  });
});

describe('not locking out the people who work here', () => {
  it('forgets a stale failure instead of adding to it', async () => {
    /* A typo on Monday and a typo on Thursday are not an attack. The window is
       reached by ageing the stored strike rather than by waiting. */
    await fail('3.3.3.3', 'sales');
    await fail('3.3.3.3', 'sales');
    const be = await getBackend();
    const book = (await be.getSetting<Record<string, { first: number }>>('crm_login_guard'))!;
    for (const s of Object.values(book)) s.first = Date.now() - 40 * 60_000;
    await be.setSetting('crm_login_guard', book);

    const next = await fail('3.3.3.3', 'sales');
    assert.equal(next.locked, false, 'the old strikes aged out — this one starts over');
    assert.equal((await check('3.3.3.3', 'sales')).allowed, true);
  });

  it('clears the slate the moment the right password arrives', async () => {
    await fail('4.4.4.4', 'sales');
    await fail('4.4.4.4', 'sales');
    await guard.noteSuccess('4.4.4.4', 'sales');
    /* Back to a full budget rather than one attempt from a lockout. */
    await fail('4.4.4.4', 'sales');
    await fail('4.4.4.4', 'sales');
    assert.equal((await check('4.4.4.4', 'sales')).allowed, true);
  });
});

describe('coming back for more', () => {
  it('locks for longer each time', async () => {
    for (let i = 0; i < 3; i += 1) await fail('5.5.5.5', 'owner');
    const first = (await check('5.5.5.5', 'owner')).retryAfter ?? 0;

    /* Serve the lockout, then keep guessing: somebody who does that is not
       making a typo. */
    const be = await getBackend();
    const book = (await be.getSetting<Record<string, { until?: number }>>('crm_login_guard'))!;
    for (const s of Object.values(book)) s.until = Date.now() - 1000;
    await be.setSetting('crm_login_guard', book);

    for (let i = 0; i < 3; i += 1) await fail('5.5.5.5', 'owner');
    const second = (await check('5.5.5.5', 'owner')).retryAfter ?? 0;
    assert.ok(second > first, `the second lockout must outlast the first (${first} → ${second})`);
  });
});

describe('when the store is unreachable', () => {
  it('lets the attempt through rather than locking everybody out', async () => {
    /* This looks like the wrong call for a security control and is not: the
       login cannot succeed without the same store either, because it has to
       write a session. Failing closed would bar the door of a building that is
       already shut. */
    const be = await getBackend();
    const real = be.getSetting;
    (be as { getSetting: unknown }).getSetting = async () => { throw new Error('database unreachable'); };
    try {
      assert.equal((await check('9.9.9.9', 'owner')).allowed, true);
      await assert.doesNotReject(() => fail('9.9.9.9', 'owner'));
    } finally {
      (be as { getSetting: unknown }).getSetting = real;
    }
  });
});
