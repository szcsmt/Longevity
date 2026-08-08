import { canEdit, currentUser, isAuthed } from '@/lib/crm/auth';
import { createManualLead } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* Create a lead by hand from the admin UI — a phone enquiry, a walk-in, a
   broker referral. Requires an authenticated CRM session (unlike /api/lead,
   which is the public form intake). */
export async function POST(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await canEdit())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : undefined);
  if (!s('name')?.trim() && !s('email')?.trim() && !s('phone')?.trim()) {
    return Response.json({ ok: false, error: 'name, email or phone required' }, { status: 400 });
  }
  const lead = await createManualLead({
    name: s('name'),
    email: s('email'),
    phone: s('phone'),
    whatsapp: s('whatsapp'),
    villa: s('villa'),
    source: s('source'),
    score: s('score'),
    value: typeof b.value === 'number' ? b.value : undefined,
    note: s('note'),
  }, (await currentUser()) || undefined);
  return Response.json({ ok: true, lead });
}
