import { can, currentUser, isAuthed } from '@/lib/crm/auth';
import {
  VillaConflict, getVillaData, setVillaStatus, updateVillaSale,
  type VillaSaleOp, type VillaStatus,
} from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

const SALE_OPS = [
  'sale', 'phase', 'extraAdd', 'extraRemove',
  'reserve', 'reservationPatch', 'releaseReservation', 'contract', 'schedule',
];

export async function GET() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, ...(await getVillaData()) });
}

export async function PATCH(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await can('money.write'))) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(b.id || '').trim();
  if (!id) return Response.json({ ok: false, error: 'missing id' }, { status: 400 });

  /* 409 with the reason in `error`, so the drawer can say WHICH buyer already
     holds the unit. A conflict is the one failure here the operator can act
     on, and it deserves a sentence rather than a red border. */
  try {
    // Sales ops (payment phases, buyer link, extras…) ride on `op`; a plain
    // status change (the original masterplan drawer contract) has none.
    if (typeof b.op === 'string' && SALE_OPS.includes(b.op)) {
      /* Who reserved it is stamped here rather than trusted from the body —
         a claim on a villa carrying somebody else's name would be worse than
         one carrying none. */
      const payload = b.op === 'reserve' ? { ...b, by: (await currentUser()) || undefined } : b;
      const data = await updateVillaSale(id, payload as unknown as VillaSaleOp);
      if (!data) return Response.json({ ok: false, error: 'invalid op' }, { status: 400 });
      return Response.json({ ok: true, ...data });
    }

    const status = String(b.status || '') as VillaStatus;
    const data = await setVillaStatus(id, status, {
      seller: b.seller ? String(b.seller) : undefined,
      note: b.note ? String(b.note) : undefined,
    });
    if (!data) return Response.json({ ok: false, error: 'invalid status' }, { status: 400 });
    return Response.json({ ok: true, ...data });
  } catch (err) {
    if (err instanceof VillaConflict) {
      return Response.json({ ok: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
