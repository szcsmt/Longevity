'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
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
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace('/admin');
        router.refresh();
      } else {
        setErr('Incorrect password.');
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
          <h1>CRM</h1>
          <p>Longevity Resort — lead management</p>
          <input
            className="crm-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{ textAlign: 'center' }}
          />
          <button className="crm-btn gold" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="crm-err">{err}</div>
        </form>
      </div>
    </div>
  );
}
