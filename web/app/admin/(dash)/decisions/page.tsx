import Link from 'next/link';
import { can, isAuthed } from '@/lib/crm/auth';
import { getVillaData, integrityIssues, listLeads, reservationWatch } from '@/lib/crm/store';
import { decisions, type DecisionKind } from '@/lib/crm/decisions';
import { fmtTHB } from '@/lib/crm/villas';

export const dynamic = 'force-dynamic';

const LABEL: Record<DecisionKind, string> = {
  extra: 'Extra kérés',
  'lapsed-hold': 'Lejárt foglalás',
  'competing-claim': 'Ügynökségi vita',
  integrity: 'Ellentmondás',
};

/* ── Döntést igényel ──

   Minden, ami egy emberre vár. Nem munka, nem utánakövetés — döntés: amíg
   valaki nem mond igent vagy nemet, addig a válasz egyik sem.

   Eddig mindegyik azon a képernyőn lakott, ami éppen megtermelte: az extra a
   villán, a lejárt foglalás a Payments-en, a két ügynökség a lead lapján. Így
   egyik sem látszik, hacsak valaki véletlenül meg nem nyitja a megfelelő
   oldalt — és egy döntés, amit senkinek nem mutatnak meg, olyan döntés, amit
   senki nem hoz meg. */
export default async function DecisionsPage() {
  if (!(await isAuthed())) return null;
  const [{ villas }, leads, holds, issues, mayDecide] = await Promise.all([
    getVillaData(), listLeads(), reservationWatch(), integrityIssues(), can('deals.approve'),
  ]);

  const list = decisions({ villas, leads, holds, issues });

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Döntést igényel</h1>
          <p className="crm-sub">
            {list.length === 0
              ? 'Semmi nem vár döntésre. Ilyenkor nincs is mit nézni ezen az oldalon.'
              : `${list.length} dolog vár arra, hogy valaki igent vagy nemet mondjon rá.`}
            {!mayDecide && list.length > 0 && ' A jóváhagyás a tulajdonos joga — te látod, de nem te döntesz.'}
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="crm-card">
          <div className="empty" style={{ padding: 46 }}>
            Nincs nyitott kérdés. Minden extra megválaszolva, egy foglalás sem járt le,
            és nincs két ügynökség ugyanazon a vevőn.
          </div>
        </div>
      ) : (
        <div className="crm-card">
          {list.map((d, n) => (
            <div key={`${d.kind}-${d.title}-${n}`} className="q-row">
              <Link href={d.href} className="crm-row q-who">
                <div className="crm-name">{d.title}</div>
                <div className="crm-meta">{d.detail}</div>
              </Link>
              <div className="q-what">
                <span className="badge stage">{LABEL[d.kind]}</span>
                {d.amount ? <span className="crm-meta tabnum"> · {fmtTHB(d.amount)}</span> : null}
              </div>
              <div className="q-tags">
                {/* Nem az a fontos, mennyire sürgős — hanem hogy mennyi ideje
                    vár. Egy hónapja nyitott kérdés nem fontosabb a mainál, csak
                    kínosabb, és ez a jobb rendezés egy olyan listához, amire
                    senki nem válaszolt. */}
                <span className={`crm-meta tabnum${(d.waitingDays ?? 0) > 7 ? ' q-late' : ''}`}>
                  {d.waitingDays === null ? '—' : `${d.waitingDays} napja`}
                </span>
              </div>
              <div className="q-act">
                <Link href={d.href} className="crm-btn ghost sm">Megnyitás</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
