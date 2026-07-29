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
  try {
    await addEvent({
      type: String(b.type || 'click'),
      label,
      path: b.path ? String(b.path) : undefined,
      source: b.source ? String(b.source) : undefined,
    });
  } catch {
    /* never let tracking break anything */
  }
  return Response.json({ ok: true });
}
