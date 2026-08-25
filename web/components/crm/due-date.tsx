'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/* ── Putting a date on an instalment ──

   The schedule is governed by progress on site: the 43% falls due when the
   foundation is finished, whenever that happens to be. That is how the deal
   actually works, and it is why most instalments carry no date at all — they
   show as "due now" the moment the building work passes their gate.

   "Due now" is true and unhelpful. It says money is owed and nothing about
   when anybody agreed to pay it, so there is nothing to chase against and
   nothing that can ever be late. A date agreed with the buyer changes both. */
export function DueDate({ villaId, phaseKey, due, readOnly }: {
  villaId: string;
  phaseKey: string;
  due?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState((due || '').slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function save(next: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/crm/villas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: villaId, op: 'phaseDue', key: phaseKey, due: next || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || 'A határidő mentése nem sikerült.');
        setValue((due || '').slice(0, 10));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (readOnly) {
    return <span className="crm-meta tabnum">{value || '—'}</span>;
  }

  return (
    <input
      className="crm-input"
      type="date"
      value={value}
      disabled={busy}
      aria-label={`${villaId} ${phaseKey} fizetési határidő`}
      style={{ width: 150, padding: '5px 8px', fontSize: 12.5 }}
      onChange={(e) => { setValue(e.target.value); save(e.target.value); }}
    />
  );
}
