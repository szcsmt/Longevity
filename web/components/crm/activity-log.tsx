'use client';

import { useMemo, useState } from 'react';

interface Ev { id: string; type: string; label: string; path?: string; source?: string; at: string }

// Type → { label, colour }. High-intent signals first & coloured.
const TYPES: Record<string, { label: string; color: string }> = {
  whatsapp:  { label: 'WhatsApp',      color: '#25D366' },
  phone:     { label: 'Hívás',         color: '#5BA7D8' },
  email:     { label: 'Email',         color: '#C9A96E' },
  brochure:  { label: 'Brosúra',       color: '#D8B26A' },
  form_open: { label: 'Űrlap megnyitás', color: '#E0A63A' },
  click:     { label: 'Kattintás',     color: '#9aa39b' },
  visit:     { label: 'Látogatás',     color: '#6b7570' },
};
const FILTERS = ['all', 'whatsapp', 'phone', 'email', 'brochure', 'form_open', 'click', 'visit'];
const FILTER_LABEL: Record<string, string> = { all: 'Mind', ...Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.label])) };

const meta = (t: string) => TYPES[t] || { label: t, color: '#9aa39b' };
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ActivityLog({ events }: { events: Ev[] }) {
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    events.forEach((e) => { c[e.type] = (c[e.type] || 0) + 1; });
    return c;
  }, [events]);

  const shown = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const signalTotal = events.filter((e) => e.type !== 'visit').length;

  return (
    <div>
      <style>{`
        .act-stats { display: flex; flex-wrap: wrap; gap: 26px; margin-bottom: 22px; }
        .act-stat .k { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-mut); }
        .act-stat .v { font-family: var(--serif); font-size: 30px; line-height: 1; margin-top: 6px; }
        .act-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
        .act-f { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; font-size: 12.5px; font-weight: 500;
          padding: 7px 13px; border-radius: 100px; border: 1px solid var(--c-line); background: transparent; color: var(--c-mut);
          transition: all 0.18s ease; }
        .act-f:hover { color: var(--c-cream); border-color: var(--c-gold); }
        .act-f.on { color: var(--c-cream); background: rgba(201,169,110,0.12); border-color: rgba(201,169,110,0.5); }
        .act-f .dot { width: 8px; height: 8px; border-radius: 50%; }
        .act-f .n { color: var(--c-mut); font-variant-numeric: tabular-nums; }
        .type-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
        .type-badge .dot { width: 8px; height: 8px; border-radius: 50%; }
      `}</style>

      {/* Signal counts */}
      <div className="act-stats">
        <div className="act-stat"><div className="k">Összes jel</div><div className="v tabnum" style={{ color: 'var(--c-gold-bright)' }}>{signalTotal}</div></div>
        <div className="act-stat"><div className="k">WhatsApp</div><div className="v tabnum">{counts.whatsapp || 0}</div></div>
        <div className="act-stat"><div className="k">Hívás</div><div className="v tabnum">{counts.phone || 0}</div></div>
        <div className="act-stat"><div className="k">Brosúra</div><div className="v tabnum">{counts.brochure || 0}</div></div>
        <div className="act-stat"><div className="k">Űrlap-megnyitás</div><div className="v tabnum">{counts.form_open || 0}</div></div>
        <div className="act-stat"><div className="k">Látogatás</div><div className="v tabnum">{counts.visit || 0}</div></div>
      </div>

      {/* Filters */}
      <div className="act-filters">
        {FILTERS.map((f) => {
          const n = f === 'all' ? events.length : (counts[f] || 0);
          return (
            <button key={f} className={`act-f${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f !== 'all' && <span className="dot" style={{ background: meta(f).color }} />}
              {FILTER_LABEL[f]}<span className="n">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Log */}
      <div className="crm-card" style={{ padding: '8px 6px' }}>
        {shown.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>Nincs ilyen interakció még.</div>
        ) : (
          <table className="crm-table">
            <thead>
              <tr><th>Típus</th><th>Elem</th><th>Forrás</th><th>Oldal</th><th style={{ textAlign: 'right' }}>Mikor</th></tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td><span className="type-badge" style={{ color: meta(e.type).color }}><span className="dot" style={{ background: meta(e.type).color }} />{meta(e.type).label}</span></td>
                  <td className="crm-name" style={{ fontWeight: 500 }}>{e.label || '—'}</td>
                  <td className="crm-meta">{e.source || '—'}</td>
                  <td className="crm-meta">{e.path || '/'}</td>
                  <td className="crm-meta tabnum" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(e.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
