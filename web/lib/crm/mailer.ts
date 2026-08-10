/* Outbound e-mail via Resend. DARK BY DEFAULT: without RESEND_API_KEY +
   CRM_AUTO_FROM the engine is fully inert — nothing is ever sent. This is
   deliberate: setting the two env vars is what activates the sequence, and
   until then nothing can reach a customer by accident. */

export function autoEmailsEnabled(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.CRM_AUTO_FROM &&           // e.g. "Longevity Samui <sales@longevitysamui.com>"
    process.env.CRM_AUTO_EMAILS !== 'off', // explicit kill-switch
  );
}

const SITE = 'https://longevitysamui.com';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  /** The lead this is going to. Drives the one-click unsubscribe headers. */
  leadId?: string;
}

/* ── Why a plain-text part ──

   An HTML-only message is one of the oldest and cheapest spam signals there
   is: every ordinary mail client sends both parts, so a message with only one
   looks machine-made before a filter has read a word of it.

   Deriving it from the HTML keeps one source of truth for the copy — the
   letter is written once, in letters.ts, and this is a view of it. Links are
   written out as "Label: url" rather than dropped, because a reader who
   cannot see the button still needs the address. */
export function plainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<head[\s\S]*?<\/head>/gi, '')
    // The hidden preheader is inbox-preview furniture, not part of the letter.
    .replace(/<span style="display:none[\s\S]*?<\/span>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      if (!text) return href;
      return href.startsWith('mailto:') ? text : `${text}: ${href}`;
    })
    .replace(/<\/(p|div|tr|h1|h2|h3|td)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&rsquo;/g, '’')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')   // last, so an escaped &amp;lt; cannot become a tag
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Send one e-mail. Returns true on acceptance; never throws. */
export async function sendEmail(mail: OutgoingEmail): Promise<boolean> {
  if (!autoEmailsEnabled()) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    /* ── One-click unsubscribe ──

       The opt-out link at the foot of the letter is not enough on its own.
       Mailbox providers want the machine-readable header, and Gmail treats its
       absence as a mark against a bulk sender. With both headers present the
       client shows its own "Unsubscribe" control beside the sender name, which
       is what an irritated recipient presses INSTEAD of "report spam". That
       difference is the whole point: one costs us a lead, the other costs us
       the reputation of the domain. */
    const headers: Record<string, string> = {};
    if (mail.leadId) {
      const url = `${SITE}/api/unsubscribe?l=${encodeURIComponent(mail.leadId)}`;
      headers['List-Unsubscribe'] = `<${url}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CRM_AUTO_FROM,
        to: [mail.to],
        /* Where replies go — and, just as importantly, how many addresses the
           customer is shown. A Reply-To that differs from the From makes the
           client print both, which reads like a forwarded mail rather than a
           letter from a person.

           So: only set it when it earns its place. With Resend inbound
           configured, CRM_REPLY_TO points at that address so the CRM sees
           answers and can stop the sequence — worth the second line. Unset,
           we send nothing at all and replies go to the From address, which is
           a real mailbox somebody reads. The old fallback to CRM_NOTIFY_TO
           bought nothing: the CRM was blind to those replies either way, and
           it cost a second address on every letter. */
        reply_to: process.env.CRM_REPLY_TO || undefined,
        subject: mail.subject,
        html: mail.html,
        text: plainText(mail.html),
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
