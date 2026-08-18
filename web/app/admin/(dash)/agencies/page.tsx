import Link from 'next/link';
import { can, isAuthed } from '@/lib/crm/auth';
import { listLeads } from '@/lib/crm/store';
import { agencyPerformance, houseProtectionDays, listAgencies, performanceFor } from '@/lib/crm/partners';
import { fmtTHB } from '@/lib/crm/villas';
import { AGENCY_STATUS } from '@/lib/crm/types';
import { NewAgencyForm } from '@/components/crm/agency-form';

export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

/* ── Which agencies actually produce sales ──

   Not "who sends the most leads". An agency that registers forty browsers and
   sells nothing is a cost; one that registers six buyers and sells two is the
   relationship worth protecting. Both look identical on a lead count, which is
   why that column is the least interesting one here. */
export default async function AgenciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAuthed())) return null;
  const sp = await searchParams;
  const showArchived = str(sp.archived) === 'only';
  const [admin, money] = await Promise.all([can('partners.write'), can('money.read')]);

  const leads = await listLeads({ archived: 'include' });
  const rows = showArchived
    ? (await listAgencies({ archived: 'only' })).map((a) => performanceFor(a, leads))
    : await agencyPerformance(leads);

  const totals = rows.reduce(
    (t, r) => ({ registered: t.registered + r.registered, won: t.won + r.won, wonValue: t.wonValue + r.wonValue }),
    { registered: 0, won: 0, wonValue: 0 },
  );

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">{showArchived ? 'Former agencies' : 'Agencies'}</h1>
          <p className="crm-sub">
            {rows.length} {rows.length === 1 ? 'agency' : 'agencies'}
            {!showArchived && rows.length > 0 && (
              <> · {totals.registered} buyers introduced · {totals.won} sold{money ? ` · ${fmtTHB(totals.wonValue)}` : ''}</>
            )}
            {' · '}a registration protects a claim for {houseProtectionDays()} days unless the agreement says otherwise.
          </p>
        </div>
        <div className="act-row">
          {admin && (
            <Link className="crm-btn ghost" href={showArchived ? '/admin/agencies' : '/admin/agencies?archived=only'}>
              {showArchived ? '← Back to agencies' : 'Former partners'}
            </Link>
          )}
        </div>
      </div>

      {admin && !showArchived && <NewAgencyForm />}

      <div className="crm-card table-scroll" style={{ padding: '8px 6px' }}>
        {rows.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>
            {showArchived
              ? 'No former partners.'
              : 'No agencies yet. Add the first one above — until an agency exists here, an introduction can only be recorded as a word in the source field, and that cannot be reported on.'}
          </div>
        ) : (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Introduced</th>
                <th style={{ textAlign: 'right' }}>Live</th>
                <th style={{ textAlign: 'right' }}>Sold</th>
                <th style={{ textAlign: 'right' }}>Conversion</th>
                {/* What a partner produced in buyers is marketing's business;
                    what those buyers are worth is not. */}
                {money && <th style={{ textAlign: 'right' }}>Sales value</th>}
                {money && <th style={{ textAlign: 'right' }}>Commission</th>}
                {money && <th style={{ textAlign: 'right' }}>Owed</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agency.id}>
                  <td>
                    <Link href={`/admin/agencies/${r.agency.id}`} className="crm-row">
                      <div className="crm-name">{r.agency.name}</div>
                      <div className="crm-meta">
                        {r.agency.country || '—'}
                        {r.agency.contacts.length ? ` · ${r.agency.contacts.filter((c) => !c.inactive).length} agents` : ''}
                      </div>
                    </Link>
                  </td>
                  <td><span className="badge stage">{AGENCY_STATUS.find((s) => s.id === r.agency.status)?.label || r.agency.status}</span></td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.registered}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.live}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.won}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{r.registered ? `${r.conversion}%` : '—'}</td>
                  {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.wonValue ? fmtTHB(r.wonValue) : '—'}</td>}
                  {/* Blank, not zero, when nothing is agreed: a zero reads as
                      "they earn nothing", which is a different statement. */}
                  {money && <td className="tabnum" style={{ textAlign: 'right' }}>{r.commission !== undefined ? fmtTHB(r.commission) : '—'}</td>}
                  {/* Generated minus paid. A dash when there is no agreement to
                      compute the first half from — an unknown minus a known is
                      not zero. */}
                  {money && (
                    <td className="tabnum" style={{ textAlign: 'right', color: (r.commissionOutstanding || 0) > 0 ? 'var(--c-gold-bright)' : undefined }}>
                      {r.commissionOutstanding === undefined ? '—' : fmtTHB(r.commissionOutstanding)}
                    </td>
                  )}
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/admin/agencies/${r.agency.id}`} className="crm-btn ghost sm">Open</Link>
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
