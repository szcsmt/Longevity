import { currentAccount, isAdmin, isAuthed } from '@/lib/crm/auth';
import { audit, clientInfo } from '@/lib/crm/audit';
import { alertFailure } from '@/lib/crm/alert';
import { blockedContacts, getVillaData, listEvents, listLeads, listNotes } from '@/lib/crm/store';
import { listAgencies } from '@/lib/crm/partners';
import { encryptBackup, type Snapshot } from '@/lib/crm/backup';

export const dynamic = 'force-dynamic';

/* Daily full backup, mailed to CRM_NOTIFY_TO. Triggered by Vercel Cron
   (Authorization: Bearer CRON_SECRET) or manually by an admin. A deleted lead
   or a bad merge stops being fatal the day this runs first: yesterday's
   snapshot is always sitting in the mailbox.

   Two things were wrong with it, and both are fixed here rather than in the
   mailbox. It went out in the clear, which made the inbox holding it the
   softest copy of the entire customer database. And it was not actually full:
   the project board, the agencies that decide who gets paid, and the blocked
   contacts were all missing, so a restore would have quietly lost them.

   The passphrase lives in CRM_BACKUP_KEY. Without one the backup still goes
   out — a missing backup is worse than a readable one — but it says so, in
   the subject line and in the mail, because a warning nobody sees is a
   warning that does not exist. */
export async function GET(req: Request) {
  const bearer = req.headers.get('authorization');
  const cronOk = Boolean(process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`);
  /* Two different refusals, said apart: a caller with no session is told to
     sign in, and a signed-in salesperson is told this is not theirs. Answering
     401 to both sent somebody who WAS signed in back to the login page, where
     signing in again would change nothing. */
  if (!cronOk) {
    if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
    if (!(await isAdmin())) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CRM_NOTIFY_TO;
  if (!key || !to) {
    return Response.json({ ok: false, error: 'mailer not configured' }, { status: 503 });
  }

  const [leads, villaData, events, notes, agencies, blocklist] = await Promise.all([
    /* Everything, archived included. A backup that quietly omits the records
       somebody set aside is not a backup — and those are exactly the ones with
       no other copy anywhere. */
    listLeads({ archived: 'include' }),
    getVillaData(),
    listEvents(500),
    listNotes(),
    /* Archived agencies too: their registrations are evidence about who
       introduced which buyer, and that outlives the relationship. */
    listAgencies({ archived: 'include' }),
    blockedContacts(),
  ]);

  const snapshot: Snapshot = {
    version: 2,
    taken_at: new Date().toISOString(),
    counts: {
      leads: leads.length,
      villas: Object.keys(villaData.villas).length,
      events: events.length,
      notes: notes.length,
      agencies: agencies.length,
      blocked: blocklist.length,
    },
    leads,
    villas: villaData.villas,
    villa_history: villaData.history,
    events,
    notes,
    agencies,
    blocklist,
  };

  /* Settings are deliberately NOT here. That corner holds the Gmail refresh
     token, the live sessions and the access log — credentials and audit, not
     the business's records. A backup should be something you can hand to
     whoever is rebuilding the system without also handing them the keys, and
     the things left out are all re-established by signing in again. */

  const json = JSON.stringify(snapshot, null, 1);
  const day = snapshot.taken_at.slice(0, 10);
  const passphrase = (process.env.CRM_BACKUP_KEY || '').trim();
  const sealed = passphrase.length > 0;
  const payload = sealed ? encryptBackup(json, passphrase) : json;
  const filename = sealed ? `crm-backup-${day}.lrb` : `crm-backup-${day}.json`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CRM_NOTIFY_FROM || 'Longevity CRM <onboarding@resend.dev>',
      to: [to],
      subject: sealed
        ? `CRM mentés — ${day} (${leads.length} lead, titkosítva)`
        : `⚠ CRM mentés — ${day} (${leads.length} lead, TITKOSÍTATLAN)`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">
        <p>A CRM napi mentése csatolva.</p>
        <p>${leads.length} lead · ${Object.keys(villaData.villas).length} villa · ${notes.length} jegyzet · ${agencies.length} ügynökség</p>
        ${sealed
          ? `<p>A fájl titkosítva van. Visszatölteni a <code>CRM_BACKUP_KEY</code> jelszóval lehet:<br>
             <code>node scripts/crm-restore.ts crm-backup-${day}.lrb</code></p>
             <p style="color:#888;font-size:12px">A jelszó nélkül ez a fájl semmit nem ér — tartsd egy jelszókezelőben is,
             ne csak a Vercelen. Az a nap, amikor mentésre lesz szükséged, könnyen lehet olyan nap, amikor a Vercel-fiók is a probléma része.</p>`
          : `<p style="color:#b00"><b>Ez a csatolmány titkosítatlan.</b> Bárki elolvashatja, aki hozzáfér ehhez a postafiókhoz —
             minden vevő neve, telefonszáma és alkudott ára.<br>
             Állíts be egy <code>CRM_BACKUP_KEY</code> értéket a Vercelen, és a holnapi mentés már titkosítva érkezik.</p>`}
        <p style="color:#888;font-size:12px">Tarts meg néhányat — bármelyikből vissza lehet állítani a CRM-et.</p>
      </div>`,
      attachments: [
        { filename, content: Buffer.from(payload, 'utf8').toString('base64') },
      ],
    }),
  });

  /* The single largest way the whole customer database can leave this
     system, so it leaves a mark every time it does — including whether it
     left readable. */
  await audit({
    actor: cronOk ? 'cron' : ((await currentAccount())?.name || 'unknown'),
    action: 'backup.mailed',
    detail: res.ok
      ? `${leads.length} lead → ${to} (${Math.round(payload.length / 1024)} kB, ${sealed ? 'titkosítva' : 'TITKOSÍTATLAN'})`
      : `SIKERTELEN — a levelező elutasította (${res.status})`,
    ...clientInfo(req),
  });

  /* A backup that quietly stopped going out is the worst kind of silence: the
     day it matters is the day you find out, and by then there is nothing to
     restore from. The audit entry above records it; this one says it out
     loud, because nobody reads an audit log on an ordinary Tuesday. */
  if (!res.ok) {
    await alertFailure(
      'nightly backup',
      new Error(`Resend refused the backup mail (HTTP ${res.status})`),
      `${leads.length} lead, ${Math.round(payload.length / 1024)} kB, cél: ${to}`,
    );
  }

  return Response.json({
    ok: res.ok,
    encrypted: sealed,
    sent_to: res.ok ? to : undefined,
    bytes: payload.length,
    counts: snapshot.counts,
  }, { status: res.ok ? 200 : 502 });
}
