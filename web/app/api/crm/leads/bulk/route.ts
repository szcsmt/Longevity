import { canEdit, currentUser, isAdmin, isAuthed } from '@/lib/crm/auth';
import { bulkDelete, bulkUpdate } from '@/lib/crm/store';
import { SCORES, STAGES } from '@/lib/crm/types';
import type { Score, Stage } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

/* Bulk actions from the leads list: move stage, set score, or delete a
   selection. Values are validated against the domain enums — a bad action or
   value is a 400. Each lead is attempted independently; the response reports
   how many succeeded and how many failed so a mid-batch error is never
   mistaken for full success. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await canEdit())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const actor = (await currentUser()) || undefined;
  const body = (await req.json().catch(() => ({}))) as {
    ids?: unknown;
    action?: unknown;
    value?: unknown;
  };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
  if (!ids.length) return Response.json({ ok: false, error: 'no ids' }, { status: 400 });

  const value = typeof body.value === 'string' ? body.value : '';
  let result: { done: number; failed: number };
  switch (body.action) {
    case 'stage':
      if (!STAGES.some((s) => s.id === value)) return Response.json({ ok: false, error: 'bad stage' }, { status: 400 });
      result = await bulkUpdate(ids, { stage: value as Stage }, actor);
      break;
    case 'score':
      if (!(SCORES as string[]).includes(value)) return Response.json({ ok: false, error: 'bad score' }, { status: 400 });
      result = await bulkUpdate(ids, { score: value as Score }, actor);
      break;
    case 'delete':
      // Deleting in bulk is the most destructive thing this CRM can do in one
      // click, so it stays with the owner even though agents may re-stage and
      // re-score freely.
      if (!(await isAdmin())) return Response.json({ ok: false, error: 'admins only' }, { status: 403 });
      result = await bulkDelete(ids);
      break;
    default:
      return Response.json({ ok: false, error: 'unknown action' }, { status: 400 });
  }
  return Response.json({ ok: result.failed === 0, count: result.done, failed: result.failed });
}
