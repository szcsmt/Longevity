/* Analytics aggregation for the CRM "Analitika" tab. One server-side pass over
   leads + interaction events + villa availability, shaped into the exact series
   the charts consume. Financial figures derive from each villa's size tier
   (M / L / XL) priced below. Time-ranged sections respect the selected window;
   villa/financial figures are an as-of-now snapshot. */
import villaGeo from '@/lib/villas.json';
import { listLeads, getVillaData, listEvents } from './store';
import { STAGES, type Stage, type VillaStatus } from './types';

// Residence list prices (THB) by size tier — keep in sync with the site.
export const PRICE: Record<string, number> = { M: 7_650_000, L: 8_050_000, XL: 11_200_000 };

type Geo = { id: string; block: string; size?: string };
const GEO = (villaGeo.villas as Geo[]);
const SIZE_OF: Record<string, string | undefined> = Object.fromEntries(GEO.map((v) => [v.id, v.size]));
const BLOCK_OF: Record<string, string> = Object.fromEntries(GEO.map((v) => [v.id, v.block]));

export type Range = 7 | 30 | 90 | 'all';
export interface Point { date: string; count: number }
export interface NamedCount { name: string; count: number }

export interface AnalyticsData {
  range: Range;
  rangeLabel: string;
  kpis: {
    totalLeads: number;
    leadsInRange: number;
    leadsTrendPct: number | null;   // vs previous equal window
    hotLeads: number;
    reservationRatePct: number;     // reserved+won / total leads
    closeRatePct: number;           // won / total leads
    visitsInRange: number;
  };
  financial: {
    soldCount: number;
    soldRevenue: number;
    reservedCount: number;
    reservedValue: number;
    freeCount: number;              // sized, still available
    totalInventoryValue: number;
    realizedPct: number;            // soldRevenue / totalInventoryValue
    committedPct: number;           // (sold+reserved value) / total
    avgDealSize: number | null;
    bySize: { size: string; price: number; total: number; sold: number; reserved: number }[];
  };
  leadsOverTime: Point[];
  visitsOverTime: Point[];
  leadsBySource: NamedCount[];
  leadsByStage: { stage: Stage; label: string; count: number }[];
  leadsByScore: { score: string; count: number }[];
  leadsByForm: NamedCount[];
  eventsByType: NamedCount[];
  visitsBySource: NamedCount[];
  funnel: { label: string; count: number }[];
  villaStatus: { free: number; reserved: number; sold: number; total: number };
  villaByBlock: { block: string; free: number; reserved: number; sold: number }[];
  agents: { seller: string; sold: number; revenue: number }[];
  /* Speed to lead — how fast the enquiry gets answered, by the machine and by
     a human. The automatic half should always be 100%; the human half is the
     number that actually decides whether the deal happens. */
  speed: {
    withEmail: number;          // leads in range we could write to
    autoAnswered: number;       // of those, how many got the minute-0 welcome
    autoPct: number | null;     // % — null while there is nothing to measure
    humanTouched: number;       // leads a person has acted on
    medianHumanMin: number | null;  // median minutes to the first human action
    within1hPct: number | null; // % of touched leads answered inside an hour
    sequenceSent: number;       // automated e-mails sent in the range, all steps
  };
}

const DAY = 86_400_000;

function normalizeRange(input?: string): Range {
  if (input === 'all') return 'all';
  const n = Number(input);
  if (n === 7 || n === 90) return n;
  return 30; // default
}

const RANGE_LABEL: Record<string, string> = {
  '7': 'Utolsó 7 nap', '30': 'Utolsó 30 nap', '90': 'Utolsó 90 nap', all: 'Teljes időszak',
};

/** Zero-filled daily (or weekly for long spans) buckets over [effFrom, now]. */
function buildSeries(datesMs: number[], effFrom: number, nowMs: number): Point[] {
  const weekly = nowMs - effFrom > 100 * DAY;
  const step = weekly ? 7 * DAY : DAY;
  const start = Math.floor(effFrom / DAY) * DAY;
  const n = Math.min(400, Math.max(1, Math.ceil((nowMs - start) / step) + 1));
  const buckets: Point[] = Array.from({ length: n }, (_, i) => ({
    date: new Date(start + i * step).toISOString().slice(0, 10), count: 0,
  }));
  for (const d of datesMs) {
    if (isNaN(d) || d < start) continue;
    const i = Math.floor((d - start) / step);
    if (i >= 0 && i < n) buckets[i].count++;
  }
  return buckets;
}

function topN(map: Record<string, number>, n: number): NamedCount[] {
  const arr = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  if (arr.length <= n) return arr;
  const head = arr.slice(0, n);
  const rest = arr.slice(n).reduce((s, x) => s + x.count, 0);
  if (rest > 0) head.push({ name: 'Egyéb', count: rest });
  return head;
}

export async function analytics(rangeInput?: string): Promise<AnalyticsData> {
  const range = normalizeRange(rangeInput);
  const [leads, vdata, events] = await Promise.all([listLeads(), getVillaData(), listEvents(20000)]);

  const nowMs = Date.now();
  const rangeDays = range === 'all' ? null : range;
  const fromMs = rangeDays ? nowMs - rangeDays * DAY : 0;
  const prevFromMs = rangeDays ? nowMs - 2 * rangeDays * DAY : 0;

  const parse = (iso?: string) => (iso ? Date.parse(iso) : NaN);
  const inRange = (iso?: string) => !rangeDays || (!isNaN(parse(iso)) && parse(iso) >= fromMs);
  const inPrev = (iso?: string) => !!rangeDays && !isNaN(parse(iso)) && parse(iso) >= prevFromMs && parse(iso) < fromMs;

  const rangedLeads = leads.filter((l) => inRange(l.created_at));
  const visits = events.filter((e) => e.type === 'visit');
  const clicks = events.filter((e) => e.type !== 'visit');
  const rangedVisits = visits.filter((e) => inRange(e.at));
  const rangedClicks = clicks.filter((e) => inRange(e.at));

  // earliest data point (for the 'all' window)
  const allDates = [...leads.map((l) => parse(l.created_at)), ...events.map((e) => parse(e.at))].filter((n) => !isNaN(n));
  const earliest = allDates.length ? Math.min(...allDates) : nowMs;
  const effFrom = rangeDays ? fromMs : earliest;

  // ── KPIs ──
  const leadsInRange = rangedLeads.length;
  const prevLeads = leads.filter((l) => inPrev(l.created_at)).length;
  const leadsTrendPct = rangeDays && prevLeads > 0 ? Math.round(((leadsInRange - prevLeads) / prevLeads) * 100) : null;
  const hotLeads = leads.filter((l) => l.score === 'hot').length;
  const wonN = leads.filter((l) => l.stage === 'won').length;
  const reservedN = leads.filter((l) => l.stage === 'reserved' || l.stage === 'won').length;
  const closeRatePct = leads.length ? Math.round((wonN / leads.length) * 100) : 0;
  const reservationRatePct = leads.length ? Math.round((reservedN / leads.length) * 100) : 0;

  // ── Financial (snapshot over sized villas) ──
  const sizes = ['M', 'L', 'XL'];
  const bySize = sizes.map((size) => ({ size, price: PRICE[size], total: 0, sold: 0, reserved: 0 }));
  const sizeIdx: Record<string, number> = { M: 0, L: 1, XL: 2 };
  let soldCount = 0, soldRevenue = 0, reservedCount = 0, reservedValue = 0, freeSized = 0, totalInventoryValue = 0;
  for (const [id, size] of Object.entries(SIZE_OF)) {
    if (!size || !(size in PRICE)) continue;
    const price = PRICE[size];
    totalInventoryValue += price;
    const row = bySize[sizeIdx[size]];
    row.total++;
    const status = (vdata.villas[id]?.status || 'free') as VillaStatus;
    if (status === 'sold') { soldCount++; soldRevenue += price; row.sold++; }
    else if (status === 'reserved') { reservedCount++; reservedValue += price; row.reserved++; }
    else freeSized++;
  }
  const realizedPct = totalInventoryValue ? Math.round((soldRevenue / totalInventoryValue) * 100) : 0;
  const committedPct = totalInventoryValue ? Math.round(((soldRevenue + reservedValue) / totalInventoryValue) * 100) : 0;
  const avgDealSize = soldCount ? Math.round(soldRevenue / soldCount) : null;

  // ── Villa status over ALL villas (incl. A-block) ──
  let vFree = 0, vRes = 0, vSold = 0;
  const blockMap: Record<string, { free: number; reserved: number; sold: number }> = {};
  const agentMap: Record<string, { sold: number; revenue: number }> = {};
  for (const g of GEO) {
    const rec = vdata.villas[g.id];
    const status = (rec?.status || 'free') as VillaStatus;
    const block = BLOCK_OF[g.id] || '?';
    blockMap[block] = blockMap[block] || { free: 0, reserved: 0, sold: 0 };
    if (status === 'sold') { vSold++; blockMap[block].sold++; }
    else if (status === 'reserved') { vRes++; blockMap[block].reserved++; }
    else { vFree++; blockMap[block].free++; }
    // Agent attribution: the leaderboard counts CLOSED sales only — a
    // reservation is not a result yet. Revenue prefers the actual contract
    // value over the list price when the sale has one recorded.
    if (status === 'sold' && rec?.seller) {
      const a = (agentMap[rec.seller] = agentMap[rec.seller] || { sold: 0, revenue: 0 });
      const listPrice = SIZE_OF[g.id] && PRICE[SIZE_OF[g.id]!] ? PRICE[SIZE_OF[g.id]!] : 0;
      a.sold++;
      a.revenue += rec.contractValue ?? listPrice;
    }
  }

  // ── Distributions (ranged leads) ──
  const srcMap: Record<string, number> = {};
  const formMap: Record<string, number> = {};
  const stageMap: Record<string, number> = {};
  const scoreMap: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
  for (const l of rangedLeads) {
    const src = l.source || l.utm_source || 'direct';
    srcMap[src] = (srcMap[src] || 0) + 1;
    if (l.form_type) formMap[l.form_type] = (formMap[l.form_type] || 0) + 1;
    stageMap[l.stage] = (stageMap[l.stage] || 0) + 1;
    scoreMap[l.score] = (scoreMap[l.score] || 0) + 1;
  }

  // ── Traffic ──
  const evtTypeMap: Record<string, number> = {};
  for (const e of rangedClicks) evtTypeMap[e.type] = (evtTypeMap[e.type] || 0) + 1;
  const vSrcMap: Record<string, number> = {};
  for (const v of rangedVisits) { const s = v.source || v.label || 'direct'; vSrcMap[s] = (vSrcMap[s] || 0) + 1; }

  // ── Funnel: lead-pipeline progression (always monotonic — each step is a
  //    subset of the one above, so conversion never exceeds 100%). A true
  //    visitor→sale funnel isn't possible without per-visitor linkage, and leads
  //    arrive from several channels (imports, WhatsApp), so we track how far
  //    leads travel through the pipeline instead. ──
  const rank: Record<string, number> = { new: 0, contacted: 1, qualified: 2, reserved: 3, won: 4, lost: -1 };
  const atLeast = (r: number) => rangedLeads.filter((l) => (rank[l.stage] ?? -1) >= r).length;
  const funnel = [
    { label: 'Lead', count: leadsInRange },
    { label: 'Kapcsolatba lépett', count: atLeast(1) },
    { label: 'Kvalifikált', count: atLeast(2) },
    { label: 'Foglalás', count: atLeast(3) },
    { label: 'Eladás', count: atLeast(4) },
  ];

  // ── Speed to lead ──
  const withEmail = rangedLeads.filter((l) => l.email);
  const autoAnswered = withEmail.filter((l) => (l.outbox || []).some((e) => e.step === 'welcome')).length;
  const humanMinutes = rangedLeads
    .filter((l) => l.first_response_at)
    .map((l) => (parse(l.first_response_at) - parse(l.created_at)) / 60_000)
    .filter((m) => isFinite(m) && m >= 0)
    .sort((a, b) => a - b);
  const medianHumanMin = humanMinutes.length
    ? Math.round(humanMinutes[Math.floor(humanMinutes.length / 2)])
    : null;
  const within1hPct = humanMinutes.length
    ? Math.round((humanMinutes.filter((m) => m <= 60).length / humanMinutes.length) * 100)
    : null;
  const sequenceSent = leads.reduce((s, l) => s + (l.outbox || []).filter((e) => inRange(e.at)).length, 0);

  return {
    range,
    rangeLabel: RANGE_LABEL[String(range)],
    kpis: { totalLeads: leads.length, leadsInRange, leadsTrendPct, hotLeads, reservationRatePct, closeRatePct, visitsInRange: rangedVisits.length },
    financial: {
      soldCount, soldRevenue, reservedCount, reservedValue, freeCount: freeSized,
      totalInventoryValue, realizedPct, committedPct, avgDealSize, bySize,
    },
    leadsOverTime: buildSeries(rangedLeads.map((l) => parse(l.created_at)), effFrom, nowMs),
    visitsOverTime: buildSeries(rangedVisits.map((e) => parse(e.at)), effFrom, nowMs),
    leadsBySource: topN(srcMap, 8),
    leadsByStage: STAGES.map((s) => ({ stage: s.id, label: s.label, count: stageMap[s.id] || 0 })),
    leadsByScore: ['hot', 'warm', 'cold'].map((score) => ({ score, count: scoreMap[score] || 0 })),
    leadsByForm: topN(formMap, 6),
    eventsByType: topN(evtTypeMap, 8),
    visitsBySource: topN(vSrcMap, 8),
    funnel,
    villaStatus: { free: vFree, reserved: vRes, sold: vSold, total: GEO.length },
    villaByBlock: Object.entries(blockMap).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([block, v]) => ({ block, ...v })),
    agents: Object.entries(agentMap).map(([seller, v]) => ({ seller, ...v })).sort((a, b) => b.revenue - a.revenue),
    speed: {
      withEmail: withEmail.length,
      autoAnswered,
      autoPct: withEmail.length ? Math.round((autoAnswered / withEmail.length) * 100) : null,
      humanTouched: humanMinutes.length,
      medianHumanMin,
      within1hPct,
      sequenceSent,
    },
  };
}
