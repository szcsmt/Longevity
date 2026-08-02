import { isAuthed } from '@/lib/crm/auth';
import { addNote, addTask, deleteLead, mergeLeads, setAwaitingReply, toggleTask, updateLead } from '@/lib/crm/store';
import { SCORES, STAGES } from '@/lib/crm/types';
import type { LeadPatch } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

/* Only these keys may be patched — anything else in the payload is dropped so
   a crafted request can't overwrite attribution, history or timestamps. */
const PATCHABLE = ['name', 'email', 'phone', 'whatsapp', 'villa', 'stage', 'score', 'value'] as const;

function sanitizePatch(raw: unknown): LeadPatch {
  const src = (raw || {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of PATCHABLE) {
    if (!(k in src)) continue;
    const v = src[k];
    if (k === 'value') {
      if (v === null || v === undefined || v === '') patch[k] = undefined;
      else if (typeof v === 'number' && isFinite(v) && v >= 0) patch[k] = Math.round(v);
    } else if (k === 'stage') {
      if (STAGES.some((s) => s.id === v)) patch[k] = v;
    } else if (k === 'score') {
      if ((SCORES as string[]).includes(v as string)) patch[k] = v;
    } else if (typeof v === 'string') {
      patch[k] = v.slice(0, 300);
    }
  }
  return patch as LeadPatch;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  let lead = null;
  switch (body.op) {
    case 'update':
      lead = await updateLead(id, sanitizePatch(body.patch));
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
    case 'merge':
      lead = await mergeLeads(id, String(body.otherId || ''));
      break;
    case 'awaiting':
      lead = await setAwaitingReply(id, body.on === true);
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
