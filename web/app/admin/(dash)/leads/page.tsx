import Link from 'next/link';
import { isAdmin } from '@/lib/crm/auth';
import { listLeads } from '@/lib/crm/store';
import type { Lead } from '@/lib/crm/types';
import { STAGES, SCORES } from '@/lib/crm/types';
import { LeadsTable } from '@/components/crm/leads-table';
import { DedupeButton } from '@/components/crm/dedupe-button';

export const dynamic = 'force-dynamic';

const FORM_TYPES = ['enquiry', 'reserve', 'brochure_request', 'manual'];
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

const SCORE_RANK: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
const stageRank = (s: string) => STAGES.findIndex((st) => st.id === s);

const SORTS: Record<string, (a: Lead, b: Lead) => number> = {
  received: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
  name: (a, b) => (a.name || 'zz').localeCompare(b.name || 'zz'),
  score: (a, b) => (SCORE_RANK[a.score] ?? 9) - (SCORE_RANK[b.score] ?? 9),
  stage: (a, b) => stageRank(a.stage) - stageRank(b.stage),
};

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
  // Object.hasOwn, not a truthy lookup: '__proto__' or 'hasOwnProperty' would
  // otherwise pass the check and hand Array.sort a non-function comparator.
  const sort = Object.hasOwn(SORTS, str(sp.sort)) ? str(sp.sort) : 'received';
  const leads = (await listLeads(filter as never)).sort(SORTS[sort]);
  const admin = await isAdmin();

  // Preserve the current view in links (sorting keeps filters, export keeps both).
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filter, sort, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const sortHrefs = Object.fromEntries(
    Object.keys(SORTS).map((id) => [id, `/admin/leads${qs({ sort: id })}`]),
  );

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Leads</h1>
          <p className="crm-sub">{leads.length} {leads.length === 1 ? 'lead' : 'leads'} matching your view.</p>
        </div>
        <div className="act-row">
          {admin && <Link className="crm-btn gold" href="/admin/leads/new">+ Add lead</Link>}
          {admin && <DedupeButton />}
          <a className="crm-btn" href={`/api/crm/export${qs({ sort: '' })}`}>Export CSV</a>
          <Link className="crm-btn" href="/admin/pipeline">Pipeline view →</Link>
        </div>
      </div>

      {/* Filters */}
      <form className="crm-filters" method="get">
        <div className="fld grow">
          <input className="crm-input" name="q" placeholder="Search name, email, phone, villa…" defaultValue={filter.q} />
        </div>
        <div className="fld">
          <select className="crm-select" name="stage" defaultValue={filter.stage} aria-label="Filter by stage">
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="fld">
          <select className="crm-select" name="score" defaultValue={filter.score} aria-label="Filter by score">
            <option value="">All scores</option>
            {SCORES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="fld">
          <select className="crm-select" name="form_type" defaultValue={filter.form_type} aria-label="Filter by form type">
            <option value="">All forms</option>
            {FORM_TYPES.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
          </select>
        </div>
        <button className="crm-btn gold" type="submit">Filter</button>
        <Link className="crm-btn ghost" href="/admin/leads">Reset</Link>
      </form>

      <LeadsTable leads={leads} sortHrefs={sortHrefs} sort={sort} readOnly={!admin} />
    </>
  );
}
