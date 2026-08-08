import { createHmac, timingSafeEqual } from 'node:crypto';
import { recordBooking, upsertLeadFromPayload } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* ── Call bookings ──

   Cal.com posts here when someone books a call from the "Book a call" button
   in an automated e-mail (or from any of our booking links). The booking lands
   on the lead's timeline with the time and the video-call link, and the lead
   moves to Contacted — a booked call is contact by any reasonable definition.

   Auth: HMAC-SHA256 of the raw body in `x-cal-signature-256`, keyed with
   CAL_WEBHOOK_SECRET. Unset → the endpoint always 401s.

   An unknown e-mail address becomes a lead: someone who books a call is a lead
   even if they never filled in a form. */

interface CalWebhook {
  triggerEvent?: string;
  payload?: {
    title?: string;
    startTime?: string;
    endTime?: string;
    attendees?: { email?: string; name?: string; timeZone?: string }[];
    metadata?: { videoCallUrl?: string };
    responses?: { notes?: { value?: string } };
    cancellationReason?: string;
  };
}

function signatureOk(raw: string, header: string | null): boolean {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!signatureOk(raw, request.headers.get('x-cal-signature-256'))) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let event: CalWebhook;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const kind = event.triggerEvent;
  const p = event.payload || {};
  const attendee = (p.attendees || [])[0] || {};
  const email = (attendee.email || '').trim().toLowerCase();
  if (!email) return Response.json({ ok: true, ignored: 'no attendee' });

  const handled: Record<string, 'booked' | 'rescheduled' | 'cancelled'> = {
    BOOKING_CREATED: 'booked',
    BOOKING_RESCHEDULED: 'rescheduled',
    BOOKING_CANCELLED: 'cancelled',
  };
  const action = kind ? handled[kind] : undefined;
  if (!action) return Response.json({ ok: true, ignored: kind || 'unknown event' });

  try {
    const { lead } = await upsertLeadFromPayload(
      { email, name: attendee.name, form_type: 'call', form_origin: 'booking', source: 'booking' },
      undefined,
    );
    await recordBooking(lead.id, {
      action,
      at: p.startTime,
      timeZone: attendee.timeZone,
      title: p.title,
      videoUrl: p.metadata?.videoCallUrl,
      note: p.responses?.notes?.value || p.cancellationReason,
    });
    return Response.json({ ok: true, lead: lead.id, action });
  } catch {
    return Response.json({ ok: true, stored: false });
  }
}
