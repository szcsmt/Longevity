/* Read a nightly backup, and put it back.

   Usage:
     node --experimental-strip-types --import ./tests/register.mjs \
       scripts/crm-restore.ts <file> [options]

     --key=<passphrase>   the backup passphrase (default: $CRM_BACKUP_KEY)
     --out=<file>         decrypt to this file and stop — do not touch any database
     --apply              actually write (WITHOUT THIS IT ONLY REPORTS)
     --overwrite          replace records that already exist
                          (default: add what is missing, leave the rest alone)

   ── Why it reports first ──

   A restore runs on the worst day, in a hurry, by somebody who has not done
   it before. The default is therefore to change nothing and print what it
   WOULD do, including which database it is pointed at — because the mistake
   that costs the most here is not a failed restore, it is a successful one
   into the wrong place. Nothing is written until --apply, and even then an
   existing record is left alone unless --overwrite says otherwise.

   ── What it can and cannot bring back ──

   Everything the snapshot holds: leads with their whole history, the
   masterplan and its log, the project board, the agencies and their
   registrations, the interaction events, the blocked contacts.

   Not the settings — the backup deliberately leaves out the Gmail token, the
   live sessions and the access log. After a restore, sign in and reconnect
   the mailbox. That is a minute of work, and it is the price of a backup file
   that is not also a set of keys. */

import { readFileSync, writeFileSync } from 'node:fs';
import { getBackend, hasDatabase } from '../lib/crm/backend';
import { readSnapshot } from '../lib/crm/backup';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Melyik fájlt töltsem vissza? Használat: crm-restore.ts <fájl> [--apply]');
  process.exit(1);
}

const text = readFileSync(file, 'utf8');
const passphrase = flag('key') || process.env.CRM_BACKUP_KEY;

let snap;
try {
  snap = readSnapshot(text, passphrase);
} catch (err) {
  console.error(`\n✗ ${(err as Error).message}\n`);
  process.exit(1);
}

console.log(`\nMentés: ${file}`);
console.log(`Készült: ${snap.taken_at}`);
console.log('Tartalom:');
for (const [what, n] of Object.entries(snap.counts || {})) console.log(`   ${String(n).padStart(6)}  ${what}`);
console.log(`   ${String((snap.villa_history || []).length).padStart(6)}  villa_history`);

/* Decrypt-and-stop. The commonest reason to reach for a backup is not a
   restore at all — it is wanting to look at what was in it. */
const out = flag('out');
if (out) {
  writeFileSync(out, JSON.stringify(snap, null, 1));
  console.log(`\n✓ Kiírva olvasható formában: ${out}`);
  console.log('  Adatbázishoz nem nyúltam.\n');
  process.exit(0);
}

const backend = await getBackend();
const target = hasDatabase()
  ? `POSTGRES — ${(process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/:[^:@]+@/, ':***@').slice(0, 60)}…`
  : `helyi fájl — ${process.env.CRM_DATA_DIR || '~/.longevity-crm'}/db.json`;

const apply = has('apply');
const overwrite = has('overwrite');
console.log(`\nCélpont: ${target}`);
console.log(apply
  ? `Mód: ÍRÁS${overwrite ? ' — a meglévő rekordokat FELÜLÍRJA' : ' — csak a hiányzókat pótolja'}`
  : 'Mód: próba (semmit nem ír). Az írás kapcsolója: --apply');

const stat = { added: 0, replaced: 0, kept: 0, failed: 0 };
const step = async (label: string, fn: () => Promise<void>) => {
  process.stdout.write(`  ${label}… `);
  const before = { ...stat };
  await fn();
  console.log(
    `+${stat.added - before.added} új, ${stat.replaced - before.replaced} felülírt, ` +
    `${stat.kept - before.kept} érintetlen${stat.failed - before.failed ? `, ${stat.failed - before.failed} HIBA` : ''}`,
  );
};

console.log('');

await step('leadek', async () => {
  for (const lead of snap.leads || []) {
    const existing = await backend.getLead(lead.id);
    if (!existing) {
      if (apply) await backend.insertLead(lead);
      stat.added++;
    } else if (overwrite) {
      if (apply && !(await backend.saveLead({ ...lead, rev: (existing.rev || 0) + 1 }, existing.rev || 0))) stat.failed++;
      else stat.replaced++;
    } else stat.kept++;
  }
});

await step('villák', async () => {
  const current = await backend.getVillas();
  for (const [id, rec] of Object.entries(snap.villas || {})) {
    const existing = current[id];
    if (!existing) {
      if (apply) await backend.setVilla(id, rec, 0);
      stat.added++;
    } else if (overwrite) {
      if (apply) await backend.setVilla(id, { ...rec, rev: (existing.rev || 0) + 1 }, existing.rev || 0);
      stat.replaced++;
    } else stat.kept++;
  }
});

/* History and events are append-only, so a second run must not double them.
   Both are matched on id rather than on content — two visits a second apart
   look identical and are not. */
await step('villa-előzmény', async () => {
  const seen = new Set((await backend.getVillaHistory(100_000)).map((h) => h.id));
  for (const entry of snap.villa_history || []) {
    if (seen.has(entry.id)) { stat.kept++; continue; }
    if (apply) await backend.addVillaHistory(entry);
    stat.added++;
  }
});

await step('események', async () => {
  const seen = new Set((await backend.allEvents(100_000)).map((e) => e.id));
  for (const ev of snap.events || []) {
    if (seen.has(ev.id)) { stat.kept++; continue; }
    if (apply) await backend.insertEvent(ev);
    stat.added++;
  }
});

await step('jegyzetek', async () => {
  const seen = new Set((await backend.allNotes()).map((n) => n.id));
  for (const note of snap.notes || []) {
    if (seen.has(note.id) && !overwrite) { stat.kept++; continue; }
    if (apply) await backend.saveNote(note);
    seen.has(note.id) ? stat.replaced++ : stat.added++;
  }
});

await step('ügynökségek', async () => {
  const seen = new Set((await backend.allAgencies()).map((a) => a.id));
  for (const agency of snap.agencies || []) {
    if (seen.has(agency.id) && !overwrite) { stat.kept++; continue; }
    if (apply) await backend.saveAgency(agency);
    seen.has(agency.id) ? stat.replaced++ : stat.added++;
  }
});

await step('tiltólista', async () => {
  const seen = new Set(await backend.getBlocklist());
  const missing = (snap.blocklist || []).filter((k) => !seen.has(k));
  if (apply && missing.length) await backend.addToBlocklist(missing);
  stat.added += missing.length;
  stat.kept += (snap.blocklist || []).length - missing.length;
});

console.log('');
if (apply) {
  console.log(`✓ Kész. ${stat.added} rekord bekerült, ${stat.replaced} felülírva, ${stat.kept} érintetlen.`);
  if (stat.failed) console.log(`  ${stat.failed} rekordot nem sikerült írni (ütközés) — futtasd újra.`);
  console.log('  A beállítások nincsenek a mentésben: jelentkezz be, és kösd újra a postafiókot.\n');
} else {
  console.log(`Próba vége — semmit nem írtam. Ez történne: +${stat.added} új, ${stat.replaced} felülírt, ${stat.kept} érintetlen.`);
  console.log('Ha ez így jó: futtasd újra --apply kapcsolóval.\n');
}
