'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from './lang-provider';
import type { Lead } from '@/lib/crm/types';
import { STAGES } from '@/lib/crm/types';
import { hasNoNextStep, isNurtured, isStalled, nextAction, nextActionState, stageAgeDays } from '@/lib/crm/rules';

/* Fixed locale + UTC so server prerender and browser hydration agree. */
const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/* What is planned next, and whether it is late. */
function NextStep({ lead }: { lead: Lead }) {
  const t = useT();
  // Parked on purpose beats every other reading: this lead is not neglected,
  // it is waiting, and saying "nothing planned" about it would be a lie.
  if (isNurtured(lead)) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>{t('Félretéve')}</div>
        <div className="crm-meta tabnum">{t('eddig')} {fmtShort(lead.nurture_until!)}</div>
      </div>
    );
  }
  const task = nextAction(lead);
  if (!task) {
    return hasNoNextStep(lead)
      ? <span className="flag nonext">{t('Nincs betervezve')}</span>
      : <span className="crm-meta">—</span>;
  }
  const state = nextActionState(lead);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13 }}>{task.title}</div>
      <div className={`crm-meta tabnum${state === 'overdue' ? ' q-late' : ''}`}>
        {task.due ? `${state === 'overdue' ? 'late · ' : state === 'today' ? 'today · ' : ''}${fmtShort(task.due)}` : 'no date'}
      </div>
    </div>
  );
}

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric' });

/* ── A sortable column heading ──

   Defined out here rather than inside the table's render. A component declared
   inside another component is a NEW component on every render as far as React
   is concerned, so it unmounts and remounts its subtree each time — losing
   focus, losing scroll, and doing it on every keystroke in a filter. It worked
   by luck because a <th> has no state to lose. */
function TH({ id, label, sortHrefs, sort, t }: {
  id: string; label: string; sortHrefs: Record<string, string>; sort?: string; t: (h: string) => string;
}) {
  return (
    <th>
      <Link href={sortHrefs[id]} className={`th-sort${sort === id ? ' on' : ''}`}>
        {t(label)}{sort === id ? ' ↓' : ''}
      </Link>
    </th>
  );
}

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
  const t = useT();
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allSelected = leads.length > 0 && leads.every((l) => sel.has(l.id));
  const ids = useMemo(() => [...sel], [sel]);

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function bulk(action: 'archive', value?: string) {
    if (!ids.length) return;
    if (action === 'archive' && !confirm(
      `${t('Archiválod ezt a(z)')} ${ids.length} ${t('leadet?')}\n\n` +
      `${t('Eltűnnek minden listából, számlálóból és riportból, és az automata levelek leállnak.')} ` +
      t('Semmi nem vész el — bármelyik visszaállítható.'),
    )) return;
    setBusy(true);
    try {
      const res = await fetch('/api/crm/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, value }),
      });
      const data = await res.json().catch(() => ({ ok: false, failed: ids.length }));
      if (data.failed) {
        // Refusals carry a reason (a lead holding a unit, most often). Showing
        // the count alone leaves the operator guessing which ones, and why.
        const why = Array.isArray(data.refused) && data.refused.length
          ? `\n\n${data.refused.join('\n')}`
          : '';
        alert(`${data.failed} ${data.failed === 1 ? 'lead' : 'leads'} could not be updated — the list below shows the current state.${why}`);
      }
      setSel(new Set());
    } finally {
      setBusy(false);
      // Refresh REGARDLESS of outcome — a partial write must never leave the
      // table showing stale rows as if nothing changed.
      router.refresh();
    }
  }

  const any = sel.size > 0;

  return (
    <>
      {/* Always rendered (disabled at zero selection) so ticking the first
          checkbox never shifts the table under the pointer. */}
      {/* Only once something is actually ticked. An always-present bar telling
          you what you could do if you selected something is a row of furniture
          on a page that is read far more often than it is acted on. */}
      {leads.length > 0 && !readOnly && any && (
        <div className="bulk-bar">
          <span className="tabnum" style={{ fontWeight: 600 }}>{sel.size} selected</span>
          {canDelete && <button className="crm-btn danger sm" disabled={busy} onClick={() => bulk('archive')}>{t('Archiválás')}</button>}
          <button className="crm-btn ghost sm" disabled={busy} onClick={() => setSel(new Set())}>{t('Törlés')}</button>
        </div>
      )}

      <div className="crm-card table-scroll" style={{ padding: '8px 6px' }}>
        {leads.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>{t('Nincs a szűrőknek megfelelő lead.')}</div>
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
                    aria-label={t('Mind kijelölése')}
                  />}
                </th>
                <TH id="name" label="Név" sortHrefs={sortHrefs} sort={sort} t={t} />
                <th>{t('Érdeklődés')}</th>
                <th>{t('Honnan')}</th>
                <TH id="score" label="Pontszám" sortHrefs={sortHrefs} sort={sort} t={t} />
                <TH id="stage" label="Fázis" sortHrefs={sortHrefs} sort={sort} t={t} />
                <th>{t('Következő lépés')}</th>
                <TH id="received" label="Beérkezett" sortHrefs={sortHrefs} sort={sort} t={t} />
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
                        aria-label={`${l.name || 'Lead'} kijelölése`}
                      />
                    )}
                  </td>
                  <td>
                    <Link href={`/admin/leads/${l.id}`} className="crm-row">
                      <div className="crm-name">{l.name || t('Névtelen')}</div>
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
                  {/* The one column a sales manager scans for. A lead with
                      nothing planned says so in words, not by an empty cell
                      that reads the same as "not loaded yet". */}
                  <td>
                    <NextStep lead={l} />
                  </td>
                  <td className="crm-meta tabnum">
                    {fmtDay(l.submitted_at || l.created_at)}
                    {isStalled(l) && !isNurtured(l) && (
                      <span className="flag stalled" title={t('A fázisában ül a megengedett időn túl')}>
                        {' '}· stalled {stageAgeDays(l)}d
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/admin/leads/${l.id}`} className="crm-btn ghost sm">{t('Megnyitás')}</Link>
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
