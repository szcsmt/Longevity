import { createHmac, timingSafeEqual } from 'node:crypto';

/* ── Verifying a Resend webhook ──

   Resend signs its deliveries with the Standard Webhooks scheme (Svix). This
   is a real improvement on the shared secret in the query string it replaces:
   a URL secret proves only that the caller once saw the URL, and URLs leak —
   into logs, into browser history, into a screenshot of a dashboard. A
   signature proves the body came from Resend and has not been altered.

   The scheme, exactly:
     · headers `svix-id`, `svix-timestamp`, `svix-signature`
       (also sent as `webhook-id` / `-timestamp` / `-signature`)
     · signed content is `<id>.<timestamp>.<raw body>`
     · key is the base64 payload of the `whsec_...` secret, decoded to bytes
     · signature is HMAC-SHA256, base64
     · the header may carry several space-separated versioned signatures
       (`v1,<sig> v1,<sig>`) during a secret rotation — any one matching is
       enough, which is what makes rotation possible without dropped events. */

const TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Pull the signature headers, accepting either spelling. */
export function svixHeaders(h: Headers): SvixHeaders {
  return {
    id: h.get('svix-id') || h.get('webhook-id'),
    timestamp: h.get('svix-timestamp') || h.get('webhook-timestamp'),
    signature: h.get('svix-signature') || h.get('webhook-signature'),
  };
}

const equalB64 = (a: string, b: string) => {
  const x = Buffer.from(a, 'base64');
  const y = Buffer.from(b, 'base64');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/**
 * True when `raw` genuinely came from the sender holding `secret`.
 * `now` is injectable so the replay window can be tested honestly.
 */
export function verifySvix(
  raw: string,
  headers: SvixHeaders,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  /* Reject anything old enough to be a replay. Without this, a delivery
     captured once could be posted back for ever — the signature stays valid,
     because the signature is over the content, not over the moment. */
  const sent = Number(headers.timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(now / 1000 - sent) > TOLERANCE_SECONDS) return false;

  // "whsec_" is a human-readable prefix, not part of the key material.
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (!key.length) return false;

  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${raw}`, 'utf8')
    .digest('base64');

  for (const part of headers.signature.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    if (equalB64(expected, value)) return true;
  }
  return false;
}
