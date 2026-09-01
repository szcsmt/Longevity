/* ── The hook Next calls when a request throws ──

   Every server error in the application — a page that failed to render, an API
   route that threw, a database that stopped answering — arrives here before
   Next turns it into a 500. Until now it went to Vercel's logs and no further,
   and nobody reads logs. The CRM was down twice this month and both times it
   was noticed by somebody trying to use it.

   Deliberately thin. Everything that could itself fail — the throttle, the
   mail — lives in lib/crm/alert.ts and is written not to throw, because a
   reporting hook that breaks is worse than one that does not exist: it turns
   one broken request into two. */
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
): Promise<void> {
  /* Only the server runtime. The Edge middleware has no mailer and no reason
     to reach one, and Next calls this in both. */
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { alertFailure } = await import('./lib/crm/alert');
  await alertFailure(`${request.method || 'GET'} ${request.path || '?'}`, err);
}

export async function register(): Promise<void> {
  /* Nothing to start up. The export has to exist for Next to load this file at
     all, and loading it is what registers onRequestError. */
}
