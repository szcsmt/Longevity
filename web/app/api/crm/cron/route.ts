import { isAuthed } from '@/lib/crm/auth';
import { runReminders } from '@/lib/crm/automation';
import { autoEmailsEnabled } from '@/lib/crm/mailer';

export const dynamic = 'force-dynamic';

/* Daily follow-up sweep: sends the single day-3 reminder to leads whose reply
   timer ran out. Triggered by Vercel Cron (Authorization: Bearer CRON_SECRET)
   or manually by a signed-in operator. Inert while the mailer is dark. */
export async function GET(req: Request) {
  const bearer = req.headers.get('authorization');
  const cronOk = Boolean(process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`);
  if (!cronOk && !(await isAuthed())) return Response.json({ ok: false }, { status: 401 });

  if (!autoEmailsEnabled()) {
    return Response.json({ ok: true, enabled: false, sent: 0, note: 'auto-emails are dark (env not configured)' });
  }
  const result = await runReminders();
  return Response.json({ ok: true, enabled: true, ...result });
}
