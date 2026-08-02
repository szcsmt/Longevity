import Link from 'next/link';
import { reports } from '@/lib/crm/store';
import { fmtTHBShort } from '@/lib/crm/villas';

export const dynamic = 'force-dynamic';

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export default async function ReportsPage() {
  const r = await reports();
  const monthMax = Math.max(1, ...r.byMonth.map((m) => m.total));

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Reports</h1>
          <p className="crm-sub">Where leads come from, what they want, and why deals are lost.</p>
        </div>
        <a className="crm-btn" href="/api/crm/export">Export all leads (CSV)</a>
      </div>

      <div className="crm-grid crm-cols-2">
        <div className="stack">
          {/* Source performance */}
          <div className="crm-card table-scroll">
            <h3>Source performance</h3>
            {r.bySource.length === 0 ? (
              <div className="empty">No leads yet.</div>
            ) : (
              <table className="crm-table">
                <thead>
                  <tr><th>Source</th><th className="tabnum">Leads</th><th className="tabnum">Hot</th><th className="tabnum">Won</th><th className="tabnum">Lost</th><th className="tabnum">Win rate</th><th className="tabnum">Won value</th></tr>
                </thead>
                <tbody>
                  {r.bySource.map((s) => (
                    <tr key={s.source}>
                      <td style={{ textTransform: 'capitalize' }}>{s.source}</td>
                      <td className="tabnum">{s.total}</td>
                      <td className="tabnum">{s.hot || '—'}</td>
                      <td className="tabnum">{s.won || '—'}</td>
                      <td className="tabnum">{s.lost || '—'}</td>
                      <td className="tabnum">{s.won + s.lost ? `${s.winRate}%` : '—'}</td>
                      <td className="tabnum">{s.wonValue ? fmtTHBShort(s.wonValue) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Monthly volume */}
          <div className="crm-card">
            <h3>Leads per month</h3>
            {r.byMonth.map((m) => (
              <div className="bar-row" key={m.month}>
                <span className="lab">{m.label}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(m.total / monthMax) * 100}%` }} /></span>
                <span className="num tabnum">{m.total}{m.won ? <small className="pct"> · {m.won} won</small> : null}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          {/* Villa interest */}
          <div className="crm-card table-scroll">
            <h3>Villa interest</h3>
            {r.byVilla.length === 0 ? (
              <div className="empty">No villa-specific leads yet.</div>
            ) : (
              <table className="crm-table">
                <thead>
                  <tr><th>Residence</th><th className="tabnum">Leads</th><th className="tabnum">Hot</th><th className="tabnum">Reserved</th><th className="tabnum">Won</th></tr>
                </thead>
                <tbody>
                  {r.byVilla.map((v) => (
                    <tr key={v.villa}>
                      <td>{v.villa}</td>
                      <td className="tabnum">{v.total}</td>
                      <td className="tabnum">{v.hot || '—'}</td>
                      <td className="tabnum">{v.reserved || '—'}</td>
                      <td className="tabnum">{v.won || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Lost reasons */}
          <div className="crm-card">
            <h3>Why deals were lost</h3>
            {r.lostReasons.length === 0 ? (
              <div className="empty">No lost reasons recorded yet — they are captured when a lead is moved to Lost.</div>
            ) : (
              <ul className="timeline">
                {r.lostReasons.map((x) => (
                  <li key={`${x.leadId}-${x.at}`}>
                    {x.reason}
                    <div className="t">
                      <Link href={`/admin/leads/${x.leadId}`} className="crm-row" style={{ color: 'var(--c-gold)' }}>{x.leadName}</Link>
                      {' · '}{fmtDay(x.at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
