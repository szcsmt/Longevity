import Link from 'next/link';
import { can } from '@/lib/crm/auth';
import { getVillaData, integrityIssues, reservationWatch, type HeldUnit } from '@/lib/crm/store';
import { financeReport, type DueState, type Instalment } from '@/lib/crm/finance';
import { houseSchedule, houseScheduleProblem, scheduleSummary } from '@/lib/crm/schedule';
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

function HoldRow({ h }: { h: HeldUnit }) {
  const lapsed = h.state === 'lapsed';
  return (
    <div className="task" style={{ alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="task-title" style={{ fontWeight: 500 }}>
          {h.id} · {h.buyerName || 'Unnamed buyer'}
        </div>
        <div className="crm-meta">
          {h.depositPaid
            ? 'Deposit received'
            : h.amount ? `Deposit of ${fmtTHB(h.amount)} not received` : 'No deposit recorded'}
          {h.expiresAt ? ` · holds to ${h.expiresAt}` : ''}
        </div>
      </div>
      <span className={`task-due${lapsed ? ' over' : ''}`} style={{ whiteSpace: 'nowrap' }}>
        {h.daysLeft === null
          ? 'no expiry'
          : lapsed
            ? `${Math.abs(h.daysLeft)} ${Math.abs(h.daysLeft) === 1 ? 'day' : 'days'} past`
            : `${h.daysLeft} ${h.daysLeft === 1 ? 'day' : 'days'} left`}
      </span>
      {h.buyerLeadId && <Link href={`/admin/leads/${h.buyerLeadId}`} className="crm-btn ghost sm">Open lead</Link>}
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
  /* The sales ledger. Agents work leads and do not need to see what every
     buyer still owes; marketing has no business here at all. */
  if (!(await can('money.read'))) {
    return (
      <div className="crm-card">
        <h3>Payments</h3>
        <div className="empty">This view is limited to the owner, the head of sales and finance.</div>
      </div>
    );
  }

  const [{ villas }, issues, holds] = await Promise.all([
    getVillaData(), integrityIssues(), reservationWatch(),
  ]);
  const pressing = holds.filter((h) => h.state !== 'held');
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

      {/* A misconfigured house schedule produces wrong money in every figure on
          this page. Falling back silently would leave the numbers looking fine
          and being wrong, which is the worst of the two failures. */}
      {houseScheduleProblem() && (
        <div className="crm-card" style={{ borderColor: 'var(--c-hot)', marginBottom: 16 }}>
          <h3 style={{ color: 'var(--c-hot)' }}>The configured payment schedule was refused</h3>
          <div className="crm-meta">
            {houseScheduleProblem()} Everything below is computed on the standard
            {' '}{scheduleSummary(houseSchedule())} schedule until <code>CRM_PAYMENT_SCHEDULE</code> is fixed.
          </div>
        </div>
      )}

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

      {/* ── Holds that need a decision ──

          A reservation with an expiry only helps if somebody is told when it
          passes. Before this an expired hold looked exactly like a live one on
          the masterplan, and the way anybody found out was by trying to sell
          the villa to somebody else. */}
      {pressing.length > 0 && (
        <div className="crm-card" style={{ marginTop: 16, borderColor: 'var(--c-hot)' }}>
          <h3 style={{ color: 'var(--c-hot)' }}>Reservations running out · {pressing.length}</h3>
          {pressing.map((h) => <HoldRow key={h.id} h={h} />)}
        </div>
      )}

      {issues.length > 0 && (
        <div className="crm-card" style={{ marginTop: 16, borderColor: 'var(--c-hot)' }}>
          <h3 style={{ color: 'var(--c-hot)' }}>Needs a decision · {issues.length}</h3>
          <p className="crm-meta" style={{ marginTop: 4, marginBottom: 10 }}>
            Nothing here is broken loudly. Each one is a figure on this page that is
            quietly wrong until somebody says which record is right.
          </p>
          {issues.map((i, n) => (
            <div key={`${i.kind}-${i.villaId || i.leadId}-${n}`} className="task" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="task-title">{i.detail}</div>
                <div className="crm-meta">{i.kind.replace(/-/g, ' ')}</div>
              </div>
              {i.leadId && (
                <Link href={`/admin/leads/${i.leadId}`} className="crm-btn ghost sm">Open lead</Link>
              )}
              {!i.leadId && i.villaId && (
                <Link href="/admin/masterplan" className="crm-btn ghost sm">Masterplan</Link>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="crm-meta" style={{ marginTop: 16 }}>
        An instalment counts as due once the work it is tied to is finished on site,
        which is how the schedule actually works. Give one an agreed date on the
        masterplan and it can also become overdue. The project sells on
        {' '}{scheduleSummary(houseSchedule())}; a unit whose buyer negotiated something else keeps
        its own terms, and changing the house schedule never rewrites a deal already struck.
      </p>
    </>
  );
}
