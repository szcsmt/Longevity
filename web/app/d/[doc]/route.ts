import { documentById } from '@/lib/crm/documents';
import { recordDownload } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* Tracked document link: /d/<document id>?l=<lead id>

   Records the open on that lead's timeline, then redirects to the real file.
   The lead id is the same random UUID used by the opt-out link — it only ever
   appears in that person's own inbox, so no signature is needed, and the worst
   case (someone forwards the mail and a colleague opens it) simply logs one
   extra open on a lead we already know is interested.

   Without ?l= the link still works, it just isn't attributed. That keeps the
   same URL usable in a WhatsApp message or on a business card. */
export async function GET(request: Request, { params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const found = documentById(doc);
  if (!found) return new Response('Not found', { status: 404 });

  const leadId = new URL(request.url).searchParams.get('l');
  // Never let a logging failure stand between the customer and the document.
  if (leadId) await recordDownload(leadId, found.title).catch(() => {});

  return Response.redirect(new URL(found.file, request.url), 302);
}
