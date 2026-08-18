import { CURRENCIES } from './types';

/* ══════════════════ Comparing budgets in different currencies ══════════════════

   A buyer's budget is stored in the money they actually said — converting it at
   the moment they said it would lose what they told us. That is right for the
   record and awkward for a question like "show me everyone with 10M THB or
   more", where four currencies have to be lined up somehow.

   So: rates are CONFIGURATION, and there are no defaults. `CRM_FX="EUR:38,
   USD:35,GBP:44"` means one euro is worth 38 baht. With nothing configured the
   CRM does not invent a rate — it compares within a single currency and says on
   screen that this is what it is doing. An invented rate would make a filter
   look complete while quietly hiding buyers, which is worse than a filter that
   admits its own limits. */

export const BASE = 'THB';

export type Rates = Record<string, number>;

/** Parsed once per call; the string is tiny and this is not a hot path. */
export function fxRates(): Rates {
  const out: Rates = { [BASE]: 1 };
  for (const pair of (process.env.CRM_FX || '').split(',')) {
    const [code, value] = pair.split(':');
    const c = (code || '').trim().toUpperCase();
    const n = Number((value || '').trim());
    if ((CURRENCIES as readonly string[]).includes(c) && Number.isFinite(n) && n > 0) out[c] = n;
  }
  return out;
}

export const hasRates = (rates: Rates = fxRates()): boolean => Object.keys(rates).length > 1;

/** The amount in baht, or **undefined** when no rate is configured for that
    currency. Undefined is the point: a missing rate must exclude the lead from
    a comparison rather than quietly treating its number as baht. */
export function toBase(amount: number, currency?: string, rates: Rates = fxRates()): number | undefined {
  const code = (currency || BASE).toUpperCase();
  const rate = rates[code];
  return rate === undefined ? undefined : Math.round(amount * rate);
}
