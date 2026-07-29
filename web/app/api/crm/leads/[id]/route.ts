import { isAuthed } from '@/lib/crm/auth';
import { addNote, addTask, deleteLead, toggleTask, updateLead } from '@/lib/crm/store';
import type { LeadPatch } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  let lead = null;
  switch (body.op) {
    case 'update':
      lead = await updateLead(id, (body.patch || {}) as LeadPatch);
      break;
    case 'addNote':
      if (!String(body.body || '').trim()) return Response.json({ ok: false, error: 'empty note' }, { status: 400 });
      lead = await addNote(id, String(body.body));
      break;
    case 'addTask':
      if (!String(body.title || '').trim()) return Response.json({ ok: false, error: 'empty task' }, { status: 400 });
      lead = await addTask(id, String(body.title), body.due ? String(body.due) : undefined);
      break;
    case 'toggleTask':
      lead = await toggleTask(id, String(body.taskId || ''));
      break;
    default:
      return Response.json({ ok: false, error: 'unknown op' }, { status: 400 });
  }

  if (!lead) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  return Response.json({ ok: true, lead });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const ok = await deleteLead(id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
