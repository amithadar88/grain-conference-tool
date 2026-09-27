import { createStore, memoryStorage } from '../js/store.js';
import { computeGaps } from '../js/gaps.js';

export default function gapsTests(t, data) {
  const seed = { conferences: data.conferences, contacts: data.contacts };
  const fresh = () => createStore({ seed, storage: memoryStorage(), prefix: 'grain.test.' });

  t.group('Gaps measure the team\'s plan (expected values from the real data + seed baseline)');

  t.test('Top-tier (A+/A) events with nobody assigned', () => {
    const g = computeGaps(fresh());
    t.eq(g.unassigned.map((s) => s.id), [
      'itb-berlin-2027', 'pay360-2027', 'act-annual-2027', 'finanzsymposium-2027',
      'money2020-europe-2027', 'phocuswright-europe-2027', 'traveltech-show-2027', 'eurofinance-2027',
    ]);
  });
  t.test('Assigning someone removes an event from "unassigned", regardless of status', () => {
    const store = fresh();
    store.setConferencePlan('pay360-2027', { status: null, reps: ['Daniel'] }); // no decision yet, but someone owns it
    const g = computeGaps(store);
    t.ok(!g.unassigned.some((s) => s.id === 'pay360-2027'), 'pay360 no longer unassigned');
  });
  t.test('Core verticals with an A/B event but none marked Going: only "fx" (TradeTech FX is B-tier, not staffed)', () => {
    const g = computeGaps(fresh());
    t.eq(g.verticals, ['fx']);
  });
  t.test('Marking an fx event Going closes that gap', () => {
    const store = fresh();
    store.setConferencePlan('tradetech-fx-2027', { status: 'going', reps: ['Daniel'] });
    t.eq(computeGaps(store).verticals, []);
  });
  t.test('Quarters with no Going event at all: Q3 2026 (partial), Q2 2027, Q3 2027 — Q4 2026 and Q1 2027 are covered by the baseline', () => {
    const g = computeGaps(fresh());
    t.eq(g.quarters, ['2026 Q3', '2027 Q2', '2027 Q3']);
  });
  t.test('Market notes: regions with no A-tier event at all (unchanged from before, informational)', () => {
    const g = computeGaps(fresh());
    t.eq(g.regions, ['North America', 'Middle East', 'Asia-Pacific']);
  });
  t.test('Quiet months: no A/B event at all — informational, includes the user\'s own example (Dec, Jul, Aug)', () => {
    const g = computeGaps(fresh());
    t.eq(g.quietMonths, ['2026-09', '2026-12', '2027-01', '2027-07', '2027-08']);
    t.ok(['2026-12', '2027-07', '2027-08'].every((m) => g.quietMonths.includes(m)), 'Dec/Jul/Aug are quiet months');
  });
  t.test('Resetting the overlay goes back to the seed baseline gaps', () => {
    const store = fresh();
    store.setConferencePlan('pay360-2027', { status: 'going', reps: ['Daniel'] });
    store.resetOverlay();
    t.ok(computeGaps(store).unassigned.some((s) => s.id === 'pay360-2027'), 'back to unassigned after reset');
  });
}
