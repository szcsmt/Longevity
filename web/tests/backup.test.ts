import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* The nightly backup, and getting it back.

   Two things were wrong with it and they were the same thing seen twice: the
   whole customer database went out every night in the clear, and nothing
   could read it back. So the mailbox holding it was the softest copy of every
   buyer's phone number and negotiated price, and the file itself was a daily
   reminder of what you would lose rather than a way of not losing it.

   What these pin down is mostly refusal. A backup format that returns
   plausible nonsense when the passphrase is wrong, or that half-decodes a
   file that was truncated in transit, is worse than one that fails: you would
   restore it. */

const { decryptBackup, encryptBackup, isEncrypted, readSnapshot } = await import('../lib/crm/backup');

const SNAP = {
  version: 2 as const,
  taken_at: '2026-08-31T03:00:00.000Z',
  counts: { leads: 2 },
  leads: [
    { id: 'a', name: 'Márta Kovács', email: 'm@example.com', phone: '+36301234567' },
    { id: 'b', name: '陈伟', email: 'w@example.cn' },
  ],
  villas: { B12: { status: 'reserved', buyerName: 'Márta Kovács' } },
  villa_history: [], events: [], notes: [], agencies: [], blocklist: ['e:spam@example.com'],
};
const json = JSON.stringify(SNAP);

describe('sealing the nightly backup', () => {
  it('comes back exactly as it went in', () => {
    const sealed = encryptBackup(json, 'a good long passphrase');
    assert.equal(decryptBackup(sealed, 'a good long passphrase'), json);
  });

  it('survives a name that is not in the Latin alphabet', () => {
    /* The buyers are international and the file is base64 over UTF-8 — worth
       one test, because a backup that mangles a Chinese name is a backup that
       silently loses a customer. */
    const back = JSON.parse(decryptBackup(encryptBackup(json, 'pw'), 'pw'));
    assert.equal(back.leads[1].name, '陈伟');
  });

  it('does not read as the database from the outside', () => {
    const sealed = encryptBackup(json, 'pw');
    assert.ok(isEncrypted(sealed));
    assert.ok(!sealed.includes('Márta'), 'a name must not survive into the ciphertext');
    assert.ok(!sealed.includes('example.com'));
  });

  it('refuses the wrong passphrase instead of returning rubbish', () => {
    const sealed = encryptBackup(json, 'right');
    assert.throws(() => decryptBackup(sealed, 'wrong'), /Wrong passphrase/);
  });

  it('refuses a file that was altered on the way', () => {
    /* Authenticated encryption, deliberately: a backup that half-decodes into
       something plausible is the one failure that gets restored. */
    const sealed = encryptBackup(json, 'pw');
    const lines = sealed.split('\n');
    lines[1] = lines[1].slice(0, -6) + 'AAAAAA';
    assert.throws(() => decryptBackup(lines.join('\n'), 'pw'), /altered|passphrase/);
  });

  it('refuses a truncated file rather than restoring half a database', () => {
    const sealed = encryptBackup(json, 'pw');
    assert.throws(() => decryptBackup(sealed.slice(0, sealed.length - 40), 'pw'));
  });

  it('survives a mail client rewrapping the lines', () => {
    /* It is wrapped at 76 columns on the way out for exactly this reason, and
       all whitespace is stripped on the way back in. */
    const sealed = encryptBackup(json, 'pw');
    const mangled = sealed.replace(/\n/g, '\r\n').replace(/(.{40})/g, '$1\n');
    assert.equal(decryptBackup(mangled, 'pw'), json);
  });

  it('says which kind of file it was handed', () => {
    assert.throws(() => decryptBackup(json, 'pw'), /not an encrypted/);
    assert.ok(!isEncrypted(json));
  });
});

describe('reading a snapshot back', () => {
  it('reads a plain one, and a sealed one with the passphrase', () => {
    assert.equal(readSnapshot(json).leads.length, 2);
    assert.equal(readSnapshot(encryptBackup(json, 'pw'), 'pw').leads.length, 2);
  });

  it('asks for the passphrase rather than failing obscurely', () => {
    assert.throws(() => readSnapshot(encryptBackup(json, 'pw')), /passphrase is needed/);
  });

  it('refuses a file that parses but is not a snapshot', () => {
    /* Somebody will one day point this at the wrong JSON file, and the moment
       to say so is before the restore, not during it. */
    assert.throws(() => readSnapshot('{"hello":"world"}'), /does not look like a CRM snapshot/);
  });
});
