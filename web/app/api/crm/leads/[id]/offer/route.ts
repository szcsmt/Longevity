import { canEdit, currentUser, isAuthed } from '@/lib/crm/auth';
import { getLead, recordDocument } from '@/lib/crm/store';
import { offerHtml, offerReference } from '@/lib/crm/offer';

export const dynamic = 'force-dynamic';

/* The reservation offer for one lead, as a printable page.

   Returned as HTML rather than a PDF on purpose: the browser's own print
   dialogue produces a better PDF than any library we would have to ship, and
   the operator can read it before it goes anywhere. `?value=` overrides the
   catalogue price for a negotiated figure.

   Generating one is filed on the timeline, because "did we ever send them an
   offer, and for how much" is a question that gets asked weeks later. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return new Response('Unauthorized', { status: 401 });
  if (!(await canEdit())) return new Response('Read-only account', { status: 403 });

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return new Response('Not found', { status: 404 });

  const raw = new URL(req.url).searchParams.get('value');
  const parsed = raw ? Number(raw) : NaN;
  const value = isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;

  const reference = offerReference(lead);
  await recordDocument(
    id,
    `Offer ${reference}${value ? ` at ${value.toLocaleString('en-US')} THB` : ''}`,
    (await currentUser()) || undefined,
  ).catch(() => {});

  return new Response(offerHtml({ lead, value }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
