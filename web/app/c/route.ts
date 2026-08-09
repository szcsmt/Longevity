import { getLead, recordClick } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* ── Tracked click: /c?l=<lead id>&t=<label>&u=<destination> ──

   Every button in every letter leaves through here. It writes one line on the
   lead's timeline and then redirects, so the customer sees nothing but the
   page they asked for.

   Why this and not an open-tracking pixel: an open is mostly noise (images
   load themselves, previews fire, corporate scanners click everything once),
   while a click is a person deciding to act. It is also honest — nothing is
   recorded unless they actually pressed something.

   The destination is checked against an allowlist before we redirect. Without
   that this route would be an open redirect: anyone could dress up a link to
   their own site as longevitysamui.com/c?u=..., which is exactly the shape a
   phishing mail takes. An unknown destination is refused rather than followed. */

const SITE_HOST = 'longevitysamui.com';

/* Hosts we deliberately send people to. Booking lives on Cal.com and chat on
   wa.me, so both have to be reachable from a letter. */
const ALLOWED_HOSTS = new Set([
  SITE_HOST,
  'www.longevitysamui.com',
  'cal.com',
  'app.cal.com',
  'wa.me',
  'api.whatsapp.com',
]);

function allowed(target: URL): boolean {
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
  const host = target.hostname.toLowerCase();
  return ALLOWED_HOSTS.has(host) || host.endsWith(`.${SITE_HOST}`);
}

/* ── Named destinations ──

   `?d=booking` instead of `?u=<the whole encoded URL>`. The letters use this
   for the booking button, which keeps the address out of the query string:
   a full encoded URL sitting in a link is the shape a phishing link takes,
   and filters score it accordingly. Resolving the name here also means the
   calendar can be moved without touching a letter already in an inbox.

   The customer's details are filled in from the lead rather than carried
   through the link, so the calendar still opens prefilled. */
async function namedDestination(name: string, leadId: string | null): Promise<string | null> {
  if (name !== 'booking') return null;
  const booking = process.env.CRM_BOOKING_URL;
  if (!booking) return null;
  try {
    const u = new URL(booking);
    const lead = leadId ? await getLead(leadId).catch(() => null) : null;
    if (lead?.name) u.searchParams.set('name', lead.name);
    if (lead?.email) u.searchParams.set('email', lead.email);
    return u.toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const leadId = q.get('l');
  const label = (q.get('t') || 'a link').slice(0, 120);
  const named = q.get('d');
  const raw = named ? await namedDestination(named, leadId) : q.get('u');

  if (!raw) return new Response('Missing destination', { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('Bad destination', { status: 400 });
  }
  if (!allowed(target)) return new Response('Destination not allowed', { status: 400 });

  // Never let a logging failure stand between the customer and where they
  // were going — the redirect is the promise this route made.
  if (leadId) await recordClick(leadId, label).catch(() => {});

  return Response.redirect(target.toString(), 302);
}
