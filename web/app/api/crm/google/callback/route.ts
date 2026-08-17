import { cookies } from 'next/headers';
import { canEdit, isAuthed } from '@/lib/crm/auth';
import { NONCE_COOKIE, connect, syncNow } from '@/lib/crm/google-tasks';

/* Step two: Google sends the browser back here with a code. Swap it for a
   refresh token, run the first sync straight away so the list isn't empty when
   the phone is checked, and land back on the board. */

export const dynamic = 'force-dynamic';

const back = (req: Request, q: string) => Response.redirect(new URL(`/admin/notes?google=${q}`, req.url), 302);

export async function GET(req: Request) {
  if (!(await isAuthed())) return Response.redirect(new URL('/admin/login', req.url), 302);
  if (!(await canEdit())) return back(req, 'readonly');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const nonce = url.searchParams.get('state');
  if (url.searchParams.get('error')) return back(req, 'denied');
  if (!code) return back(req, 'nocode');

  const jar = await cookies();
  if (!nonce || nonce !== jar.get(NONCE_COOKIE)?.value) return back(req, 'badstate');
  jar.delete(NONCE_COOKIE);

  try {
    await connect(code, new URL('/api/crm/google/callback', req.url).toString());
  } catch {
    return back(req, 'failed');
  }
  await syncNow(true).catch(() => {});
  return back(req, 'connected');
}
