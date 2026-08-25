'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GmailStatus } from '@/lib/crm/gmail';

/* ── The sales mailbox ──

   Connecting it is the one thing that closes the CRM's biggest blind spot: a
   salesperson writes to a buyer from Gmail, the buyer answers, six messages go
   back and forth, and the CRM shows a lead nobody has touched in a fortnight.

   Read-only, and it files a message only when one of the addresses on it
   belongs to a lead the CRM already knows. Everything else is looked at, not
   matched, and forgotten — which is worth saying on the screen, because
   "connect your mailbox" is a large thing to ask. */

const MESSAGES: Record<string, string> = {
  connected: 'Postafiók összekötve. Az első szinkron az elmúlt 30 nap levelezését hozza be.',
  denied: 'Ehhez a fiókodhoz nincs jogosultság — a postafiók összekötése a tulajdonosé.',
  failed: 'Nem sikerült az összekötés. Próbáld újra, és ha marad, nézd meg a Google Cloud beállításokat.',
  unconfigured: 'Hiányzik a GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.',
};

const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export function GmailStrip({ initial, canConnect }: { initial: GmailStatus; canConnect: boolean }) {
  const [st, setSt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const flash = useSearchParams()?.get('gmail');

  async function sync() {
    setBusy(true);
    try {
      setSt(await (await fetch('/api/crm/gmail', { method: 'POST' })).json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-card" style={{ marginTop: 16 }}>
      <h3>Sales postafiók</h3>

      {flash && MESSAGES[flash] && (
        <div className="crm-meta" style={{ marginBottom: 12 }}>{MESSAGES[flash]}</div>
      )}

      {!st.configured ? (
        <div className="crm-meta">
          Nincs beállítva a Google-alkalmazás (<code>GOOGLE_CLIENT_ID</code> /{' '}
          <code>GOOGLE_CLIENT_SECRET</code>).
        </div>
      ) : st.connected ? (
        <>
          <div style={{ fontWeight: 600 }}>{st.account}</div>
          <div className="crm-meta" style={{ marginTop: 4 }}>
            {st.lastSync ? `Utolsó szinkron ${fmtTime(st.lastSync)}` : 'Még nem futott szinkron'}
            {st.lastResult
              ? ` · ${st.lastResult.seen} levél átnézve, ${st.lastResult.filed} felvéve ${st.lastResult.leads} leadre`
              : ''}
          </div>
          {st.lastError && (
            <div className="crm-meta" style={{ marginTop: 6, color: 'var(--c-hot)' }}>{st.lastError}</div>
          )}
          <div className="act-row" style={{ marginTop: 12 }}>
            <button className="crm-btn sm" disabled={busy} onClick={sync}>
              {busy ? 'Szinkron…' : 'Szinkronizálás most'}
            </button>
            {canConnect && (
              <button className="crm-btn ghost sm" disabled={busy}
                onClick={async () => {
                  if (!confirm('Leválasztod a postafiókot?\n\nAmi eddig felkerült a leadekre, az megmarad — egy megtörtént beszélgetés megtörtént. Csak az újakat nem fogja látni.')) return;
                  setBusy(true);
                  try { setSt(await (await fetch('/api/crm/gmail', { method: 'DELETE' })).json()); }
                  finally { setBusy(false); }
                }}>
                Leválasztás
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="crm-meta" style={{ marginBottom: 12, lineHeight: 1.6 }}>
            A CRM most csak a saját maga küldte leveleket látja. Kösd össze a közös sales
            postafiókot, és a leadek idővonalán ott lesz a teljes levelezés — mindkét irányban.
            <br /><br />
            <strong>Csak olvas.</strong> Soha nem küld, nem címkéz, nem töröl. És csak azt viszi
            fel, aminek a címzettje vagy feladója egy már ismert lead — minden más levél
            (könyvelő, kivitelező, magánlevél) érintetlenül marad, nem tárolódik és nem naplózódik.
          </div>
          {canConnect ? (
            <a className="crm-btn gold sm" href="/api/crm/gmail/connect">Postafiók összekötése</a>
          ) : (
            <div className="crm-meta">A postafiók összekötése a tulajdonos döntése.</div>
          )}
        </>
      )}
    </div>
  );
}
