import { can, currentUser, isAuthed } from '@/lib/crm/auth';
import {
  addContact, addPayment, archiveAgency, getAgency, setContactActive, unarchiveAgency, updateAgency,
} from '@/lib/crm/partners';
import { closePortal, openPortal } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  const agency = await getAgency((await params).id);
  if (!agency) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  return Response.json({ ok: true, agency });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  /* Everything here edits the commercial relationship — terms, contacts, or
     whether we deal with them at all. That stays with the owner of the
     business, the same as the sales ledger and the export. */
  if (!(await can('partners.write'))) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  let agency = null;
  switch (body.op) {
    case 'update':
      agency = await updateAgency(id, (body.patch || {}) as never);
      break;
    case 'addContact':
      agency = await addContact(id, (body.contact || {}) as never);
      if (!agency) return Response.json({ ok: false, error: 'A contact needs a name.' }, { status: 400 });
      break;
    case 'setContactActive':
      agency = await setContactActive(id, String(body.contactId || ''), body.active === true);
      break;
    case 'addPayment':
      /* Append-only: there is no removePayment. A payment entered by mistake
         is corrected with a NEGATIVE amount, which is accounting's own answer
         and leaves the trail intact. */
      agency = await addPayment(id, (body.payment || {}) as never, (await currentUser()) || undefined);
      if (!agency) {
        return Response.json(
          { ok: false, error: 'A payment needs an amount that is not zero and a date.' },
          { status: 400 },
        );
      }
      break;
    case 'openPortal': {
      /* The plain access code exists for exactly one response and is never
         recoverable afterwards — it is stored as a hash. Re-issuing replaces
         the old code AND kills every session opened with it. */
      const opened = await openPortal(id);
      if (!opened) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
      return Response.json({ ok: true, agency: opened.agency, token: opened.token });
    }
    case 'closePortal':
      agency = await closePortal(id);
      break;
    case 'archive':
      /* Archived, never deleted: the registrations made under this name decide
         who introduced which buyer, and that has to outlive the relationship. */
      agency = await archiveAgency(id, (await currentUser()) || undefined);
      break;
    case 'unarchive':
      agency = await unarchiveAgency(id);
      break;
    default:
      return Response.json({ ok: false, error: 'unknown op' }, { status: 400 });
  }

  if (!agency) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  return Response.json({ ok: true, agency });
}
