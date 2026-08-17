import { canEdit, isAuthed } from '@/lib/crm/auth';
import { disconnect, status, syncNow } from '@/lib/crm/google-tasks';

/* Status, sync and disconnect for the Google Tasks link. The consent redirect
   itself lives in ./connect and ./callback — those are browser navigations, not
   fetches, and need to be their own URLs. */

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, ...(await status()) });
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await canEdit())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const body = await req.json().catch(() => ({} as { force?: boolean }));
  const result = await syncNow(Boolean(body.force));
  return Response.json({ ...result, ...(await status()) });
}

export async function DELETE() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await canEdit())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  await disconnect();
  return Response.json({ ok: true, ...(await status()) });
}
