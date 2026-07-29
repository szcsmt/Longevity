import type { Score } from './types';

/* Auto hot/warm/cold scoring from the form context, mirroring the CTA strategy
   in the handoff doc: a reserve intent (or picking a specific villa) is the
   hottest signal, an enquiry is warm, a brochure download is cold. */
export function scoreFor(formType?: string, formOrigin?: string): Score {
  const origin = (formOrigin || '').toLowerCase();
  if (origin.startsWith('villa')) return 'hot';

  switch (formType) {
    case 'reserve':
      return 'hot';
    case 'enquiry':
      // Enquiries opened from the investment / reserve areas run warmer.
      return origin.includes('investment') || origin.includes('reserve') ? 'hot' : 'warm';
    case 'brochure_request':
      return 'cold';
    default:
      return 'warm';
  }
}
