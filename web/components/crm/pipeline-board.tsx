'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Lead, Stage } from '@/lib/crm/types';
import { STAGES } from '@/lib/crm/types';

export function PipelineBoard({ leads: initial }: { leads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function move(lead: Lead, dir: -1 | 1) {
    const idx = STAGES.findIndex((s) => s.id === lead.stage);
    const next = STAGES[idx + dir];
    if (!next) return;
    setBusy(lead.id);
    // optimistic
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stage: next.id as Stage } : l)));
    try {
      await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'update', patch: { stage: next.id } }),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="kb-wrap">
      {STAGES.map((col) => {
        const items = leads.filter((l) => l.stage === col.id);
        return (
          <div className="kb-col" key={col.id}>
            <h4>
              <span>{col.label}</span>
              <span className="cnt">{items.length}</span>
            </h4>
            {items.length === 0 && <div className="empty" style={{ padding: '8px 0' }}>—</div>}
            {items.map((l) => {
              const idx = STAGES.findIndex((s) => s.id === l.stage);
              return (
                <div className="kb-card" key={l.id} style={{ opacity: busy === l.id ? 0.6 : 1 }}>
                  <Link href={`/admin/leads/${l.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="nm">{l.name || 'Unknown'}</div>
                    <div className="mt">
                      {l.villa || l.form_type || 'enquiry'}
                      {l.source ? ` · ${l.source}` : ''}
                    </div>
                  </Link>
                  <div className="kb-card-foot">
                    <span className={`badge ${l.score}`}>{l.score}</span>
                    <div className="kb-move">
                      <button onClick={() => move(l, -1)} disabled={idx === 0} aria-label="Move back">‹</button>
                      <button onClick={() => move(l, 1)} disabled={idx === STAGES.length - 1} aria-label="Move forward">›</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
