import { canEdit, currentUser, isAuthed } from '@/lib/crm/auth';
import {
  createNote, deleteNote, listNotes, toggleNoteItem, updateNote,
  type NoteInput,
} from '@/lib/crm/store';

/* The project board's one endpoint. Everything is keyed by an id in the body
   rather than in the path, which keeps this a single route file and means the
   board only ever talks to one URL.

   Roles follow the rest of the CRM: viewers read, everyone else writes. */

export const dynamic = 'force-dynamic';

const deny = (status: number, error: string) => Response.json({ ok: false, error }, { status });

async function guard(): Promise<Response | null> {
  if (!(await isAuthed())) return deny(401, 'not signed in');
  return null;
}

async function guardWrite(): Promise<Response | null> {
  const g = await guard();
  if (g) return g;
  if (!(await canEdit())) return deny(403, 'read-only account');
  return null;
}

export async function GET() {
  const g = await guard();
  if (g) return g;
  return Response.json({ ok: true, notes: await listNotes() });
}

export async function POST(req: Request) {
  const g = await guardWrite();
  if (g) return g;
  const body = (await req.json().catch(() => ({}))) as NoteInput;
  // A note with neither text nor a list is an empty card — nothing to keep.
  const hasContent = Boolean(body.title || body.body || body.items?.some((i) => i?.text));
  if (!hasContent) return deny(400, 'empty note');
  const note = await createNote(body, (await currentUser()) || undefined);
  return Response.json({ ok: true, note });
}

export async function PATCH(req: Request) {
  const g = await guardWrite();
  if (g) return g;
  const body = (await req.json().catch(() => ({}))) as NoteInput & { id?: string; op?: string; itemId?: string };
  const id = String(body.id || '').trim();
  if (!id) return deny(400, 'missing id');

  // One checklist tick — sent on its own so a tap can never overwrite the rest
  // of the card with a stale copy the board happened to be holding.
  if (body.op === 'toggleItem') {
    const note = await toggleNoteItem(id, String(body.itemId || ''));
    return note ? Response.json({ ok: true, note }) : deny(404, 'no such note or item');
  }

  // Whitelist rather than spread: only these fields may ever reach a note, and
  // a field that wasn't sent must stay untouched (the store patches by presence).
  const patch: NoteInput = {};
  for (const key of ['title', 'body', 'items', 'color', 'labels', 'pinned', 'archived', 'due', 'owner'] as const) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  const note = await updateNote(id, patch);
  return note ? Response.json({ ok: true, note }) : deny(404, 'no such note');
}

export async function DELETE(req: Request) {
  const g = await guardWrite();
  if (g) return g;
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id || '').trim();
  if (!id) return deny(400, 'missing id');
  return Response.json({ ok: await deleteNote(id) });
}
