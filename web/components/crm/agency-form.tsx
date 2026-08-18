'use client';

/* Adding a partner agency. Deliberately three fields: a name, where they are,
   and whether we have actually agreed anything yet. The commission terms and
   the protection window are set on the agency's own page, because they are
   negotiated later and getting them wrong at the moment of typing a name is
   how a wrong number ends up in a report. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AGENCY_STATUS } from '@/lib/crm/types';

export function NewAgencyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('prospect');

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/crm/agencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, country, status }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data?.error || 'The agency could not be added.'); return; }
      setName(''); setCountry(''); setStatus('prospect'); setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="act-row" style={{ marginBottom: 18 }}>
        <button className="crm-btn gold" onClick={() => setOpen(true)}>+ Add agency</button>
      </div>
    );
  }

  return (
    <div className="crm-card" style={{ marginBottom: 18 }}>
      <h3>New agency</h3>
      <div className="crm-filters" style={{ marginBottom: 0 }}>
        <div className="fld grow">
          <label className="crm-label">Name</label>
          <input className="crm-input" value={name} autoFocus placeholder="Bangkok Prime Property"
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fld">
          <label className="crm-label">Country</label>
          <input className="crm-input" value={country} placeholder="TH" onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="fld">
          <label className="crm-label">Where we stand</label>
          <select className="crm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {AGENCY_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <button className="crm-btn gold" disabled={busy || !name.trim()} onClick={submit}>Add</button>
        <button className="crm-btn ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
