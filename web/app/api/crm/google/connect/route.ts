import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { canEdit, isAuthed } from '@/lib/crm/auth';
import { NONCE_COOKIE, authUrl, googleConfigured } from '@/lib/crm/google-tasks';

/* Step one of the consent dance: send the browser to Google. The nonce goes out
   in the URL and into a short-lived cookie, so the callback can prove the reply
   belongs to the request that started here. */

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await isAuthed())) return Response.redirect(new URL('/admin/login', req.url), 302);
  if (!(await canEdit())) return Response.redirect(new URL('/admin/notes?google=readonly', req.url), 302);
  if (!googleConfigured()) return Response.redirect(new URL('/admin/notes?google=unconfigured', req.url), 302);

  const nonce = randomUUID();
  const jar = await cookies();
  jar.set(NONCE_COOKIE, nonce, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
  });

  const redirectUri = new URL('/api/crm/google/callback', req.url).toString();
  return Response.redirect(authUrl(redirectUri, nonce), 302);
}
