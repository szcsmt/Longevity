'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/* ── Keeping the mailbox in step while somebody is working ──

   Vercel's plan allows a handful of scheduled jobs a day, which is fine for the
   nightly sweep and useless for e-mail: a reply that shows up tomorrow morning
   is a reply the CRM did not see.

   So the browser asks. While a CRM tab is open, this pokes the sync every few
   minutes; when nobody is looking, nothing runs. The server throttles the
   request anyway, so four open tabs cost the same as one, and it refreshes the
   view only when something was actually filed — a re-render for nothing would
   fight with whatever the operator is typing. */
export function MailSync({ minutes = 3 }: { minutes?: number }) {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    const run = async () => {
      // A background tab is not somebody working. Wait until it is looked at.
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/crm/gmail', { method: 'POST' });
        const data = await res.json().catch(() => null);
        if (alive && data?.filed > 0) router.refresh();
      } catch {
        /* Offline, or the mailbox is not connected. Neither is worth a noise. */
      }
    };

    run();
    const id = setInterval(run, minutes * 60_000);
    document.addEventListener('visibilitychange', run);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', run);
    };
  }, [router, minutes]);

  return null;
}
