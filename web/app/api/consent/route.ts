import { addEvent } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* ── Consent log ──

   GDPR Art. 7(1): a controller must be able to *demonstrate* that consent was
   given. The cookie on the visitor's device is their copy; this is ours.

   Deliberately anonymous. We record what was chosen, when, in which language,
   and a salted one-way hash of the IP — enough to show a decision was made and
   to answer "was consent in place on this date", but not enough to identify
   anyone or to build a profile. Logging consent must not itself become
   tracking. */

const hash = async (value: string) => {
  const salt = process.env.CONSENT_SALT || 'longevity-consent';
  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const c = body?.choices || {};
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const granted = ['preferences', 'analytics', 'marketing'].filter((k) => c[k] === true);

    await addEvent({
      type: 'consent',
      label: granted.length ? `Accepted: ${granted.join(', ')}` : 'Rejected non-essential',
      path: typeof body?.locale === 'string' ? body.locale.slice(0, 5) : undefined,
      source: ip ? `v${body?.version ?? '?'}·${await hash(ip)}` : `v${body?.version ?? '?'}`,
    });
  } catch {
    /* Never fail the visitor's choice over a logging problem — the cookie is
       already written client-side by the time this runs. */
  }
  return Response.json({ ok: true });
}
