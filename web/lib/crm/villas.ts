/* The villa catalogue — mirrors the Residences section on the marketing site
   (components/villas-section.tsx). Prices are THB list prices; keep the two
   files in sync when pricing changes. */

export interface Villa {
  name: string;
  size: string;   // the tier code used by the unit catalogue: M / L / XL
  built: string;  // the residence itself
  plot: string;   // the land it sits on
  price: number;  // THB
}

/* ── The one price table ──

   These three numbers used to exist twice: here, keyed by name, and again in
   analytics.ts keyed by size tier. Two sources of truth for the same figure,
   and changing one would have left the other quietly reporting the old price
   in every financial chart. `size` is what joins this to the unit catalogue,
   so the tier lookup no longer needs a second copy of the numbers. */
export const VILLAS: Villa[] = [
  { name: 'Residence M',  size: 'M',  built: '80.5 m²',  plot: '105 m²',   price: 7_650_000 },
  { name: 'Residence L',  size: 'L',  built: '83.72 m²', plot: '116 m²',   price: 8_050_000 },
  { name: 'Residence XL', size: 'XL', built: '110.1 m²', plot: '144.9 m²', price: 11_200_000 },
];

/** List price for a tier code (M / L / XL). Undefined for anything else — the
    A block carries no tier, and inventing one for it would be a guess about
    money. */
export const priceForSize = (size?: string): number | undefined =>
  size ? VILLAS.find((v) => v.size === size)?.price : undefined;

export const SIZES: string[] = VILLAS.map((v) => v.size);

/** Match a lead's free-text villa field to the catalogue (case-insensitive). */
export function villaByName(name?: string): Villa | undefined {
  const n = (name || '').trim().toLowerCase();
  if (!n) return undefined;
  return VILLAS.find((v) => v.name.toLowerCase() === n) ||
    VILLAS.find((v) => n.includes(v.name.toLowerCase()));
}

export const fmtTHB = (n: number) => `THB ${n.toLocaleString('en-US')}`;

/** Compact money for stat tiles: THB 7.65M */
export const fmtTHBShort = (n: number) =>
  n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0)}M`
  : n >= 1_000 ? `฿${Math.round(n / 1_000)}k`
  : `฿${n}`;

/* ── Payment-schedule helpers ──

   Every one of these reads the schedule the UNIT is sold on (`scheduleFor`),
   not a global constant. A buyer who negotiated different terms keeps them, and
   changing the house schedule next year cannot rewrite what anybody already
   agreed. */

import type { PhaseDef, PhaseKey, VillaRecord } from './types';
import { scheduleFor } from './schedule';

/** THB due for one phase — explicit override wins, else pct × contract value. */
export function phaseAmount(rec: VillaRecord, key: PhaseKey): number {
  const override = rec.phases?.[key]?.amount;
  if (override) return override;
  const def = scheduleFor(rec).find((p) => p.key === key);
  return def && rec.contractValue ? Math.round((def.pct / 100) * rec.contractValue) : 0;
}

/** Total THB received so far across paid phases. */
export function paidTotal(rec: VillaRecord): number {
  return scheduleFor(rec).reduce((sum, p) => sum + (rec.phases?.[p.key]?.paid ? phaseAmount(rec, p.key) : 0), 0);
}

/** The next unpaid milestone, or null when the schedule is complete. */
export function nextPhase(rec: VillaRecord): PhaseDef | null {
  return scheduleFor(rec).find((p) => !rec.phases?.[p.key]?.paid) || null;
}

/** Common extras offered to buyers — free-text custom items are also allowed. */
export const EXTRA_PRESETS = [
  'Podcast studio',
  'Office setup',
  'Gym corner',
  'Sauna',
  'Outdoor kitchen',
  'EV charger',
];
