import Link from 'next/link';
import { ReportTabs } from '@/components/crm/report-tabs';
import { can, isAdmin, isAuthed } from '@/lib/crm/auth';
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
  /* Hidden from the menu for everyone but the owner, and refused here too — a
     screen that ranks the team by what they closed is the owner's, and hiding
     a link is a tidier menu rather than a permission. */
  if (!(await isAdmin())) {
    return (
      <>
        <ReportTabs />
      <div className="crm-head"><h1 className="crm-title">Teljesítmény</h1></div>
        <div className="crm-card">
          <div className="empty" style={{ padding: 46 }}>
            Ez az oldal a tulajdonosé. Hogy ki mennyit zárt — olyan kérdés, amire
            egyvalakinek kell látnia a választ.
          </div>
        </div>
      </>
    );
  }
  /* Marketing reads this screen for the funnel and the attribution and must
     not read it for the money. Hiding the columns rather than the page: what a
     campaign produced in buyers is exactly their business. */
  const money = await can('money.read');
  const leads = await listLeads();
  const p = performance(leads);
  const agencies = await agencyPerformance(leads);
  const producing = agencies.filter((a) => a.registered > 0);

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Teljesítmény</h1>
          <p className="crm-sub">
            {p.total} live {p.total === 1 ? 'lead' : 'leads'} · {p.open} open · {p.won} sold · {p.lost} lost.
            Where deals die, how long they take, and who is producing.
          </p>
        </div>
        <Link className="crm-btn" href="/admin/analytics">Marketing analitika →</Link>
      </div>

      {/* ── What needs a decision today ── */}
      <div className="crm-card attention" style={{ marginBottom: 16 }}>
        <h3>Vezetői figyelmet igényel</h3>
        <div className="fin-grid">
          <Link className="crm-row" href="/admin/leads?flag=uncontacted"><Tile k="Nobody has spoken to" v={String(p.attention.uncontacted)} s="new leads with no conversation" /></Link>
          <Link className="crm-row" href="/admin/leads?flag=overdue"><Tile k="Late follow-ups" v={String(p.attention.overdue)} s="past the date somebody set" /></Link>
          <Link className="crm-row" href="/admin/leads?flag=nonext"><Tile k="Nothing planned" v={String(p.attention.noNext)} s="live deals with no next step" /></Link>
          <Link className="crm-row" href="/admin/leads?flag=stalled"><Tile k="Not moving" v={String(p.attention.stalled)} s="past the stage threshold" /></Link>
        </div>
      </div>

      {/* ── Money and time ── */}
      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3>Az üzlet alakja</h3>
        <div className="fin-grid">
          <Tile k="Sold" v={money ? fmtTHBshort(p.wonValue) : String(p.won)} s={`${p.won} ${p.won === 1 ? 'deal' : 'deals'}`} />
          {money && <Tile k="In the pipeline" v={fmtTHBshort(p.pipelineValue)} s="qualified and still open" />}
          <Tile k="Sales cycle" v={days(p.cycleDays)} s="median, arriving to sold" />
          <Tile k="Time to first contact" v={hours(p.firstContactHours)} s="median, arriving to a real conversation" />
        </div>
      </div>

      {/* ── Where deals die ── */}
      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3>A tölcsér <span className="h3-note">· ki jutott el az egyes fázisokig, és mennyi esett ki az előzőből</span></h3>
        <table className="crm-table">
          <thead>
            <tr>
              <th>Fázis</th>
              <th style={{ textAlign: 'right' }}>Eljutott ide</th>
              <th style={{ textAlign: 'right' }}>Az összes leadből</th>
              <th style={{ textAlign: 'right' }}>Az előzőből</th>
              <th style={{ textAlign: 'right' }}>Itt veszett el</th>
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
        <h3 style={{ padding: '0 14px' }}>Értékesítőnként</h3>
        <table className="crm-table">
          <thead>
            <tr>
              <th>Ki</th>
              <th style={{ textAlign: 'right' }}>Lead</th>
              <th style={{ textAlign: 'right' }}>Nyitott</th>
              {money && <th style={{ textAlign: 'right' }}>Folyamatban</th>}
              <th style={{ textAlign: 'right' }}>Eladva</th>
              {money && <th style={{ textAlign: 'right' }}>Eladási érték</th>}
              <th style={{ textAlign: 'right' }}>Figyelmet igényel</th>
            </tr>
          </thead>
          <tbody>
            {p.bySalesperson.map((r) => (
              <tr key={r.name}>
                <td className="crm-name">{r.name}</td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.leads}</td>
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.live}</td>
                {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.pipelineValue ? fmtTHBshort(r.pipelineValue) : '—'}</td>}
                <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>}
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
          <h3 style={{ padding: '0 14px' }}>Forrásonként <span className="h3-note">· nem a leadek száma a lényeg</span></h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Forrás</th>
                <th style={{ textAlign: 'right' }}>Lead</th>
                <th style={{ textAlign: 'right' }}>Minősítve</th>
                <th style={{ textAlign: 'right' }}>Eladva</th>
                {money && <th style={{ textAlign: 'right' }}>Érték</th>}
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
                  {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="crm-card">
          <h3>Miért veszítünk</h3>
          {p.lostReasons.length === 0 ? (
            <div className="empty">Még semmi nem veszett el.</div>
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
          <h3 style={{ padding: '0 14px' }}>Országonként <span className="h3-note">· az országhívóból, hacsak valaki nem javította</span></h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Ország</th>
                <th style={{ textAlign: 'right' }}>Lead</th>
                <th style={{ textAlign: 'right' }}>Minősítve</th>
                <th style={{ textAlign: 'right' }}>Eladva</th>
                {money && <th style={{ textAlign: 'right' }}>Érték</th>}
              </tr>
            </thead>
            <tbody>
              {p.byCountry.slice(0, 15).map((r) => (
                <tr key={r.code}>
                  <td className="crm-name">{r.name}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.leads}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.qualified}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                  {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>}
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
          <h3 style={{ padding: '0 14px' }}>Kampányonként</h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Kampány</th>
                <th style={{ textAlign: 'right' }}>Lead</th>
                <th style={{ textAlign: 'right' }}>Minősítve</th>
                <th style={{ textAlign: 'right' }}>Lefoglalva</th>
                <th style={{ textAlign: 'right' }}>Eladva</th>
                {money && <th style={{ textAlign: 'right' }}>Érték</th>}
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
                  {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>}
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
                <th style={{ textAlign: 'right' }}>Lead</th>
                <th style={{ textAlign: 'right' }}>Minősítve</th>
                <th style={{ textAlign: 'right' }}>Eladva</th>
                {money && <th style={{ textAlign: 'right' }}>Érték</th>}
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
                  {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Partners ── */}
      {producing.length > 0 && (
        <div className="crm-card table-scroll" style={{ marginBottom: 24 }}>
          <h3 style={{ padding: '0 14px' }}>Ügynökségenként</h3>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Ügynökség</th>
                <th style={{ textAlign: 'right' }}>Behozott</th>
                <th style={{ textAlign: 'right' }}>Nyitott</th>
                <th style={{ textAlign: 'right' }}>Eladva</th>
                <th style={{ textAlign: 'right' }}>Konverzió</th>
                {money && <th style={{ textAlign: 'right' }}>Eladási érték</th>}
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
                  {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHBshort(r.wonValue) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
