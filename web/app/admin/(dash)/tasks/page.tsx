import Link from 'next/link';
import { canEdit } from '@/lib/crm/auth';
import { allTasks, type GlobalTask } from '@/lib/crm/store';
import { TaskToggle } from '@/components/crm/task-toggle';

export const dynamic = 'force-dynamic';

/* ── The calendar ──

   This page used to be four lists — overdue, today, upcoming, done — and the
   first two of those are on Today already, which is why it read as a second
   copy of the same screen and why anybody would ask whether it was needed.
   It was a fair question. A list of what is late is not a second thing worth
   having a menu item for.

   What Today genuinely cannot show is WHEN. It answers "who do I ring now",
   in the order the work should be done, and it is deliberately blind to
   Thursday. That is the job left over, and it is the job a calendar does:
   somebody promising a buyer a call on the 12th needs to see what else the
   12th already holds before they promise it.

   So this is a month, and Today is the day. No overlap, and the reason the
   page exists fits in a sentence. */

const DAY = 86_400_000;
const WEEKDAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('hu-HU', { timeZone: 'UTC', year: 'numeric', month: 'long' });

/** The Monday on or before the 1st, and enough days to fill whole weeks. */
function gridDays(ym: string): string[] {
  const first = new Date(`${ym}-01T00:00:00Z`);
  /* getUTCDay() is 0 for Sunday; the week starts on Monday here, so Sunday
     has to reach back six days rather than none. */
  const back = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - back * DAY);
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const total = Math.ceil((end.getTime() - start.getTime()) / DAY + 1);
  const weeks = Math.ceil(total / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => iso(new Date(start.getTime() + i * DAY)));
}

const shift = (ym: string, months: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))).slice(0, 7);
};

function Row({ t, overdue, readOnly }: { t: GlobalTask; overdue?: boolean; readOnly?: boolean }) {
  return (
    <div className={`task${t.task.done ? ' done' : ''}`} style={{ alignItems: 'center' }}>
      <TaskToggle leadId={t.leadId} taskId={t.task.id} done={t.task.done} title={t.task.title} readOnly={readOnly} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="task-title" style={{ fontWeight: 500 }}>{t.task.title}</div>
        <div className="crm-meta">
          <Link href={`/admin/leads/${t.leadId}`} className="crm-row" style={{ color: 'var(--c-gold)' }}>{t.leadName}</Link>
        </div>
      </div>
      {t.task.due && (
        <span className={`task-due${overdue ? ' over' : ''}`} style={{ whiteSpace: 'nowrap' }}>
          {t.task.due.slice(8, 10)}.{t.task.due.slice(5, 7)}.{overdue ? ' · lejárt' : ''}
        </span>
      )}
    </div>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const asked = Array.isArray(sp.m) ? sp.m[0] : sp.m;
  const today = iso(new Date());
  const month = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : today.slice(0, 7);

  const tasks = await allTasks();
  const readOnly = !(await canEdit());
  const open = tasks.filter((t) => !t.task.done && t.task.due);

  /* Everything late, whatever month it was promised in. It stays above the
     calendar rather than in it: a broken promise is not a date any more, it
     is a thing to do now. */
  const overdue = open
    .filter((t) => t.task.due!.slice(0, 10) < today)
    .sort((a, b) => a.task.due!.localeCompare(b.task.due!));

  const byDay = new Map<string, GlobalTask[]>();
  for (const t of open) {
    const day = t.task.due!.slice(0, 10);
    if (day < today) continue;
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(t);
  }

  const days = gridDays(month);
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const monthCount = days.filter(inMonth).reduce((n, d) => n + (byDay.get(d)?.length || 0), 0);

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Naptár</h1>
          <p className="crm-sub">
            Mikor mit ígértünk — {monthLabel(month)}: {monthCount} bejegyzés.
            {' '}A mai munkalista a <Link href="/admin/today" className="crm-row" style={{ color: 'var(--c-gold)' }}>Mai teendők</Link> oldalon van.
          </p>
        </div>
        <div className="act-row">
          <Link className="crm-btn" href={`/admin/tasks?m=${shift(month, -1)}`}>← Előző</Link>
          <Link className="crm-btn" href="/admin/tasks">Ez a hónap</Link>
          <Link className="crm-btn" href={`/admin/tasks?m=${shift(month, 1)}`}>Következő →</Link>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="crm-card" style={{ marginBottom: 18, borderColor: 'var(--c-hot)' }}>
          <h3 style={{ color: 'var(--c-hot)' }}>Lejárt · {overdue.length}</h3>
          {overdue.map((t) => <Row key={t.task.id} t={t} overdue readOnly={readOnly} />)}
        </div>
      )}

      <div className="crm-card">
        <div className="cal-head">
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="cal-grid">
          {days.map((d) => {
            const items = byDay.get(d) || [];
            return (
              <div
                key={d}
                className={`cal-day${inMonth(d) ? '' : ' out'}${d === today ? ' today' : ''}`}
              >
                <div className="cal-num">{Number(d.slice(8, 10))}</div>
                {items.slice(0, 4).map((t) => (
                  <Link key={t.task.id} href={`/admin/leads/${t.leadId}`} className="cal-item" title={`${t.leadName} — ${t.task.title}`}>
                    {t.leadName}
                  </Link>
                ))}
                {items.length > 4 && <div className="cal-more">+{items.length - 4} további</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
