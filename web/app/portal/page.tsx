import { listLeads } from '@/lib/crm/store';
import { creditedClaim } from '@/lib/crm/rules';
import { protectionDays } from '@/lib/crm/partners';
import { currentAgency, portalLeads } from '@/lib/crm/portal';
import { PortalLogin } from '@/components/portal/portal-login';
import { RegisterBuyer } from '@/components/portal/register-buyer';
import { PortalSignOut } from '@/components/portal/sign-out';

export const dynamic = 'force-dynamic';

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/* ── The partner portal ──

   Everything a partner agency needs and nothing else: register a buyer, and
   see what happened to the ones they registered. No CRM, no other agency's
   buyers, no contact details we hold beyond what they gave us, and a status in
   five words rather than our ten-stage pipeline. */
export default async function PortalPage() {
  const agency = await currentAgency();
  if (!agency) return <PortalLogin />;

  const leads = await listLeads();
  const mine = portalLeads(agency, leads, (l) => creditedClaim(l)?.agencyId);
  const today = new Date().toISOString().slice(0, 10);

  const live = mine.filter((l) => l.status === 'in progress' || l.status === 'registered').length;
  const reserved = mine.filter((l) => l.status === 'reserved').length;
  const completed = mine.filter((l) => l.status === 'completed').length;

  return (
    <div className="crm-root">
      <main className="crm-main" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="crm-head">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO.svg" alt="Longevity Resort" style={{ height: 34, marginBottom: 10 }} />
            <h1 className="crm-title">{agency.name}</h1>
            <p className="crm-sub">
              Partner portal · a registration protects your introduction for {protectionDays(agency)} days.
            </p>
          </div>
          <PortalSignOut />
        </div>

        <div className="crm-grid crm-stats" style={{ marginBottom: 18 }}>
          <div className="crm-card crm-stat"><div className="k">Registered</div><div className="v tabnum">{mine.length}</div></div>
          <div className="crm-card crm-stat"><div className="k">In progress</div><div className="v tabnum">{live}</div></div>
          <div className="crm-card crm-stat"><div className="k">Reserved</div><div className="v tabnum">{reserved}</div></div>
          <div className="crm-card crm-stat accent"><div className="k">Completed</div><div className="v tabnum">{completed}</div></div>
        </div>

        <RegisterBuyer />

        <div className="crm-card table-scroll" style={{ marginTop: 18, padding: '8px 6px' }}>
          <h3 style={{ padding: '10px 14px 0' }}>Your registrations · {mine.length}</h3>
          {mine.length === 0 ? (
            <div className="empty" style={{ padding: 34 }}>
              Nothing registered yet. Use the form above and the buyer appears here straight away.
            </div>
          ) : (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Registered</th>
                  <th>Protected until</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((l) => {
                  const lapsed = Boolean(l.protectedUntil && l.protectedUntil < today);
                  return (
                    <tr key={`${l.name}-${l.registeredAt}`}>
                      <td>
                        <div className="crm-name">{l.name}</div>
                        <div className="crm-meta">
                          {[l.villa, l.broker].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="crm-meta tabnum">{fmtDay(l.registeredAt)}</td>
                      <td className="crm-meta tabnum" style={{ color: lapsed ? 'var(--c-hot)' : undefined }}>
                        {l.protectedUntil ? `${fmtDay(l.protectedUntil)}${lapsed ? ' · lapsed' : ''}` : '—'}
                      </td>
                      <td><span className="badge stage">{l.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="crm-meta" style={{ marginTop: 18, marginBottom: 40 }}>
          Status is deliberately broad — <em>registered</em>, <em>in progress</em>,{' '}
          <em>reserved</em>, <em>completed</em>, <em>closed</em>. For anything more detailed about
          one of your buyers, speak to your contact at Longevity Resort.
        </p>
      </main>
    </div>
  );
}
