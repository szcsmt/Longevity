/* Traffic-source + lead capture for CRM attribution.
   A visitor arriving via e.g. https://longevitysamui.com/?utm_source=qr&utm_campaign=launch
   (or the simpler ?source=...) has the full UTM set stored for the whole session, so
   every form can send it on submit — even if the visitor scrolls or navigates first
   (the query string may be gone by then). Leads are POSTed to our own /api/lead route,
   which stores them server-side in our own CRM (keeps everything off
   the client). */
export const SOURCE_KEY = 'lr-source';
const UTM_KEY = 'lr-utm';
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type Utm = Partial<Record<(typeof UTM_FIELDS)[number] | 'source', string>>;

/** Reads any UTM / source params from the current URL, merges + persists them for the
 *  session, and returns the full set. Safe to call on any page, repeatedly. */
export function captureUtm(): Utm {
  try {
    const qs = new URLSearchParams(window.location.search);
    const incoming: Utm = {};
    for (const f of UTM_FIELDS) {
      const v = qs.get(f);
      if (v) incoming[f] = v;
    }
    const s = qs.get('source');
    if (s) incoming.source = s;

    const stored: Utm = JSON.parse(sessionStorage.getItem(UTM_KEY) || '{}');
    if (Object.keys(incoming).length) {
      const merged = { ...stored, ...incoming };
      sessionStorage.setItem(UTM_KEY, JSON.stringify(merged));
      return merged;
    }
    return stored;
  } catch {
    return {};
  }
}

/** The single best "source" value for the hidden field (?source= wins, else utm_source). */
export function captureSource(): string {
  const u = captureUtm();
  return u.source || u.utm_source || '';
}

/** Fire-and-forget lead POST to our own API route. Never throws
 *  and never blocks the UI — the visitor sees the thank-you regardless of network. */
export async function sendLead(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true, // let it finish even if the page navigates
      body: JSON.stringify({
        ...captureUtm(),
        ...payload,
        page_url: typeof location !== 'undefined' ? location.href : '',
        // Which language they were reading the site in — the CRM uses it to
        // route the lead to someone who speaks it (see lib/crm/language.ts).
        locale: typeof document !== 'undefined'
          ? (document.documentElement.lang || navigator.language || '').slice(0, 5)
          : '',
        submitted_at: new Date().toISOString(),
      }),
    });
  } catch {
    /* best-effort; attribution is not worth breaking the form over */
  }
}
