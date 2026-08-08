import Link from 'next/link';
import { isAdmin } from '@/lib/crm/auth';
import { getVillaData } from '@/lib/crm/store';
import { financeReport, type DueState, type Instalment } from '@/lib/crm/finance';
import { fmtTHB, fmtTHBShort } from '@/lib/crm/villas';

export const dynamic = 'force-dynamic';

/* ── Payments ──

   The masterplan shows the schedule one unit at a time, which is the right way
   to record it and the wrong way to run a week. This page turns the same data
   sideways: not "what does plot B12 owe" but "what is owed to us, and who is
   late". Everything here is derived — nothing new is stored. */

const STATE_LABEL: Record<DueState, string> = {
  overdue: 'Overdue',
  due: 'Due now',
  soon: 'Next 30 days',
  later: 'Later',
  paid: 'Paid',
};

function Tile({ label, value, note, alarm }: { label: string; value: string; note?: string; alarm?: boolean }) {
  return (
    <div className="crm-card" style={{ minWidth: 0 }}>
      <div className="crm-meta" style={{ letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: 10 }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-playfair), Georgia, serif',
        fontSize: 30, lineHeight: '38px', marginTop: 6,
        color: alarm ? 'var(--c-hot)' : 'var(--c-gold)',
      }}>{value}</div>
      {note && <div className="crm-meta" style={{ marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function Row({ i }: { i: Instalment }) {
  const who = i.buyerName || 'Unnamed buyer';
  return (
    <div className="task" style={{ alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="task-title" style={{ fontWeight: 500 }}>
          {i.villaId} · {i.label}
        </div>
        <div className="crm-meta">
          {i.buyerLeadId
            ? <Link href={`/admin/leads/${i.buyerLeadId}`} className="crm-row" style={{ color: 'var(--c-gold)' }}>{who}</Link>
            : who}
          {' · '}{i.reason}
        </div>
      </div>
      <span className={`task-due${i.state === 'overdue' ? ' over' : ''}`} style={{ whiteSpace: 'nowrap' }}>
        {fmtTHB(i.amount)}
      </span>
    </div>
  );
}

function Group({ state, items }: { state: DueState; items: Instalment[] }) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="crm-card">
      <h3>{STATE_LABEL[state]}{items.length ? ` · ${fmtTHBShort(total)}` : ''}</h3>
      {items.length === 0
        ? <div className="empty">Nothing here.</div>
        : items.map((i) => <Row key={`${i.villaId}-${i.key}`} i={i} />)}
    </div>
  );
}

export default async function FinancePage() {
  /* The sales ledger is the owner's business. Agents work leads; they do not
     need to see what every buyer still owes. */
  if (!(await isAdmin())) {
    return (
      <div className="crm-card">
        <h3>Payments</h3>
        <div className="empty">This view is limited to the account owner.</div>
      </div>
    );
  }

  const { villas } = await getVillaData();
  const r = financeReport(villas);
  const by = (s: DueState) => r.instalments.filter((i) => i.state === s);
  const collected = r.contracted ? Math.round((r.received / r.contracted) * 100) : 0;

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Payments</h1>
          <p className="crm-sub">
            {r.units} {r.units === 1 ? 'unit' : 'units'} under contract. {collected}% of the contracted
            value has been received.
          </p>
        </div>
        <Link className="crm-btn" href="/admin/masterplan">Masterplan →</Link>
      </div>

      <div className="crm-grid crm-stats">
        <Tile label="Contracted" value={fmtTHBShort(r.contracted)} note={`${r.units} units`} />
        <Tile label="Received" value={fmtTHBShort(r.received)} note={`${collected}% collected`} />
        <Tile label="Outstanding" value={fmtTHBShort(r.outstanding)} note="still to come in" />
        <Tile
          label="Needs chasing"
          value={fmtTHBShort(r.overdue + r.dueNow)}
          note={r.overdue ? `${fmtTHBShort(r.overdue)} past an agreed date` : 'released, not yet paid'}
          alarm={Boolean(r.overdue + r.dueNow)}
        />
      </div>

      <div className="crm-grid crm-cols-2" style={{ marginTop: 16 }}>
        <div className="stack">
          <Group state="overdue" items={by('overdue')} />
          <Group state="due" items={by('due')} />
        </div>
        <div className="stack">
          <Group state="soon" items={by('soon')} />
          <Group state="later" items={by('later')} />
        </div>
      </div>

      <p className="crm-meta" style={{ marginTop: 16 }}>
        An instalment counts as due once the work it is tied to is finished on site,
        which is how the schedule actually works. Give one an agreed date on the
        masterplan and it can also become overdue.
      </p>
    </>
  );
}
