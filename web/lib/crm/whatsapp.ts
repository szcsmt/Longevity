import { createHmac, timingSafeEqual } from 'node:crypto';

/* ── WhatsApp, through Meta's Cloud API ──

   The reason this exists: until now every WhatsApp conversation lived on one
   person's handset. The CRM could not see it, nobody else could answer it, and
   the day that person leaves the company the entire history leaves with them.
   Routing the business number through the Cloud API puts those messages where
   the e-mails already are — on the lead's own timeline.

   DARK BY DEFAULT, exactly like the mailer: without the env below nothing is
   sent and the webhook simply refuses everything, so a half-configured
   deployment can neither leak nor be fed forged messages.

     WHATSAPP_TOKEN         permanent access token of the system user
     WHATSAPP_PHONE_ID      phone number id (NOT the phone number itself)
     WHATSAPP_VERIFY_TOKEN  any string; also typed into Meta's webhook form
     WHATSAPP_APP_SECRET    app secret, used to verify every delivery
     WHATSAPP_API_VERSION   optional, defaults below

   The 24-hour rule is Meta's, not ours: outside 24 hours from the customer's
   last message only a pre-approved template may be sent. Free text is still
   attempted — Meta rejects it with a clear error and `sendWhatsApp` returns
   false, which the sequence treats as "not sent" and retries another day. */

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export function whatsappEnabled(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_ID &&
    process.env.WHATSAPP_MESSAGES !== 'off', // explicit kill-switch
  );
}

/** True when the webhook is configured well enough to accept deliveries. */
export function whatsappInboundEnabled(): boolean {
  return Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET);
}

/* Meta wants the recipient in E.164 without the plus and without separators.
   Numbers reach us in every shape a human can type one, so normalise hard. */
export function waNumber(raw: string | undefined): string | null {
  const digits = (raw || '').replace(/[^\d]/g, '');
  // Shorter than 8 digits is a local extension or a typo, not a mobile number.
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Send one free-text WhatsApp message. Returns true on acceptance; never throws. */
export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!whatsappEnabled()) return false;
  const number = waNumber(to);
  if (!number || !body.trim()) return false;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: number,
          type: 'text',
          // preview_url lets our tracked document links render a card, which
          // is a large part of why a link gets tapped at all.
          text: { preview_url: true, body: body.slice(0, 4000) },
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Verifying a delivery ──

   Meta signs every POST with the app secret. Without this check anyone who
   learns the URL could file messages onto real leads, so an unverifiable
   delivery is dropped rather than trusted. */
export function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const given = header.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── Reading a delivery ──

   One POST can carry several entries, each with several changes, each with
   several messages. Most deliveries are in fact delivery receipts with no
   message at all, which is why the flattening returns an empty list so often. */
export interface IncomingWhatsApp {
  from: string;      // E.164 digits, no plus
  name?: string;     // WhatsApp profile name — often the only name we ever get
  text: string;
  messageId: string;
  at?: string;       // ISO
}

interface CloudPayload {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
        }[];
      };
    }[];
  }[];
}

export function readIncoming(payload: unknown): IncomingWhatsApp[] {
  const out: IncomingWhatsApp[] = [];
  const p = payload as CloudPayload;
  for (const entry of p?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue;
      // The profile name arrives beside the message, not inside it.
      const names = new Map<string, string>();
      for (const c of value.contacts || []) {
        if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      }
      for (const m of value.messages) {
        if (!m.from || !m.id) continue;
        /* A tapped quick-reply button carries its label rather than free text.
           Treating it as the message is right: the customer did say that. */
        const text =
          m.text?.body ||
          m.interactive?.button_reply?.title ||
          m.interactive?.list_reply?.title ||
          m.button?.text ||
          (m.type && m.type !== 'text' ? `[${m.type}]` : '');
        if (!text) continue;
        out.push({
          from: m.from,
          name: names.get(m.from),
          text,
          messageId: m.id,
          at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : undefined,
        });
      }
    }
  }
  return out;
}
