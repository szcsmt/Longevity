import { unsubscribeLead } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

/* One-click opt-out from the automated e-mail sequence, linked at the foot of
   every automated mail. The lead id is the token: it is a random UUID that only
   ever appears in that person's own inbox, so no extra signature is needed —
   and the worst case, someone unsubscribing themselves twice, is harmless.
   Always answers with a friendly page, even for an unknown id, so the customer
   never sees an error for doing what we asked them to do. */

const page = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Longevity Samui</title>
</head>
<body style="margin:0;background:#060E08;color:#D6C7A8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:80px 24px;text-align:center">
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;line-height:40px;color:#D8B87C;margin:0">${title}</h1>
    <p style="font-size:16px;line-height:28px;margin:20px 0 0">${body}</p>
    <p style="margin:36px 0 0"><a href="https://longevitysamui.com" style="color:#C9A46A;text-decoration:none;font-size:13px;letter-spacing:0.18em;text-transform:uppercase">longevitysamui.com</a></p>
  </div>
</body></html>`;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('l') || '';
  if (id) await unsubscribeLead(id).catch(() => null);
  return new Response(
    page(
      'You are unsubscribed',
      'You will not receive any further automatic follow-ups from us. If you ever want to pick the conversation back up, just reply to one of our earlier e-mails — a person reads that inbox.',
    ),
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
