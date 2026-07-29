import { cookies } from 'next/headers';
import { CRM_COOKIE } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = await cookies();
  jar.delete(CRM_COOKIE);
  return Response.json({ ok: true });
}
