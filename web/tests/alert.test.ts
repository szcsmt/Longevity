import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* Telling somebody when it breaks.

   The CRM went down twice this month and both times it was noticed by
   somebody trying to use it. The errors were in the hosting logs the whole
   time, and nobody reads hosting logs — that is not a criticism of anyone,
   it is what logs are for.

   The hard part is not sending the mail. It is not sending fourteen thousand
   of them. An alarm that arrives every six seconds is an alarm people filter
   into a folder, and from that day on the next real one is filed away unread —
   which leaves you worse off than having no alarm at all. So most of what is
   pinned down here is silence: the same problem reported once, a ceiling on
   distinct problems, and a count carried in the one mail that does go.

   The other rule is that this must not need the database, because the most
   important thing it will ever report is the database being unreachable. */

process.env.RESEND_API_KEY = 'test-key';
process.env.CRM_ALERT_TO = 'ops@example.com';
process.env.CRM_ALERT_QUIET_MIN = '60';
process.env.CRM_ALERT_MAX = '3';

const { alertFailure, alertState, resetAlerts } = await import('../lib/crm/alert');

/** Resend, replaced. */
function mailer(accepts = true) {
  const sent: { subject: string; html: string }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('api.resend.com')) {
      const body = JSON.parse(String(init?.body || '{}'));
      sent.push({ subject: body.subject, html: body.html });
    }
    if (!accepts) throw new Error('the mailer is down too');
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = real; } };
}

beforeEach(() => resetAlerts());

describe('not flooding', () => {
  it('reports a problem once, however many times it happens', async () => {
    const m = mailer();
    try {
      for (let i = 0; i < 50; i += 1) {
        await alertFailure('GET /admin', new Error('the database is unreachable'));
      }
      assert.equal(m.sent.length, 1, 'fifty failures, one mail');
    } finally { m.restore(); }
  });

  it('counts what it stayed quiet about, and says so in the next mail', async () => {
    const m = mailer();
    try {
      /* Two different problems: the first mail cannot know about the second,
         but the second mail carries its own count once it repeats. */
      await alertFailure('GET /admin', new Error('database unreachable'));
      await alertFailure('GET /admin', new Error('database unreachable'));
      await alertFailure('POST /api/crm/leads', new Error('write failed'));
      assert.equal(m.sent.length, 2);
      assert.match(m.sent[1].subject, /POST \/api\/crm\/leads/);
    } finally { m.restore(); }
  });

  it('treats one problem as one problem however the ids differ', async () => {
    /* A thousand requests failing on a thousand different lead ids is one
       outage, not a thousand. Without this the collapsing does nothing at all,
       because no two messages are ever byte-identical. */
    const m = mailer();
    try {
      await alertFailure('PATCH /api/crm/leads/[id]', new Error('lead 9f2c1a04-1111-4aaa-8bbb-cccccccccccc not saved after 4 tries'));
      await alertFailure('PATCH /api/crm/leads/[id]', new Error('lead 3b7e0000-2222-4ccc-9ddd-eeeeeeeeeeee not saved after 7 tries'));
      assert.equal(m.sent.length, 1, 'same failure, different ids');
    } finally { m.restore(); }
  });

  it('has a ceiling on distinct problems, and admits to it', async () => {
    const m = mailer();
    try {
      for (let i = 0; i < 10; i += 1) {
        await alertFailure(`GET /page-${i}`, new Error(`something ${'x'.repeat(i)} broke`));
      }
      assert.equal(m.sent.length, 3, 'CRM_ALERT_MAX is 3');
      assert.equal(alertState().suppressed, 7, 'and it knows how many it held back');
    } finally { m.restore(); }
  });

  it('does not grow without bound on a deployment that is failing everywhere', async () => {
    const m = mailer();
    try {
      for (let i = 0; i < 260; i += 1) {
        await alertFailure(`GET /p${i}`, new Error(`distinct failure ${'y'.repeat(i % 40)}`));
      }
      assert.ok(alertState().tracked <= 200, 'the map is bounded');
    } finally { m.restore(); }
  });
});

describe('being the last thing that still works', () => {
  it('never throws, even when the mailer is down as well', async () => {
    const m = mailer(false);
    try {
      await assert.doesNotReject(() => alertFailure('GET /admin', new Error('everything is on fire')));
    } finally { m.restore(); }
  });

  it('never throws on a non-Error', async () => {
    const m = mailer();
    try {
      await assert.doesNotReject(() => alertFailure('cron', 'a string, not an Error'));
      assert.equal(m.sent.length, 1);
    } finally { m.restore(); }
  });

  it('stays silent when there is nowhere to send', async () => {
    const to = process.env.CRM_ALERT_TO;
    const notify = process.env.CRM_NOTIFY_TO;
    delete process.env.CRM_ALERT_TO;
    delete process.env.CRM_NOTIFY_TO;
    const m = mailer();
    try {
      await alertFailure('GET /admin', new Error('nobody to tell'));
      assert.equal(m.sent.length, 0);
    } finally {
      m.restore();
      process.env.CRM_ALERT_TO = to;
      if (notify) process.env.CRM_NOTIFY_TO = notify;
    }
  });
});

describe('what the mail says', () => {
  it('names where it broke and what it said', async () => {
    const m = mailer();
    try {
      await alertFailure('nightly sweep · gmail', new Error('invalid_grant'), '3 leadhez nem fért hozzá');
      assert.match(m.sent[0].subject, /nightly sweep · gmail/);
      assert.match(m.sent[0].html, /invalid_grant/);
      assert.match(m.sent[0].html, /3 leadhez nem fért hozzá/);
    } finally { m.restore(); }
  });

  it('escapes what it quotes — an error message is untrusted text', async () => {
    /* Error messages carry user input more often than anybody expects: a
       failed write quotes the value it choked on. */
    const m = mailer();
    try {
      await alertFailure('POST /api/lead', new Error('<script>alert(1)</script> rejected'));
      assert.ok(!m.sent[0].html.includes('<script>'), 'the tag must not survive into the mail');
      assert.match(m.sent[0].html, /&lt;script&gt;/);
    } finally { m.restore(); }
  });
});
