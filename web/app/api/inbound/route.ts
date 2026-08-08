import { upsertLeadFromPayload, recordInboundReply } from '@/lib/crm/store';
import { readReply, readingAsNote } from '@/lib/crm/triage';

export const dynamic = 'force-dynamic';

/* ── Inbound customer replies ──

   Resend posts here when someone answers one of our e-mails (webhook event
   `email.received`). The payload carries metadata only, so the body is fetched
   back over the Receiving API before anything is filed.

   Auth: `?key=<INBOUND_SECRET>`. Unset → the endpoint always 401s, so a
   half-configured deployment can't be fed forged replies.

   Everything downstream is best-effort by design: a reply from a real customer
   must never be lost because a lookup or a reading failed. */

interface ReceivedEvent {
  type?: string;
  data?: { email_id?: string; from?: string; subject?: string; to?: string[] };
}

/** Fetch the full message back from Resend — webhooks omit the body. */
async function fetchBody(emailId: string): Promise<{ text: string; subject?: string; from?: string } | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const mail = await res.json();
    const text: string = mail.text || stripHtml(mail.html || '');
    return { text, subject: mail.subject, from: mail.from };
  } catch {
    return null;
  }
}

const stripHtml = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

/** "Jane Doe <jane@x.com>" → "jane@x.com" */
const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();

/* Quoted history and signatures make a two-line reply look like a thread. Cut
   at the first quote marker so the note — and the reading — see what the person
   actually wrote this time. */
function justTheReply(text: string): string {
  const markers = [
    /^\s*On .+ wrote:\s*$/m,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*From:\s.+$/m,
    /^\s*>{1,}/m,
    /^\s*_{10,}\s*$/m,
  ];
  let cut = text.length;
  for (const m of markers) {
    const hit = text.match(m);
    if (hit?.index !== undefined && hit.index < cut) cut = hit.index;
  }
  return text.slice(0, cut).trim() || text.trim();
}

export async function POST(request: Request) {
  const secret = process.env.INBOUND_SECRET;
  const key = new URL(request.url).searchParams.get('key');
  if (!secret || key !== secret) return Response.json({ ok: false }, { status: 401 });

  const event = (await request.json().catch(() => null)) as ReceivedEvent | null;
  if (!event || event.type !== 'email.received' || !event.data?.email_id) {
    return Response.json({ ok: true, ignored: true });
  }

  const mail = await fetchBody(event.data.email_id);
  const from = addressOf(mail?.from || event.data.from || '');
  const body = justTheReply(mail?.text || '');
  if (!from) return Response.json({ ok: true, ignored: 'no sender' });

  try {
    // One person = one lead: an unknown sender becomes a lead rather than being
    // dropped — somebody wrote to us, that is a lead by definition.
    const { lead } = await upsertLeadFromPayload(
      { email: from, name: (mail?.from || '').split('<')[0].trim() || undefined, form_type: 'email', form_origin: 'reply', source: 'email' },
      undefined,
    );

    const reading = await readReply(lead, body);
    await recordInboundReply(lead.id, {
      message: `${mail?.subject ? `Subject: ${mail.subject}\n\n` : ''}${body}`,
      channel: 'email',
      reading: reading
        ? { score: reading.score, note: readingAsNote(reading), urgency: reading.urgency }
        : null,
    });

    return Response.json({ ok: true, lead: lead.id, read: Boolean(reading) });
  } catch {
    // Never hand Resend a 500 for a message we already accepted — it would retry
    // and could double-file the reply.
    return Response.json({ ok: true, stored: false });
  }
}
