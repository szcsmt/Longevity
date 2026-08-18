'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Lead, Stage } from '@/lib/crm/types';
import { LOST_REASONS, STAGES } from '@/lib/crm/types';
import { LostReasonDialog } from '@/components/crm/lost-reason-dialog';
import { isNurtured, nextAction, nextActionState } from '@/lib/crm/rules';

function NextStepLine({ lead }: { lead: Lead }) {
  if (isNurtured(lead)) return <div className="mt">Parked until {lead.nurture_until!.slice(0, 10)}</div>;
  const task = nextAction(lead);
  const state = nextActionState(lead);
  if (!task) {
    // Won and lost cards need no plan; everything else does.
    if (lead.stage === 'won' || lead.stage === 'lost') return null;
    return <div className="mt flag nonext">Nothing planned</div>;
  }
  return (
    <div className={`mt${state === 'overdue' ? ' q-late' : ''}`}>
      {state === 'overdue' ? '⚠ ' : state === 'today' ? '● ' : ''}{task.title}
    </div>
  );
}

export function PipelineBoard({ leads: initial }: { leads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Stage | null>(null);

  // Resync from the server whenever AutoRefresh re-renders the page — but not
  // mid-move, when the optimistic state is ahead of the incoming snapshot.
  useEffect(() => {
    if (!busy) setLeads(initial);
  }, [initial, busy]);

  const [losingLead, setLosingLead] = useState<Lead | null>(null);

  async function moveTo(lead: Lead, stage: Stage) {
    if (lead.stage === stage) return;
    // Losing a deal requires a reason — route through the dialog first.
    if (stage === 'lost') {
      setLosingLead(lead);
      return;
    }
    await commitMove(lead, stage);
  }

  async function commitMove(lead: Lead, stage: Stage, extra?: { lost_reason: string; note: string }) {
    const prev = lead.stage;
    setBusy(lead.id);
    // optimistic
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'update', patch: extra ? { stage, lost_reason: extra.lost_reason } : { stage } }),
      });
      if (!res.ok) {
        /* A refusal is not a network failure and must not be reported as one:
           the server says exactly what is missing, and the operator can fix it
           on the lead in ten seconds. */
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `The move could not be saved (${res.status}).`);
      }
      if (extra?.note) {
        await fetch(`/api/crm/leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'addNote', body: extra.note }),
        }).catch(() => {});
      }
    } catch (err) {
      // The card goes back where it was, either way — nothing was saved.
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stage: prev } : l)));
      alert(err instanceof Error ? err.message : 'Could not save the move — check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  function moveStep(lead: Lead, dir: -1 | 1) {
    const idx = STAGES.findIndex((s) => s.id === lead.stage);
    const next = STAGES[idx + dir];
    if (next) moveTo(lead, next.id);
  }

  return (
    <div className="kb-wrap">
      {losingLead && (
        <LostReasonDialog
          leadName={losingLead.name || ''}
          onCancel={() => setLosingLead(null)}
          onConfirm={(reasonId, detail) => {
            const label = LOST_REASONS.find((r) => r.id === reasonId)?.label || reasonId;
            const lead = losingLead;
            setLosingLead(null);
            commitMove(lead, 'lost', {
              lost_reason: reasonId,
              note: `Lost: ${label}${detail ? ` — ${detail}` : ''}`,
            });
          }}
        />
      )}
      {STAGES.map((col) => {
        const items = leads.filter((l) => l.stage === col.id);
        const hot = items.filter((l) => l.score === 'hot').length;
        return (
          <div
            className={`kb-col${overCol === col.id ? ' drop' : ''}`}
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              const id = e.dataTransfer.getData('text/plain') || dragId;
              const lead = leads.find((l) => l.id === id);
              if (lead) moveTo(lead, col.id);
              setDragId(null);
            }}
          >
            <h4>
              <span>{col.label}</span>
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                {hot > 0 && <span className="cnt hot-cnt">{hot} hot</span>}
                <span className="cnt">{items.length}</span>
              </span>
            </h4>
            {items.length === 0 && <div className="empty" style={{ padding: '8px 0' }}>—</div>}
            {items.map((l) => {
              const idx = STAGES.findIndex((s) => s.id === l.stage);
              return (
                <div
                  className={`kb-card${dragId === l.id ? ' dragging' : ''}`}
                  key={l.id}
                  style={{ opacity: busy === l.id ? 0.6 : 1 }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', l.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(l.id);
                  }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                >
                  <Link href={`/admin/leads/${l.id}`} style={{ textDecoration: 'none', color: 'inherit' }} draggable={false}>
                    <div className="nm">{l.name || 'Unknown'}</div>
                    <div className="mt">
                      {l.villa || l.form_type || 'enquiry'}
                      {l.source ? ` · ${l.source}` : ''}
                    </div>
                    {/* What happens next to this card. A board of names tells
                        you where everyone stands and nothing about whether
                        anybody is doing anything about it. */}
                    <NextStepLine lead={l} />
                  </Link>
                  <div className="kb-card-foot">
                    <span className={`badge ${l.score}`}>{l.score}</span>
                    <div className="kb-move">
                      <button onClick={() => moveStep(l, -1)} disabled={idx === 0} aria-label="Move back">‹</button>
                      <button onClick={() => moveStep(l, 1)} disabled={idx === STAGES.length - 1} aria-label="Move forward">›</button>
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
