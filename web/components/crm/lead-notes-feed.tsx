import Link from 'next/link';
import type { LeadNote } from '@/lib/crm/store';
import { STAGES } from '@/lib/crm/types';

/* Fixed locale + UTC, like everywhere else: the server prerender and the
   browser must produce the same text or React reports a hydration mismatch. */
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('hu-HU', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('hu-HU', { timeZone: 'UTC', month: 'long', day: 'numeric' });

const dayLabel = (iso: string): string => {
  const day = iso.slice(0, 10);
  const at = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  if (day === at(0)) return 'Ma';
  if (day === at(-1)) return 'Tegnap';
  return new Date(iso).toLocaleDateString('hu-HU', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
};

/* ── Everything anybody wrote on a lead ──

   A note lived on its lead and nowhere else, so reading the week meant opening
   thirty leads one at a time. Nobody does that, which meant the notes were
   written and never read again — and a note nobody reads is a conversation
   nobody remembers having.

   The timestamp is on every line on purpose. The question people actually ask
   of this list is not "what did I write" but "did I agree a time with them",
   and that is answered by the clock next to the words plus the call-back the
   lead is carrying. Both are here, on the same row. */
export function LeadNotesFeed({ items, limit = 300 }: { items: LeadNote[]; limit?: number }) {
  if (items.length === 0) {
    return (
      <div className="crm-card" style={{ marginTop: 26 }}>
        <h3>Amit a leadekhez írtunk</h3>
        <div className="empty" style={{ padding: 34 }}>
          Még senki nem írt jegyzetet egyetlen leadhez sem.
        </div>
      </div>
    );
  }

  return (
    <div className="crm-card" style={{ marginTop: 26 }}>
      <h3>Amit a leadekhez írtunk · {items.length}</h3>
      <p className="crm-sub" style={{ margin: '0 0 14px' }}>
        Minden jegyzet, amit a kollégák a leadekhez írtak — időponttal, hogy ne kelljen
        egyesével végigkattintani a leadeket.
        {/* Said out loud rather than left to be discovered. A list that quietly
            stops at a round number reads as "this is all of it", and the day
            that becomes untrue is not announced. */}
        {items.length >= limit && ` A legutóbbi ${limit} látszik.`}
      </p>
      <ul className="timeline">
        {items.map((it, n) => {
          const dayNow = it.note.at.slice(0, 10);
          const dayBefore = n > 0 ? items[n - 1].note.at.slice(0, 10) : '';
          return (
            <li key={`${it.leadId}-${it.note.id}`}>
              {dayNow !== dayBefore && <div className="tl-day">{dayLabel(it.note.at)}</div>}
              <div className="crm-meta" style={{ marginBottom: 3 }}>
                <Link href={`/admin/leads/${it.leadId}`} className="crm-row" style={{ color: 'var(--c-gold)' }}>
                  {it.leadName}
                </Link>
                {' · '}{STAGES.find((s) => s.id === it.leadStage)?.label}
                {it.note.by ? ` · ${it.note.by}` : ''}
              </div>
              <div className="tl-body">{it.note.body}</div>
              <div className="t">
                {fmtWhen(it.note.at)}
                {/* What was agreed, next to what was said. */}
                {it.due && <span className="feed-due">Visszahívás: {fmtDay(it.due)}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
