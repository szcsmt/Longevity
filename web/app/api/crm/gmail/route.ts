import { can, isAuthed } from '@/lib/crm/auth';
import { disconnect, status, syncNow } from '@/lib/crm/gmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  return Response.json(await status());
}

/** Sync on demand — the button next to "last synced". */
export async function POST() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await can('leads.write'))) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const result = await syncNow(true);
  return Response.json({ ...result, ...(await status()) });
}

/** Disconnect. The refresh token is dropped; nothing already filed is touched —
    a conversation that happened still happened. */
export async function DELETE() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await can('partners.write'))) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });
  await disconnect();
  return Response.json(await status());
}
