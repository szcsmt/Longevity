import { redirect } from 'next/navigation';
import { currentAccount, isAuthed } from '@/lib/crm/auth';
import { attentionCounts } from '@/lib/crm/store';
import { CrmNav } from '@/components/crm/crm-nav';
import { LogoutButton } from '@/components/crm/logout-button';
import { AutoRefresh } from '@/components/crm/auto-refresh';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect('/admin/login');
  // Re-read on every render — AutoRefresh re-runs this layout every few
  // seconds, so the badges are always current.
  const att = await attentionCounts();
  const account = await currentAccount();

  return (
    <div className="crm-root">
      <AutoRefresh seconds={6} />
      <div className="crm-shell">
        <aside className="crm-side">
          <div className="crm-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO.svg" alt="Longevity Resort" />
          </div>
          <CrmNav alerts={{ leads: att.actionable, followups: att.overdue }} />
          <div className="crm-side-foot">
            {/* Knowing which account you are signed in as matters the moment
                more than one person uses the CRM — an agent who does not know
                they are an agent reads a hidden button as a broken one. */}
            {account?.role === 'viewer' && (
              <div className="viewer-chip" title="Read-only account — changes are disabled">
                👁 View only · {account.name}
              </div>
            )}
            {account?.role === 'agent' && (
              <div className="viewer-chip" title="Sales account — you can work every lead, but deleting, the masterplan ledger and exports stay with the owner">
                ◆ Sales · {account.name}
              </div>
            )}
            <LogoutButton />
          </div>
        </aside>
        <main className="crm-main">{children}</main>
      </div>
    </div>
  );
}
