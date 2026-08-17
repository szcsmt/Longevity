'use client';

import { useEffect } from 'react';

/* ─── 3destate "3D Twin" ───

   Embedded via the official launcher script (NOT an iframe; the vendor's own
   guide says iframes degrade the mobile experience). The launcher reads the app
   id off its <script> tag and renders the live viewer into #sm3de.

   One twin covers the whole project. Opened plain it lands on the estate model
   from above — all 69 residences, their availability, and the filters that go
   with them — and any one of them can be walked into from there. Opened with a
   unit id it drops the visitor straight inside that residence instead.

   Lives in its own module because two places mount it: the tour section (estate
   level) and the villa modal (one residence). Both share this single
   implementation so the launcher is only ever wired up one way. */
export const TOUR_APP_ID = 'naboo-sol-fzc-balalake-resort-dsa73hsa-co-sm-prod';
const TOUR_LAUNCHER = 'https://oneappappsprd.z6.web.core.windows.net/launcher/production/app.js';

/* Strip every state param the viewer reads/writes, so our address bar goes back
   to clean once the tour closes (the viewer mirrors its state into the page URL). */
export function clearTourParams() {
  const u = new URL(window.location.href);
  let changed = false;
  [...u.searchParams.keys()].forEach(k => { if (k.startsWith('sm-')) { u.searchParams.delete(k); changed = true; } });
  if (changed) window.history.replaceState(null, '', u.pathname + u.search + u.hash);
}

/* Mounts the launcher the official way: a #sm3de host element plus the launcher
   <script> (id "sm-init-script", data-appid). The launcher auto-inits on first
   load; on every later open we re-init through its public window API so the
   viewer rebuilds inside the fresh host without a page reload.

   Only ever render ONE of these at a time — the host id is fixed by the vendor,
   and a second live viewer would mean a second WebGL context for no gain. */
export function Tour3D({ appId = TOUR_APP_ID, unitId }: { appId?: string; unitId?: string }) {
  useEffect(() => {
    const ROOT = 'sm3de';
    let cancelled = false;

    // The viewer takes its starting state from the page URL. Pointing it at one
    // unit's interior (Dollhouse = the 3D apartment model) opens that villa
    // directly instead of the whole estate from above.
    if (unitId) {
      const u = new URL(window.location.href);
      [...u.searchParams.keys()].forEach(k => { if (k.startsWith('sm-')) u.searchParams.delete(k); });
      u.searchParams.set('sm-screen-type', 'UnitDetails');
      u.searchParams.set('sm-unit', unitId);
      u.searchParams.set('sm-media', 'Dollhouse');
      window.history.replaceState(null, '', u.toString());
    } else {
      clearTourParams();
    }

    const config = { appId, rootElement: ROOT };
    type Launcher = { init: (o: typeof config) => unknown };
    const w = window as unknown as {
      AppLauncher3DEOA?: Launcher;
      AppLauncher3DEOAConfig?: typeof config;
    };

    if (w.AppLauncher3DEOA?.init) {
      // Launcher already on the page from a previous open — rebuild for this view
      // (it re-reads the URL params we just set).
      if (!cancelled) w.AppLauncher3DEOA.init(config);
    } else if (!document.getElementById('sm-init-script')) {
      // First open: the launcher auto-inits from this global config; the viewer
      // reads the unit from the URL. No manual init, or it would build twice.
      w.AppLauncher3DEOAConfig = config;
      const s = document.createElement('script');
      s.id = 'sm-init-script';
      s.src = TOUR_LAUNCHER;
      s.async = true;
      s.setAttribute('data-appid', appId);
      s.setAttribute('data-rootelement', ROOT);
      document.body.appendChild(s);
    }

    return () => {
      cancelled = true;
      const host = document.getElementById(ROOT);
      if (host) host.innerHTML = '';   // clear the viewer so the next open starts clean
      clearTourParams();               // and restore a clean address bar
    };
  }, [appId, unitId]);

  return <div id="sm3de" style={{ width: '100%', height: '100%' }} />;
}
