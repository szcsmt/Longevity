import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* Normalising a source value.

   `fb`, `Facebook`, `FB_ads` and `l.facebook.com` used to be four rows in a
   report with room for eight, so the scattered spelling did not merely look
   untidy — it HID the performance of whichever channel produced the most.

   The tests that matter here are the ones about not over-matching. `ig` must
   fold into Instagram and `signup` must not, which is the whole reason short
   aliases live in an exact list and long ones in a substring list. */

const { sourceKey, sourceLabel, leadSource, rawSource, SOURCES, OTHER } =
  await import('../lib/crm/sources');

describe('folding the spellings together', () => {
  it('collects every way somebody writes Facebook', () => {
    for (const raw of ['fb', 'FB', 'Facebook', 'facebook_ads', 'FB-Ads', 'fb ads', 'l.facebook.com', 'FBCLID']) {
      assert.equal(sourceKey(raw), 'facebook', `${raw} is Facebook`);
    }
  });

  it('does the same for Google, Instagram and TikTok', () => {
    assert.equal(sourceKey('google_ads'), 'google');
    assert.equal(sourceKey('AdWords'), 'google');
    assert.equal(sourceKey('gclid'), 'google');
    assert.equal(sourceKey('ig'), 'instagram');
    assert.equal(sourceKey('Instagram Stories'), 'instagram');
    assert.equal(sourceKey('tiktok_ads'), 'tiktok');
  });

  it('keeps Facebook and Instagram apart, because a marketer buys them separately', () => {
    assert.notEqual(sourceKey('facebook'), sourceKey('instagram'));
  });

  it('does not swallow a word that merely contains a short alias', () => {
    // 'ig' is Instagram; 'signup' is not.
    assert.equal(sourceKey('signup'), OTHER);
    assert.equal(sourceKey('digital-brochure'), OTHER);
    // 'g' is Google; 'gift' is not.
    assert.equal(sourceKey('gift-voucher'), OTHER);
  });

  it('treats nothing at all as direct', () => {
    for (const raw of ['', '   ', 'direct', '(direct)', 'none', null, undefined]) {
      assert.equal(sourceKey(raw as string), 'direct', `${JSON.stringify(raw)} is direct`);
    }
  });

  it('sends anything unrecognised to other rather than guessing', () => {
    assert.equal(sourceKey('some-blog-we-never-heard-of'), OTHER);
    assert.equal(sourceLabel(OTHER), 'Other');
  });

  it('gives every definition a label', () => {
    for (const def of SOURCES) assert.ok(def.label.length > 0, `${def.id} needs a label`);
  });
});

describe('what a lead is grouped under', () => {
  it('prefers the explicit source over the UTM one', () => {
    assert.equal(rawSource({ source: 'Roadshow', utm_source: 'fb' }), 'Roadshow');
    assert.equal(leadSource({ source: 'Roadshow', utm_source: 'fb' }), 'event');
  });

  it('falls back to the UTM value', () => {
    assert.equal(leadSource({ utm_source: 'FB_Ads' }), 'facebook');
  });

  it('calls a lead with neither direct', () => {
    assert.equal(rawSource({}), 'direct');
    assert.equal(leadSource({}), 'direct');
  });

  it('never rewrites the raw value it was given', () => {
    // The normalised key is a grouping; the raw string is evidence, and the day
    // the mapping turns out wrong it is what the redo is done from.
    const lead = { source: 'FB_Ads' };
    assert.equal(leadSource(lead), 'facebook');
    assert.equal(lead.source, 'FB_Ads');
  });
});
