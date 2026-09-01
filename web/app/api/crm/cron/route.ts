import { isAuthed } from '@/lib/crm/auth';
import { runSequence } from '@/lib/crm/automation';
import { sendDigest } from '@/lib/crm/digest';
import { alertFailure } from '@/lib/crm/alert';
import { autoEmailsEnabled } from '@/lib/crm/mailer';
import { whatsappEnabled } from '@/lib/crm/whatsapp';
import { syncNow as syncGoogleTasks } from '@/lib/crm/google-tasks';
import { syncNow as syncGmail } from '@/lib/crm/gmail';

export const dynamic = 'force-dynamic';

/* The daily sweep, at 00:00 UTC — seven in the morning on Samui, which is the
   point: the operator's day starts with the CRM having already done its round.

   Two jobs in one run, deliberately. Vercel's plan allows few scheduled jobs,
   and these two belong together anyway: advance the customer sequence first,
   then report to the operator on what is left for a human to do.

   Triggered by Vercel Cron (Authorization: Bearer CRON_SECRET) or by hand from
   a signed-in session. Both halves are inert until their env is configured. */
export async function GET(req: Request) {
  const bearer = req.headers.get('authorization');
  const cronOk = Boolean(process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`);
  if (!cronOk && !(await isAuthed())) return Response.json({ ok: false }, { status: 401 });

  const canSend = autoEmailsEnabled() || whatsappEnabled();
  const sequence = canSend
    ? await runSequence()
    : { checked: 0, sent: 0, steps: {}, note: 'sequence is dark (env not configured)' };

  /* ── Failures here used to be swallowed whole ──

     Each of these is wrapped so that one broken integration cannot stop the
     rest of the nightly sweep, which is right. What was missing is the other
     half: the error went into the catch and nowhere else, so a mailbox that
     had stopped syncing, or a digest that had not gone out for a week, was
     invisible until somebody noticed the silence. Now it still does not fail
     the sweep — and it does say so. */
  const step = async <T, F>(name: string, run: () => Promise<T>, fallback: F): Promise<T | F> => {
    try {
      return await run();
    } catch (err) {
      await alertFailure(`nightly sweep · ${name}`, err);
      return fallback;
    }
  };

  /* The digest must run even when the sequence is dark: telling the operator
     what needs doing has nothing to do with whether we are mailing customers. */
  const digest = await step('digest', sendDigest, { sent: false, total: 0 });

  /* And carry the project board to the phone. Inert until someone has connected
     a Google account; a failure here must never fail the sweep. */
  const googleTasks = await step('google tasks', () => syncGoogleTasks(true), { ok: false, error: 'sync threw' });

  /* The mailbox, once a day as a backstop. The real cadence comes from the
     browser while somebody is working — see components/crm/mail-sync.tsx —
     but a night with nobody logged in should not leave a gap in the record. */
  const gmail = await step('gmail', () => syncGmail(true), { ok: false, error: 'sync threw' });

  return Response.json({ ok: true, enabled: canSend, ...sequence, digest, googleTasks, gmail });
}
