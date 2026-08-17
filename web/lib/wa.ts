/* ── Reading a Longevity reference off an inbound WhatsApp message ──

   The site no longer publishes a WhatsApp number: there is no floating icon and
   no wa.me link anywhere in the public pages, so no visitor is handed a phone
   number to tap. Every enquiry comes through the form instead, which is the
   route that reaches the CRM with page, language and campaign still attached.

   Inbound messages have not stopped, though — a "Ref: LR-XXXXXX" line can still
   arrive from a letter, from a salesperson's own wa.me link, or from someone who
   saved the number months ago. This is what reads that reference back off it.

   ── Why a reference code ──

   To Meta, the moment a person first heard of us and the message that lands on
   the webhook are two unrelated events: the webhook delivers a phone number and
   a line of text, nothing else. The code is the thread between them — when the
   message arrives the CRM looks it up and the lead is born with its history
   attached instead of as an anonymous number.

   Client-safe on purpose (no node: imports). */

/* Codes are shown to the customer, so they are read aloud, retyped and
   screenshotted: six characters, no I/O/0/1. */
const REF_LENGTH = 6;

/* The whole "Ref: LR-XXXXXX" line comes off the text, not just the code: what
   goes on the lead's timeline should read like something a person wrote, and
   our own bookkeeping has no business being there. Tolerant of what WhatsApp
   and the customer do to a prefilled message — reordered lines, a lower-case
   retype, a stray full stop at the end. */
const REF_LINE = new RegExp(String.raw`\s*(?:^|\n)\s*(?:ref\.?|reference)\s*[:#-]?\s*LR-([A-Z0-9]{${REF_LENGTH}})\s*\.?\s*(?=\n|$)`, 'i');

export function stripWaRef(raw: string): { ref: string | null; text: string } {
  const m = REF_LINE.exec(raw);
  if (!m) return { ref: null, text: raw };
  const text = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim();
  /* A message that was nothing but the reference still has to say something on
     the timeline, otherwise the operator sees an empty line and no context. */
  return { ref: m[1].toUpperCase(), text: text || 'Started a WhatsApp chat' };
}
