import { cookies } from 'next/headers';
import { can, isAuthed } from '@/lib/crm/auth';
import { NONCE_COOKIE, connect } from '@/lib/crm/gmail';

export const dynamic = 'force-dynamic';

const back = (req: Request, flash: string) =>
  Response.redirect(new URL(`/admin/notes?gmail=${flash}`, req.url), 302);

export async function GET(req: Request) {
  if (!(await isAuthed())) return Response.redirect(new URL('/admin/login', req.url), 302);
  if (!(await can('partners.write'))) return back(req, 'denied');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value;
  jar.set(NONCE_COOKIE, '', { path: '/', maxAge: 0 });

  /* The nonce proves this redirect belongs to the request that started the
     consent — without it, anybody could hand us a code of their own. */
  if (!code || !state || !nonce || state !== nonce) return back(req, 'failed');

  try {
    await connect(code, new URL('/api/crm/gmail/callback', req.url).toString());
    return back(req, 'connected');
  } catch {
    return back(req, 'failed');
  }
}
