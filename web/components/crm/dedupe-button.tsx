'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/* One-click duplicate cleanup: dry-run first, then an explicit confirmation
   with real numbers before anything is merged. */
export function DedupeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const report = await (await fetch('/api/crm/dedupe')).json();
      if (!report.ok) return;
      if (!report.groups) {
        alert('Nincs duplikátum — minden kapcsolathoz pontosan egy lead tartozik.');
        return;
      }
      const names = report.sample?.length ? `\n\ne.g.: ${report.sample.join(', ')}` : '';
      if (!confirm(
        `${report.groups} ${report.groups === 1 ? 'contact has' : 'contacts have'} multiple leads ` +
        `(${report.extras} extra ${report.extras === 1 ? 'lead' : 'leads'}).${names}\n\n` +
        `Merge each into the contact's original lead? Notes, tasks and history are all kept.`,
      )) return;
      const result = await (await fetch('/api/crm/dedupe', { method: 'POST' })).json();
      alert(result.ok ? `Done — ${result.merged} duplicate ${result.merged === 1 ? 'lead' : 'leads'} folded in.` : 'Valami elromlott — semmi nem veszett el, próbáld újra.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="crm-btn sm" disabled={busy} onClick={run} title="Duplikált leadek összevonása kapcsolatonként egybe">
      {busy ? 'Dolgozom…' : '⧉ Tidy duplicates'}
    </button>
  );
}
