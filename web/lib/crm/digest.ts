import type { Lead } from './types';
import { hasNoNextStep, isStalled, stageAgeDays } from './rules';
import { REPLY_FLAG_DAYS, listLeads } from './store';

/* ── The morning digest ──

   Everything else in this CRM waits to be looked at. A lead can sit untouched
   for a week and the system will patiently keep the badge red without anyone
   ever seeing it, because seeing it requires opening the CRM in the first
   place. This inverts that: once a day, at seven in the morning Samui time,
   the CRM writes to the operator instead.

   The rule for what goes in: only things a person has to DO today. Vanity
   counts are left out — a digest that reports how well yesterday went trains
   you to stop reading it. If there is nothing to do, nothing is sent at all,
   which is what makes the mail worth opening on the days it does arrive. */

const SITE = 'https://longevitysamui.com';
const DAY = 86_400_000;

export interface DigestLine {
  leadId: string;
  name: string;
  detail: string;
}

export interface Digest {
  date: string;
  /* Ordered by how much it costs to ignore: a customer waiting on an answer
     beats a task you set yourself, which beats a lead going stale. */
  unanswered: DigestLine[];   // they wrote to us and nobody has replied
  overdue: DigestLine[];      // open tasks past their due date
  untouched: DigestLine[];    // new leads nobody has picked up
  awaiting: DigestLine[];     // we wrote, they have gone quiet past the threshold
  warming: DigestLine[];      // opened or clicked in the last day — call them now
  stalled: DigestLine[];      // sitting in a stage past its limit
  noNext: DigestLine[];       // active, with nothing scheduled at all
  total: number;
}

const nameOf = (l: Lead) => l.name || l.email || l.whatsapp || l.phone || 'Unknown';
const line = (l: Lead, detail: string): DigestLine => ({ leadId: l.id, name: nameOf(l), detail });

/* A customer's message counts as answered once a human does something after
   it — writes a note, sets a task, or moves the deal. The automatic sequence
   deliberately doesn't count: it stopped the moment they replied. */
function unansweredSince(l: Lead): string | null {
  const messages = (l.history || []).filter((h) => h.kind === 'message');
  if (!messages.length) return null;
  const last = messages[messages.length - 1];
  const humanAfter =
    l.notes.some((n) => n.by && n.at > last.at) ||
    l.tasks.some((t) => t.at > last.at) ||
    (l.history || []).some((h) => h.at > last.at && (h.kind === 'stage' || h.kind === 'score') && h.by);
  return humanAfter ? null : last.at;
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

export async function buildDigest(now = new Date()): Promise<Digest> {
  const leads = await listLeads();
  const today = now.toISOString().slice(0, 10);
  const newCut = new Date(now.getTime() - DAY).toISOString();
  const replyCut = new Date(now.getTime() - REPLY_FLAG_DAYS * DAY).toISOString();
  const warmCut = new Date(now.getTime() - DAY).toISOString();

  const d: Digest = {
    date: today,
    unanswered: [], overdue: [], untouched: [], awaiting: [],
    warming: [], stalled: [], noNext: [], total: 0,
  };

  for (const l of leads) {
    if (l.stage === 'won' || l.stage === 'lost') continue;

    const waiting = unansweredSince(l);
    if (waiting) {
      const days = daysSince(waiting);
      d.unanswered.push(line(l, days === 0 ? 'wrote to us today' : `waiting ${days} day${days === 1 ? '' : 's'}`));
    }

    for (const t of l.tasks) {
      if (!t.done && t.due && t.due.slice(0, 10) < today) {
        d.overdue.push(line(l, `${t.title} — due ${t.due.slice(0, 10)}`));
      }
    }

    if (l.stage === 'new' && l.created_at < newCut && !l.notes.length && !l.tasks.length) {
      d.untouched.push(line(l, `came in ${daysSince(l.created_at)} day${daysSince(l.created_at) === 1 ? '' : 's'} ago, nobody has picked it up`));
    }

    if (l.awaiting_reply_since && l.awaiting_reply_since < replyCut) {
      d.awaiting.push(line(l, `no answer for ${daysSince(l.awaiting_reply_since)} days`));
    }

    /* The most actionable group in the whole mail: someone who opened the
       brochure or pressed a button yesterday is thinking about it right now. */
    const signals = (l.history || []).filter(
      (h) => (h.kind === 'download' || h.kind === 'click') && h.at > warmCut,
    );
    if (signals.length) {
      d.warming.push(line(l, signals.map((s) => s.detail).slice(0, 3).join(' · ')));
    }

    if (isStalled(l)) d.stalled.push(line(l, `${stageAgeDays(l)} days in ${l.stage}`));
    if (hasNoNextStep(l)) d.noNext.push(line(l, 'no task, no reply expected — nothing scheduled'));
  }

  d.total =
    d.unanswered.length + d.overdue.length + d.untouched.length +
    d.awaiting.length + d.warming.length + d.stalled.length + d.noNext.length;
  return d;
}

/* ── The mail itself ──
   Deliberately plainer than the customer letters: this is a working document
   read on a phone at breakfast, so it is a list, not a brochure. */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PANEL = '#0A140C';
const GOLD = '#C9A46A';
const GOLD_HI = '#D8B87C';
const BODY = '#D6C7A8';
const MUTED = '#C6BCA6';   // sand, matching the letters — see letters.ts

function section(title: string, lines: DigestLine[], urgent = false): string {
  if (!lines.length) return '';
  return `
  <tr><td style="padding:26px 32px 0 32px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;line-height:14px;letter-spacing:0.28em;text-transform:uppercase;color:${urgent ? GOLD_HI : MUTED};">${esc(title)} &middot; ${lines.length}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
      ${lines.slice(0, 12).map((l) => `
      <tr><td style="padding:10px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:${BODY};">
        <a href="${SITE}/admin/leads/${l.leadId}" style="color:${GOLD_HI};text-decoration:none;">${esc(l.name)}</a>
        <span style="color:${MUTED};"> — ${esc(l.detail)}</span>
      </td></tr>`).join('')}
      ${lines.length > 12 ? `
      <tr><td style="padding:10px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">and ${lines.length - 12} more</td></tr>` : ''}
    </table>
  </td></tr>`;
}

export function digestHtml(d: Digest): string {
  const bg = (c: string) => `background-color:${c};background-image:linear-gradient(${c},${c});`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Today at Longevity</title></head>
<body style="margin:0;padding:0;${bg('#060E08')}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${bg('#060E08')}">
<tr><td align="center" style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;${bg(PANEL)}">

  <tr><td style="padding:36px 32px 0 32px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;line-height:16px;letter-spacing:0.30em;text-transform:uppercase;color:${MUTED};">Longevity CRM &middot; ${esc(d.date)}</div>
    <h1 style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;line-height:38px;color:${GOLD_HI};">${d.total} thing${d.total === 1 ? '' : 's'} to do today</h1>
  </td></tr>

  ${section('Waiting on you', d.unanswered, true)}
  ${section('Overdue', d.overdue, true)}
  ${section('Nobody has picked these up', d.untouched, true)}
  ${section('Warming up — they opened something', d.warming)}
  ${section('Gone quiet', d.awaiting)}
  ${section('Stalled', d.stalled)}
  ${section('No next step', d.noNext)}

  <tr><td align="center" style="padding:34px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr><td align="center" bgcolor="${GOLD}" style="${bg(GOLD)}border-radius:999px;">
        <a href="${SITE}/admin" style="display:block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:16px;letter-spacing:0.18em;text-transform:uppercase;color:${PANEL};text-decoration:none;">Open the CRM</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding:30px 32px 36px 32px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:20px;color:${MUTED};">
    Sent once a day, and only when there is something to do.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Build and send today's digest. Silent when there is nothing worth saying. */
export async function sendDigest(): Promise<{ sent: boolean; total: number }> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.CRM_DIGEST_TO || process.env.CRM_NOTIFY_TO;
  const from = process.env.CRM_NOTIFY_FROM || process.env.CRM_AUTO_FROM;
  if (!key || !to || !from) return { sent: false, total: 0 };

  const d = await buildDigest();
  // An empty digest is the good case, and sending it anyway is how a daily
  // mail becomes wallpaper. Nothing to do, nothing in the inbox.
  if (!d.total) return { sent: false, total: 0 };

  const headline =
    d.unanswered.length ? `${d.unanswered.length} waiting on you`
    : d.overdue.length ? `${d.overdue.length} overdue`
    : `${d.total} to do`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        subject: `Today at Longevity — ${headline}`,
        html: digestHtml(d),
      }),
    });
    return { sent: res.ok, total: d.total };
  } catch {
    return { sent: false, total: d.total };
  }
}
