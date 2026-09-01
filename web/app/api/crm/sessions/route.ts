import { currentAccount, isAdmin, isAuthed } from '@/lib/crm/auth';
import { revokeAllFor, revokeSession } from '@/lib/crm/sessions';
import { audit, clientInfo } from '@/lib/crm/audit';

export const dynamic = 'force-dynamic';

/* Cutting somebody off. The owner's alone rather than a capability somebody
   else could be given: ending another person's session is the sort of thing
   that should be traceable to exactly one desk. */
export async function POST(req: Request) {
  /* 401 and 403 are different sentences and it matters which one arrives:
     "sign in" is something the caller can act on, "you may not" is not. Asking
     isAdmin() alone answered 403 to somebody who was simply not signed in,
     which reads as a permissions problem when it is a session that expired. */
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await isAdmin())) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const actor = (await currentAccount())?.name || 'unknown';
  const info = clientInfo(req);

  if (typeof body.user === 'string' && body.user.trim()) {
    const count = await revokeAllFor(body.user);
    await audit({
      actor, action: 'session.revoked',
      detail: `${body.user}: ${count} eszköz`, ...info,
    });
    return Response.json({ ok: true, revoked: count });
  }

  if (typeof body.id === 'string' && body.id.trim()) {
    const gone = await revokeSession(body.id);
    if (gone) await audit({ actor, action: 'session.revoked', detail: `session ${body.id}`, ...info });
    return Response.json({ ok: gone, revoked: gone ? 1 : 0 });
  }

  return Response.json({ ok: false, error: 'id or user required' }, { status: 400 });
}
