import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Lead } from '../lib/crm/types';

/* Two scores, kept apart.

   Mixing "can they buy" with "are they talking to us" produces the two most
   expensive mistakes in a pipeline. A buyer with the money and the timing who
   has gone quiet reads as cold and gets dropped, when they are the most
   valuable name on the list. Somebody who replies to everything and cannot
   afford an entry-level villa reads as hot and eats a fortnight.

   Both are derived, so these tests are pure arithmetic over a known lead. */

const {
  fitScore, engagementScore, scoreVerdict, entryPrice, FIT_MAX, ENGAGEMENT_MAX,
} = await import('../lib/crm/scores');

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'x', stage: 'new', score: 'warm', notes: [], tasks: [],
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const ev = (kind: string, detail = '', reached?: boolean) =>
  ({ id: Math.random().toString(36), kind, detail, at: '2026-02-01T00:00:00.000Z', reached }) as never;

describe('fit', () => {
  it('measures the budget against the cheapest villa, not an invented number', () => {
    /* The threshold moves by itself when the price list does, which is the
       point of deriving it rather than typing it in. */
    const entry = entryPrice();
    const rich = fitScore(lead({ qualification: { budget: entry, currency: 'THB' } }));
    const poor = fitScore(lead({ qualification: { budget: entry - 1, currency: 'THB' } }));

    assert.ok(rich.reasons.some((r) => /elég egy belépő szintű villára/.test(r)));
    assert.ok(poor.reasons.some((r) => /a belépő ár alatt/.test(r)));
    assert.ok(rich.value > poor.value);
  });

  it('neither credits nor penalises a budget it cannot compare', () => {
    // Recorded in euros with no rate configured: we know the number and cannot
    // line it up, and guessing either way would be a guess.
    const s = fitScore(lead({ qualification: { budget: 300_000, currency: 'EUR' } }));
    assert.ok(s.reasons.some((r) => /nem összehasonlítható/.test(r)));
    assert.equal(s.missing.includes('keret'), false, 'it is answered, just not comparable');
  });

  it('separates a low score from an unknown one', () => {
    const blank = fitScore(lead());
    assert.equal(blank.value, 0);
    assert.equal(blank.missing.length, 6, 'six things nobody has asked');

    const answered = fitScore(lead({
      villa: 'Residence L',
      qualification: { budget: 1, currency: 'THB', timeframe: '12+', purpose: 'lifestyle', financing: 'financing', decision: 'shared' },
    }));
    assert.deepEqual(answered.missing, [], 'everything asked, and the answers are simply weak');
    assert.ok(answered.value < FIT_MAX / 2);
  });

  it('reaches the top on a cash buyer who wants a specific villa this quarter', () => {
    const s = fitScore(lead({
      villa: 'Residence XL',
      qualification: {
        budget: 20_000_000, currency: 'THB', timeframe: '0-3',
        purpose: 'investment', financing: 'cash', decision: 'sole',
      },
    }));
    assert.equal(s.value, FIT_MAX);
    assert.equal(s.band, 'high');
  });
});

describe('engagement', () => {
  it('counts nothing the CRM did by itself', () => {
    const s = engagementScore(lead({
      history: [ev('email', 'Email sent — awaiting reply'), ev('call', 'Called, no answer', false)],
    }));
    assert.equal(s.value, 0, 'an automated e-mail and a call that rang out are not engagement');
  });

  it('counts a real conversation and a reply', () => {
    const s = engagementScore(lead({
      history: [ev('call', 'Spoke by phone', true), ev('email', 'Reply received — they asked about the pool')],
    }));
    assert.deepEqual(s.reasons.sort(), ['Spoke to us', 'Wrote back']);
  });

  it('weighs a site visit heaviest', () => {
    const visited = engagementScore(lead({ history: [ev('visit', 'Site visit', true)] }));
    const spoke = engagementScore(lead({ history: [ev('call', 'Spoke by phone', true)] }));
    assert.ok(visited.value > spoke.value);
  });

  it('does not multiply for repetition', () => {
    /* Somebody who opened the brochure nine times is interested, not nine times
       more interested than somebody who opened it once. */
    const once = engagementScore(lead({ history: [ev('download', 'Opened: Brochure')] }));
    const nine = engagementScore(lead({
      history: Array.from({ length: 9 }, () => ev('download', 'Opened: Brochure')),
    }));
    assert.equal(once.value, nine.value);
  });

  it('tells a booked call from a cancelled one', () => {
    const booked = engagementScore(lead({ history: [ev('message', 'Call booked for 2026-03-01 10:00 UTC')] }));
    const cancelled = engagementScore(lead({ history: [ev('message', 'Call cancelled')] }));
    assert.ok(booked.reasons.includes('Booked a call'));
    assert.equal(cancelled.reasons.includes('Booked a call'), false);
  });

  it('has a ceiling that everything can add up to', () => {
    const s = engagementScore(lead({
      history: [
        ev('visit', 'Site visit', true), ev('call', 'Spoke by phone', true),
        ev('message', 'They wrote on WhatsApp'), ev('message', 'Call booked for later'),
        ev('download', 'Opened: Brochure'), ev('click', 'Clicked the price list'),
      ],
    }));
    assert.equal(s.value, ENGAGEMENT_MAX);
  });
});

describe('the bands', () => {
  it('does not call a site visit low engagement', () => {
    /* Engagement signals are lumpy in a way fit answers are not: somebody who
       flew to Samui and stood on the plot is deeply engaged on ONE signal. */
    assert.equal(engagementScore(lead({ history: [ev('visit', 'Site visit', true)] })).band, 'medium');
    assert.equal(engagementScore(lead({ history: [ev('email', 'Reply received')] })).band, 'medium');
    assert.equal(engagementScore(lead({ history: [ev('click', 'Clicked')] })).band, 'low');
  });

  it('calls any two real signals high', () => {
    const s = engagementScore(lead({
      history: [ev('visit', 'Site visit', true), ev('call', 'Spoke by phone', true)],
    }));
    assert.equal(s.band, 'high');
  });
});

describe('reading the two together', () => {
  it('names the most valuable lead on the list', () => {
    const fit = fitScore(lead({
      villa: 'Residence L',
      qualification: { budget: 20_000_000, currency: 'THB', timeframe: '0-3', purpose: 'investment', financing: 'cash', decision: 'sole' },
    }));
    const quiet = engagementScore(lead());
    assert.match(scoreVerdict(fit, quiet), /elhallgatott/);
  });

  it('names the one that eats a fortnight', () => {
    const poor = fitScore(lead({
      qualification: { budget: 1_000, currency: 'THB', timeframe: '12+', purpose: 'lifestyle', financing: 'financing', decision: 'shared' },
    }));
    const chatty = engagementScore(lead({
      history: [ev('visit', 'Site visit', true), ev('call', 'Spoke by phone', true), ev('download', 'Opened: Brochure')],
    }));
    assert.match(scoreVerdict(poor, chatty), /nem tud venni/);
  });

  it('says "qualify them" rather than "low" when nobody has asked anything', () => {
    assert.match(scoreVerdict(fitScore(lead()), engagementScore(lead())), /Túl keveset tudunk/);
  });
});
