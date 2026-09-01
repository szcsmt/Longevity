'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IDLE_MINUTES, REFRESH_SECONDS } from '@/lib/crm/rules';

/* ── Keeping the screen current without reading the database all night ──

   `router.refresh()` re-runs the server components, so a new lead or a
   colleague's edit appears without anybody pressing reload. It used to fire
   every six seconds and ask no questions: not whether the tab was in front,
   not whether anybody had touched the keyboard since Friday. A CRM left open
   on an office machine re-read the entire database ten times a minute
   through every night and weekend, which is what exhausted a month of the
   database's data-transfer allowance in a single working day and took the
   whole system off the air.

   Three conditions now, and they are all the same condition — is a person
   actually there:

     the tab is in front            (visibilityState)
     somebody has touched it lately (a click, a key, a scroll)
     and only then, on the interval

   Nothing is lost by being slower, because the two moments freshness really
   matters are handled directly rather than by polling. Your own edits
   refresh the view as they save. And coming back to the tab refreshes it
   immediately — before you have finished focusing on it — which is what
   makes a minute feel like no wait at all.

   The listeners are passive and do nothing but write a timestamp to a local
   variable; they cost nothing and never re-render. */
export function AutoRefresh({
  seconds = REFRESH_SECONDS,
  idleMinutes = IDLE_MINUTES,
}: {
  seconds?: number;
  idleMinutes?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let lastTouch = Date.now();
    const touch = () => { lastTouch = Date.now(); };

    const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of ACTIVITY) window.addEventListener(e, touch, { passive: true });

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastTouch > idleMinutes * 60_000) return;
      router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);

    /* Coming back counts as being here, and gets the fresh view straight
       away — this is what pays for the longer interval. */
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      touch();
      router.refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const e of ACTIVITY) window.removeEventListener(e, touch);
    };
  }, [router, seconds, idleMinutes]);

  return null;
}
