import { ClaimConflict, registerAgency, upsertLeadFromPayload } from '@/lib/crm/store';
import { protectionDays } from '@/lib/crm/partners';
import { currentAgency } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

/* Same shape of limit as the public lead form: an agency registering more than
   a handful of buyers a minute is a script, not a salesperson. */
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 6;
const WINDOW = 60_000;

function allowed(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.t > WINDOW) {
    hits.set(key, { n: 1, t: now });
    if (hits.size > 5000) hits.clear();
    return true;
  }
  h.n += 1;
  return h.n <= LIMIT;
}

export async function POST(req: Request) {
  const agency = await currentAgency();
  if (!agency) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  if (!allowed(agency.id)) return Response.json({ ok: false }, { status: 429 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const name = str('name');
  const email = str('email');
  const phone = str('phone');

  if (!name) return Response.json({ ok: false, error: 'A buyer needs a name.' }, { status: 400 });
  if (!email && !phone) {
    return Response.json(
      { ok: false, error: 'An e-mail address or a phone number — without one of them we cannot tell whether we already know this buyer.' },
      { status: 400 },
    );
  }

  /* Through the SAME gate as every website form. That is the point: if we
     already know this person, the registration attaches to the record that
     exists rather than starting a second one beside it — which is exactly the
     duplicate an agency portal would otherwise create every week. */
  const { lead, created } = await upsertLeadFromPayload({
    name,
    email,
    phone,
    whatsapp: str('whatsapp'),
    villa: str('villa'),
    form_type: 'manual',
    form_origin: `agency: ${agency.name}`,
    source: 'agent',
  }, str('note') ? `Registered by ${agency.name}: ${str('note')}` : undefined);

  try {
    await registerAgency(
      lead.id,
      agency,
      protectionDays(agency),
      { brokerName: str('broker') || undefined, note: str('note') || undefined },
      `${agency.name} (portal)`,
    );
  } catch (err) {
    if (err instanceof ClaimConflict) {
      /* Somebody else holds the claim. The portal says so and does NOT say
         who: that is the other agency's business, and naming them would turn
         a protection window into a leak. The date is ours to share — it is
         what tells this agency when they may try again. */
      return Response.json(
        {
          ok: false,
          error: 'This buyer is already registered with us by another partner.',
          until: err.claim.expires_at ?? null,
        },
        { status: 409 },
      );
    }
    throw err;
  }

  return Response.json({ ok: true, created });
}
