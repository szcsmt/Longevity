'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/* Registering a buyer. Five fields, of which two are required — a name, and
   some way of telling whether we already know them.

   The 409 is the whole reason the portal is worth having: it answers "is this
   buyer already registered?" in a second, in writing, instead of by e-mail
   three days later. It says somebody else holds the registration and does not
   say who — that is the other agency's business. */
export function RegisterBuyer() {
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', phone: '', whatsapp: '', villa: '', broker: '', note: '' });
  const [state, setState] = useState<{ kind: 'idle' | 'ok' | 'taken' | 'error'; message?: string }>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setState({ kind: 'idle' });
    try {
      const res = await fetch('/api/partners/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ kind: 'ok' });
        setF({ name: '', email: '', phone: '', whatsapp: '', villa: '', broker: '', note: '' });
        router.refresh();
      } else if (res.status === 409) {
        setState({
          kind: 'taken',
          message: data.until
            ? `This buyer is already registered with us by another partner, until ${String(data.until).slice(0, 10)}.`
            : 'This buyer is already registered with us by another partner.',
        });
      } else {
        setState({ kind: 'error', message: data.error || 'The registration could not be recorded.' });
      }
    } catch {
      setState({ kind: 'error', message: 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="crm-card" onSubmit={submit}>
      <h3>Register a buyer</h3>
      <p className="crm-meta" style={{ marginTop: -10, marginBottom: 14 }}>
        A name, and either an e-mail address or a phone number. We check straight away whether the
        buyer is already known to us, and tell you before you spend any more time on them.
      </p>

      <div className="edit-grid">
        <label>
          <span className="crm-label">Buyer&rsquo;s name *</span>
          <input className="crm-input" value={f.name} onChange={set('name')} required />
        </label>
        <label>
          <span className="crm-label">E-mail</span>
          <input className="crm-input" type="email" value={f.email} onChange={set('email')} />
        </label>
        <label>
          <span className="crm-label">Phone</span>
          <input className="crm-input" value={f.phone} onChange={set('phone')} />
        </label>
        <label>
          <span className="crm-label">WhatsApp</span>
          <input className="crm-input" value={f.whatsapp} onChange={set('whatsapp')} />
        </label>
        <label>
          <span className="crm-label">Residence of interest</span>
          <input className="crm-input" value={f.villa} onChange={set('villa')} placeholder="Residence M / L / XL" />
        </label>
        <label>
          <span className="crm-label">Your agent</span>
          <input className="crm-input" value={f.broker} onChange={set('broker')} placeholder="Who at your agency" />
        </label>
      </div>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span className="crm-label">Anything we should know</span>
        <textarea className="crm-textarea" value={f.note} onChange={set('note')}
          placeholder="Budget, timing, where you met them…" />
      </label>

      <button className="crm-btn gold" type="submit" disabled={busy || !f.name.trim()} style={{ marginTop: 14 }}>
        {busy ? 'Registering…' : 'Register this buyer'}
      </button>

      {state.kind === 'ok' && (
        <div className="lost-hint" style={{ marginTop: 14 }}>
          <strong>Registered.</strong> They are on the list below, with the date your protection runs to.
        </div>
      )}
      {state.kind === 'taken' && (
        <div className="lost-hint" style={{ marginTop: 14, borderColor: 'rgba(224,119,78,0.45)' }}>
          {state.message}
        </div>
      )}
      {state.kind === 'error' && <div className="crm-err" style={{ marginTop: 12 }}>{state.message}</div>}
    </form>
  );
}
