import type { Lead } from './types';

/* Instant e-mail alert when a new lead arrives, via the Resend HTTP API.
   Activates only when both env vars are set — otherwise a silent no-op:

     RESEND_API_KEY   — API key from resend.com
     CRM_NOTIFY_TO    — recipient, e.g. crm@longevitysamui.com
     CRM_NOTIFY_FROM  — optional sender (default onboarding@resend.dev)

   The layout follows the approved brand e-mail design ("Direction A,
   Editorial"): 600px table on #060E08, panel #0A140C, warm gold scale,
   Georgia serif headings, hairline rules, 2px-radius gold button. Pure
   white text is prohibited by the brand — everything uses the gold scale. */

const SITE = 'https://longevitysamui.com';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function notifyNewLead(lead: Lead): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.CRM_NOTIFY_TO;
  if (!key || !to) return;

  const kind = (lead.form_type || 'enquiry').replace('_', ' ');
  const name = lead.name || 'Unknown enquirer';
  const hot = lead.score === 'hot';

  const rows: [string, string | undefined][] = [
    ['Type', kind],
    ['Score', lead.score],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['WhatsApp', lead.whatsapp],
    ['Villa', lead.villa],
    ['Origin', lead.form_origin],
    ['Source', lead.source || lead.utm_source],
    ['Campaign', lead.utm_campaign],
  ];
  const detailRows = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `
      <tr>
        <td width="120" style="width:120px;padding:12px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:26px;letter-spacing:0.22em;text-transform:uppercase;color:#94896F;">${k}</td>
        <td style="padding:12px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:26px;color:#D6C7A8;">${esc(v!)}${k === 'Score' && hot ? ' &#128293;' : ''}</td>
      </tr>`,
    )
    .join('');

  const preheader = `${name} · ${kind}${lead.villa ? ` · ${lead.villa}` : ''}${hot ? ' · hot' : ''}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>New lead — Longevity CRM</title>
<style>
  @media only screen and (max-width:620px){
    .container{width:100% !important;}
    .px{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:28px !important;line-height:36px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#060E08;">
<span style="display:none;font-size:1px;color:#060E08;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#060E08;margin:0;padding:0;">
<tr><td align="center" style="padding:0;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;background-color:#0A140C;">

<tr><td class="px" style="padding:44px 56px 0 56px;" align="center">
  <img src="${SITE}/email/logo.png" width="134" height="100" alt="Longevity Resort" style="display:block;width:134px;height:100px;border:0;outline:none;text-decoration:none;margin:0 auto;">
  <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;line-height:16px;letter-spacing:0.30em;text-transform:uppercase;color:#94896F;padding-top:16px;">New lead &middot; Longevity CRM</div>
</td></tr>

<tr><td class="px" style="padding:34px 56px 0 56px;" align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="60" style="width:60px;"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background-color:#C9A46A;">&nbsp;</td></tr></table>
</td></tr>

<tr><td class="px" style="padding:30px 56px 0 56px;" align="center">
  <h1 class="h1" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:34px;line-height:44px;color:#D8B87C;">${esc(name)}${hot ? ' &#128293;' : ''}</h1>
</td></tr>

<tr><td class="px" style="padding:18px 56px 0 56px;" align="center">
  <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-weight:400;font-size:16px;line-height:28px;color:#D6C7A8;">A new <span style="color:#D8B87C;">${esc(kind)}</span> just landed in the CRM.</p>
</td></tr>

<tr><td class="px" style="padding:32px 56px 0 56px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-top:1px solid rgba(201,164,106,0.26);border-bottom:1px solid rgba(201,164,106,0.26);">
    <tr><td colspan="2" style="padding:22px 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:10px;line-height:14px;letter-spacing:0.30em;text-transform:uppercase;color:#E4C48F;">The details</td></tr>
    ${detailRows}
    <tr><td colspan="2" style="padding:0 0 22px 0;font-size:1px;line-height:1px;">&nbsp;</td></tr>
  </table>
</td></tr>

<tr><td class="px" style="padding:34px 56px 0 56px;" align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="#C9A46A" style="background-color:#C9A46A;border-radius:2px;">
        <a href="${SITE}/admin/leads/${lead.id}" style="display:block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:16px;letter-spacing:0.18em;text-transform:uppercase;color:#0A140C;text-decoration:none;">Open in the CRM</a>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td class="px" style="padding:46px 56px 0 56px;" align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="60" style="width:60px;"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background-color:#C9A46A;">&nbsp;</td></tr></table>
</td></tr>

<tr><td class="px" style="padding:24px 56px 44px 56px;" align="center">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:26px;color:#D8B87C;">Longevity CRM</div>
  <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:22px;color:#94896F;padding-top:6px;">Automatic alert &middot;
    <a href="${SITE}/admin" style="color:#C9A46A;text-decoration:none;">longevitysamui.com/admin</a>
  </div>
</td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CRM_NOTIFY_FROM || 'Longevity CRM <onboarding@resend.dev>',
      to: [to],
      subject: `New ${kind} — ${name}${hot ? ' 🔥' : ''}`,
      html,
    }),
  });
}
