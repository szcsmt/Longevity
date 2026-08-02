import { cookies } from 'next/headers';
import { CRM_COOKIE, passwordMatches, sessionToken, usernameMatches } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({ username: '', password: '' }));
  const token = sessionToken();
  if (!token || !usernameMatches(username || '') || !passwordMatches(password || '')) {
    return Response.json({ ok: false, error: 'invalid credentials' }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(CRM_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return Response.json({ ok: true });
}
