/* ── Getting the message out of the e-mail ──

   Shared by the Resend inbound webhook and the Gmail sync, because both face
   the same three problems: the body may only exist as HTML, the sender arrives
   wrapped in a display name, and a two-line reply carries a fortnight of quoted
   history underneath it.

   Lived in the inbound route until the Gmail sync needed the identical logic.
   Two copies of a quote-trimmer is two behaviours the moment somebody fixes a
   bug in one of them. */

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Jane Doe <jane@x.com>" → "jane@x.com" */
export const addressOf = (from: string): string =>
  (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();

/** "Jane Doe <jane@x.com>" → "Jane Doe" */
export const nameOf = (from: string): string | undefined => {
  const n = from.split('<')[0].trim().replace(/^["']|["']$/g, '');
  return n && !n.includes('@') ? n : undefined;
};

/** Every address in a header that may list several. */
export const addressesIn = (header: string): string[] =>
  header.split(',').map((p) => addressOf(p)).filter((a) => a.includes('@'));

/* Cut at the first quote marker so a note — and the AI reading — see what the
   person actually wrote this time, not the thread they wrote it under. */
export function justTheReply(text: string): string {
  const markers = [
    /^\s*On .+ wrote:\s*$/m,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*From:\s.+$/m,
    /^\s*>{1,}/m,
    /^\s*_{10,}\s*$/m,
    /^\s*Sent from my \w+/m,
    /^\s*\d{4}\. \w+\. \d+\..*írta:\s*$/m,   // Gmail, in Hungarian
  ];
  let cut = text.length;
  for (const m of markers) {
    const hit = text.match(m);
    if (hit?.index !== undefined && hit.index < cut) cut = hit.index;
  }
  return text.slice(0, cut).trim() || text.trim();
}
