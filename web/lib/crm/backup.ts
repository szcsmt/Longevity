import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { Agency, CrmEvent, Lead, ProjectNote, VillaHistoryEntry, VillaRecord } from './types';

/* ══════════════════ The nightly snapshot, and getting it back ══════════════════

   The backup went out every night as a plain JSON attachment: every lead,
   every phone number, every note, every negotiated price, readable by anyone
   who could read the mailbox. It was the largest way the customer database
   could leave this system, and no firewall touches it, because the data walks
   out by design. One compromised inbox — or one wrong address in
   CRM_NOTIFY_TO — and the whole thing is gone.

   And the other half was worse in a quieter way: nothing could read it back.
   The route's own comment promised that "any one of them can restore the
   CRM", and no code anywhere could. A backup you cannot restore is not a
   backup; it is a daily reminder of what you would lose.

   So: the attachment is encrypted with a passphrase the mailbox does not
   have, and scripts/crm-restore.ts reads it.

   ── The format ──

   A header and a body, both text, because an attachment gets forwarded,
   copied into chat windows and pasted into terminals, and binary does not
   survive any of that. The header also means somebody looking at the file can
   tell at a glance that it is encrypted rather than corrupt.

       LRCRM1.<salt-hex:32>.<iv-hex:24>.<tag-hex:32>
       <base64 ciphertext>

   Every field is a fixed length, and reading strips ALL whitespace before it
   parses anything. That is not tidiness: mail clients rewrap long lines, and
   the header is ninety-seven characters — long enough to be broken in half by
   one, which would have made the file unreadable on exactly the day it
   mattered. With fixed widths the layout is recoverable however the text has
   been folded.

   scrypt for the key and AES-256-GCM for the payload, both from Node's own
   crypto. A backup format whose first requirement is "install this library"
   is a backup format that fails on the day you need it, on a laptop that is
   not the usual one. GCM rather than CBC so that a truncated or edited file
   is REFUSED rather than half-decoded into plausible nonsense.

   ── The thing to be honest about ──

   Encryption moves the risk rather than removing it. Lose the passphrase and
   the backups are gone as surely as if they had never been written. It lives
   in CRM_BACKUP_KEY, and it belongs in a password manager as well, because
   the day you need a backup is quite likely a day the Vercel account is part
   of the problem. */

const MAGIC = 'LRCRM1';
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
/* MAGIC + '.' + salt + '.' + iv + '.' + tag, all hex, all fixed width. */
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN * 2 + 1 + IV_LEN * 2 + 1 + TAG_LEN * 2;

/** What a snapshot holds. Everything the business would have to re-create by
    hand, and deliberately none of its credentials — see `snapshotOf`. */
export interface Snapshot {
  version: 2;
  taken_at: string;
  counts: Record<string, number>;
  leads: Lead[];
  villas: Record<string, VillaRecord>;
  villa_history: VillaHistoryEntry[];
  events: CrmEvent[];
  notes: ProjectNote[];
  agencies: Agency[];
  blocklist: string[];
}

export const isEncrypted = (text: string): boolean => text.trimStart().startsWith(`${MAGIC}.`);

/** Encrypt a snapshot for the mailbox. */
export function encryptBackup(plaintext: string, passphrase: string): string {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = scryptSync(passphrase, salt, KEY_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = [MAGIC, salt.toString('hex'), iv.toString('hex'), tag.toString('hex')].join('.');
  /* 6 + 1 + 32 + 1 + 24 + 1 + 32 — see HEADER_LEN, which the reader relies on. */
  /* Wrapped at 76 columns: some mail clients rewrap long lines, and a
     rewrapped base64 blob that cannot be read is a backup that was there and
     is not any more. Newlines are stripped on the way back in. */
  const wrapped = body.toString('base64').replace(/(.{76})/g, '$1\n');
  return `${header}\n${wrapped}\n`;
}

/** Read one back. Throws with a sentence a person can act on. */
export function decryptBackup(text: string, passphrase: string): string {
  /* Whitespace first, before anything is measured: whatever forwarded this
     file was free to fold it wherever it liked. */
  const flat = text.replace(/\s+/g, '');
  if (!flat.startsWith(`${MAGIC}.`)) {
    throw new Error('This file is not an encrypted Longevity backup (no LRCRM1 header).');
  }
  if (flat.length <= HEADER_LEN) throw new Error('The backup has a header but no contents.');

  const [, saltHex, ivHex, tagHex] = flat.slice(0, HEADER_LEN).split('.');
  if (saltHex?.length !== SALT_LEN * 2 || ivHex?.length !== IV_LEN * 2 || tagHex?.length !== TAG_LEN * 2) {
    throw new Error('The backup header is damaged.');
  }

  const key = scryptSync(passphrase, Buffer.from(saltHex, 'hex'), KEY_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const body = Buffer.from(flat.slice(HEADER_LEN), 'base64');
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    /* GCM refuses rather than returning nonsense, and the two reasons it
       refuses are worth separating in the reader's head even though the
       library cannot tell them apart. */
    throw new Error('Wrong passphrase, or the file was altered in transit.');
  }
}

/** Parse a snapshot, from either an encrypted or a plain file. */
export function readSnapshot(text: string, passphrase?: string): Snapshot {
  const json = isEncrypted(text.trim())
    ? decryptBackup(text, passphrase || (() => { throw new Error('This backup is encrypted — a passphrase is needed (CRM_BACKUP_KEY).'); })())
    : text;
  const data = JSON.parse(json) as Snapshot;
  if (!Array.isArray(data.leads) || typeof data.villas !== 'object') {
    throw new Error('The file parsed, but it does not look like a CRM snapshot.');
  }
  return data;
}
