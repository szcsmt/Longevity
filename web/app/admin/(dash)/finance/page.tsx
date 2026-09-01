import Link from 'next/link';
import { can } from '@/lib/crm/auth';
import { getVillaData, reservationWatch, type HeldUnit } from '@/lib/crm/store';
import { financeReport, type DueState, type Instalment } from '@/lib/crm/finance';
import { houseSchedule, houseScheduleProblem, scheduleSummary } from '@/lib/crm/schedule';
import { DueDate } from '@/components/crm/due-date';
import { fmtTHB, fmtTHBShort } from '@/lib/crm/villas';

export const dynamic = 'force-dynamic';

/* ── Payments ──

   The masterplan shows the schedule one unit at a time, which is the right way
   to record it and the wrong way to run a week. This page turns the same data
   sideways: not "what does plot B12 owe" but "what is owed to us, and who is
   late". Everything here is derived — nothing new is stored. */

const STATE_LABEL: Record<DueState, string> = {
  overdue: 'Lejárt',
  due: 'Most esedékes',
  soon: 'Következő 30 nap',
  later: 'Később',
  paid: 'Befizetve',
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

function Row({ i, canWrite }: { i: Instalment; canWrite: boolean }) {
  const who = i.buyerName || 'Névtelen vevő';
  return (
    <div className="task" style={{ alignItems: 'center', gap: 12 }}>
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
      {/* An agreed date, set right here. Without one an instalment can only
          ever be "due now" — which is true, and gives nobody a day to chase
          against. */}
      <DueDate villaId={i.villaId} phaseKey={i.key} due={i.due} readOnly={!canWrite} />
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
          {h.id} · {h.buyerName || 'Névtelen vevő'}
        </div>
        <div className="crm-meta">
          {h.depositPaid
            ? 'Előleg megérkezett'
            : h.amount ? `Deposit of ${fmtTHB(h.amount)} not received` : 'Nincs rögzített előleg'}
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
      {h.buyerLeadId && <Link href={`/admin/leads/${h.buyerLeadId}`} className="crm-btn ghost sm">Lead megnyitása</Link>}
    </div>
  );
}

function Group({ state, items, canWrite }: { state: DueState; items: Instalment[]; canWrite: boolean }) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="crm-card">
      <h3>{STATE_LABEL[state]}{items.length ? ` · ${fmtTHBShort(total)}` : ''}</h3>
      {items.length === 0
        ? <div className="empty">Itt nincs semmi.</div>
        : items.map((i) => <Row key={`${i.villaId}-${i.key}`} i={i} canWrite={canWrite} />)}
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
        <div className="empty">Ezt az oldalt csak a tulajdonos, a sales vezető és a pénzügy látja.</div>
      </div>
    );
  }

  const [{ villas }, holds, canWrite] = await Promise.all([
    getVillaData(), reservationWatch(), can('money.write'),
  ]);
  const pressing = holds.filter((h) => h.state !== 'held');
  const r = financeReport(villas);
  const by = (s: DueState) => r.instalments.filter((i) => i.state === s);
  const collected = r.contracted ? Math.round((r.received / r.contracted) * 100) : 0;

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Fizetések</h1>
          <p className="crm-sub">
            {r.units} lakás van szerződés alatt. A szerződött érték {collected}%-a folyt be.
          </p>
        </div>
        <Link className="crm-btn" href="/admin/masterplan">Masterplan →</Link>
      </div>

      {/* A misconfigured house schedule produces wrong money in every figure on
          this page. Falling back silently would leave the numbers looking fine
          and being wrong, which is the worst of the two failures. */}
      {houseScheduleProblem() && (
        <div className="crm-card" style={{ borderColor: 'var(--c-hot)', marginBottom: 16 }}>
          <h3 style={{ color: 'var(--c-hot)' }}>A beállított fizetési ütemet a rendszer elutasította</h3>
          <div className="crm-meta">
            {houseScheduleProblem()} Everything below is computed on the standard
            {' '}{scheduleSummary(houseSchedule())} schedule until <code>CRM_PAYMENT_SCHEDULE</code> is fixed.
          </div>
        </div>
      )}

      <div className="crm-grid crm-stats">
        <Tile label="Szerződött" value={fmtTHBShort(r.contracted)} note={`${r.units} lakás`} />
        <Tile label="Befolyt" value={fmtTHBShort(r.received)} note={`${collected}% beérkezett`} />
        <Tile label="Kint van" value={fmtTHBShort(r.outstanding)} note="még be kell folynia" />
        <Tile
          label="Utána kell menni"
          value={fmtTHBShort(r.overdue + r.dueNow)}
          note={r.overdue ? `${fmtTHBShort(r.overdue)} megbeszélt határidőn túl` : 'felszabadult, még nincs fizetve'}
          alarm={Boolean(r.overdue + r.dueNow)}
        />
      </div>

      <div className="crm-grid crm-cols-2" style={{ marginTop: 16 }}>
        <div className="stack">
          <Group state="overdue" items={by('overdue')} canWrite={canWrite} />
          <Group state="due" items={by('due')} canWrite={canWrite} />
        </div>
        <div className="stack">
          <Group state="soon" items={by('soon')} canWrite={canWrite} />
          <Group state="later" items={by('later')} canWrite={canWrite} />
        </div>
      </div>

      {/* ── Holds that need a decision ──

          A reservation with an expiry only helps if somebody is told when it
          passes. Before this an expired hold looked exactly like a live one on
          the masterplan, and the way anybody found out was by trying to sell
          the villa to somebody else. */}
      {pressing.length > 0 && (
        <div className="crm-card" style={{ marginTop: 16, borderColor: 'var(--c-hot)' }}>
          <h3 style={{ color: 'var(--c-hot)' }}>Lejáró foglalások · {pressing.length}</h3>
          {pressing.map((h) => <HoldRow key={h.id} h={h} />)}
        </div>
      )}

      {/* The integrity problems used to be listed here too, under "Needs a
          decision". They are on Today with everything else waiting on a
          person: the same list in two places is not twice the reminder, it is
          two places to check and one of them to forget. */}

      <p className="crm-meta" style={{ marginTop: 16 }}>
        Egy részlet akkor válik esedékessé, amikor a hozzá tartozó munka elkészül a helyszínen —
        a fizetési ütem valójában így működik. Ha a masterplanon megbeszélt dátumot is kap, akkor
        lejárttá is válhat. A projekt fizetési üteme:
        {' '}{scheduleSummary(houseSchedule())}. Az a lakás, amelyiknek a vevője mást alkudott ki,
        megtartja a saját feltételeit — a házirend későbbi módosítása soha nem írja át a már
        megkötött üzletet.
      </p>
    </>
  );
}
