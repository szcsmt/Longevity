import type { Lead } from './types';
import { type Agent, agentByName, agents } from './agents';

/* ── The letters the automatic sequence sends ──
   Content only: no store, no mailer, no Node APIs, so the wording can be read,
   rendered and reviewed on its own. automation.ts decides WHEN each goes out
   (the timetable lives in sequence.ts); this file decides WHAT it says. */

const SITE = 'https://longevitysamui.com';
const BROCHURE_URL = `${SITE}/brochure/longevity-brochure-2026.pdf`;

const firstName = (l: Lead) => (l.name || '').trim().split(/\s+/)[0] || 'there';

/* Who signs the letter: the agent who owns the lead, falling back to the first
   person on the roster (CRM_AGENTS / CRM_AGENT_NAME). Until a roster exists,
   a neutral team signature is used. */
function signer(l: Lead): Agent | undefined {
  return agentByName(l.owner) || agents()[0];
}

/* Name, title and (when there is one) phone. No website link here — the brand
   footer already carries it, and a signature repeating it reads like a
   template rather than a person. */
function signature(l: Lead): string {
  const me = signer(l);
  if (!me) {
    return `<p style="margin:26px 0 0">Warm regards,<br/>The Longevity Samui team</p>`;
  }
  const wa = me.phone ? `https://wa.me/${me.phone.replace(/[^\d]/g, '')}` : null;
  return `
    <p style="margin:26px 0 0">Warm regards,</p>
    <p style="margin:14px 0 0"><b>${me.name}</b><br/>
      <span style="color:#555555">${me.title || 'Longevity Samui'}</span>
      ${me.phone ? `<br/>${me.phone}${wa ? ` · <a href="${wa}" style="color:#555555">WhatsApp</a>` : ''}` : ''}</p>`;
}

/* The brand frame: logo, a gold hairline, and a quiet footer — the letter
   itself stays a plain first-person note in a readable serif-free face. A
   hand-written-looking note gets replies; a designed newsletter gets skimmed,
   archived, and filed under Gmail's Promotions tab. This keeps the brand
   present without turning the letter into marketing.

   Table-based and inline-styled on purpose: Outlook ignores <div> widths and
   external CSS, so every mail client has to be handed the layout explicitly. */

const BODY_FONT = '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif';
const CREAM = '#FBF9F5';   // page behind the letter, warm rather than stark white
const GOLD = '#C9A46A';
const INK = '#222222';
const MUTED = '#8A8478';

/** A short centred gold hairline — the brand's own divider. */
const rule = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="48" style="width:48px;">
    <tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background-color:${GOLD};">&nbsp;</td></tr>
  </table>`;

const wrap = (l: Lead, body: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;padding:0;background-color:${CREAM};">
  <tr><td align="center" style="padding:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">

      <tr><td align="center" style="padding:36px 40px 0 40px;">
        <img src="${SITE}/email/logo.png" width="116" height="87" alt="Longevity Resort"
             style="display:block;width:116px;height:87px;border:0;outline:none;text-decoration:none;">
      </td></tr>

      <tr><td align="center" style="padding:18px 40px 0 40px;">${rule}</td></tr>

      <tr><td style="padding:30px 40px 0 40px;font-family:${BODY_FONT};color:${INK};font-size:15px;line-height:1.6;">
        ${body}
        ${signature(l)}
      </td></tr>

      <tr><td align="center" style="padding:36px 40px 0 40px;">${rule}</td></tr>

      <tr><td align="center" style="padding:16px 40px 40px 40px;font-family:${BODY_FONT};font-size:12px;line-height:1.7;color:${MUTED};">
        <a href="${SITE}" style="color:${MUTED};text-decoration:none;">longevitysamui.com</a><br/>
        Prefer not to get these follow-ups?
        <a href="${SITE}/api/unsubscribe?l=${l.id}" style="color:${MUTED};">Unsubscribe</a> ·
        it only stops the automatic mails, never a personal reply.
      </td></tr>

    </table>
  </td></tr>
</table>`;

/** The phone line to offer, only when the signing agent actually has one. */
const callLine = (l: Lead) => {
  const phone = signer(l)?.phone;
  return phone ? ` or call me directly at ${phone}` : '';
};

export function welcomeEmail(l: Lead): { subject: string; html: string } {
  const name = firstName(l);
  if (l.form_type === 'brochure_request') {
    return {
      subject: 'Your Longevity Samui brochure',
      html: wrap(l, `
        <p>Hi ${name},</p>
        <p>Thanks for your interest in Longevity — here's the brochure you asked for:</p>
        <p><a href="${BROCHURE_URL}" style="color:#9a7b3f;font-weight:bold">Download the brochure (PDF)</a></p>
        <p>Have a look, and if any of the residences catches your eye, just hit reply —
        I'm happy to walk you through availability, pricing and how reservation works.</p>`),
    };
  }
  if (l.form_type === 'reserve' || (l.form_origin || '').startsWith('villa')) {
    return {
      subject: `Your reservation enquiry${l.villa ? ` — ${l.villa}` : ''}`,
      html: wrap(l, `
        <p>Hi ${name},</p>
        <p>Thank you for your enquiry${l.villa ? ` about <b>${l.villa}</b>` : ''} — great choice.
        I'm putting together the details for you now: current availability, exact pricing and
        our simple 4-step payment schedule.</p>
        <p>I'll get back to you personally within a few hours. If you'd rather talk sooner,
        just reply to this e-mail${callLine(l)}.</p>`),
    };
  }
  return {
    subject: 'Thanks for reaching out',
    html: wrap(l, `
      <p>Hi ${name},</p>
      <p>Thanks for your interest in Longevity Wellness Resort — I've received your enquiry
      and will get back to you personally shortly.</p>
      <p>Meanwhile, feel free to browse the residences at
      <a href="${SITE}" style="color:#9a7b3f">${SITE.replace('https://', '')}</a> — and if you
      already have questions, just reply, this inbox comes straight to me.</p>`),
  };
}

export function reminderEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: `Re: your Longevity enquiry${l.villa ? ` — ${l.villa}` : ''}`,
    html: wrap(l, `
      <p>Hi ${firstName(l)},</p>
      <p>Just following up on what I sent a few days ago — I know a decision like this
      takes time, so no rush at all.</p>
      <p>If any questions have come up about the residences, pricing or the reservation
      process, just reply — I'm glad to help. And if the timing isn't right, a one-line
      reply saying so is absolutely fine too.</p>`),
  };
}

/* Day 10 — the "why this exists" letter. No offer, no pressure: someone who
   went quiet needs a reason to care again, not another nudge. */
export function storyEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: 'What we are actually building on Samui',
    html: wrap(l, `
      <p>Hi ${firstName(l)},</p>
      <p>I thought you might like the fuller picture, beyond the floor plans.</p>
      <p>Longevity isn't a villa development with a spa attached. It's a wellness resort
      built around one idea: that where you live should add years to your life, not take
      them. Private residences, a longevity and diagnostics centre, daily movement and
      recovery — on one of the calmest parts of Koh Samui.</p>
      <p>Owners use their residence part of the year and let us take care of it — and of
      guests — the rest. That's the part most people ask about second, once the place
      itself has done its work.</p>
      <p>If you'd like, reply with what matters most to you — the lifestyle, the returns,
      or simply the timing — and I'll send you exactly that, nothing else.</p>`),
  };
}

/* Day 24 — the invitation. The single strongest step in the sequence: people
   who see it (even by video) decide; people who only read never do. */
export function viewingEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: `Come and see it${l.villa ? ` — ${l.villa}` : ''}`,
    html: wrap(l, `
      <p>Hi ${firstName(l)},</p>
      <p>An offer that stands whenever you're ready: come and see
      ${l.villa ? `<b>${l.villa}</b>` : 'the resort'} in person. We arrange private viewings on
      Koh Samui — the site, the beach, the plans — and I'll block out the time properly,
      not a rushed walk-through.</p>
      <p>If travelling isn't practical right now, I'll do a live video tour with you
      instead: same thing, from your sofa, and you can ask anything as we go.</p>
      <p>Just reply with a couple of dates that could work${callLine(l)}, and I'll take
      care of the rest.</p>`),
  };
}

/* Day 45 — the numbers, plainly. By now they either want the commercials or
   they don't; hiding the payment schedule only wastes everyone's time. */
export function termsEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: 'How reserving a residence works',
    html: wrap(l, `
      <p>Hi ${firstName(l)},</p>
      <p>In case it's useful, here is the commercial side in plain terms — no small print.</p>
      <p>Reservation is a four-step schedule, each step tied to real progress on your
      residence:</p>
      <ul style="margin:12px 0 0;padding-left:20px">
        <li><b>7%</b> — reserves the plot, transferred into your name</li>
        <li><b>43%</b> — on completed foundation</li>
        <li><b>40%</b> — on completed building</li>
        <li><b>10%</b> — on furnishing, at handover</li>
      </ul>
      <p style="margin-top:16px">Nothing moves until the step before it is genuinely finished,
      which is the whole point of doing it this way.</p>
      <p>Reply and I'll send the current availability${l.villa ? ` and the exact figures for ${l.villa}` : ' and the exact figures'},
      plus the reservation agreement to read at your own pace.</p>`),
  };
}

/* Day 60 — the graceful exit. Says out loud that we'll stop writing, which is
   both good manners and, in practice, the mail that gets the most replies. */
export function closingEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: 'Closing the loop',
    html: wrap(l, `
      <p>Hi ${firstName(l)},</p>
      <p>I don't want to keep landing in your inbox uninvited, so this is my last automatic
      note — I'll leave the next move to you.</p>
      <p>Your enquiry stays on file with me. If Longevity comes back to mind in a month or
      in a year, one line to this address is all it takes and I'll pick it up exactly where
      we left off.${signer(l)?.phone ? ` My direct line is ${signer(l)!.phone} if you'd rather talk.` : ''}</p>
      <p>Either way, thank you for the interest — and if you ever find yourself on Samui,
      the invitation to visit stands.</p>`),
  };
}
