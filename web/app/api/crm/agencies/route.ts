import { isAdmin, isAuthed } from '@/lib/crm/auth';
import { createAgency, listAgencies } from '@/lib/crm/partners';

export const dynamic = 'force-dynamic';

/* Partner agencies. Reading is for anybody signed in — a salesperson has to
   know which agencies exist to register a buyer against one. Creating and
   changing them is an owner's job: an agency record carries a commission
   agreement, and that is not a salesperson's to write. */

export async function GET(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  const mode = new URL(req.url).searchParams.get('archived');
  const agencies = await listAgencies({
    archived: mode === 'only' ? 'only' : mode === 'include' ? 'include' : 'exclude',
  });
  return Response.json({ ok: true, agencies });
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await isAdmin())) return Response.json({ ok: false, error: 'admins only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const agency = await createAgency(body || {});
  if (!agency) return Response.json({ ok: false, error: 'An agency needs a name.' }, { status: 400 });
  return Response.json({ ok: true, agency });
}
