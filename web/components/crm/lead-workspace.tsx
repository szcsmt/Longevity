'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, Score, Stage } from '@/lib/crm/types';
import { STAGES, SCORES } from '@/lib/crm/types';

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
const digits = (s?: string) => (s || '').replace(/[^\d]/g, '');

export function LeadWorkspace({ lead: initial }: { lead: Lead }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initial);
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.lead) setLead(data.lead);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this lead permanently?')) return;
    await fetch(`/api/crm/leads/${lead.id}`, { method: 'DELETE' });
    router.replace('/admin/leads');
    router.refresh();
  }

  const wa = digits(lead.whatsapp || lead.phone);
  const attribution: [string, string | undefined][] = [
    ['Source', lead.source || lead.utm_source],
    ['Medium', lead.utm_medium],
    ['Campaign', lead.utm_campaign],
    ['Term', lead.utm_term],
    ['Content', lead.utm_content],
    ['Landing', lead.page_url],
  ];

  return (
    <div className="crm-detail">
      {/* ── Left column ── */}
      <div className="stack">
        {/* Contact + quick actions */}
        <div className="crm-card">
          <h3>Contact</h3>
          <dl className="kv">
            <dt>Name</dt><dd>{lead.name || '—'}</dd>
            <dt>Email</dt><dd>{lead.email || '—'}</dd>
            <dt>Phone</dt><dd>{lead.phone || '—'}</dd>
            <dt>Enquiry</dt>
            <dd>
              {lead.form_type || '—'}
              {lead.form_origin ? <span className="muted"> · {lead.form_origin}</span> : null}
              {lead.villa ? <span className="muted"> · {lead.villa}</span> : null}
            </dd>
            <dt>Received</dt><dd>{fmtDate(lead.submitted_at || lead.created_at)}</dd>
            <dt>Consent</dt><dd>{lead.gdpr_consent ? 'GDPR consent given' : '—'}</dd>
          </dl>
          <div className="act-row" style={{ marginTop: 18 }}>
            {lead.email && <a className="crm-btn sm" href={`mailto:${lead.email}`}>✉ Email</a>}
            {wa && <a className="crm-btn sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
            {lead.phone && <a className="crm-btn sm" href={`tel:${digits(lead.phone)}`}>Call</a>}
          </div>
        </div>

        {/* Attribution */}
        <div className="crm-card">
          <h3>Attribution</h3>
          <dl className="kv">
            {attribution.map(([k, v]) => (
              <FragmentRow key={k} k={k} v={v} />
            ))}
          </dl>
        </div>

        {/* Notes */}
        <div className="crm-card">
          <h3>Notes & activity</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <textarea
              className="crm-textarea"
              placeholder="Log a call, add a note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button
            className="crm-btn gold sm"
            disabled={busy || !note.trim()}
            onClick={async () => { await patch({ op: 'addNote', body: note }); setNote(''); }}
          >
            Add note
          </button>
          <ul className="timeline" style={{ marginTop: 16 }}>
            {lead.notes.length === 0 && <div className="empty">No notes yet.</div>}
            {lead.notes.map((n) => (
              <li key={n.id}>
                {n.body}
                <div className="t">{fmtDate(n.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="stack">
        {/* Stage / score */}
        <div className="crm-card">
          <h3>Status</h3>
          <label className="crm-label">Stage</label>
          <select
            className="crm-select"
            value={lead.stage}
            onChange={(e) => patch({ op: 'update', patch: { stage: e.target.value as Stage } })}
            style={{ marginBottom: 16 }}
          >
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <label className="crm-label">Score</label>
          <select
            className="crm-select"
            value={lead.score}
            onChange={(e) => patch({ op: 'update', patch: { score: e.target.value as Score } })}
          >
            {SCORES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <div style={{ marginTop: 16 }}>
            <span className={`badge ${lead.score}`}>{lead.score}</span>{' '}
            <span className="badge stage">{STAGES.find((s) => s.id === lead.stage)?.label}</span>
          </div>
        </div>

        {/* Tasks */}
        <div className="crm-card">
          <h3>Follow-up tasks</h3>
          <div>
            {lead.tasks.length === 0 && <div className="empty">No tasks yet.</div>}
            {lead.tasks.map((tk) => {
              const over = !tk.done && tk.due && tk.due < new Date().toISOString();
              return (
                <div key={tk.id} className={`task${tk.done ? ' done' : ''}`}>
                  <input type="checkbox" checked={tk.done} onChange={() => patch({ op: 'toggleTask', taskId: tk.id })} />
                  <div style={{ flex: 1 }}>
                    <div className="task-title">{tk.title}</div>
                    {tk.due && <div className={`task-due${over ? ' over' : ''}`}>Due {fmtDay(tk.due)}{over ? ' · overdue' : ''}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <input
              className="crm-input"
              placeholder="New task…"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <input
              className="crm-input"
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <button
              className="crm-btn gold sm"
              disabled={busy || !taskTitle.trim()}
              onClick={async () => {
                await patch({ op: 'addTask', title: taskTitle, due: taskDue ? new Date(taskDue).toISOString() : undefined });
                setTaskTitle(''); setTaskDue('');
              }}
            >
              Add task
            </button>
          </div>
        </div>

        {/* Danger */}
        <div className="crm-card">
          <h3>Danger zone</h3>
          <button className="crm-btn danger sm" onClick={remove}>Delete lead</button>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <>
      <dt>{k}</dt>
      <dd style={{ wordBreak: 'break-all' }}>{v}</dd>
    </>
  );
}
