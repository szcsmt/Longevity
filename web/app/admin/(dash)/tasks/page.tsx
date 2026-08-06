import Link from 'next/link';
import { isAdmin } from '@/lib/crm/auth';
import { allTasks, type GlobalTask } from '@/lib/crm/store';
import { STAGES } from '@/lib/crm/types';
import { TaskToggle } from '@/components/crm/task-toggle';

export const dynamic = 'force-dynamic';

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '';

function Row({ t, overdue, readOnly }: { t: GlobalTask; overdue?: boolean; readOnly?: boolean }) {
  return (
    <div className={`task${t.task.done ? ' done' : ''}`} style={{ alignItems: 'center' }}>
      <TaskToggle leadId={t.leadId} taskId={t.task.id} done={t.task.done} title={t.task.title} readOnly={readOnly} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="task-title" style={{ fontWeight: 500 }}>{t.task.title}</div>
        <div className="crm-meta">
          <Link href={`/admin/leads/${t.leadId}`} className="crm-row" style={{ color: 'var(--c-gold)' }}>{t.leadName}</Link>
          {' · '}{STAGES.find((s) => s.id === t.leadStage)?.label}
        </div>
      </div>
      {t.task.due && (
        <span className={`task-due${overdue ? ' over' : ''}`} style={{ whiteSpace: 'nowrap' }}>
          {fmtDay(t.task.due)}{overdue ? ' · overdue' : ''}
        </span>
      )}
    </div>
  );
}

function Group({ title, items, overdue, empty, readOnly }: { title: string; items: GlobalTask[]; overdue?: boolean; empty: string; readOnly?: boolean }) {
  return (
    <div className="crm-card">
      <h3>{title}{items.length ? ` · ${items.length}` : ''}</h3>
      {items.length === 0 ? <div className="empty">{empty}</div> : items.map((t) => <Row key={t.task.id} t={t} overdue={overdue} readOnly={readOnly} />)}
    </div>
  );
}

export default async function TasksPage() {
  const tasks = await allTasks();
  const readOnly = !(await isAdmin());
  // Compare CALENDAR DATES, not instants: a due date is stored as midnight UTC,
  // so an instant comparison would flag today's tasks as overdue all day.
  const todayStr = new Date().toISOString().slice(0, 10);
  const dueDay = (t: GlobalTask) => (t.task.due || '').slice(0, 10);

  const open = tasks.filter((t) => !t.task.done);
  const overdue = open.filter((t) => t.task.due && dueDay(t) < todayStr)
    .sort((a, b) => (a.task.due || '').localeCompare(b.task.due || ''));
  const today = open.filter((t) => t.task.due && dueDay(t) === todayStr)
    .sort((a, b) => (a.task.due || '').localeCompare(b.task.due || ''));
  const upcoming = open.filter((t) => !t.task.due || dueDay(t) > todayStr)
    .sort((a, b) => (a.task.due || '9').localeCompare(b.task.due || '9'));
  const done = tasks.filter((t) => t.task.done)
    .sort((a, b) => (b.task.at || '').localeCompare(a.task.at || ''))
    .slice(0, 12);

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Follow-ups</h1>
          <p className="crm-sub">{open.length} open {open.length === 1 ? 'task' : 'tasks'} across all leads. Tick one off and it moves to Done.</p>
        </div>
        <Link className="crm-btn" href="/admin/leads">All leads →</Link>
      </div>
      <div className="crm-grid crm-cols-2">
        <div className="stack">
          <Group title="Overdue" items={overdue} overdue empty="Nothing overdue — good." readOnly={readOnly} />
          <Group title="Due today" items={today} empty="Nothing due today." readOnly={readOnly} />
        </div>
        <div className="stack">
          <Group title="Upcoming" items={upcoming} empty="Nothing scheduled." readOnly={readOnly} />
          <Group title="Recently completed" items={done} empty="Nothing completed yet." readOnly={readOnly} />
        </div>
      </div>
    </>
  );
}
