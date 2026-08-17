import { canEdit, currentUser, isAdmin, isAuthed } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import {
  addNote, addTask, archiveLead, blockContactOf, getLead, mergeLeads, purgeLead,
  setAwaitingReply, toggleTask, unarchiveLead, updateLead,
} from '@/lib/crm/store';
import { LOST_REASONS, SCORES, STAGES } from '@/lib/crm/types';
import type { LeadPatch } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

/* Only these keys may be patched — anything else in the payload is dropped so
   a crafted request can't overwrite attribution, history or timestamps. */
const PATCHABLE = ['name', 'email', 'phone', 'whatsapp', 'villa', 'stage', 'score', 'value', 'lost_reason', 'owner'] as const;

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
    } else if (k === 'lost_reason') {
      if (v === null || v === '') patch[k] = undefined;
      else if (LOST_REASONS.some((r) => r.id === v)) patch[k] = v;
    } else if (k === 'owner') {
      // Only a name on the configured roster may own a lead — an empty value
      // unassigns. Anything else is dropped rather than stored as free text.
      if (v === null || v === '') patch[k] = undefined;
      else if (typeof v === 'string' && agents().some((a) => a.name === v)) patch[k] = v;
    } else if (typeof v === 'string') {
      patch[k] = v.slice(0, 300);
    }
  }
  return patch as LeadPatch;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await canEdit())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // Stamped onto every change, so the timeline says who as well as what.
  const actor = (await currentUser()) || undefined;

  let lead = null;
  switch (body.op) {
    case 'update':
      lead = await updateLead(id, sanitizePatch(body.patch), actor);
      break;
    case 'addNote':
      if (!String(body.body || '').trim()) return Response.json({ ok: false, error: 'empty note' }, { status: 400 });
      lead = await addNote(id, String(body.body), actor);
      break;
    case 'addTask':
      if (!String(body.title || '').trim()) return Response.json({ ok: false, error: 'empty task' }, { status: 400 });
      lead = await addTask(id, String(body.title), body.due ? String(body.due) : undefined, actor);
      break;
    case 'toggleTask':
      lead = await toggleTask(id, String(body.taskId || ''));
      break;
    case 'merge':
      // Merging destroys one of the two records — an owner's decision.
      if (!(await isAdmin())) return Response.json({ ok: false, error: 'admins only' }, { status: 403 });
      lead = await mergeLeads(id, String(body.otherId || ''), actor);
      break;
    case 'awaiting':
      lead = await setAwaitingReply(id, body.on === true);
      break;
    case 'unarchive':
      /* Restoring is the reversal of an owner-level decision, so it stays with
         the owner. Everything about the lead is intact; this only puts it back
         into the working views. */
      if (!(await isAdmin())) return Response.json({ ok: false, error: 'admins only' }, { status: 403 });
      lead = await unarchiveLead(id, actor);
      break;
    default:
      return Response.json({ ok: false, error: 'unknown op' }, { status: 400 });
  }

  if (!lead) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  return Response.json({ ok: true, lead });
}

/* ── DELETE archives; ?purge=1 destroys ──

   The default is reversible, because the request that looks like "get rid of
   this" is almost always "get this out of my way". A real erasure needs
   ?purge=1 AND a lead that is already archived, so destroying a customer's
   history can never be a single click.

   Both stay with the owner of the business even though agents may edit
   everything else about a lead. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await isAdmin())) return Response.json({ ok: false, error: 'admins only' }, { status: 403 });
  const { id } = await params;
  const q = new URL(req.url).searchParams;

  // ?block=1: also blocklist the contact so their next WhatsApp message never
  // recreates the lead (for private/non-lead contacts).
  if (q.get('block') === '1') {
    const lead = await getLead(id);
    if (lead) await blockContactOf(lead);
  }

  if (q.get('purge') === '1') {
    const result = await purgeLead(id);
    if (result === 'not-found') return Response.json({ ok: false, error: 'not found' }, { status: 404 });
    if (result === 'not-archived') {
      return Response.json(
        { ok: false, error: 'Archive the lead first. A permanent delete is deliberately a second step.' },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, purged: true });
  }

  const lead = await archiveLead(id, q.get('reason') || undefined, (await currentUser()) || undefined);
  const ok = Boolean(lead);
  return Response.json({ ok, archived: ok }, { status: ok ? 200 : 404 });
}
