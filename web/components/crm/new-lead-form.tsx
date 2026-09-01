'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SCORES, scoreLabel } from '@/lib/crm/types';
import { VILLAS, fmtTHB, villaByName } from '@/lib/crm/villas';

const SOURCES = ['phone', 'walk-in', 'referral', 'email', 'agent', 'other'];

export function NewLeadForm() {
  const router = useRouter();
  const [f, setF] = useState({
    name: '', email: '', phone: '', whatsapp: '',
    villa: '', source: 'phone', score: 'warm', value: '', note: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const catalogPrice = villaByName(f.villa)?.price;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() && !f.email.trim() && !f.phone.trim()) {
      setErr('Adj meg legalább nevet, e-mailt vagy telefonszámot.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          value: f.value.trim() ? Number(f.value.replace(/[^\d]/g, '')) : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && data.lead) {
        router.push(`/admin/leads/${data.lead.id}`);
        router.refresh();
      } else {
        setErr(data.error || 'A leadet nem sikerült menteni.');
      }
    } catch {
      setErr('A leadet nem sikerült menteni.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="crm-card" style={{ maxWidth: 720 }} onSubmit={submit}>
      <div className="edit-grid">
        <label>
          <span className="crm-label">Name</span>
          <input className="crm-input" value={f.name} onChange={set('name')} placeholder="Teljes név" />
        </label>
        <label>
          <span className="crm-label">Email</span>
          <input className="crm-input" type="email" value={f.email} onChange={set('email')} placeholder="name@example.com" />
        </label>
        <label>
          <span className="crm-label">Phone</span>
          <input className="crm-input" value={f.phone} onChange={set('phone')} placeholder="+66 …" />
        </label>
        <label>
          <span className="crm-label">WhatsApp</span>
          <input className="crm-input" value={f.whatsapp} onChange={set('whatsapp')} placeholder="Ha eltér a telefonszámtól" />
        </label>
        <label>
          <span className="crm-label">Melyik lakás érdekli</span>
          <select className="crm-select" value={f.villa} onChange={set('villa')}>
            <option value="">Még nem dőlt el</option>
            {VILLAS.map((v) => <option key={v.name} value={v.name}>{v.name} · {fmtTHB(v.price)}</option>)}
          </select>
        </label>
        <label>
          <span className="crm-label">Hogyan talált ránk?</span>
          <select className="crm-select" value={f.source} onChange={set('source')}>
            {SOURCES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label>
          <span className="crm-label">Score</span>
          <select className="crm-select" value={f.score} onChange={set('score')}>
            {SCORES.map((s) => <option key={s} value={s}>{scoreLabel(s)}</option>)}
          </select>
        </label>
        <label>
          <span className="crm-label">Üzlet értéke (THB)</span>
          <input
            className="crm-input"
            inputMode="numeric"
            value={f.value}
            onChange={set('value')}
            placeholder={catalogPrice ? `${catalogPrice.toLocaleString('en-US')} (listaár)` : 'Nem kötelező'}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span className="crm-label">Első jegyzet</span>
          <textarea className="crm-textarea" value={f.note} onChange={set('note')} placeholder="Mit mondott? Mi a következő lépés?" />
        </label>
      </div>
      {err && <div className="crm-err" style={{ textAlign: 'left' }}>{err}</div>}
      <div className="act-row" style={{ marginTop: 18 }}>
        <button className="crm-btn gold" type="submit" disabled={busy}>
          {busy ? 'Mentés…' : 'Lead mentése'}
        </button>
        <button className="crm-btn ghost" type="button" onClick={() => router.back()}>Mégse</button>
      </div>
    </form>
  );
}
