/* Public endpoint — the live site posts a lightweight interaction event here
   whenever a visitor clicks a meaningful CTA (open a form, WhatsApp, phone,
   brochure…). Anonymous; stored separately from leads. */
import { addEvent } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* Light per-IP rate limit (per serverless instance): enough to stop casual
   spam of this anonymous endpoint without any external dependency. */
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 30;          // events
const WINDOW = 60_000;     // per minute

function allowed(ip: string): boolean {
  const nowT = Date.now();
  const h = hits.get(ip);
  if (!h || nowT - h.t > WINDOW) {
    hits.set(ip, { n: 1, t: nowT });
    if (hits.size > 5000) hits.clear(); // bound memory
    return true;
  }
  h.n += 1;
  return h.n <= LIMIT;
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!allowed(ip)) return Response.json({ ok: false }, { status: 429 });

  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const label = String(b.label || '').trim();
  if (!label) return Response.json({ ok: false }, { status: 400 });

  /* A WhatsApp tap posts what we know about the visitor alongside the reference
     code, because the conversation is about to leave the site and this is the
     last moment any of it is knowable. Every other event ignores these. */
  const str = (v: unknown, max: number) => (v ? String(v).slice(0, max) : undefined);
  const utmIn = (b.utm && typeof b.utm === 'object' ? b.utm : {}) as Record<string, unknown>;
  const utm: Record<string, string> = {};
  for (const k of ['source', 'medium', 'campaign', 'term', 'content'] as const) {
    const v = str(utmIn[k], 120);
    if (v) utm[k] = v;
  }

  try {
    await addEvent({
      type: String(b.type || 'click'),
      label,
      path: b.path ? String(b.path) : undefined,
      source: b.source ? String(b.source) : undefined,
      ref: str(b.ref, 16),
      locale: str(b.locale, 10),
      page_url: str(b.page_url, 300),
      utm,
    });
  } catch {
    /* never let tracking break anything */
  }
  return Response.json({ ok: true });
}
