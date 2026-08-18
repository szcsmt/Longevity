import Link from 'next/link';
import { canEdit, currentUser } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import { listLeads, workQueue } from '@/lib/crm/store';
import { DayQueue } from '@/components/crm/day-queue';

export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

/* ── Today ──

   The screen a salesperson opens first. Not a dashboard: a queue, in the order
   the work should be done, with every live lead appearing exactly once.

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

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Today</h1>
          <p className="crm-sub">
            {waiting === 0
              ? 'Nothing is waiting.'
              : `${waiting} ${waiting === 1 ? 'lead wants' : 'leads want'} something from you`}
            {owner ? `, on ${owner}'s leads.` : ', across the whole team.'}
          </p>
        </div>
        <div className="act-row">
          {mine && (
            <Link className="crm-btn" href={owner ? '/admin/today?owner=all' : `/admin/today?owner=${encodeURIComponent(mine)}`}>
              {owner ? 'Whole team' : 'My leads'}
            </Link>
          )}
          {/* With a roster, a head of sales wants one person at a time. Plain
              GET form rather than an onChange handler, so the whole screen
              stays a server component. */}
          {roster.length > 1 && (
            <form method="get" className="act-row">
              <select className="crm-select" name="owner" defaultValue={owner || 'all'} aria-label="Whose leads">
                <option value="all">Everyone</option>
                {roster.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="crm-btn" type="submit">Show</button>
            </form>
          )}
          <Link className="crm-btn" href="/admin/leads">All leads →</Link>
        </div>
      </div>

      <DayQueue sections={sections} readOnly={!editor} />
    </>
  );
}
