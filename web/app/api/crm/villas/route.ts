import { isAdmin, isAuthed } from '@/lib/crm/auth';
import {
  getVillaData, setVillaStatus, updateVillaSale,
  type VillaSaleOp, type VillaStatus,
} from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, ...(await getVillaData()) });
}

export async function PATCH(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await isAdmin())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(b.id || '').trim();
  if (!id) return Response.json({ ok: false, error: 'missing id' }, { status: 400 });

  // Sales ops (payment phases, buyer link, extras…) ride on `op`; a plain
  // status change (the original masterplan drawer contract) has none.
  if (typeof b.op === 'string' && ['sale', 'phase', 'extraAdd', 'extraRemove'].includes(b.op)) {
    const data = await updateVillaSale(id, b as unknown as VillaSaleOp);
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
}
