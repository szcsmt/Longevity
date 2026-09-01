'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/crm/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace('/admin');
        router.refresh();
        return;
      }

      /* ── Say which failure it was ──

         Every non-OK answer used to read "wrong username or password",
         including a 500. For three days while the database was unreachable,
         everybody who tried to sign in was told their password was wrong —
         so they tried another, then another, then began to doubt themselves,
         when nothing they could type would ever have worked.

         A password can be corrected by the person at the keyboard. An outage
         cannot, and telling them it is their fault sends them looking in the
         one place the answer is not. */
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        setErr('Hibás felhasználónév vagy jelszó.');
      } else if (res.status === 429) {
        setErr(data?.error || 'Túl sok sikertelen próbálkozás. Próbáld újra később.');
      } else {
        setErr(
          'A rendszer most nem elérhető — ez nem a jelszóddal van. ' +
          'Próbáld újra pár perc múlva; ha továbbra sem megy, szólj.',
        );
      }
    } catch {
      /* The request never left, or never came back. */
      setErr('Nincs kapcsolat a szerverrel. Ellenőrizd az internetet, és próbáld újra.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-root">
      <div className="crm-login">
        <form className="box" onSubmit={submit}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LOGO.svg" alt="Longevity Resort" />
          <h1>CRM</h1>
          <p>Longevity Resort — ügyfélkezelés</p>
          <input
            className="crm-input"
            type="text"
            placeholder="Felhasználónév"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            style={{ textAlign: 'center' }}
          />
          <input
            className="crm-input"
            type="password"
            placeholder="Jelszó"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ textAlign: 'center', marginTop: 10 }}
          />
          <button className="crm-btn gold" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
            {busy ? 'Belépés…' : 'Belépés'}
          </button>
          <div className="crm-err">{err}</div>
        </form>
      </div>
    </div>
  );
}
