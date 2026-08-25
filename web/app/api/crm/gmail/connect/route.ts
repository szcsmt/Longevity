import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { can, isAuthed } from '@/lib/crm/auth';
import { NONCE_COOKIE, authUrl, gmailConfigured } from '@/lib/crm/gmail';

export const dynamic = 'force-dynamic';

/* Connecting the sales mailbox hands the CRM read access to every customer
   conversation in it. That is the owner's decision, not a salesperson's. */
export async function GET(req: Request) {
  if (!(await isAuthed())) return Response.redirect(new URL('/admin/login', req.url), 302);
  if (!(await can('partners.write'))) return Response.redirect(new URL('/admin/notes?gmail=denied', req.url), 302);
  if (!gmailConfigured()) return Response.redirect(new URL('/admin/notes?gmail=unconfigured', req.url), 302);

  const nonce = randomUUID();
  (await cookies()).set(NONCE_COOKIE, nonce, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
  });

  const redirectUri = new URL('/api/crm/gmail/callback', req.url).toString();
  return Response.redirect(authUrl(redirectUri, nonce), 302);
}
