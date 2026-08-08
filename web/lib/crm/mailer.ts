/* Outbound e-mail via Resend. DARK BY DEFAULT: without RESEND_API_KEY +
   CRM_AUTO_FROM the engine is fully inert — nothing is ever sent. This is
   deliberate while Bigin still handles customer e-mail; flipping the two env
   vars (and turning Bigin's sender off) activates the sequence. */

export function autoEmailsEnabled(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.CRM_AUTO_FROM &&           // e.g. "Longevity Samui <sales@longevitysamui.com>"
    process.env.CRM_AUTO_EMAILS !== 'off', // explicit kill-switch
  );
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

/** Send one e-mail. Returns true on acceptance; never throws. */
export async function sendEmail(mail: OutgoingEmail): Promise<boolean> {
  if (!autoEmailsEnabled()) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CRM_AUTO_FROM,
        to: [mail.to],
        /* Where replies go. With Resend inbound configured, set CRM_REPLY_TO to
           that inbound address so the CRM sees answers and can stop the sequence;
           the inbound route forwards a copy to the operator's mailbox either way.
           Unset, replies go straight to the operator and the CRM stays blind. */
        reply_to: process.env.CRM_REPLY_TO || process.env.CRM_NOTIFY_TO || undefined,
        subject: mail.subject,
        html: mail.html,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
