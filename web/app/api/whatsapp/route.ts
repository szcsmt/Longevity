import { isBlockedContact, recordInboundReply, upsertLeadFromPayload } from '@/lib/crm/store';
import { notifyNewLead } from '@/lib/crm/notify';
import { forwardToOperator } from '@/lib/crm/forward';
import { readReply, readingAsNote } from '@/lib/crm/triage';
import { readIncoming, validSignature, whatsappInboundEnabled } from '@/lib/crm/whatsapp';

export const dynamic = 'force-dynamic';

/* ── Inbound WhatsApp (Meta Cloud API webhook) ──

   The channel that used to end at one person's handset. Every message now
   lands on a lead: an unknown number becomes one, a known number's message
   becomes a reply on the lead that already exists.

   Two endpoints in one file, as Meta requires:
     GET   the one-time subscription handshake
     POST  the deliveries themselves, signed with the app secret

   Both fail closed while the env is unset — an unconfigured deployment can
   neither be verified nor fed forged messages. */

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    token &&
    q.get('hub.mode') === 'subscribe' &&
    q.get('hub.verify_token') === token &&
    q.get('hub.challenge')
  ) {
    // Meta wants the challenge echoed back as bare text, not JSON.
    return new Response(q.get('hub.challenge')!, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  if (!whatsappInboundEnabled()) return Response.json({ ok: false }, { status: 401 });

  // The signature covers the raw bytes, so the body must be read as text and
  // parsed afterwards — parsing first and re-serialising would not match.
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'))) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }

  const messages = readIncoming(payload);
  // Most deliveries are delivery receipts with no message in them at all.
  if (!messages.length) return Response.json({ ok: true, messages: 0 });

  let filed = 0;
  for (const m of messages) {
    try {
      const phone = `+${m.from}`;
      // A number deleted with "Delete & block" never re-enters through here.
      if (await isBlockedContact(undefined, phone, phone)) continue;

      const { lead, created } = await upsertLeadFromPayload(
        {
          name: m.name,
          phone,
          whatsapp: phone,
          form_type: 'whatsapp',
          form_origin: 'whatsapp',
          source: 'WhatsApp',
          submitted_at: m.at,
        },
        /* No opening message: recordInboundReply below files the same text
           with the reading attached, and passing it here too would put it on
           the timeline twice. */
        undefined,
      );

      const reading = await readReply(lead, m.text);
      await recordInboundReply(lead.id, {
        message: m.text,
        channel: 'whatsapp',
        reading: reading
          ? { score: reading.score, note: readingAsNote(reading), urgency: reading.urgency }
          : null,
      });

      if (created) await notifyNewLead(lead).catch(() => {});
      await forwardToOperator({
        lead,
        channel: 'whatsapp',
        body: m.text,
        brief: reading ? readingAsNote(reading) : null,
      });
      filed++;
    } catch {
      /* Carry on with the rest — one bad message must not drop the batch. */
    }
  }

  // Always 200: a non-2xx makes Meta retry, which would double-file messages
  // we have already accepted.
  return Response.json({ ok: true, messages: messages.length, filed });
}
