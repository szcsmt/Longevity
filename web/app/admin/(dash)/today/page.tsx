import Link from 'next/link';
import { can, canEdit, currentUser } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import { getVillaData, integrityIssues, listLeads, reservationWatch, workQueue } from '@/lib/crm/store';
import { decisions } from '@/lib/crm/decisions';
import { DayQueue } from '@/components/crm/day-queue';
import { lang as uiLang } from '@/lib/crm/lang-server';
import { DecisionList } from '@/components/crm/decision-list';

export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

/* ── Today ──

   The screen a salesperson opens first. Not a dashboard: a queue, in the order
   the work should be done, with every live lead appearing exactly once.

   Decisions used to be a second tab beside this one. From the inside the two
   were different — work you do versus a choice you make — and from the
   outside they were the same thing twice: two menu items, both meaning
   "things that need attention", and no way for somebody opening the CRM on
   their first morning to know which one was theirs. They are one screen now,
   with the choices at the top, because a question nobody answered blocks
   everything under it.

   It defaults to the signed-in person's own leads when they are on the roster,
   because "who do I call today" is a question about my own day. Anyone can
   switch to the whole team in one click — covering for a colleague on the road
   is normal, and a head of sales wants the team view anyway. */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { t } = await uiLang();
  const [me, editor] = await Promise.all([currentUser(), canEdit()]);
  const roster = agents().map((a) => a.name);
  const mine = me && roster.includes(me) ? me : null;

  /* `owner=all` is an explicit request for the team view; no parameter means
     "the sensible default for who I am". */
  const asked = str(sp.owner);
  const owner = asked === 'all' ? '' : asked || mine || '';

  const leads = await listLeads(owner ? { owner } : {});
  const sections = workQueue(leads);
  const waiting = sections.reduce((n, s) => n + s.leads.length, 0);

  /* The decision list is deliberately NOT filtered by owner. An unanswered
     extra is the owner's to answer whoever is looking at whose leads, and a
     decision that hides itself because a filter is set is a decision that
     never gets made. */
  const [{ villas }, allLeads, holds, issues, mayDecide] = await Promise.all([
    getVillaData(), listLeads(), reservationWatch(), integrityIssues(), can('deals.approve'),
  ]);
  const pending = decisions({ villas, leads: allLeads, holds, issues });

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">{t('Mai teendők')}</h1>
          <p className="crm-sub">
            {waiting === 0
              ? t('Semmi nem vár rád.')
              : `${waiting} ${t('lead vár tőled valamit')}`}
            {owner ? ` — ${owner}` : ` — ${t('az egész csapatnál')}`}
            {pending.length > 0 && ` · ${pending.length} ${t('kérdés vár döntésre')}`}
          </p>
        </div>
        <div className="act-row">
          {mine && (
            <Link className="crm-btn" href={owner ? '/admin/today?owner=all' : `/admin/today?owner=${encodeURIComponent(mine)}`}>
              {owner ? t('Az egész csapat') : t('Az én leadjeim')}
            </Link>
          )}
          {/* With a roster, a head of sales wants one person at a time. Plain
              GET form rather than an onChange handler, so the whole screen
              stays a server component. */}
          {roster.length > 1 && (
            <form method="get" className="act-row">
              <select className="crm-select" name="owner" defaultValue={owner || 'all'} aria-label={t('Kinek a leadjei')}>
                <option value="all">{t('Mindenki')}</option>
                {roster.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="crm-btn" type="submit">{t('Mutasd')}</button>
            </form>
          )}
          <Link className="crm-btn" href="/admin/leads">{t('Összes lead →')}</Link>
        </div>
      </div>

      <DecisionList items={pending} mayDecide={mayDecide} t={t} />

      <DayQueue sections={sections} readOnly={!editor} />
    </>
  );
}
