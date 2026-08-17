'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Lead } from '@/lib/crm/types';
import { STAGES, SCORES } from '@/lib/crm/types';
import { hasNoNextStep, isStalled, stageAgeDays } from '@/lib/crm/rules';

/* Fixed locale + UTC so server prerender and browser hydration agree. */
const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export function LeadsTable({ leads, sortHrefs, sort, readOnly = false, canDelete = false }: {
  leads: Lead[];
  sortHrefs: Record<string, string>; // column id -> href with that sort applied
  sort: string;
  readOnly?: boolean;
  /** Agents re-stage and re-score all day but may not archive a selection out
      of everyone's view: the button is hidden for them rather than shown and
      then refused by the API. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkStage, setBulkStage] = useState('');
  const [bulkScore, setBulkScore] = useState('');

  const allSelected = leads.length > 0 && leads.every((l) => sel.has(l.id));
  const ids = useMemo(() => [...sel], [sel]);

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function bulk(action: 'stage' | 'score' | 'archive', value?: string) {
    if (!ids.length) return;
    if (action === 'archive' && !confirm(
      `Archive ${ids.length} ${ids.length === 1 ? 'lead' : 'leads'}?\n\n` +
      'They leave every list, count and report, and their automated e-mails stop. ' +
      'Nothing is lost — each one can be restored.',
    )) return;
    setBusy(true);
    try {
      const res = await fetch('/api/crm/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, value }),
      });
      const data = await res.json().catch(() => ({ ok: false, failed: ids.length }));
      if (data.failed) alert(`${data.failed} ${data.failed === 1 ? 'lead' : 'leads'} could not be updated — the list below shows the current state.`);
      setSel(new Set());
      setBulkStage('');
      setBulkScore('');
    } finally {
      setBusy(false);
      // Refresh REGARDLESS of outcome — a partial write must never leave the
      // table showing stale rows as if nothing changed.
      router.refresh();
    }
  }

  const TH = ({ id, label }: { id: string; label: string }) => (
    <th>
      <Link href={sortHrefs[id]} className={`th-sort${sort === id ? ' on' : ''}`}>
        {label}{sort === id ? ' ↓' : ''}
      </Link>
    </th>
  );

  const any = sel.size > 0;

  return (
    <>
      {/* Always rendered (disabled at zero selection) so ticking the first
          checkbox never shifts the table under the pointer. */}
      {leads.length > 0 && !readOnly && (
        <div className={`bulk-bar${any ? '' : ' idle'}`}>
          <span className="tabnum" style={{ fontWeight: 600 }}>
            {any ? `${sel.size} selected` : 'Select leads for bulk actions'}
          </span>
          <select className="crm-select sm" value={bulkStage} disabled={busy || !any} aria-label="Move selection to stage"
            onChange={(e) => { setBulkStage(e.target.value); if (e.target.value) bulk('stage', e.target.value); }}>
            <option value="">Move to stage…</option>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select className="crm-select sm" value={bulkScore} disabled={busy || !any} aria-label="Set selection score"
            onChange={(e) => { setBulkScore(e.target.value); if (e.target.value) bulk('score', e.target.value); }}>
            <option value="">Set score…</option>
            {SCORES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          {canDelete && <button className="crm-btn danger sm" disabled={busy || !any} onClick={() => bulk('archive')}>Archive</button>}
          <button className="crm-btn ghost sm" disabled={busy || !any} onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      <div className="crm-card table-scroll" style={{ padding: '8px 6px' }}>
        {leads.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>No leads match these filters.</div>
        ) : (
          <table className="crm-table">
            <thead>
              <tr>
                <th style={{ width: readOnly ? 0 : 34 }}>
                  {!readOnly && <input
                    type="checkbox"
                    className="bulk-check"
                    checked={allSelected}
                    onChange={() => setSel(allSelected ? new Set() : new Set(leads.map((l) => l.id)))}
                    aria-label="Select all"
                  />}
                </th>
                <TH id="name" label="Name" />
                <th>Enquiry</th>
                <th>Source</th>
                <TH id="score" label="Score" />
                <TH id="stage" label="Stage" />
                <TH id="received" label="Received" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className={sel.has(l.id) ? 'row-sel' : undefined}>
                  <td>
                    {!readOnly && (
                      <input
                        type="checkbox"
                        className="bulk-check"
                        checked={sel.has(l.id)}
                        onChange={() => toggle(l.id)}
                        aria-label={`Select ${l.name || 'lead'}`}
                      />
                    )}
                  </td>
                  <td>
                    <Link href={`/admin/leads/${l.id}`} className="crm-row">
                      <div className="crm-name">{l.name || 'Unknown'}</div>
                      <div className="crm-meta">{l.email || l.phone || '—'}</div>
                    </Link>
                  </td>
                  <td>
                    <div style={{ textTransform: 'capitalize' }}>{(l.form_type || 'enquiry').replace('_', ' ')}</div>
                    <div className="crm-meta">{l.villa || l.form_origin || ''}</div>
                  </td>
                  <td className="crm-meta">{l.source || l.utm_source || 'direct'}</td>
                  <td><span className={`badge ${l.score}`}>{l.score}</span></td>
                  <td><span className="badge stage">{STAGES.find((s) => s.id === l.stage)?.label}</span></td>
                  <td className="crm-meta tabnum">
                    {fmtDay(l.submitted_at || l.created_at)}
                    {isStalled(l) && (
                      <span className="flag stalled" title="Sitting in this stage past its threshold">
                        {' '}· stalled {stageAgeDays(l)}d
                      </span>
                    )}
                    {!isStalled(l) && hasNoNextStep(l) && (
                      <span className="flag nonext" title="Active lead with no open task and no reply timer">
                        {' '}· no next step
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/admin/leads/${l.id}`} className="crm-btn ghost sm">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
