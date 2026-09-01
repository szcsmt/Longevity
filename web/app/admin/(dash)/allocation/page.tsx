import Link from 'next/link';
import { ReportTabs } from '@/components/crm/report-tabs';
import { isAdmin, isAuthed } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import { listLeads } from '@/lib/crm/store';
import { listAgencies } from '@/lib/crm/partners';
import { creditedClaim } from '@/lib/crm/rules';
import { STAGES, isOpenStage, type Lead, type Stage } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label || s;

/* Who is carrying what, side by side.

   The two answers lived on different screens and in different shapes: whose
   leads these are was a filter on the Leads list, and which agency introduced
   whom was buried on each buyer's own page. Neither could be read as a
   distribution, so the questions an owner actually asks — is anybody carrying
   twice what everybody else is, is one agency producing all of it — had no
   screen at all.

   Both columns count the same thing the same way, which is the point of
   putting them next to each other. */
function Column({ title, blurb, rows, empty }: {
  title: string;
  blurb: string;
  rows: { key: string; name: string; note?: string; href?: string; leads: Lead[] }[];
  empty: string;
}) {
  return (
    <div className="crm-card">
      <h3>{title}</h3>
      <p className="crm-sub" style={{ margin: '0 0 14px' }}>{blurb}</p>
      {rows.length === 0 ? (
        <div className="empty" style={{ padding: 30 }}>{empty}</div>
      ) : rows.map((r) => {
        const open = r.leads.filter((l) => isOpenStage(l.stage));
        /* Stages in pipeline order rather than by size: a column that reorders
           itself as deals move is a column nobody can read twice. */
        const byStage = STAGES
          .map((s) => ({ stage: s.id, n: r.leads.filter((l) => l.stage === s.id).length }))
          .filter((x) => x.n > 0);
        return (
          <div key={r.key} className="alloc-row">
            <div className="alloc-head">
              <div className="crm-name">
                {r.href ? <Link href={r.href} className="crm-row">{r.name}</Link> : r.name}
              </div>
              <div className="alloc-count">
                <b>{open.length}</b> nyitott
                {r.leads.length !== open.length && <span className="crm-meta"> · {r.leads.length} összesen</span>}
              </div>
            </div>
            {r.note && <div className="crm-meta">{r.note}</div>}
            {byStage.length === 0 ? (
              <div className="crm-meta" style={{ marginTop: 6 }}>Nincs hozzá rendelve lead.</div>
            ) : (
              <div className="alloc-stages">
                {byStage.map((x) => (
                  <span key={x.stage} className="alloc-chip">
                    {stageLabel(x.stage)} <b>{x.n}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default async function AllocationPage() {
  if (!(await isAuthed())) return null;
  if (!(await isAdmin())) {
    return (
      <>
        <ReportTabs />
      <div className="crm-head"><h1 className="crm-title">Kiosztás</h1></div>
        <div className="crm-card">
          <div className="empty" style={{ padding: 46 }}>
            Ez az oldal a tulajdonosé. Hogy ki mennyit visz — olyan kérdés, amire
            egyvalakinek kell látnia a választ.
          </div>
        </div>
      </>
    );
  }

  const [leads, agencies] = await Promise.all([listLeads(), listAgencies()]);
  const roster = agents();

  const byOwner = (name: string) =>
    leads.filter((l) => (l.owner || '').trim().toLowerCase() === name.trim().toLowerCase());

  const agentRows = roster.map((a) => ({
    key: a.name, name: a.name, href: `/admin/leads?owner=${encodeURIComponent(a.name)}`,
    note: a.email, leads: byOwner(a.name),
  }));

  /* Anybody holding leads who is not on the roster — somebody who left, or a
     name typed by hand. Worth showing rather than quietly dropping: those
     leads are the ones nobody is looking after. */
  const known = new Set(roster.map((a) => a.name.trim().toLowerCase()));
  const strays = [...new Set(
    leads.map((l) => (l.owner || '').trim()).filter((o) => o && !known.has(o.toLowerCase())),
  )].map((name) => ({
    key: `stray-${name}`, name, href: `/admin/leads?owner=${encodeURIComponent(name)}`,
    note: 'Nincs a jelenlegi névsorban', leads: byOwner(name),
  }));

  const unassigned = leads.filter((l) => !(l.owner || '').trim());
  const unassignedRow = unassigned.length
    ? [{ key: 'none', name: 'Nincs kiosztva', note: 'Senki nem felelős értük', leads: unassigned,
         href: '/admin/leads' }]
    : [];

  const agencyRows = agencies.map((a) => ({
    key: a.id, name: a.name, href: `/admin/agencies/${a.id}`,
    note: undefined as string | undefined,
    leads: leads.filter((l) => creditedClaim(l)?.agencyId === a.id),
  }));
  const direct = leads.filter((l) => !creditedClaim(l));
  const directRow = direct.length
    ? [{ key: 'direct', name: 'Közvetlenül jött', note: 'Nincs mögötte ügynökség', leads: direct,
         href: '/admin/leads' }]
    : [];

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Kiosztás</h1>
          <p className="crm-sub">
            Ki mennyit visz, és melyik ügynökség hozta — {leads.length} lead összesen.
            Egy leadnek van értékesítője <em>és</em> lehet mögötte ügynökség, ezért a két
            oldal ugyanazt a listát osztja fel kétféleképpen; az összegük nem adódik össze.
          </p>
        </div>
      </div>

      <div className="crm-grid crm-cols-2">
        <Column
          title="Értékesítők"
          blurb="Kihez van kiosztva a lead. A névsor a CRM_AGENTS beállításból jön."
          rows={[...unassignedRow, ...agentRows, ...strays]}
          empty="Nincs beállítva értékesítő."
        />
        <Column
          title="Ügynökségek"
          blurb="Ki hozta a vevőt. Csak az élő regisztrációk számítanak."
          rows={[...agencyRows, ...directRow]}
          empty="Még egy ügynökség sincs rögzítve."
        />
      </div>
    </>
  );
}
