import Link from 'next/link';
import { isAuthed } from '@/lib/crm/auth';
import { listLeads } from '@/lib/crm/store';
import { performance } from '@/lib/crm/performance';
import { agencyPerformance } from '@/lib/crm/partners';
import { fmtTHBshort } from '@/lib/crm/format';

export const dynamic = 'force-dynamic';

/* ── The head of sales' screen ──

   Not another analytics page. That one answers where the traffic comes from and
   what the inventory is worth; this one answers four questions about the sales
   operation itself: where deals die, how long they take, who is producing, and
   what needs attention today.

   Almost all of it was already being computed and thrown away — the store worked
   out source-by-source win rates on every call and no page rendered them, and
   the old funnel counted stages but never the drop between them, which is the
   only part anybody acts on. */

const Tile = ({ k, v, s }: { k: string; v: string; s?: string }) => (
  <div className="fin-tile">
    <div className="k">{k}</div>
    <div className="v">{v}</div>
    {s && <div className="s">{s}</div>}
  </div>
);

const days = (n: number | null) => (n === null ? '—' : `${n} ${n === 1 ? 'day' : 'days'}`);
const hours = (n: number | null) =>
  n === null ? '—' : n < 1 ? `${Math.round(n * 60)} min` : n < 48 ? `${Math.round(n)} h` : `${Math.round(n / 24)} days`;

export default async function PerformancePage() {
  if (!(await isAuthed())) return null;
  const leads = await listLeads();
  const p = performance(leads);
  const agencies = await agencyPerformance(leads);
  const producing = agencies.filter((a) => a.registered > 0);

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Performance</h1>
          <p className="crm-sub">
            {p.total} live {p.total === 1 ? 'lead' : 'leads'} · {p.open} open · {p.won} sold · {p.lost} lost.
            Where deals die, how long they take, and who is producing.
          </p>
        </div>
        <Link className="crm-btn" href="/admin/analytics">Marketing analytics →</Link>
      </div>

      {/* ── What needs a decision today ── */}
      <div className="crm-card attention" style={{ marginBottom: 16 }}>
        <h3>Needs management attention</h3>
        <div className="fin-grid">
          <Link className="crm-row" href="/admin/leads?flag=uncontacted"><Tile k="Nobody has spoken to" v={String(p.attention.uncontacted)} s="new leads with no conversation" /></Link>
          <Link className="crm-row" href="/admin/leads?flag=overdue"><Tile k="Late follow-ups" v={String(p.attention.overdue)} s="past the date somebody set" /></Link>
          <Link className="crm-row" href="/admin/leads?flag=nonext"><Tile k="Nothing planned" v={String(p.attention.noNext)} s="live deals with no next step" /></Link>
          <Link className="crm-row" href="/admin/leads?flag=stalled"><Tile k="Not moving" v={String(p.attention.stalled)} s="past the stage threshold" /></Link>
        </div>
      </div>

      {/* ── Money and time ── */}
      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3>The shape of the business</h3>
        <div className="fin-grid">
          <Tile k="Sold" v={fmtTHBshort(p.wonValue)} s={`${p.won} ${p.won === 1 ? 'deal' : 'deals'}`} />
          <Tile k="In the pipeline" v={fmtTHBshort(p.pipelineValue)} s="qualified and still open" />
          <Tile k="Sales cycle" v={days(p.cycleDays)} s="median, arriving to sold" />
          <Tile k="Time to first contact" v={hours(p.firstContactHours)} s="median, arriving to a real conversation" />
        </div>
      </div>

      {/* ── Where deals die ── */}
      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3>The funnel <span className="h3-note">· reached each stage, and the drop from the one before</span></h3>
        <table className="crm-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th style={{ textAlign: 'right' }}>Reached</th>
              <th style={{ textAlign: 'right' }}>Of all leads</th>
              <th style={{ textAlign: 'right' }}>From previous</th>
              <th style={{ textAlign: 'right' }}>Lost here</th>
            </tr>
          </thead>
          <tbody>
            {p.funnel.map((f) => (
              <tr key={f.stage}>
                <td>
                  <div className="crm-name">{f.label}</div>
                  <div className="crm-meta">{f.blurb}</div>
                </td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{f.reached}</td>
                <td className="tabnum crm-meta" style={{ textAlign: 'right' }}>{f.ofTotal}%</td>
                {/* The only column worth a meeting: two thirds of the leads
                    that got a presentation never reaching a viewing is a
                    decision, where "41 reached Presentation" is just a number. */}
                <td className="tabnum" style={{ textAlign: 'right', color: f.ofPrevious !== null && f.ofPrevious < 50 ? 'var(--c-hot)' : undefined }}>
                  {f.ofPrevious === null ? '—' : `${f.ofPrevious}%`}
                </td>
                <td className="tabnum crm-meta" style={{ textAlign: 'right' }}>{f.lostHere || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.lost > p.lostStageKnown && (
          <div className="crm-meta" style={{ marginTop: 12 }}>
            {p.lost - p.lostStageKnown} of the {p.lost} lost deals were lost before the CRM recorded which
            stage they were in, so the “lost here” column under-counts by exactly that many. It will be
            complete for everything lost from now on.
          </div>
        )}
      </div>

      {/* ── Who is producing ── */}
      <div className="crm-card table-scroll" style={{ marginBottom: 16 }}>
        <h3 style={{ padding: '0 14px' }}>By salesperson</h3>
        <table className="crm-table">
          <thead>
            <tr>
              <th>Who</th>
              <th style={{ textAlign: 'right' }}>Leads</th>
              <th style={{ textAlign: 'right' }}>Open</th>
              <th style={{ textAlign: 'right' }}>Pipeline</th>
              <th style={{ textAlign: 'right' }}>Sold</th>
              <th style={{ textAlign: 'right' }}>Sales value</th>
              <th style={{ textAlign: 'right' }}>Needs attention</th>
            </tr>
          </thead>
          <tbody>
            {p.bySalesperson.map((r) => (
              <tr key={r.name}>
                <td className="crm-name">{r.name}</td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.leads}</td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.live}</td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.pipelineValue ? fmtTHBshort(r.pipelineValue) : '—'}</td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>
                <td className="tabnum" style={{ textAlign: 'right', color: r.needsAttention ? 'var(--c-hot)' : undefined }}>
                  {r.needsAttention || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Which marketing produces buyers, not leads ── */}
      <div className="crm-grid crm-cols-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <div className="crm-card table-scroll">
          <h3 style={{ padding: '0 14px' }}>By source <span className="h3-note">· leads are not the point</span></h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Leads</th>
                <th style={{ textAlign: 'right' }}>Qualified</th>
                <th style={{ textAlign: 'right' }}>Sold</th>
                <th style={{ textAlign: 'right' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {p.bySource.map((r) => (
                <tr key={r.source}>
                  <td>
                    <div className="crm-name">{r.label}</div>
                    {/* What was actually written in the links. An "Other: 14"
                        row that will not say what it contains is how a real
                        channel stays invisible. */}
                    {r.raw.length > 0 && <div className="crm-meta">{r.raw.slice(0, 4).join(', ')}{r.raw.length > 4 ? ` +${r.raw.length - 4}` : ''}</div>}
                  </td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.leads}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.qualified}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="crm-card">
          <h3>Why we lose</h3>
          {p.lostReasons.length === 0 ? (
            <div className="empty">Nothing lost yet.</div>
          ) : (
            p.lostReasons.map((r) => (
              <div className="bar-row" key={r.reason}>
                <span className="lab">{r.label}</span>
                <span className="bar-track"><i className="bar-fill" style={{ width: `${r.ofLost}%` }} /></span>
                <span className="num">{r.count} · {r.ofLost}%</span>
              </div>
            ))
          )}
        </div>
      </div>

      {p.byCountry.length > 0 && (
        <div className="crm-card table-scroll" style={{ marginBottom: 16 }}>
          <h3 style={{ padding: '0 14px' }}>By country <span className="h3-note">· from the dialling code unless somebody corrected it</span></h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Country</th>
                <th style={{ textAlign: 'right' }}>Leads</th>
                <th style={{ textAlign: 'right' }}>Qualified</th>
                <th style={{ textAlign: 'right' }}>Sold</th>
                <th style={{ textAlign: 'right' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {p.byCountry.slice(0, 15).map((r) => (
                <tr key={r.code}>
                  <td className="crm-name">{r.name}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.leads}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.qualified}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.byCountry.length > 15 && (
            <div className="crm-meta" style={{ padding: '10px 14px 0' }}>
              {p.byCountry.length - 15} more countries below these, none of them larger.
            </div>
          )}
        </div>
      )}

      {/* ── One level down ──

          A channel says Facebook is working. A campaign says WHICH Facebook is
          working. Both were already on every lead and nothing ever grouped on
          them, so the money question stopped at "Facebook: 62 leads". These
          tables simply do not appear until the links carry the tags. */}
      {p.byCampaign.length > 0 && (
        <div className="crm-card table-scroll" style={{ marginBottom: 16 }}>
          <h3 style={{ padding: '0 14px' }}>By campaign</h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th style={{ textAlign: 'right' }}>Leads</th>
                <th style={{ textAlign: 'right' }}>Qualified</th>
                <th style={{ textAlign: 'right' }}>Reserved</th>
                <th style={{ textAlign: 'right' }}>Sold</th>
                <th style={{ textAlign: 'right' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {p.byCampaign.map((r) => (
                <tr key={r.campaign}>
                  <td>
                    <div className="crm-name">{r.campaign}</div>
                    <div className="crm-meta">{r.channels.join(', ')}</div>
                  </td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.leads}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.qualified}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.reserved}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="crm-meta" style={{ padding: '10px 14px 0' }}>
            Only leads whose link carried a <code>utm_campaign</code>. Untagged traffic is left out
            rather than piled into an “unknown” row — it is not a campaign that did badly.
          </div>
        </div>
      )}

      {p.byAd.length > 0 && (
        <div className="crm-card table-scroll" style={{ marginBottom: 16 }}>
          <h3 style={{ padding: '0 14px' }}>By ad <span className="h3-note">· utm_content</span></h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th style={{ textAlign: 'right' }}>Leads</th>
                <th style={{ textAlign: 'right' }}>Qualified</th>
                <th style={{ textAlign: 'right' }}>Sold</th>
                <th style={{ textAlign: 'right' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {p.byAd.map((r) => (
                <tr key={r.ad}>
                  <td>
                    <div className="crm-name">{r.ad}</div>
                    {r.campaign && <div className="crm-meta">{r.campaign}</div>}
                  </td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.leads}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.qualified}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Partners ── */}
      {producing.length > 0 && (
        <div className="crm-card table-scroll" style={{ marginBottom: 24 }}>
          <h3 style={{ padding: '0 14px' }}>By agency</h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Agency</th>
                <th style={{ textAlign: 'right' }}>Introduced</th>
                <th style={{ textAlign: 'right' }}>Open</th>
                <th style={{ textAlign: 'right' }}>Sold</th>
                <th style={{ textAlign: 'right' }}>Conversion</th>
                <th style={{ textAlign: 'right' }}>Sales value</th>
              </tr>
            </thead>
            <tbody>
              {producing.map((r) => (
                <tr key={r.agency.id}>
                  <td>
                    <Link href={`/admin/agencies/${r.agency.id}`} className="crm-row">
                      <span className="crm-name">{r.agency.name}</span>
                    </Link>
                  </td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.registered}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.live}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.conversion}%</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
