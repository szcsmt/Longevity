/* The villa catalogue — mirrors the Residences section on the marketing site
   (components/villas-section.tsx). Prices are THB list prices; keep the two
   files in sync when pricing changes. */

export interface Villa {
  name: string;
  built: string;  // the residence itself
  plot: string;   // the land it sits on
  price: number;  // THB
}

export const VILLAS: Villa[] = [
  { name: 'Residence M',  built: '80.5 m²',  plot: '105 m²',   price: 7_650_000 },
  { name: 'Residence L',  built: '83.72 m²', plot: '116 m²',   price: 8_050_000 },
  { name: 'Residence XL', built: '110.1 m²', plot: '144.9 m²', price: 11_200_000 },
];

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

/* ── Payment-schedule helpers (7/43/40/10 of the contract value) ── */

import type { PhaseKey, VillaRecord } from './types';
import { PHASES } from './types';

/** THB due for one phase — explicit override wins, else pct × contract value. */
export function phaseAmount(rec: VillaRecord, key: PhaseKey): number {
  const override = rec.phases?.[key]?.amount;
  if (override) return override;
  const def = PHASES.find((p) => p.key === key);
  return def && rec.contractValue ? Math.round((def.pct / 100) * rec.contractValue) : 0;
}

/** Total THB received so far across paid phases. */
export function paidTotal(rec: VillaRecord): number {
  return PHASES.reduce((sum, p) => sum + (rec.phases?.[p.key]?.paid ? phaseAmount(rec, p.key) : 0), 0);
}

/** The next unpaid milestone, or null when the schedule is complete. */
export function nextPhase(rec: VillaRecord): (typeof PHASES)[number] | null {
  return PHASES.find((p) => !rec.phases?.[p.key]?.paid) || null;
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
