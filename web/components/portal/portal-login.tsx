'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/* One field, because the code identifies the agency. There is no username to
   remember and no password to reset — a firm gets a code, and the developer
   can revoke it in one click. */
export function PortalLogin() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/partners/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.ok) {
        router.replace('/portal');
        router.refresh();
      } else if (res.status === 429) {
        setErr('Too many attempts. Wait a minute and try again.');
      } else {
        setErr('That access code is not valid.');
      }
    } catch {
      setErr('Something went wrong. Try again.');
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
          <h1>Partner portal</h1>
          <p>Longevity Resort — register a buyer, and follow the ones you introduced</p>
          <input
            className="crm-input"
            type="password"
            placeholder="Access code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
            autoComplete="one-time-code"
            style={{ textAlign: 'center' }}
          />
          <button className="crm-btn gold" type="submit" disabled={busy}
            style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
            {busy ? 'Checking…' : 'Enter'}
          </button>
          <div className="crm-err">{err}</div>
          <p style={{ marginTop: 18, fontSize: 12 }}>
            Your agency was given a code when the agreement was signed. Lost it? Ask your contact
            at Longevity Resort — a new one can be issued, and it replaces the old.
          </p>
        </form>
      </div>
    </div>
  );
}
