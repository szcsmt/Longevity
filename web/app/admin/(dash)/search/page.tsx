import Link from 'next/link';
import { isAuthed } from '@/lib/crm/auth';
import { getVillaData, listLeads } from '@/lib/crm/store';
import { listAgencies } from '@/lib/crm/partners';
import { search, type HitKind } from '@/lib/crm/search';

export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

const KIND_LABEL: Record<HitKind, string> = { lead: 'Lead', agency: 'Agency', unit: 'Unit' };

/* ── One search box, three kinds of answer ──

   The sidebar search has always filtered the lead list, which is the right
   answer to "where is that buyer" and no answer at all to "which agency was Nok
   at" or "who is holding B12" — both of which get asked out loud every week. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAuthed())) return null;
  const q = str((await searchParams).q).trim();

  /* Archived leads are included on purpose. Somebody searching a name has a
     reason, and "we archived them in March" is an answer — a search that
     silently omits them looks like a CRM that lost the record. */
  const [leads, agencies, villaData] = q.length >= 2
    ? await Promise.all([listLeads({ archived: 'include' }), listAgencies({ archived: 'include' }), getVillaData()])
    : [[], [], { villas: {}, history: [] }];

  const hits = search(q, { leads, agencies, villas: villaData.villas });
  const groups: HitKind[] = ['lead', 'agency', 'unit'];

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Search</h1>
          <p className="crm-sub">
            {q.length < 2
              ? 'Írj be legalább két karaktert. Nevek, e-mail címek, telefonszámok, ügynökségek, azok ügynökei és lakásszámok.'
              : hits.length === 0
                ? `Nothing matches “${q}”.`
                : `${hits.length} ${hits.length === 1 ? 'match' : 'matches'} for “${q}”.`}
          </p>
        </div>
        <form method="get" className="act-row">
          <input className="crm-input" name="q" defaultValue={q} placeholder="Név, e-mail, telefon, ügynökség, lakás…"
            aria-label="Search" style={{ minWidth: 260 }} />
          <button className="crm-btn gold" type="submit">Search</button>
        </form>
      </div>

      {q.length >= 2 && hits.length === 0 && (
        <div className="crm-card">
          <div className="empty" style={{ padding: 40 }}>
            Nincs találat. A telefonszámot az utolsó kilenc számjegye alapján keressük, tehát az
            országhívó és a szóközök nem számítanak — a nevet viszont úgy kell írni, ahogy el van mentve.
          </div>
        </div>
      )}

      <div className="stack">
        {groups.map((kind) => {
          const mine = hits.filter((h) => h.kind === kind);
          if (!mine.length) return null;
          return (
            <div className="crm-card" key={kind}>
              <h3>{KIND_LABEL[kind]}s · {mine.length}</h3>
              {mine.map((h) => (
                <Link key={`${h.kind}-${h.id}`} href={h.href} className="crm-row related-row" style={{ textDecoration: 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="crm-name">{h.title}</div>
                    <div className="crm-meta">{h.subtitle}</div>
                  </div>
                  {/* Which field matched, so a hit on a phone number does not
                      look like a mysterious one on the name. */}
                  <span className="crm-meta" style={{ whiteSpace: 'nowrap' }}>matched on {h.matched}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
