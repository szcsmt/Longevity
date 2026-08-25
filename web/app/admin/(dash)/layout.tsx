import { redirect } from 'next/navigation';
import { ROLES, can, currentAccount, isAuthed } from '@/lib/crm/auth';
import { attentionCounts, getVillaData, integrityIssues, listLeads, reservationWatch } from '@/lib/crm/store';
import { decisions } from '@/lib/crm/decisions';
import { CrmNav } from '@/components/crm/crm-nav';
import { LogoutButton } from '@/components/crm/logout-button';
import { AutoRefresh } from '@/components/crm/auto-refresh';
import { MailSync } from '@/components/crm/mail-sync';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect('/admin/login');
  // Re-read on every render — AutoRefresh re-runs this layout every few
  // seconds, so the badges are always current.
  const att = await attentionCounts();
  /* The badge is the whole point of the decisions page: something waiting on a
     person is invisible until a number says so. */
  const [{ villas }, leads, holds, issues] = await Promise.all([
    getVillaData(), listLeads(), reservationWatch(), integrityIssues(),
  ]);
  const pending = decisions({ villas, leads, holds, issues }).length;
  const account = await currentAccount();
  /* Marketing has no business on the ledger, so the ledger is not in their
     menu. Every other screen stays: reading a worklist harms nothing, and
     hiding it would only make the CRM feel broken. */
  const hidden = (await can('money.read')) ? [] : ['/admin/finance'];
  const role = ROLES.find((r) => r.id === account?.role);

  return (
    <div className="crm-root">
      <AutoRefresh seconds={6} />
      {/* The mailbox, kept in step while somebody is actually looking. */}
      <MailSync minutes={3} />
      <div className="crm-shell">
        <aside className="crm-side">
          <div className="crm-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO.svg" alt="Longevity Resort" />
          </div>
          {/* The badge sits on the screen that RESOLVES it: Today is the
              queue, so that is where "something needs a human" points. */}
          <CrmNav alerts={{ today: att.actionable, decisions: pending, followups: att.overdueTasks }} hidden={hidden} />
          <div className="crm-side-foot">
            {/* Knowing which account you are signed in as matters the moment
                more than one person uses the CRM — an agent who does not know
                they are an agent reads a hidden button as a broken one. */}
            {/* Knowing which account you are signed in as matters the moment
                more than one person uses the CRM — somebody who does not know
                they are on a marketing account reads a hidden column as a bug.
                The owner gets no chip: everything is there, so there is
                nothing to explain. */}
            {role && role.id !== 'admin' && (
              <div className="viewer-chip" title={role.blurb}>
                {role.id === 'viewer' ? '👁' : '◆'} {role.label} · {account!.name}
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
