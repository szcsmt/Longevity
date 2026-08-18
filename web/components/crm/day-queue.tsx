'use client';

/* ── The day, in the order it should be worked ──

   One list that answers "who do I call now?", built from the queue rules in
   rules.ts. Every lead appears once, under the most urgent reason it qualified.

   The one write this screen offers is scheduling the next step, because that
   is the gap it exists to close: a lead with nothing planned is the way deals
   are quietly lost, and asking somebody to open the lead, scroll to the task
   box and type a date is how it stays that way. Two clicks from here. */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Lead } from '@/lib/crm/types';
import { NURTURE_REASONS, STAGES } from '@/lib/crm/types';
import { nextAction, stageAgeDays, type QueueSection } from '@/lib/crm/rules';

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '';

const daysSince = (iso?: string) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0;

const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label || id;

/* Offered when the next step is being set from here. Deliberately relative —
   nobody wants a date picker between two phone calls — and deliberately short:
   anything further out than a fortnight is a nurture decision, not a follow-up,
   and belongs on the lead itself. */
const WHEN: { key: string; label: string; days: number }[] = [
  { key: 'today',    label: 'today',        days: 0 },
  { key: 'tomorrow', label: 'tomorrow',     days: 1 },
  { key: 'd3',       label: 'in 3 days',    days: 3 },
  { key: 'w1',       label: 'in a week',    days: 7 },
  { key: 'w2',       label: 'in 2 weeks',   days: 14 },
];

const dueIso = (days: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

/* Why this lead is on the list, in the words that make the next move obvious. */
function reasonLine(lead: Lead, key: QueueSection['key']): string {
  const age = daysSince(lead.created_at);
  switch (key) {
    case 'uncontacted':
      return age === 0 ? 'Came in today' : `Waiting ${age} ${age === 1 ? 'day' : 'days'}`;
    case 'silent': {
      const d = daysSince(lead.awaiting_reply_since);
      return `No reply for ${d} ${d === 1 ? 'day' : 'days'}`;
    }
    case 'stalled':
      return `${stageLabel(lead.stage)} for ${stageAgeDays(lead)} days`;
    case 'wake': {
      // Only leads whose date has already arrived reach this section, so the
      // count is always "how long ago", never "how long until".
      const since = daysSince(lead.nurture_until);
      const when = since <= 0 ? 'due back today' : `due back ${since} ${since === 1 ? 'day' : 'days'} ago`;
      const why = NURTURE_REASONS.find((r) => r.id === lead.nurture_reason)?.label;
      return why ? `${why} — ${when}` : `Parked — ${when}`;
    }
    case 'nonext':
      return 'Nothing planned';
    default: {
      const t = nextAction(lead);
      return t ? t.title : '';
    }
  }
}

function Row({ lead, section, readOnly }: { lead: Lead; section: QueueSection['key']; readOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const task = nextAction(lead);
  const late = section === 'overdue';

  async function schedule(days: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'addTask', title: 'Follow up', due: dueIso(days) }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      alert('Could not save the follow-up — check your connection and try again.');
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="q-row">
      <Link href={`/admin/leads/${lead.id}`} className="crm-row q-who">
        <div className="crm-name">{lead.name || 'Unknown'}</div>
        <div className="crm-meta">{lead.email || lead.phone || lead.whatsapp || '—'}</div>
      </Link>

      <div className="q-what">
        <div className={late ? 'q-late' : undefined}>
          {reasonLine(lead, section)}
          {task?.due && (section === 'overdue' || section === 'today') && ` · ${fmtDay(task.due)}`}
        </div>
        <div className="crm-meta">
          {lead.villa || lead.form_origin || (lead.source || 'direct')}
          {lead.owner ? ` · ${lead.owner}` : ''}
        </div>
      </div>

      <div className="q-tags">
        <span className={`badge ${lead.score}`}>{lead.score}</span>
        <span className="badge stage">{stageLabel(lead.stage)}</span>
      </div>

      <div className="q-act">
        {/* Only where there is nothing planned — offering it next to a task
            that already has a date invites two. */}
        {!readOnly && !task && (
          <select
            className="crm-select sm"
            defaultValue=""
            disabled={busy}
            aria-label={`Schedule a follow-up with ${lead.name || 'this lead'}`}
            onChange={(e) => { if (e.target.value) schedule(Number(e.target.value)); }}
          >
            <option value="">Follow up…</option>
            {WHEN.map((w) => <option key={w.key} value={w.days}>{w.label}</option>)}
          </select>
        )}
        <Link href={`/admin/leads/${lead.id}`} className="crm-btn ghost sm">Open</Link>
      </div>
    </div>
  );
}

export function DayQueue({ sections, readOnly = false }: { sections: QueueSection[]; readOnly?: boolean }) {
  const live = sections.filter((s) => s.leads.length > 0);

  if (!live.length) {
    return (
      <div className="crm-card">
        <div className="empty" style={{ padding: 46 }}>
          Nothing is waiting. Every live lead has been spoken to and has a next step with a date on it.
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {live.map((s) => (
        <div key={s.key} className={`crm-card${s.key === 'overdue' || s.key === 'uncontacted' ? ' attention' : ''}`}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{s.title} · {s.leads.length}</span>
            {/* The same rule on the list, where it can be sorted, bulk-acted
                and exported. The queue is for working; the list is for
                managing, and they are the same set of leads. */}
            <Link href={`/admin/leads?flag=${s.key}`} className="crm-row" style={{ color: 'var(--c-gold)' }}>
              in the list →
            </Link>
          </h3>
          <p className="crm-meta" style={{ margin: '-10px 0 14px' }}>{s.blurb}</p>
          {s.leads.map((l) => <Row key={l.id} lead={l} section={s.key} readOnly={readOnly} />)}
        </div>
      ))}
    </div>
  );
}
