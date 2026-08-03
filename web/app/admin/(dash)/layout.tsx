import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/crm/auth';
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
            <LogoutButton />
          </div>
        </aside>
        <main className="crm-main">{children}</main>
      </div>
    </div>
  );
}
