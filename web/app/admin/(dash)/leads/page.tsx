import Link from 'next/link';
import { listLeads } from '@/lib/crm/store';
import { STAGES, SCORES } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

const FORM_TYPES = ['enquiry', 'reserve', 'brochure_request'];
const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = {
    stage: str(sp.stage),
    score: str(sp.score),
    form_type: str(sp.form_type),
    q: str(sp.q),
  };
  const leads = await listLeads(filter as never);

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Leads</h1>
          <p className="crm-sub">{leads.length} {leads.length === 1 ? 'lead' : 'leads'} matching your view.</p>
        </div>
        <Link className="crm-btn" href="/admin/pipeline">Pipeline view →</Link>
      </div>

      {/* Filters */}
      <form className="crm-filters" method="get">
        <div className="fld grow">
          <input className="crm-input" name="q" placeholder="Search name, email, phone, villa…" defaultValue={filter.q} />
        </div>
        <div className="fld">
          <select className="crm-select" name="stage" defaultValue={filter.stage}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="fld">
          <select className="crm-select" name="score" defaultValue={filter.score}>
            <option value="">All scores</option>
            {SCORES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="fld">
          <select className="crm-select" name="form_type" defaultValue={filter.form_type}>
            <option value="">All forms</option>
            {FORM_TYPES.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
          </select>
        </div>
        <button className="crm-btn gold" type="submit">Filter</button>
        <Link className="crm-btn ghost" href="/admin/leads">Reset</Link>
      </form>

      {/* Table */}
      <div className="crm-card" style={{ padding: '8px 6px' }}>
        {leads.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>No leads match these filters.</div>
        ) : (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Enquiry</th>
                <th>Source</th>
                <th>Score</th>
                <th>Stage</th>
                <th>Received</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
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
                  <td className="crm-meta tabnum">{fmtDay(l.submitted_at || l.created_at)}</td>
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
