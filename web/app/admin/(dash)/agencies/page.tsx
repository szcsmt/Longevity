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
          <h1 className="crm-title">{showArchived ? 'Korábbi ügynökségek' : 'Ügynökségek'}</h1>
          <p className="crm-sub">
            {rows.length} {rows.length === 1 ? 'agency' : 'agencies'}
            {!showArchived && rows.length > 0 && (
              <> · {totals.registered} buyers introduced · {totals.won} sold{money ? ` · ${fmtTHB(totals.wonValue)}` : ''}</>
            )}
            {' · '}egy regisztráció {houseProtectionDays()} napig védi az igényt, hacsak a megállapodás mást nem mond.
          </p>
        </div>
        <div className="act-row">
          {admin && (
            <Link className="crm-btn ghost" href={showArchived ? '/admin/agencies' : '/admin/agencies?archived=only'}>
              {showArchived ? '← Vissza az ügynökségekhez' : 'Korábbi partnerek'}
            </Link>
          )}
        </div>
      </div>

      {admin && !showArchived && <NewAgencyForm />}

      <div className="crm-card table-scroll" style={{ padding: '8px 6px' }}>
        {rows.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>
            {showArchived
              ? 'Nincs korábbi partner.'
              : 'Még nincs ügynökség. Vegyél fel egyet fent — amíg nincs itt ügynökség, egy behozott vevőt csak egy szóként lehet rögzíteni a forrás mezőben, és arról nem lehet riportot készíteni.'}
          </div>
        ) : (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Ügynökség</th>
                <th>Állapot</th>
                <th style={{ textAlign: 'right' }}>Behozott</th>
                <th style={{ textAlign: 'right' }}>Élő</th>
                <th style={{ textAlign: 'right' }}>Eladva</th>
                <th style={{ textAlign: 'right' }}>Konverzió</th>
                {/* What a partner produced in buyers is marketing's business;
                    what those buyers are worth is not. */}
                {money && <th style={{ textAlign: 'right' }}>Eladási érték</th>}
                {money && <th style={{ textAlign: 'right' }}>Jutalék</th>}
                {money && <th style={{ textAlign: 'right' }}>Tartozás</th>}
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
                    <Link href={`/admin/agencies/${r.agency.id}`} className="crm-btn ghost sm">Megnyitás</Link>
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
