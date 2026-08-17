'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GoogleStatus } from '@/lib/crm/google-tasks';

/* The Google Tasks link, shown above the board.

   When connected it syncs quietly on every visit (the server throttles it to one
   run per 30s), so opening the board is enough to pull in whatever was ticked on
   the phone. */

export const NOTES_REFRESH_EVENT = 'lr-notes-refresh';

const MESSAGES: Record<string, string> = {
  connected: 'Összekötve. A kártyák megjelennek a Google Tasks „Longevity Resort" listájában.',
  denied: 'A Google-engedélyt elutasítottad — nem történt semmi.',
  failed: 'Nem sikerült az összekötés. Próbáld újra, és ha marad, nézd meg a Google Cloud beállításokat.',
  badstate: 'Lejárt vagy nem egyező kérés. Indítsd újra az összekötést.',
  nocode: 'A Google nem küldött vissza engedélyt. Próbáld újra.',
  readonly: 'Ehhez a fiókodhoz nincs szerkesztési jog.',
  unconfigured: 'Hiányzik a GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.',
};

const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export function GoogleTasksStrip({ initial, readOnly }: { initial: GoogleStatus; readOnly: boolean }) {
  const [st, setSt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const params = useSearchParams();
  const flash = params?.get('google');

  /* `quiet` is the catch-up that runs on arrival: no spinner, and nothing set
     before the first await, so it stays out of the render path. */
  const sync = useCallback(async (force: boolean, quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const r = await fetch('/api/crm/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const next = await r.json().catch(() => null);
      if (next) setSt(next);
      // Whatever the phone did lands in the notes — tell the board to re-read.
      window.dispatchEvent(new Event(NOTES_REFRESH_EVENT));
    } finally { if (!quiet) setBusy(false); }
  }, []);

  // Quiet catch-up on arrival, thrown a tick past the commit so the board paints
  // first and the network call never sits in the render path. Server-throttled,
  // so revisiting the page costs nothing.
  useEffect(() => {
    if (!initial.connected || readOnly) return;
    const id = setTimeout(() => sync(false, true), 0);
    return () => clearTimeout(id);
  }, [initial.connected, readOnly, sync]);

  if (!st.configured) {
    return (
      <div className="gt-strip">
        <span className="gt-dot off" />
        <span className="gt-txt">
          <strong>Google Tasks</strong> — még nincs beállítva. A <code>GOOGLE_CLIENT_ID</code> és{' '}
          <code>GOOGLE_CLIENT_SECRET</code> hiányzik; a lépések a <code>docs/GOOGLE-TASKS.md</code>-ben vannak.
        </span>
      </div>
    );
  }

  return (
    <div className="gt-strip">
      <span className={`gt-dot${st.connected ? '' : ' off'}`} />
      <span className="gt-txt">
        {st.connected ? (
          <>
            <strong>Google Tasks</strong>
            {st.account ? ` · ${st.account}` : ''}
            {st.lastSync ? ` · utolsó szinkron ${fmtTime(st.lastSync)}` : ''}
            {st.lastResult && (st.lastResult.pushed || st.lastResult.pulled)
              ? ` (${st.lastResult.pushed} ki, ${st.lastResult.pulled} be)` : ''}
          </>
        ) : (
          <><strong>Google Tasks</strong> — nincs összekötve. Kösd össze, és a kártyák megjelennek a telefonodon.</>
        )}
        {flash && MESSAGES[flash] && <em className="gt-flash">{MESSAGES[flash]}</em>}
        {st.lastError && <em className="gt-err">{st.lastError}</em>}
      </span>

      {!readOnly && (st.connected ? (
        <>
          <button type="button" className="crm-btn sm" disabled={busy} onClick={() => sync(true)}>
            {busy ? 'Szinkron…' : 'Szinkron most'}
          </button>
          <button
            type="button" className="crm-btn sm ghost" disabled={busy}
            onClick={async () => {
              if (!confirm('Szétkapcsolod a Google Tasks-t? A már kint lévő feladatok megmaradnak.')) return;
              setBusy(true);
              try { setSt(await (await fetch('/api/crm/google', { method: 'DELETE' })).json()); }
              finally { setBusy(false); }
            }}
          >Szétkapcsolás</button>
        </>
      ) : (
        <a className="crm-btn gold sm" href="/api/crm/google/connect">Összekötés</a>
      ))}
    </div>
  );
}
