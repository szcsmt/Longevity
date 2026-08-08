import type { EmailStep, Lead } from './types';
import { type Agent, agentByName, agents } from './agents';
import { docHref } from './documents';
import { VILLAS } from './villas';

/* ── The letters the automatic sequence sends ──

   Built to the approved brand hand-off ("Direction A, Editorial"): a 600px
   centred column on #060E08, the letter on a #0A140C panel, gold scale type,
   Georgia headings, hairline rules, 2px-radius gold buttons, legal footer
   outside the panel. Pure white text is prohibited by the brand — everything
   comes from the warm gold scale.

   Content only: no store, no mailer, no Node APIs, so the wording and markup
   can be rendered and reviewed on their own. automation.ts decides WHEN each
   letter goes out (the timetable lives in sequence.ts); this file decides what
   it says and how it looks. */

const SITE = 'https://longevitysamui.com';

/* Documents are linked through the tracked /d/<id> route, so the CRM records
   who opened what — and so the file behind a link can be replaced without
   breaking the letters already sitting in people's inboxes. */
const docUrl = (l: Lead, id = 'brochure') => `${SITE}${docHref(id, l.id)}`;

/* ── Knowing who clicked ──

   Opening a letter tells us almost nothing: images load themselves, previews
   fire, and half of it is noise. A click is different — a person decided to
   act. So every button leaves through /c, which records the click on that
   lead's timeline and then redirects to the real destination.

   Two exemptions. A /d/ document link already records the open, and one tap
   should read as one line of history rather than two. And mailto: cannot be
   redirected to, so it goes out untouched. */
const track = (l: Lead, label: string, href: string) => {
  if (href.startsWith(`${SITE}/d/`) || href.startsWith('mailto:')) return href;
  const q = new URLSearchParams({ l: l.id, t: label, u: href });
  return `${SITE}/c?${q.toString()}`;
};

/* Design tokens, straight from the hand-off. */
const PAGE = '#060E08';
const PANEL = '#0A140C';
const GOLD = '#C9A46A';        // rules, buttons, links, figures
const GOLD_HI = '#D8B87C';     // headings, highlights
const EYEBROW = '#E4C48F';
const BODY = '#E6DFD1';        // intro/lead copy
const BODY_ROW = '#DBD3C3';    // the essentials table's right column
const BODY_2 = '#C9BFAC';      // price line, one step back from the body
const MUTED = '#8B8371';        // location line, sign-off detail
const LEGAL = '#6A6353';        // legal footer, outside the panel
const HAIR = 'rgba(201,164,106,0.26)';
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Helvetica,Arial,sans-serif';

/* Gmail's dark mode repaints a flat dark background into sand — it did exactly
   that to the first version of this design. A background-image that resolves to
   the same colour survives the repaint, so every dark surface sets both. */
const bg = (c: string) => `background-color:${c};background-image:linear-gradient(${c},${c});`;

const firstName = (l: Lead) => (l.name || '').trim().split(/\s+/)[0] || 'there';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Cheapest residence in the catalogue, for the price line. */
const fromPrice = () => {
  const low = Math.min(...VILLAS.map((v) => v.price));
  return `THB ${(low / 1_000_000).toFixed(2).replace(/0$/, '')} M`;
};

/* Who signs the letter: the agent who owns the lead, falling back to the first
   person on the roster (CRM_AGENTS / CRM_AGENT_NAME). Until a roster exists,
   the letter is signed by the sales office, as in the hand-off. */
function signer(l: Lead): Agent | undefined {
  return agentByName(l.owner) || agents()[0];
}

/** The 60px gold hairline the design uses as its only divider. */
const rule = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="60" style="width:60px;">
    <tr><td height="1" style="height:1px;line-height:1px;font-size:1px;${bg(GOLD)}">&nbsp;</td></tr>
  </table>`;

/** A body paragraph inside the panel. Left-aligned: these letters run to
    several paragraphs, and centred prose that long is hard to read. */
const p = (html: string) => `
  <tr><td class="px" style="padding:20px 56px 0 56px;">
    <p style="margin:0;font-family:${SANS};font-size:16px;line-height:28px;color:${BODY};">${html}</p>
  </td></tr>`;

/** The opening line, centred under the headline, as in the hand-off. */
const intro = (html: string) => `
  <tr><td class="px" style="padding:20px 56px 0 56px;" align="center">
    <p class="lead" style="margin:0;font-family:${SANS};font-size:16px;line-height:30px;color:${BODY};">${html}</p>
  </td></tr>`;

/** THE ESSENTIALS — the four-figure table from the hand-off. */
const essentials = () => {
  const rows: [string, string][] = [
    ['10%', 'Fixed annual ROI, contracted'],
    ['100%', 'Buyback guaranteed'],
    ['1 &amp; 2 BR', 'Residences with a private pool'],
    ['5 min', 'To the beach, 24/7 gated security'],
  ];
  return `
  <tr><td class="px" style="padding:36px 56px 0 56px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-top:1px solid ${HAIR};border-bottom:1px solid ${HAIR};">
      <tr><td style="padding:22px 0 6px 0;font-family:${SANS};font-size:10px;line-height:14px;letter-spacing:0.30em;text-transform:uppercase;color:${EYEBROW};">The essentials</td></tr>
      <tr><td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
          ${rows.map(([k, v]) => `
          <tr><td width="120" class="num" style="width:120px;padding:12px 0 0 0;font-family:${SERIF};font-size:22px;line-height:26px;color:${GOLD};">${k}</td>
              <td style="padding:12px 0 0 0;font-family:${SANS};font-size:15px;line-height:26px;color:${BODY_ROW};">${v}</td></tr>`).join('')}
        </table>
      </td></tr>
    </table>
  </td></tr>`;
};

/** The price line, with the figure picked out in the highlight gold. */
const priceLine = () => `
  <tr><td class="px" style="padding:26px 56px 0 56px;" align="center">
    <p style="margin:0;font-family:${SANS};font-size:15px;line-height:26px;color:${BODY_2};">
      Residences from <span style="color:${GOLD_HI};">${fromPrice()}</span>, fully managed.
      Wellness access is included with ownership.</p>
  </td></tr>`;

interface Button { label: string; href: string }

/** Primary (solid gold) and optional secondary (outlined) button, side by side.
    Takes the lead so every destination can leave through the click tracker. */
const buttons = (l: Lead, primary: Button, secondary?: Button) => `
  <tr><td class="px" style="padding:34px 56px 0 56px;" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btnwrap" style="margin:0 auto;">
      <tr class="btnrow">
        <td align="center" bgcolor="${GOLD}" class="btn" style="${bg(GOLD)}border-radius:999px;">
          <a href="${track(l, primary.label, primary.href)}" style="display:block;padding:17px 40px;font-family:${SANS};font-size:13px;line-height:16px;letter-spacing:0.18em;text-transform:uppercase;color:${PANEL};text-decoration:none;">${primary.label}</a>
        </td>
        ${secondary ? `
        <td width="14" class="gap" style="width:14px;font-size:1px;line-height:1px;">&nbsp;</td>
        <td align="center" class="btn" style="border:1px solid rgba(201,164,106,0.5);border-radius:999px;">
          <a href="${track(l, secondary.label, secondary.href)}" style="display:block;padding:16px 36px;font-family:${SANS};font-size:13px;line-height:16px;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD};text-decoration:none;">${secondary.label}</a>
        </td>` : ''}
      </tr>
    </table>
  </td></tr>`;

/* Who the letter is signed by. Two modes:

     · By default the lead's owner signs it — name, title, phone — because a
       letter from a person outperforms one from an organisation.
     · Set CRM_SIGNATURE_NAME and the office signs instead, with no personal
       name anywhere. Useful while there is one salesperson and no number to
       publish yet. The lead's OWNER is untouched either way: the CRM still
       knows who is responsible, it just isn't printed in the letter.

   Env: CRM_SIGNATURE_NAME, _TITLE, _PHONE, _EMAIL. */
export function letterIdentity(l: Lead): { name: string; title: string; phone?: string; email?: string } {
  const office = process.env.CRM_SIGNATURE_NAME;
  if (office) {
    return {
      name: office,
      title: process.env.CRM_SIGNATURE_TITLE || 'Plai Laem, Koh Samui, Thailand',
      phone: process.env.CRM_SIGNATURE_PHONE || undefined,
      email: process.env.CRM_SIGNATURE_EMAIL || agents()[0]?.email,
    };
  }
  const me = signer(l);
  return {
    name: me?.name || 'Longevity Resort Sales Office',
    title: me ? (me.title || 'Longevity Samui') : 'Plai Laem, Koh Samui, Thailand',
    phone: me?.phone,
    email: me?.email,
  };
}

const signOff = (l: Lead) => {
  const me = letterIdentity(l);
  const { name, title } = me;
  const wa = me.phone ? `https://wa.me/${me.phone.replace(/[^\d]/g, '')}` : null;
  const mail = me.email;
  return `
  <tr><td class="px" style="padding:46px 56px 0 56px;" align="center">${rule}</td></tr>
  <tr><td class="px" style="padding:26px 56px 44px 56px;" align="center">
    <div style="font-family:${SERIF};font-size:20px;line-height:28px;color:${GOLD_HI};">${esc(name)}</div>
    <div style="font-family:${SANS};font-size:13px;line-height:24px;color:${MUTED};padding-top:8px;">${esc(title)}<br>
      <a href="${SITE}" style="color:${GOLD};text-decoration:none;">longevitysamui.com</a>${mail ? ` &middot;
      <a href="mailto:${mail}" style="color:${GOLD};text-decoration:none;">${mail}</a>` : ''}${me.phone ? `<br>${esc(me.phone)}${wa ? ` &middot; <a href="${wa}" style="color:${GOLD};text-decoration:none;">WhatsApp</a>` : ''}` : ''}
    </div>
  </td></tr>`;
};

interface Letter {
  preheader: string;   // inbox preview text
  headline: string;    // Georgia, gold, centred
  body: string;        // rows built with intro()/p()/essentials()/buttons()
}

/** The full document: page, panel, logo, letter, sign-off, legal footer. */
function shell(l: Lead, letter: Letter): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Longevity Resort, Koh Samui</title>
<style>
  @media (prefers-color-scheme: dark){
    body, .page{background-color:${PAGE} !important;}
    .panel{background-color:${PANEL} !important;}
  }
  @media only screen and (max-width:620px){
    .container{width:100% !important;}
    .px{padding-left:26px !important;padding-right:26px !important;}
    .h1{font-size:28px !important;line-height:38px !important;}
    .lead{font-size:16px !important;line-height:29px !important;}
    .mark{width:88px !important;height:84px !important;}
    .num{width:88px !important;font-size:20px !important;}
    .btnwrap{width:100% !important;}
    .btnrow td{display:block !important;width:100% !important;box-sizing:border-box !important;}
    .gap{height:12px !important;line-height:12px !important;font-size:12px !important;width:auto !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;${bg(PAGE)}">
<span style="display:none;font-size:1px;color:${PAGE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(letter.preheader)}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="page" style="${bg(PAGE)}margin:0;padding:0;">
<tr><td align="center" style="padding:0;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container panel" style="width:600px;max-width:600px;${bg(PANEL)}">

  <tr><td class="px" style="padding:44px 56px 0 56px;" align="center">
    <img src="${SITE}/email/logo.png" width="134" height="128" alt="Longevity Resort" class="mark" style="display:block;width:134px;height:128px;border:0;outline:none;text-decoration:none;margin:0 auto;">
    <div style="font-family:${SANS};font-size:10px;line-height:16px;letter-spacing:0.30em;text-transform:uppercase;color:${MUTED};padding-top:18px;">Plai Laem &middot; Koh Samui &middot; Thailand</div>
  </td></tr>

  <tr><td class="px" style="padding:34px 56px 0 56px;" align="center">${rule}</td></tr>

  <tr><td class="px" style="padding:30px 56px 0 56px;" align="center">
    <h1 class="h1" style="margin:0;font-family:${SERIF};font-weight:400;font-size:36px;line-height:46px;color:${GOLD_HI};">${letter.headline}</h1>
  </td></tr>

  ${letter.body}
  ${signOff(l)}

</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">
<tr><td class="px" align="center" style="padding:20px 56px 40px 56px;font-family:${SANS};font-size:11px;line-height:20px;color:${LEGAL};">
  You are receiving this because you asked us about Longevity Resort.<br>
  Longevity Resort Sales Office, Plai Laem, Koh Samui 84320, Thailand.<br>
  <a href="${SITE}/api/unsubscribe?l=${l.id}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

/** "Book a call" has no calendar behind it yet, so it opens a reply to the
    person who owns the lead — which is what a call request turns into anyway. */
const callHref = (l: Lead) => {
  /* With a booking page configured (CRM_BOOKING_URL — a Cal.com link), the
     button opens the calendar with the lead's details pre-filled, and the
     booking comes back to /api/booking. Without one it falls back to opening
     a reply, which is what a call request turns into anyway. */
  const booking = process.env.CRM_BOOKING_URL;
  if (booking) {
    try {
      const u = new URL(booking);
      if (l.name) u.searchParams.set('name', l.name);
      if (l.email) u.searchParams.set('email', l.email);
      return u.toString();
    } catch {
      /* misconfigured URL — fall through to the mailto */
    }
  }
  const to = letterIdentity(l).email || 'info@longevitysamui.com';
  const subject = encodeURIComponent(`Call about Longevity Resort${l.villa ? ` — ${l.villa}` : ''}`);
  return `mailto:${to}?subject=${subject}`;
};

/* ── The six letters ── */

export function welcomeEmail(l: Lead): { subject: string; html: string } {
  const name = firstName(l);

  if (l.form_type === 'brochure_request') {
    return {
      subject: 'Your Longevity Resort brochure, Koh Samui',
      html: shell(l, {
        preheader: 'Your brochure is inside. Managed residences with a private pool, five minutes from the beach.',
        headline: 'Your brochure',
        body:
          intro(`Hi ${esc(name)}, here is the brochure you asked for. Longevity Resort is a managed
            residence community at Plai Laem, Koh Samui, built around a physician-led longevity centre.
            Owners receive a fixed return and full management; guests receive the medical programme.`) +
          essentials() +
          priceLine() +
          buttons(l, { label: 'Download brochure', href: docUrl(l, 'brochure') }, { label: 'Book a call', href: callHref(l) }) +
          p(`If any of the residences catches your eye, just reply to this e-mail. I am happy to walk
            you through availability, pricing and how reservation works.`),
      }),
    };
  }

  if (l.form_type === 'reserve' || (l.form_origin || '').startsWith('villa')) {
    return {
      subject: `Your reservation enquiry${l.villa ? `, ${l.villa}` : ''}`,
      html: shell(l, {
        preheader: `Thank you for your enquiry${l.villa ? ` about ${l.villa}` : ''}. I am putting the details together now.`,
        headline: 'Thank you for your enquiry',
        body:
          intro(`Hi ${esc(name)}, thank you for your interest${l.villa ? ` in <span style="color:${GOLD_HI};">${esc(l.villa)}</span>` : ''} —
            a very good choice. I am putting the details together for you now: current availability,
            exact pricing and our four-step payment schedule.`) +
          essentials() +
          priceLine() +
          buttons(l, { label: 'Book a call', href: callHref(l) }, { label: 'The overview', href: docUrl(l, 'overview') }) +
          p(`I will come back to you personally within a few hours. If you would rather talk sooner,
            simply reply to this e-mail.`),
      }),
    };
  }

  return {
    subject: 'Thank you for your interest',
    html: shell(l, {
      preheader: 'Managed residences with a private pool at Plai Laem, five minutes from the beach.',
      headline: 'Thank you for your interest',
      body:
        intro(`Hi ${esc(name)}, I have your enquiry and will come back to you personally shortly.
          Longevity Resort is a managed residence community at Plai Laem, Koh Samui, built around a
          physician-led longevity centre.`) +
        essentials() +
        priceLine() +
        buttons(l, { label: 'Book a call', href: callHref(l) }, { label: 'The overview', href: docUrl(l, 'overview') }) +
        p(`In the meantime, feel free to reply with anything you would like to know. This inbox comes
          straight to me.`),
    }),
  };
}

export function reminderEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: `Your Longevity enquiry${l.villa ? `, ${l.villa}` : ''}`,
    html: shell(l, {
      preheader: 'Just following up on what I sent a few days ago. No rush at all.',
      headline: 'Following up',
      body:
        intro(`Hi ${esc(firstName(l))}, just following up on what I sent a few days ago. A decision
          like this takes time, so there is no rush at all.`) +
        p(`If any questions have come up about the residences, the pricing or the reservation process,
          simply reply and I will answer them. And if the timing is not right, a one-line reply saying
          so is absolutely fine too.`) +
        buttons(l, { label: 'Book a call', href: callHref(l) }),
    }),
  };
}

/* Day 10 — the "why this exists" letter. No offer, no pressure: someone who
   went quiet needs a reason to care again, not another nudge. */
export function storyEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: 'What we are building on Samui',
    html: shell(l, {
      preheader: 'Not a villa development with a spa attached. A resort built around living longer.',
      headline: 'What we are building',
      body:
        intro(`Hi ${esc(firstName(l))}, I thought you might like the fuller picture, beyond the floor plans.`) +
        p(`Longevity is not a villa development with a spa attached. It is a wellness resort built
          around one idea: that where you live should add years to your life rather than take them.
          Private residences, a longevity and diagnostics centre, daily movement and recovery, on one
          of the calmest parts of Koh Samui.`) +
        p(`Owners use their residence part of the year and let us take care of it, and of guests, the
          rest. That is the part most people ask about second, once the place itself has done its work.`) +
        p(`If you would like, reply with what matters most to you: the lifestyle, the returns, or
          simply the timing. I will send you exactly that and nothing else.`) +
        /* The full 52-page brochure lands here rather than on day 0. Someone who
           has read this far will open it; a stranger on day one would not. */
        buttons(l, { label: 'The full brochure', href: docUrl(l, 'brochure') }, { label: 'Book a call', href: callHref(l) }),
    }),
  };
}

/* Day 24 — the invitation. The single strongest step in the sequence: people
   who see it, even by video, decide; people who only read never do. */
export function viewingEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: `Come and see it${l.villa ? `, ${l.villa}` : ''}`,
    html: shell(l, {
      preheader: 'A private viewing on Koh Samui, or a live video tour if travelling is not practical.',
      headline: 'Come and see it',
      body:
        intro(`Hi ${esc(firstName(l))}, an offer that stands whenever you are ready: come and see
          ${l.villa ? `<span style="color:${GOLD_HI};">${esc(l.villa)}</span>` : 'the resort'} in person.`) +
        p(`We arrange private viewings on Koh Samui: the site, the beach, the plans. I block out the
          time properly, so it is never a rushed walk-through.`) +
        p(`If travelling is not practical right now, I will do a live video tour with you instead. The
          same thing from your sofa, and you can ask anything as we go.`) +
        buttons(l, { label: 'Arrange a viewing', href: callHref(l) }, { label: 'The overview', href: docUrl(l, 'overview') }),
    }),
  };
}

/* Day 45 — the numbers, plainly. By now they either want the commercials or
   they don't; hiding the payment schedule only wastes everyone's time. */
export function termsEmail(l: Lead): { subject: string; html: string } {
  const steps: [string, string][] = [
    ['7%', 'Reserves the plot, transferred into your name'],
    ['43%', 'On completed foundation'],
    ['40%', 'On completed building'],
    ['10%', 'On furnishing, at handover'],
  ];
  const schedule = `
  <tr><td class="px" style="padding:36px 56px 0 56px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-top:1px solid ${HAIR};border-bottom:1px solid ${HAIR};">
      <tr><td style="padding:22px 0 6px 0;font-family:${SANS};font-size:10px;line-height:14px;letter-spacing:0.30em;text-transform:uppercase;color:${EYEBROW};">The payment schedule</td></tr>
      <tr><td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
          ${steps.map(([k, v]) => `
          <tr><td width="120" class="num" style="width:120px;padding:12px 0 0 0;font-family:${SERIF};font-size:22px;line-height:26px;color:${GOLD};">${k}</td>
              <td style="padding:12px 0 0 0;font-family:${SANS};font-size:15px;line-height:26px;color:${BODY_ROW};">${v}</td></tr>`).join('')}
        </table>
      </td></tr>
    </table>
  </td></tr>`;

  return {
    subject: 'How reserving a residence works',
    html: shell(l, {
      preheader: 'The commercial side in plain terms: four steps, each tied to real progress on site.',
      headline: 'How reserving works',
      body:
        intro(`Hi ${esc(firstName(l))}, in case it is useful, here is the commercial side in plain
          terms. No small print.`) +
        schedule +
        p(`Nothing moves until the step before it is genuinely finished, which is the whole point of
          doing it this way.`) +
        buttons(l, { label: 'Ask for the figures', href: callHref(l) }, { label: 'The full brochure', href: docUrl(l, 'brochure') }) +
        p(`Reply and I will send the current availability${l.villa ? ` and the exact figures for ${esc(l.villa)}` : ' and the exact figures'},
          plus the reservation agreement to read at your own pace.`),
    }),
  };
}

/* Day 60 — the graceful exit. Says out loud that we'll stop writing, which is
   both good manners and, in practice, the mail that gets the most replies. */
export function closingEmail(l: Lead): { subject: string; html: string } {
  return {
    subject: 'Closing the loop',
    html: shell(l, {
      preheader: 'My last automatic note. Your enquiry stays on file whenever you are ready.',
      headline: 'Closing the loop',
      body:
        intro(`Hi ${esc(firstName(l))}, I do not want to keep landing in your inbox uninvited, so this
          is my last automatic note. I will leave the next move to you.`) +
        p(`Your enquiry stays on file with me. If Longevity comes back to mind in a month or in a year,
          one line to this address is all it takes and I will pick it up exactly where we left off.`) +
        p(`Either way, thank you for the interest. And if you ever find yourself on Samui, the
          invitation to visit stands.`),
    }),
  };
}

/* ── The same sequence, on WhatsApp ──

   For the leads that arrive with a number and no e-mail address — most of the
   WhatsApp ones — this is the whole conversation, so it has to stand on its
   own. It is not the letter shortened: WhatsApp is a chat, and a chat that
   reads like a mailshot gets blocked. Short, one idea, one link, and a real
   question at the end, because a message that asks nothing gets no reply.

   Links go through the same tracked routes as the letters, so an open or a
   click lands on the timeline no matter which channel produced it. */
export function whatsappMessage(step: EmailStep, l: Lead): string | null {
  const name = firstName(l);
  const hi = name === 'there' ? 'Hello' : `Hi ${name}`;
  const call = track(l, 'Book a call', callHref(l));
  const overview = docUrl(l, 'overview');
  const brochure = docUrl(l, 'brochure');
  const office = process.env.CRM_SIGNATURE_NAME || 'Longevity Resort';

  switch (step) {
    case 'welcome':
      return `${hi}, thank you for your enquiry about Longevity Resort on Koh Samui.\n\n` +
        why(l) +
        `Here is a short overview, 12 pages: ${overview}\n\n` +
        `What would be most useful to know first — the residences, the returns, or the timing?\n\n${office}`;

    case 'reminder':
      return `${hi}, just following up on what I sent a few days ago. No rush at all.\n\n` +
        `If a question has come up about the residences or the pricing, send it over and I will answer it. ` +
        `And if the timing is simply not right, one line saying so is absolutely fine.`;

    case 'story':
      return `${hi}, I thought you might like the fuller picture.\n\n` +
        `Longevity is not a villa development with a spa attached. It is a resort built around one idea: ` +
        `that where you live should add years to your life rather than take them. Private residences, a ` +
        `physician-led longevity centre, on one of the calmest parts of Koh Samui.\n\n` +
        `The full brochure, if you would like it: ${brochure}`;

    case 'viewing':
      return `${hi}, an offer that stands whenever you are ready: come and see ` +
        `${l.villa || 'the resort'} in person. We arrange private viewings on Samui and block out the time properly.\n\n` +
        `If travelling is not practical right now, I will do a live video tour with you instead.\n\n` +
        `Pick a time here: ${call}`;

    case 'terms':
      return `${hi}, the commercial side in plain terms:\n\n` +
        `7% reserves the plot and transfers it into your name\n` +
        `43% on completed foundation\n` +
        `40% on completed building\n` +
        `10% on furnishing, at handover\n\n` +
        `Nothing moves until the step before it is genuinely finished. ` +
        `Say the word and I will send the current availability and the exact figures.`;

    case 'closing':
      return `${hi}, I do not want to keep landing in your messages uninvited, so this is my last note. ` +
        `Your enquiry stays on file. If Longevity comes back to mind in a month or in a year, one line here ` +
        `is all it takes.\n\nThank you for the interest, and if you are ever on Samui the invitation to visit stands.`;

    default:
      return null;
  }
}

/** One line of context in the welcome, matched to what they actually did. */
function why(l: Lead): string {
  if (l.form_type === 'brochure_request') return `You asked for the brochure, so here it is.\n\n`;
  if (l.villa) return `You were looking at ${l.villa}, which is a very good choice.\n\n`;
  return '';
}
