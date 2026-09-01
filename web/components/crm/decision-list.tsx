import Link from 'next/link';
import type { Decision, DecisionKind } from '@/lib/crm/decisions';
import { fmtTHB } from '@/lib/crm/villas';

const LABEL: Record<DecisionKind, string> = {
  extra: 'Extra kérés',
  'lapsed-hold': 'Lejárt foglalás',
  'competing-claim': 'Ügynökségi vita',
  integrity: 'Ellentmondás',
};

/* ── The things waiting on a yes or a no ──

   This used to be a page of its own, next to Today in the menu, and the two
   were hard to tell apart from the outside: both are lists of things that
   need doing, and nobody opening the CRM for the first time could say which
   one they were supposed to look at. So there is one screen now, and the
   distinction lives where it is actually useful — as the block at the top of
   the day rather than as a second tab.

   The distinction is still real, and it is why this stays a separate block
   instead of being mixed into the queue: everything below is work somebody
   does, and everything here is a choice somebody makes. Ringing a lead can be
   delegated, put off, or done badly and repeated. Saying yes to an extra
   cannot — until the answer exists, there is no answer. */
export function DecisionList({ items, mayDecide, t }: {
  items: Decision[]; mayDecide: boolean; t: (hu: string) => string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="crm-card decisions-block">
      <h3 style={{ color: 'var(--c-hot)', margin: '0 0 4px' }}>
        {t('Döntést igényel')} · {items.length}
      </h3>
      <p className="crm-meta" style={{ margin: '0 0 12px' }}>
        {mayDecide
          ? t('Amíg valaki nem mond igent vagy nemet, addig a válasz egyik sem.')
          : t('A jóváhagyás a tulajdonos joga — te látod, de nem te döntesz.')}
      </p>
      {items.map((d, n) => (
        <div key={`${d.kind}-${d.title}-${n}`} className="q-row">
          <div className="q-who">
            <div className="crm-name">{d.title}</div>
            <div className="crm-meta">{d.detail}</div>
          </div>
          <div className="q-what">
            <span className="badge stage">{t(LABEL[d.kind])}</span>
            {d.amount ? <span className="crm-meta tabnum"> · {fmtTHB(d.amount)}</span> : null}
          </div>
          <div className="q-tags">
            {/* Not how urgent it is — how long it has been waiting. A question
                nobody answered for a month is not more important than this
                morning's, only more embarrassing, and that is the better
                ordering for a list like this. */}
            <span className={`crm-meta tabnum${(d.waitingDays ?? 0) > 7 ? ' q-late' : ''}`}>
              {d.waitingDays === null ? '—' : `${d.waitingDays} ${t('napja')}`}
            </span>
          </div>
          <div className="q-act">
            <Link href={d.href} className="crm-btn ghost sm">{t('Megnyitás')}</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
