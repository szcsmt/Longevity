import Link from 'next/link';
import { redirect } from 'next/navigation';
import { lang as uiLang } from '@/lib/crm/lang-server';
import { LangProvider } from '@/components/crm/lang-provider';
import { LangToggle } from '@/components/crm/lang-toggle';
import { ROLES, can, currentAccount, isAuthed } from '@/lib/crm/auth';
import { attentionCounts, getVillaData, integrityIssues, listLeads, reservationWatch } from '@/lib/crm/store';
import { decisions } from '@/lib/crm/decisions';
import { CrmNav } from '@/components/crm/crm-nav';
import { LogoutButton } from '@/components/crm/logout-button';
import { TextSize } from '@/components/crm/text-size';
import { AutoRefresh } from '@/components/crm/auto-refresh';
import { MailSync } from '@/components/crm/mail-sync';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect('/admin/login');
  // Re-read on every render. AutoRefresh re-runs this layout on a timer while
  // somebody is actually at the keyboard, so the badges are current whenever
  // there is anybody to read them — and nothing is read when there is not.
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
  const hidden: string[] = (await can('money.read')) ? [] : ['/admin/finance'];
  /* Who is signed in, from where, and what left the building — that is the
     owner's question, and a menu item promising an answer to everyone else
     would only be a locked door with a sign on it. The same goes for how the
     team is performing: it is a screen about people rather than for them. */
  const owner = account?.role === 'admin';
  const role = ROLES.find((r) => r.id === account?.role);
  /* Read once here and handed to every client component below, so the two
     halves of a page never disagree about which language they are in. */
  const { lang, t } = await uiLang();

  return (
    <LangProvider lang={lang}>
    <div className="crm-root">
      <AutoRefresh />
      {/* The mailbox, kept in step while somebody is actually looking. */}
      <MailSync minutes={3} />
      <div className="crm-shell">
        <aside className="crm-side">
          {/* The logo is the way home. It used to be decoration with a
              "Dashboard" menu item next to it pointing at the same screen. */}
          <Link href="/admin" className="crm-brand" aria-label={t('Kezdőlap')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO.svg" alt="Longevity Resort" />
          </Link>
          {/* The badge sits on the screen that RESOLVES it: Today is the
              queue, so that is where "something needs a human" points. */}
          {/* One badge, because there is one screen now: the work and the
              questions waiting on a person are counted together. */}
          <CrmNav alerts={{ today: att.actionable + pending, followups: att.overdueTasks }} hidden={hidden} owner={owner} />
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
                {role.id === 'viewer' ? '👁' : '◆'} {t(role.label)} · {account!.name}
              </div>
            )}
            {/* Not a menu item: the point of this session was fewer of
                those. It sits with the other things you set up once. */}
            <Link href="/admin/help" className="crm-help-link">{t('Hogyan működik?')}</Link>
            <LangToggle />
            <TextSize />
            <LogoutButton />
          </div>
        </aside>
        <main className="crm-main">{children}</main>
      </div>
    </div>
    </LangProvider>
  );
}
