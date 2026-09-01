import Link from 'next/link';
import { can, canEdit, currentUser } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import { listLeads } from '@/lib/crm/store';
import { SECTION_META, isQueueKey } from '@/lib/crm/rules';
import { SOURCES, leadSource } from '@/lib/crm/sources';
import { COUNTRIES, countryName, leadCountry } from '@/lib/crm/language';
import { fxRates, hasRates } from '@/lib/crm/money';
import { TIMEFRAMES, scoreLabel } from '@/lib/crm/types';
import type { Lead } from '@/lib/crm/types';
import { STAGES, SCORES } from '@/lib/crm/types';
import { LeadsTable } from '@/components/crm/leads-table';
import { lang as uiLang } from '@/lib/crm/lang-server';

export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

const SCORE_RANK: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
const stageRank = (s: string) => STAGES.findIndex((st) => st.id === s);

const SORTS: Record<string, (a: Lead, b: Lead) => number> = {
  received: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
  name: (a, b) => (a.name || 'zz').localeCompare(b.name || 'zz'),
  score: (a, b) => (SCORE_RANK[a.score] ?? 9) - (SCORE_RANK[b.score] ?? 9),
  stage: (a, b) => stageRank(a.stage) - stageRank(b.stage),
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { t } = await uiLang();
  /* `archived=only` is the one way into the archive, and it is deliberately a
     URL rather than a prominent tab: setting leads aside should be easy to
     undo and uninteresting to browse. */
  const showArchived = str(sp.archived) === 'only';
  /* One of the six working-queue rules, asked on its own — "show me every
     stalled lead". The dashboard used to give the count and then open the
     unfiltered list, leaving the operator to find the seven leads themselves. */
  const flag = isQueueKey(str(sp.flag)) ? str(sp.flag) : '';
  const filter = {
    stage: str(sp.stage),
    score: str(sp.score),
    form_type: str(sp.form_type),
    source: str(sp.source),
    country: str(sp.country).toUpperCase(),
    timeframe: str(sp.timeframe),
    minBudget: Number(str(sp.minBudget)) || undefined,
    budgetCurrency: str(sp.budgetCurrency) || 'THB',
    owner: str(sp.owner),
    q: str(sp.q),
    flag,
    // Left undefined off the archive view, so it stays out of every link qs() builds.
    archived: (showArchived ? 'only' : undefined) as 'only' | undefined,
  };
  // Object.hasOwn, not a truthy lookup: '__proto__' or 'hasOwnProperty' would
  // otherwise pass the check and hand Array.sort a non-function comparator.
  const sort = Object.hasOwn(SORTS, str(sp.sort)) ? str(sp.sort) : 'received';
  const matching = (await listLeads(filter as never)).sort(SORTS[sort]);

  /* ── One page at a time ──

     The list used to render every matching lead. At twenty-five that is the
     right answer and at two thousand it is a page that takes seconds to draw
     and cannot be scrolled to anything. The cost arrives gradually and nobody
     notices the day it stops being fine, which is the argument for doing it
     before it matters rather than after.

     Page size is configuration, not a number typed into a component: a screen
     full of leads is a different number on a laptop and on the office
     monitor. */
  const pageSize = Math.max(10, Number(process.env.CRM_PAGE_SIZE || 50));
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  /* Out-of-range page numbers land on the last page rather than on nothing —
     a bookmark from when the list was longer should show leads, not a void. */
  const page = Math.min(pages, Math.max(1, Number(str(sp.page)) || 1));
  const leads = matching.slice((page - 1) * pageSize, page * pageSize);
  const [archiver, exporter, editor, me] = await Promise.all([
    can('leads.archive'), can('leads.export'), canEdit(), currentUser(),
  ]);
  /* Read off the unfiltered table rather than the filtered view, or choosing a
     source would empty the list of every other source to switch back to. */
  const everything = await listLeads({ archived: filter.archived });
  const seen = new Set(everything.map(leadSource));
  const presentSources = SOURCES.filter((sc) => seen.has(sc.id));
  const seenCountries = new Set(everything.map(leadCountry).filter(Boolean) as string[]);
  const presentCountries = COUNTRIES.filter((c) => seenCountries.has(c.code));
  const rates = hasRates(fxRates());
  const roster = agents().map((a) => a.name);
  /* A salesperson's own leads are the ones they are paid to work, so that is
     the view they land on. It is a default, not a wall: "Everyone" is one
     click away, because covering for a colleague is normal. */
  const mine = me && roster.includes(me) ? me : null;

  // Preserve the current view in links (sorting keeps filters, export keeps both).
  /* `page` is carried only when a caller asks for it: changing a filter or the
     sort has to go back to page one, or the list lands on page seven of a
     result set that now has two pages. */
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filter, sort, ...over })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const sortHrefs = Object.fromEntries(
    Object.keys(SORTS).map((id) => [id, `/admin/leads${qs({ sort: id })}`]),
  );

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">{showArchived ? t('Archivált leadek') : t('Leadek')}</h1>
          <p className="crm-sub">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'} matching your view.
            {flag && ` ${SECTION_META.find((sec) => sec.key === flag)?.blurb}`}
            {filter.country && ` ${countryName(filter.country)}.`}
            {/* Said out loud rather than left to be discovered: without rates
                the budget filter can only compare within one currency, and a
                filter that looks complete while hiding buyers is worse than one
                that admits its limits. */}
            {Boolean(filter.minBudget) && (rates
              ? ' Budgets converted at the configured rates — approximate.'
              : ' No exchange rates configured, so only budgets recorded in this currency are compared.')}
            {showArchived && ' Hidden from every count and report, and the automated e-mails have stopped. Open one to restore it.'}
          </p>
        </div>
        <div className="act-row">
          {/* The pipeline board used to be its own line in the menu, which
              made it look like a different subject. It is this list, drawn as
              columns, so it belongs here — one click from the data it draws,
              and one fewer thing to scan on the way in. */}
          {!showArchived && <Link className="crm-btn ghost" href="/admin/pipeline">{t('Tábla nézet')}</Link>}
          {editor && <Link className="crm-btn gold" href="/admin/leads/new">{t('+ Új lead')}</Link>}
          {/* The export walks out of the building with every contact on it,
              so it needs its own permission rather than riding along with
              being able to read the list. */}
          {exporter && <a className="crm-btn" href={`/api/crm/export${qs({ sort: '' })}`}>{t('CSV letöltés')}</a>}
          {mine && (
            <Link className="crm-btn" href={filter.owner === mine ? '/admin/leads' : `/admin/leads${qs({ owner: mine })}`}>
              {filter.owner === mine ? t('Mindenki') : t('Az én leadjeim')}
            </Link>
          )}
          {archiver && (
            <Link className="crm-btn ghost" href={showArchived ? '/admin/leads' : '/admin/leads?archived=only'}>
              {showArchived ? `← ${t('Vissza a leadekhez')}` : t('Archívum')}
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <form className="crm-filters" method="get">
        <div className="fld grow">
          <input className="crm-input" name="q" placeholder={t('Név, e-mail, telefon, lakás…')} defaultValue={filter.q} />
        </div>
        <div className="fld">
          <select className="crm-select" name="stage" defaultValue={filter.stage} aria-label={t('Szűrés fázisra')}>
            <option value="">{t('Minden fázis')}</option>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{t(s.label)}</option>)}
          </select>
        </div>
        <div className="fld">
          <select className="crm-select" name="score" defaultValue={filter.score} aria-label={t('Szűrés pontszámra')}>
            <option value="">{t('Minden pontszám')}</option>
            {SCORES.map((s) => <option key={s} value={s}>{t(scoreLabel(s))}</option>)}
          </select>
        </div>
        {/* With one salesperson this is noise, so it only appears once there
            is a roster to choose from. */}
        {roster.length > 1 && (
          <div className="fld">
            <select className="crm-select" name="owner" defaultValue={filter.owner} aria-label={t('Szűrés értékesítőre')}>
              <option value="">Everyone</option>
              {roster.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        {/* Channel, not spelling: picking Facebook catches `fb`, `FB_ads` and
            `l.facebook.com`, which used to be three different filters. Only
            the channels that actually appear in the data are offered — a
            dropdown of sixteen where two exist is a dropdown nobody reads. */}
        {presentSources.length > 1 && (
          <div className="fld">
            <select className="crm-select" name="source" defaultValue={filter.source} aria-label={t('Szűrés forrásra')}>
              <option value="">{t('Minden forrás')}</option>
              {presentSources.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
            </select>
          </div>
        )}
        {/* Only the countries that actually appear, for the same reason as the
            sources: a picker of forty where four exist is a picker nobody
            reads. Matches `leadCountry`, so a lead with nothing recorded is
            still filed under what its phone number says. */}
        {presentCountries.length > 1 && (
          <div className="fld">
            <select className="crm-select" name="country" defaultValue={filter.country} aria-label={t('Szűrés országra')}>
              <option value="">{t('Minden ország')}</option>
              {presentCountries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="fld">
          <select className="crm-select" name="timeframe" defaultValue={filter.timeframe} aria-label={t('Szűrés vásárlási időtávra')}>
            <option value="">{t('Bármelyik időtáv')}</option>
            {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="fld">
          <input className="crm-input" name="minBudget" inputMode="numeric" placeholder={t('Kerettől…')}
            defaultValue={filter.minBudget || ''} aria-label={t('Minimális keret')} />
        </div>
        <div className="fld" style={{ minWidth: 90 }}>
          <select className="crm-select" name="budgetCurrency" defaultValue={filter.budgetCurrency} aria-label={t('A keret pénzneme')}>
            {['THB', 'EUR', 'USD', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* The attention rules as a filter. Same definitions the Today queue
            uses, asked one at a time. */}
        <div className="fld">
          <select className="crm-select" name="flag" defaultValue={flag} aria-label={t('Szűrés arra, mi igényel figyelmet')}>
            <option value="">{t('Bármilyen állapot')}</option>
            {SECTION_META.map((sec) => <option key={sec.key} value={sec.key}>{sec.title}</option>)}
          </select>
        </div>
        {showArchived && <input type="hidden" name="archived" value="only" />}
        <button className="crm-btn gold" type="submit">{t('Szűrés')}</button>
      </form>

      <LeadsTable leads={leads} sortHrefs={sortHrefs} sort={sort} readOnly={!editor} canDelete={archiver} />

      {pages > 1 && (
        <div className="pager">
          <span className="crm-meta">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, matching.length)}
            {' / '}{matching.length} {t('lead')}
          </span>
          <span className="pager-acts">
            {page > 1 && <Link className="crm-btn sm" href={`/admin/leads${qs({ page: String(page - 1) })}`}>{t('← Előző')}</Link>}
            <span className="crm-meta">{page} / {pages} {t('oldal')}</span>
            {page < pages && <Link className="crm-btn sm" href={`/admin/leads${qs({ page: String(page + 1) })}`}>{t('Következő →')}</Link>}
          </span>
        </div>
      )}
    </>
  );
}
