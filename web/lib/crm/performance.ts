import type { Lead, Stage } from './types';
import { LOST_REASONS, STAGES, atOrBeyond, isOpenStage, stageIndex } from './types';
import { firstConversationAt, matchesFlag, stageEnteredAt } from './rules';

/* ══════════════════ What the head of sales needs to know ══════════════════

   Pure: every figure here is derived from a list of leads, nothing is fetched,
   and the whole module can be tested without a database.

   It exists because most of this was already being computed and thrown away.
   `reports()` in the store worked out source-by-source win rates and revenue on
   every call and was rendered by no page at all; the funnel on the analytics
   screen counted stages but never the drop between them, which is the only part
   anybody acts on.

   Deliberately NOT here: anything the analytics page already answers well
   (inventory, traffic, campaign volume). Two screens computing the same number
   two ways is how a management meeting turns into an argument about the CRM. */

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const pct = (n: number, of: number): number => (of ? Math.round((n / of) * 100) : 0);

const groupBy = (leads: Lead[], key: (l: Lead) => string): Map<string, Lead[]> => {
  const m = new Map<string, Lead[]>();
  for (const l of leads) {
    const k = key(l);
    const bucket = m.get(k);
    if (bucket) bucket.push(l);
    else m.set(k, [l]);
  }
  return m;
};

/* ── The funnel, with the drop between the steps ──

   "How many reached Qualified" is a number. "Two thirds of the leads that got a
   presentation never reached a viewing" is a decision. Only the second one is
   worth a meeting, and it is the one the old funnel could not produce.

   Counted as REACHED, not "is sitting in": a lead now at Negotiation reached
   every stage before it. Lost deals are excluded from progression and reported
   separately — a deal that died at Presentation did reach Presentation, and
   `lostHere` is where it is counted. */
export interface FunnelStep {
  stage: Stage;
  label: string;
  blurb: string;
  reached: number;
  /** Of everything that entered the funnel. */
  ofTotal: number;
  /** Of whatever reached the previous stage — the drop-off that matters. */
  ofPrevious: number | null;
  /** Deals lost while sitting in this stage. Only counts leads whose loss was
      recorded with a stage (`lost_from`); see `lostStageKnown`. */
  lostHere: number;
}

export interface PersonRow {
  name: string;
  leads: number;
  live: number;
  won: number;
  wonValue: number;
  pipelineValue: number;
  conversion: number;
  /** Live leads of theirs that are asking for attention right now. */
  needsAttention: number;
}

export interface SourceRow {
  source: string;
  leads: number;
  qualified: number;
  reserved: number;
  won: number;
  wonValue: number;
  /** Of decided deals — won and lost. A source with nothing decided yet has
      no win rate, and showing 0% for it would libel a campaign that is simply
      young. */
  winRate: number | null;
}

export interface LostRow {
  reason: string;
  label: string;
  count: number;
  ofLost: number;
}

export interface Performance {
  total: number;
  open: number;
  won: number;
  lost: number;
  wonValue: number;
  pipelineValue: number;
  /** Median days from arriving to being sold. */
  cycleDays: number | null;
  /** Median hours from arriving to somebody actually speaking to them. */
  firstContactHours: number | null;
  funnel: FunnelStep[];
  /** How many lost deals recorded which stage they died in. Everything before
      `lost_from` existed did not, and `lostHere` under-counts by exactly this
      difference — said out loud rather than quietly. */
  lostStageKnown: number;
  bySalesperson: PersonRow[];
  bySource: SourceRow[];
  lostReasons: LostRow[];
  attention: { uncontacted: number; overdue: number; noNext: number; stalled: number };
}

/** A lead nobody owns gets its own row rather than being dropped: it is the
    most important thing on this screen, not a rounding error. */
export const UNASSIGNED = '— unassigned —';

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function performance(leads: Lead[], today = new Date().toISOString().slice(0, 10)): Performance {
  const live = leads.filter((l) => !l.archived_at);
  const won = live.filter((l) => l.stage === 'won');
  const lost = live.filter((l) => l.stage === 'lost');
  const open = live.filter((l) => isOpenStage(l.stage));

  /* ── Funnel ──
     A lost deal still reached the stages it passed through, so it counts
     towards `reached` up to wherever it died — otherwise every drop-off reads
     as if the deals had evaporated rather than been lost somewhere specific. */
  const furthest = (l: Lead): number =>
    l.stage === 'lost' ? stageIndex(l.lost_from || 'new') : stageIndex(l.stage);

  const steps = STAGES.filter((s) => s.id !== 'lost');
  const funnel: FunnelStep[] = steps.map((s, i) => {
    const reached = live.filter((l) => furthest(l) >= i).length;
    const previous = i === 0 ? null : live.filter((l) => furthest(l) >= i - 1).length;
    return {
      stage: s.id,
      label: s.label,
      blurb: s.blurb,
      reached,
      ofTotal: pct(reached, live.length),
      ofPrevious: previous === null ? null : pct(reached, previous),
      lostHere: lost.filter((l) => l.lost_from === s.id).length,
    };
  });

  /* ── Cycle and speed ──
     Cycle: arriving to sold. `stageEnteredAt` on a won lead IS the moment it
     was won, because that was its last stage change. */
  const cycleDays = median(
    won
      .map((l) => (new Date(stageEnteredAt(l)).getTime() - new Date(l.created_at).getTime()) / DAY)
      .filter((d) => d >= 0)
      .map(Math.round),
  );

  const firstContactHours = median(
    live
      .map((l) => {
        const at = firstConversationAt(l);
        return at ? (new Date(at).getTime() - new Date(l.created_at).getTime()) / HOUR : null;
      })
      .filter((h): h is number => h !== null && h >= 0)
      .map((h) => Math.round(h * 10) / 10),
  );

  // ── By salesperson ──
  const people = groupBy(live, (l) => l.owner || UNASSIGNED);
  const bySalesperson: PersonRow[] = [...people.entries()]
    .map(([name, mine]) => {
      const theirWon = mine.filter((l) => l.stage === 'won');
      const theirOpen = mine.filter((l) => isOpenStage(l.stage));
      return {
        name,
        leads: mine.length,
        live: theirOpen.length,
        won: theirWon.length,
        wonValue: theirWon.reduce((n, l) => n + (l.value || 0), 0),
        pipelineValue: theirOpen
          .filter((l) => atOrBeyond(l.stage, 'qualified'))
          .reduce((n, l) => n + (l.value || 0), 0),
        conversion: pct(theirWon.length, mine.length),
        needsAttention: theirOpen.filter((l) =>
          matchesFlag(l, 'uncontacted', today) || matchesFlag(l, 'overdue', today) ||
          matchesFlag(l, 'nonext', today) || matchesFlag(l, 'stalled', today),
        ).length,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.live - a.live);

  /* ── By source ──
     The chain the marketing spend is judged on: leads → qualified → reserved →
     sold → money. Volume alone says nothing; a source that produces forty
     cheap leads and no buyers costs more than one that produces four. */
  const sources = groupBy(live, (l) => l.source || l.utm_source || 'direct');
  const bySource: SourceRow[] = [...sources.entries()]
    .map(([source, mine]) => {
      const w = mine.filter((l) => l.stage === 'won');
      const decided = w.length + mine.filter((l) => l.stage === 'lost').length;
      return {
        source,
        leads: mine.length,
        /* Reached qualification at some point — including the deals that got
           there and were then lost, which is exactly what a source should be
           credited with producing. */
        qualified: mine.filter(
          (l) => atOrBeyond(l.stage, 'qualified') || (l.lost_from ? atOrBeyond(l.lost_from, 'qualified') : false),
        ).length,
        reserved: mine.filter((l) => atOrBeyond(l.stage, 'reserved')).length,
        won: w.length,
        wonValue: w.reduce((n, l) => n + (l.value || 0), 0),
        winRate: decided ? pct(w.length, decided) : null,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.leads - a.leads);

  /* ── Why we lose ──
     Read from the structured `lost_reason`, not from the "Lost: …" note text
     that used to feed this. A report that parses prose breaks the first time
     somebody types the note by hand. */
  const lostCounts = new Map<string, number>();
  for (const l of lost) {
    const key = l.lost_reason || 'unrecorded';
    lostCounts.set(key, (lostCounts.get(key) || 0) + 1);
  }
  const lostReasons: LostRow[] = [...lostCounts.entries()]
    .map(([reason, count]) => ({
      reason,
      label: LOST_REASONS.find((r) => r.id === reason)?.label || 'No reason recorded',
      count,
      ofLost: pct(count, lost.length),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: live.length,
    open: open.length,
    won: won.length,
    lost: lost.length,
    wonValue: won.reduce((n, l) => n + (l.value || 0), 0),
    pipelineValue: open
      .filter((l) => atOrBeyond(l.stage, 'qualified'))
      .reduce((n, l) => n + (l.value || 0), 0),
    cycleDays,
    firstContactHours,
    funnel,
    lostStageKnown: lost.filter((l) => l.lost_from).length,
    bySalesperson,
    bySource,
    lostReasons,
    attention: {
      uncontacted: live.filter((l) => matchesFlag(l, 'uncontacted', today)).length,
      overdue: live.filter((l) => matchesFlag(l, 'overdue', today)).length,
      noNext: live.filter((l) => matchesFlag(l, 'nonext', today)).length,
      stalled: live.filter((l) => matchesFlag(l, 'stalled', today)).length,
    },
  };
}
