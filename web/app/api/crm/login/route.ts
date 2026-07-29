import { cookies } from 'next/headers';
import { CRM_COOKIE, passwordMatches, sessionToken } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!passwordMatches(password || '')) {
    return Response.json({ ok: false, error: 'invalid password' }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(CRM_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return Response.json({ ok: true });
}
