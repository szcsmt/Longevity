import Link from 'next/link';
import { analytics, type Range } from '@/lib/crm/analytics';
import { fmtInt, fmtTHBshort } from '@/lib/crm/format';
import { AreaChart, BarList, Donut, Funnel, StackedBarList } from '@/components/crm/charts';
import { STATUS_COLOR, STATUS_LABEL, SCORE_COLOR, SCORE_LABEL } from '@/lib/crm/chart-theme';

export const dynamic = 'force-dynamic';

const RANGES: { v: string; label: string }[] = [
  { v: '7', label: '7 nap' }, { v: '30', label: '30 nap' }, { v: '90', label: '90 nap' }, { v: 'all', label: 'Összes' },
];

const EVENT_LABEL: Record<string, string> = {
  form_open: 'Űrlap megnyitva', whatsapp: 'WhatsApp', phone: 'Telefon', email: 'E-mail',
  brochure: 'Brossúra', click: 'Kattintás', reserve: 'Foglalás', visit: 'Látogatás',
};
const pretty = (s: string) => EVENT_LABEL[s] || s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

function Trend({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return <small className={`kpi-trend ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct)}%</small>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const a = await analytics(sp.range);
  const rangeStr = String(a.range as Range);
  const f = a.financial;

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Analitika</h1>
          <p className="crm-sub">Minden CRM-adat egy helyen, átláthatóan · {a.rangeLabel.toLowerCase()}.</p>
        </div>
        <div className="seg">
          {RANGES.map((r) => (
            <Link key={r.v} href={`/admin/analytics?range=${r.v}`} className={`seg-item${rangeStr === r.v ? ' active' : ''}`}>{r.label}</Link>
          ))}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="crm-grid crm-stats" style={{ marginBottom: 16 }}>
        <div className="crm-card crm-stat">
          <div className="k">Összes lead</div>
          <div className="v tabnum">{fmtInt(a.kpis.totalLeads)}</div>
        </div>
        <div className="crm-card crm-stat">
          <div className="k">Új lead · {a.rangeLabel.toLowerCase()}</div>
          <div className="v tabnum">{fmtInt(a.kpis.leadsInRange)} <Trend pct={a.kpis.leadsTrendPct} /></div>
        </div>
        <div className="crm-card crm-stat accent">
          <div className="k">Forró leadek</div>
          <div className="v tabnum">{fmtInt(a.kpis.hotLeads)}</div>
        </div>
        <div className="crm-card crm-stat">
          <div className="k">Foglalási arány</div>
          <div className="v tabnum">{a.kpis.reservationRatePct}<small>%</small></div>
        </div>
      </div>

      {/* ── Financial ── */}
      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3>Pénzügyi áttekintés <span className="h3-note">· aktuális állás</span></h3>
        <div className="fin-grid">
          <div className="fin-tile"><div className="k">Elért bevétel</div><div className="v">{fmtTHBshort(f.soldRevenue)}</div><div className="s">{f.soldCount} eladott villa · a készlet {f.realizedPct}%-a</div></div>
          <div className="fin-tile"><div className="k">Foglalások értéke</div><div className="v">{fmtTHBshort(f.reservedValue)}</div><div className="s">{f.reservedCount} lefoglalt villa</div></div>
          <div className="fin-tile"><div className="k">Átlag üzletméret</div><div className="v">{f.avgDealSize != null ? fmtTHBshort(f.avgDealSize) : '—'}</div><div className="s">eladott villánként</div></div>
          <div className="fin-tile"><div className="k">Teljes készlet-érték</div><div className="v">{fmtTHBshort(f.totalInventoryValue)}</div><div className="s">{f.bySize.reduce((s, x) => s + x.total, 0)} árazott villa</div></div>
        </div>

        <div className="fin-progress" title={`Eladva ${f.realizedPct}% · lekötve ${f.committedPct}%`}>
          <span className="fp-sold" style={{ width: `${f.realizedPct}%` }} />
          <span className="fp-res" style={{ width: `${Math.max(0, f.committedPct - f.realizedPct)}%` }} />
        </div>
        <div className="fin-progress-legend">
          <span><i style={{ background: STATUS_COLOR.sold }} />Eladva {f.realizedPct}%</span>
          <span><i style={{ background: STATUS_COLOR.reserved }} />Lefoglalva {Math.max(0, f.committedPct - f.realizedPct)}%</span>
          <span><i style={{ background: 'rgba(228,217,195,0.12)' }} />Szabad {Math.max(0, 100 - f.committedPct)}%</span>
        </div>

        <div className="fin-sizes">
          {f.bySize.map((r) => (
            <div className="fin-size-row" key={r.size}>
              <span className="fin-size-tag">{r.size}</span>
              <span className="fin-size-meta">{fmtTHBshort(r.price)} / villa</span>
              <span className="fin-size-bar">
                <i className="s-sold" style={{ width: `${(r.sold / r.total) * 100}%` }} />
                <i className="s-res" style={{ width: `${(r.reserved / r.total) * 100}%` }} />
              </span>
              <span className="fin-size-count tabnum">{r.sold}/{r.reserved}/{r.total}</span>
            </div>
          ))}
          <div className="fin-size-key">eladva / foglalt / összes</div>
        </div>
      </div>

      {/* ── Leads ── */}
      <h2 className="sec-title">Leadek</h2>
      <div className="crm-grid crm-cols-2" style={{ marginBottom: 16 }}>
        <div className="crm-card"><h3>Leadek időben</h3><AreaChart data={a.leadsOverTime} unit="lead" /></div>
        <div className="crm-card"><h3>Leadek forrás szerint</h3><BarList data={a.leadsBySource} unit="lead" /></div>
      </div>
      <div className="crm-grid crm-cols-2" style={{ marginBottom: 16 }}>
        <div className="crm-card"><h3>Pipeline fázisok</h3><BarList data={a.leadsByStage.map((s) => ({ name: s.label, count: s.count }))} unit="lead" /></div>
        <div className="crm-card"><h3>Hőfok megoszlás</h3><Donut segments={a.leadsByScore.map((s) => ({ label: SCORE_LABEL[s.score], value: s.count, color: SCORE_COLOR[s.score] }))} centerLabel="lead" unit="lead" /></div>
      </div>
      <div className="crm-card" style={{ marginBottom: 16 }}><h3>Űrlap típus szerint</h3><BarList data={a.leadsByForm.map((s) => ({ name: pretty(s.name), count: s.count }))} unit="lead" /></div>

      {/* ── Traffic ── */}
      <h2 className="sec-title">Weboldal-forgalom</h2>
      <div className="crm-grid crm-cols-2" style={{ marginBottom: 16 }}>
        <div className="crm-card"><h3>Látogatók időben</h3><AreaChart data={a.visitsOverTime} unit="látogató" /></div>
        <div className="crm-card"><h3>Interakciók típus szerint</h3><BarList data={a.eventsByType.map((s) => ({ name: pretty(s.name), count: s.count }))} /></div>
      </div>
      <div className="crm-card" style={{ marginBottom: 16 }}><h3>Látogatók forrása</h3><BarList data={a.visitsBySource} unit="látogató" /></div>

      {/* ── Funnel ── */}
      <h2 className="sec-title">Konverziós tölcsér</h2>
      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3>A leadek útja a lezárásig <span className="h3-note">· {a.rangeLabel.toLowerCase()}</span></h3>
        <Funnel steps={a.funnel} />
      </div>

      {/* ── Villas ── */}
      <h2 className="sec-title">Villák</h2>
      <div className="crm-grid crm-cols-2" style={{ marginBottom: 16 }}>
        <div className="crm-card"><h3>Villa státusz <span className="h3-note">· aktuális</span></h3>
          <Donut
            segments={[
              { label: STATUS_LABEL.sold, value: a.villaStatus.sold, color: STATUS_COLOR.sold },
              { label: STATUS_LABEL.reserved, value: a.villaStatus.reserved, color: STATUS_COLOR.reserved },
              { label: STATUS_LABEL.free, value: a.villaStatus.free, color: STATUS_COLOR.free },
            ]}
            centerValue={fmtInt(a.villaStatus.total)} centerLabel="villa" unit="villa"
          />
        </div>
        <div className="crm-card"><h3>Blokkonként</h3>
          <StackedBarList
            legend={[{ name: STATUS_LABEL.sold, color: STATUS_COLOR.sold }, { name: STATUS_LABEL.reserved, color: STATUS_COLOR.reserved }, { name: STATUS_LABEL.free, color: STATUS_COLOR.free }]}
            rows={a.villaByBlock.map((b) => ({
              label: `${b.block} blokk`,
              parts: [
                { name: STATUS_LABEL.sold, value: b.sold, color: STATUS_COLOR.sold },
                { name: STATUS_LABEL.reserved, value: b.reserved, color: STATUS_COLOR.reserved },
                { name: STATUS_LABEL.free, value: b.free, color: STATUS_COLOR.free },
              ],
            }))}
          />
        </div>
      </div>

      {/* ── Agents ── */}
      <h2 className="sec-title">Értékesítői ranglista</h2>
      <div className="crm-card" style={{ marginBottom: 24 }}>
        {a.agents.length === 0 ? (
          <div className="cx-empty" style={{ padding: '30px 16px' }}>
            Még nincs értékesítőhöz kötött eladás. Amint egy villa az értékesítő nevén kel el, itt automatikusan megjelenik a ranglista — ki hány villát adott el és mekkora bevétellel. (A foglalás még nem eredmény — csak a lezárt eladás számít.)
          </div>
        ) : (
          <div className="rank">
            {a.agents.map((ag, i) => (
              <div className="rank-row" key={ag.seller}>
                <span className="rank-pos">{i + 1}</span>
                <span className="rank-name">{ag.seller}</span>
                <span className="rank-stat"><b>{ag.sold}</b> eladás</span>
                <span className="rank-rev tabnum">{fmtTHBshort(ag.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
