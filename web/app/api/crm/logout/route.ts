import { cookies } from 'next/headers';
import { CRM_COOKIE, currentAccount } from '@/lib/crm/auth';
import { endSession } from '@/lib/crm/sessions';
import { audit, clientInfo } from '@/lib/crm/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  /* Read who this is before the session goes, or the log records that
     somebody signed out and not who. */
  const account = await currentAccount();
  const jar = await cookies();
  /* Ending the session server-side is the part that matters. Deleting the
     cookie only asks the browser to forget a token; until now that token
     stayed valid forever, so "sign out" on a shared laptop was a request
     rather than an act. */
  await endSession(jar.get(CRM_COOKIE)?.value);
  jar.delete(CRM_COOKIE);
  if (account) await audit({ actor: account.name, action: 'logout', ...clientInfo(req) });
  return Response.json({ ok: true });
}
