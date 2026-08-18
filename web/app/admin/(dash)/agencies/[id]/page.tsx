import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin, isAuthed } from '@/lib/crm/auth';
import { listLeads } from '@/lib/crm/store';
import { creditedClaim } from '@/lib/crm/rules';
import { getAgency, houseProtectionDays, performanceFor, protectionDays } from '@/lib/crm/partners';
import { fmtTHB } from '@/lib/crm/villas';
import { AGENCY_STATUS, STAGES } from '@/lib/crm/types';
import { AgencyEditor } from '@/components/crm/agency-editor';

export const dynamic = 'force-dynamic';

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default async function AgencyPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return null;
  const { id } = await params;
  const agency = await getAgency(id);
  if (!agency) notFound();

  const admin = await isAdmin();
  const leads = await listLeads();
  const perf = performanceFor(agency, leads);
  /* The buyers this agency is CREDITED with — first registration, never
     withdrawn. Not "everyone they ever registered": a claim they recorded over
     somebody else's introduction is on the lead's timeline, not in their
     production figures. */
  const introduced = leads
    .filter((l) => creditedClaim(l)?.agencyId === agency.id)
    .sort((a, b) => (creditedClaim(b)!.at || '').localeCompare(creditedClaim(a)!.at || ''));

  const stat = (k: string, v: string) => (
    <div className="crm-stat" key={k}><div className="k">{k}</div><div className="v tabnum">{v}</div></div>
  );

  return (
    <>
      <div className="crm-head">
        <div>
          <Link href="/admin/agencies" className="crm-meta" style={{ textDecoration: 'none' }}>← All agencies</Link>
          <h1 className="crm-title" style={{ marginTop: 6 }}>{agency.name}</h1>
          <p className="crm-sub">
            {AGENCY_STATUS.find((s) => s.id === agency.status)?.label || agency.status}
            {agency.country ? ` · ${agency.country}` : ''}
            {agency.agreement_at ? ` · agreement ${fmtDay(agency.agreement_at)}` : ''}
            {' · '}registrations protected for {protectionDays(agency)} days
            {agency.archived_at ? ' · archived' : ''}
          </p>
        </div>
        {agency.website && (
          <a className="crm-btn" href={agency.website.startsWith('http') ? agency.website : `https://${agency.website}`}
            target="_blank" rel="noreferrer">Website ↗</a>
        )}
      </div>

      <div className="crm-grid crm-stats" style={{ marginBottom: 18 }}>
        {stat('Introduced', String(perf.registered))}
        {stat('Still live', String(perf.live))}
        {stat('Sold', String(perf.won))}
        {stat('Sales value', perf.wonValue ? fmtTHB(perf.wonValue) : '—')}
      </div>

      {admin ? (
        <AgencyEditor agency={agency} houseDays={houseProtectionDays()} />
      ) : (
        <div className="crm-card" style={{ marginBottom: 18 }}>
          <h3>The agreement</h3>
          <dl className="kv">
            <dt>Status</dt><dd>{AGENCY_STATUS.find((s) => s.id === agency.status)?.label || agency.status}</dd>
            <dt>Country</dt><dd>{agency.country || '—'}</dd>
            <dt>Agents</dt><dd>{agency.contacts.filter((c) => !c.inactive).map((c) => c.name).join(', ') || '—'}</dd>
          </dl>
          {/* Commission terms are the owner's business, and a salesperson does
              not need them to register a buyer. */}
          <div className="crm-meta" style={{ marginTop: 10 }}>Commission terms are visible to the owner.</div>
        </div>
      )}

      <div className="crm-card table-scroll" style={{ marginTop: 18, padding: '8px 6px' }}>
        <h3 style={{ padding: '10px 14px 0' }}>Buyers they introduced · {introduced.length}</h3>
        {introduced.length === 0 ? (
          <div className="empty" style={{ padding: 30 }}>
            Nothing registered yet. A registration is recorded on the buyer&rsquo;s own page, under
            &ldquo;Introduced by&rdquo;.
          </div>
        ) : (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Registered</th>
                <th>Their agent</th>
                <th>Stage</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {introduced.map((l) => {
                const c = creditedClaim(l)!;
                return (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/admin/leads/${l.id}`} className="crm-row">
                        <div className="crm-name">{l.name || 'Unknown'}</div>
                        <div className="crm-meta">{l.email || l.phone || '—'}</div>
                      </Link>
                    </td>
                    <td className="crm-meta tabnum">{fmtDay(c.at)}</td>
                    <td className="crm-meta">{c.brokerName || '—'}</td>
                    <td><span className="badge stage">{STAGES.find((s) => s.id === l.stage)?.label}</span></td>
                    <td className="tabnum" style={{ textAlign: 'right' }}>{l.value ? fmtTHB(l.value) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link href={`/admin/leads/${l.id}`} className="crm-btn ghost sm">Open</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
