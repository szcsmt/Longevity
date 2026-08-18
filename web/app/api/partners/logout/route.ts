import { cookies } from 'next/headers';
import { PORTAL_COOKIE } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

export async function POST() {
  (await cookies()).set(PORTAL_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return Response.json({ ok: true });
}
