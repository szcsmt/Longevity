/* Inbound lead ingestion for make.com / Zoho Bigin (e.g. WhatsApp leads).
   make.com POSTs a lead here with the shared secret in the `x-ingest-key`
   header (or `?key=`). We store it straight into the CRM and do NOT forward it
   back to make.com — that avoids a loop, unlike /api/lead. Flexible field
   mapping so Bigin/WhatsApp payloads map cleanly to our lead shape. */
import { upsertLeadFromPayload } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

function pick(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Decode a base64 field. make.com sends the WhatsApp message body base64-encoded
    so quotes / newlines / emojis can never corrupt the JSON payload in transit. */
function fromB64(s: string | undefined): string | undefined {
  if (!s) return undefined;
  try {
    const t = Buffer.from(s, 'base64').toString('utf8').trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort name from a WhatsApp opener like "My name is Jane Doe. …". */
function nameFromMessage(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  const m = msg.match(/my name is\s+([^\n.,;!?]+)/i);
  if (!m) return undefined;
  return m[1].trim().split(/\s+/).slice(0, 3).join(' ') || undefined;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const key = req.headers.get('x-ingest-key') || url.searchParams.get('key') || '';
  const secret = process.env.INGEST_SECRET;
  if (!secret || key !== secret) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Tolerant body parse: message may arrive base64 in `message_b64`, so the JSON
  // itself always stays well-formed regardless of the WhatsApp text content.
  const raw = await req.text();
  let p: Record<string, unknown> = {};
  try {
    p = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    p = {};
  }

  const first = pick(p, 'first_name', 'First Name', 'firstName', 'Owner_First_Name');
  const last = pick(p, 'last_name', 'Last Name', 'lastName');
  const phone = pick(p, 'phone', 'Phone', 'mobile', 'Mobile', 'phone_number', 'Phone Number', 'whatsapp', 'WhatsApp');
  const message = pick(p, 'message', 'Message', 'note', 'Note', 'Description', 'text', 'body')
    || fromB64(pick(p, 'message_b64', 'messageB64'));
  const name = pick(p, 'name', 'Full_Name', 'fullName', 'contact_name', 'Contact Name')
    || [first, last].filter(Boolean).join(' ').trim()
    || nameFromMessage(message)
    || undefined;

  const payload = {
    name,
    email: pick(p, 'email', 'Email', 'email_address'),
    phone,
    whatsapp: pick(p, 'whatsapp', 'WhatsApp') || phone,
    form_type: pick(p, 'form_type') || 'whatsapp',
    form_origin: pick(p, 'form_origin') || 'bigin',
    source: pick(p, 'source', 'Source', 'utm_source', 'Lead Source') || 'WhatsApp',
    utm_campaign: pick(p, 'utm_campaign', 'campaign', 'Campaign'),
    page_url: pick(p, 'page_url', 'url'),
    gdpr_consent: p.gdpr_consent === true || p.gdpr_consent === 'true',
    submitted_at: pick(p, 'submitted_at', 'created_at', 'Created Time'),
  };

  // Require at least one contact detail so we don't store empty rows. Return 200
  // (not 4xx) so an empty WhatsApp webhook never registers as an error in the
  // make.com scenario that forwards to us — it just becomes a no-op.
  if (!payload.name && !payload.email && !payload.phone) {
    return Response.json({ ok: false, skipped: 'empty' });
  }

  try {
    // One person = one lead: a known contact's new message lands as a note on
    // their existing lead (and counts as their reply); only a genuinely new
    // contact creates a lead.
    const { lead, created } = await upsertLeadFromPayload(payload as Record<string, unknown>, message);
    return Response.json({ ok: true, id: lead.id, created });
  } catch {
    return Response.json({ ok: false, error: 'store error' }, { status: 500 });
  }
}
