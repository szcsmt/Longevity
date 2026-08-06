import { isAdmin, isAuthed } from '@/lib/crm/auth';
import { dedupeMerge, dedupeReport } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* Duplicate cleanup for the backlog. GET = dry-run report (how many people
   have multiple leads), POST = fold each group into its oldest lead. The
   intake now upserts, so this is a one-time tidy-up plus an occasional
   safety net. */

export async function GET() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, ...(await dedupeReport()) });
}

export async function POST() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await isAdmin())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const result = await dedupeMerge();
  return Response.json({ ok: true, ...result });
}
