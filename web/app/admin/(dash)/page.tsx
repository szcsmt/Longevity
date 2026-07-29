import Link from 'next/link';
import { listEvents, listLeads, stats } from '@/lib/crm/store';
import { STAGES } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export default async function Dashboard() {
  const [s, leads, allEvents] = await Promise.all([stats(), listLeads(), listEvents(80)]);
  // The activity feed shows interactions; raw visits are counted in the
  // Visitors panel instead so they don't drown out the clicks.
  const events = allEvents.filter((e) => e.type !== 'visit').slice(0, 30);

  const recent = leads.slice(0, 6);
  const upcoming = leads
    .flatMap((l) => l.tasks.filter((t) => !t.done).map((t) => ({ t, l })))
    .sort((a, b) => (a.t.due || '9').localeCompare(b.t.due || '9'))
    .slice(0, 6);

  const stageMax = Math.max(1, ...STAGES.map((st) => s.byStage[st.id] || 0));
  const srcMax = Math.max(1, ...s.bySource.map((x) => x.count));
  const nowIso = new Date().toISOString();

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Dashboard</h1>
          <p className="crm-sub">Every website enquiry, reservation and brochure request lands here.</p>
        </div>
        <Link className="crm-btn gold" href="/admin/leads">View all leads</Link>
      </div>

      {/* Stat tiles */}
      <div className="crm-grid crm-stats" style={{ marginBottom: 16 }}>
        <div className="crm-card crm-stat">
          <div className="k">Total leads</div>
          <div className="v tabnum">{s.total}</div>
        </div>
        <div className="crm-card crm-stat">
          <div className="k">New · last 7 days</div>
          <div className="v tabnum">{s.last7}</div>
        </div>
        <div className="crm-card crm-stat accent">
          <div className="k">Hot leads</div>
          <div className="v tabnum">{s.byScore.hot || 0}</div>
        </div>
        <div className="crm-card crm-stat">
          <div className="k">Open tasks</div>
          <div className="v tabnum">{s.openTasks}</div>
        </div>
      </div>

      <div className="crm-grid crm-cols-2">
        {/* Left: visitors + funnel + sources */}
        <div className="stack">
          {/* Real traffic measured first-party on the live site */}
          <div className="crm-card">
            <h3>Visitors <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-mut-2)' }}>· real traffic</span></h3>
            <div style={{ display: 'flex', gap: 36, marginBottom: s.visitsBySource.length ? 18 : 0 }}>
              <div>
                <div className="crm-meta" style={{ marginBottom: 4 }}>Last 7 days</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 40, lineHeight: 1 }} className="tabnum">{s.visits7d}</div>
              </div>
              <div>
                <div className="crm-meta" style={{ marginBottom: 4 }}>Last 24 hours</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 40, lineHeight: 1 }} className="tabnum">{s.visits24h}</div>
              </div>
            </div>
            {s.visitsBySource.length === 0 ? (
              <div className="empty">Counting starts now — visits appear as real people open the site.</div>
            ) : (
              s.visitsBySource.map((x) => {
                const max = Math.max(1, ...s.visitsBySource.map((v) => v.count));
                return (
                  <div className="bar-row" key={x.source}>
                    <span className="lab">{x.source}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ width: `${(x.count / max) * 100}%` }} /></span>
                    <span className="num tabnum">{x.count}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="crm-card">
            <h3>Pipeline</h3>
            {STAGES.map((st) => {
              const n = s.byStage[st.id] || 0;
              return (
                <div className="bar-row" key={st.id}>
                  <span className="lab">{st.label}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / stageMax) * 100}%` }} /></span>
                  <span className="num tabnum">{n}</span>
                </div>
              );
            })}
          </div>

          <div className="crm-card">
            <h3>Leads by source</h3>
            {s.bySource.length === 0 && <div className="empty">No data yet.</div>}
            {s.bySource.map((x) => (
              <div className="bar-row" key={x.source}>
                <span className="lab">{x.source}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(x.count / srcMax) * 100}%` }} /></span>
                <span className="num tabnum">{x.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: recent + tasks */}
        <div className="stack">
          <div className="crm-card">
            <h3>Recent leads</h3>
            {recent.map((l) => (
              <Link key={l.id} href={`/admin/leads/${l.id}`} className="crm-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 0', borderBottom: '1px solid rgba(228,217,195,0.10)' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="crm-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name || 'Unknown'}</div>
                  <div className="crm-meta">{l.villa || l.form_type || 'enquiry'} · {fmtDay(l.created_at)}</div>
                </div>
                <span className={`badge ${l.score}`}>{l.score}</span>
              </Link>
            ))}
          </div>

          <div className="crm-card">
            <h3>Upcoming follow-ups</h3>
            {upcoming.length === 0 && <div className="empty">Nothing scheduled.</div>}
            {upcoming.map(({ t, l }) => {
              const over = t.due && t.due < nowIso;
              return (
                <Link key={t.id} href={`/admin/leads/${l.id}`} className="crm-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(228,217,195,0.10)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div className="crm-meta">{l.name || 'Unknown'}</div>
                  </div>
                  {t.due && <span className="crm-meta" style={{ color: over ? 'var(--c-hot)' : undefined, whiteSpace: 'nowrap' }}>{fmtDay(t.due)}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live activity — real clicks on the live site */}
      <div className="crm-card" style={{ marginTop: 16 }}>
        <h3>
          Live activity
          <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-mut-2)' }}>
            · {s.events24h} in the last 24h
          </span>
        </h3>
        {events.length === 0 && (
          <div className="empty">No interactions yet. Open the site and click a CTA — it appears here instantly.</div>
        )}
        {events.map((ev) => (
          <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(228,217,195,0.10)' }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge stage" style={{ textTransform: 'capitalize' }}>{ev.type.replace('_', ' ')}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
            </div>
            <span className="crm-meta" style={{ whiteSpace: 'nowrap' }}>{ev.source ? `${ev.source} · ` : ''}{fmtTime(ev.at)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
