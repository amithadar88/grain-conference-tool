import { createStore, memoryStorage } from '../js/store.js';
import { computeGaps } from '../js/gaps.js';
import { gapsHTML, unassignedLine, verticalLines, quarterLines, regionsLine, monthsLine } from '../js/views/plan.js';

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
  t.test('Core verticals with an A/B event but none marked Going: only "fx" (TradeTech FX is B-tier, not staffed), with its events attached', () => {
    const g = computeGaps(fresh());
    t.eq(g.verticals.map((v) => v.vertical), ['fx']);
    t.eq(g.verticals[0].events.map((s) => s.id), ['tradetech-fx-2027']);
  });
  t.test('Marking an fx event Going closes that gap', () => {
    const store = fresh();
    store.setConferencePlan('tradetech-fx-2027', { status: 'going', reps: ['Daniel'] });
    t.eq(computeGaps(store).verticals, []);
  });
  t.test('Quarters with no Going event at all: Q3 2026 (partial), Q2 2027, Q3 2027 — Q4 2026 and Q1 2027 are covered by the baseline; each carries every event in that quarter, highest-scored first', () => {
    const g = computeGaps(fresh());
    t.eq(g.quarters.map((q) => q.quarter), ['2026 Q3', '2027 Q2', '2027 Q3']);
    const q2 = g.quarters.find((q) => q.quarter === '2027 Q2');
    t.eq(q2.events[0].id, 'money2020-europe-2027'); // score 98, highest in that quarter
    t.ok(q2.events.every((s, i) => i === 0 || s.score <= q2.events[i - 1].score), 'sorted highest-scored first');
  });
  t.test('Regions with no A-tier event at all, plus every event in those regions, highest-scored first', () => {
    const g = computeGaps(fresh());
    t.eq(g.regionNames, ['North America', 'Middle East', 'Asia-Pacific']);
    t.ok(g.regionEvents.every((s) => g.regionNames.includes(s.conf.region)), 'only events from the flagged regions');
    t.ok(g.regionEvents.every((s, i) => i === 0 || s.score <= g.regionEvents[i - 1].score), 'sorted highest-scored first');
  });
  t.test('Quiet months: no A/B event at all — includes the user\'s own example (Dec, Jul, Aug)', () => {
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

  t.group('Gaps text: facts and concrete next steps, at most 3 named events per line (real seed data)');

  t.test('Unassigned line: true count, at most 3 names, a concrete action', () => {
    const g = computeGaps(fresh());
    const line = unassignedLine(g);
    t.ok(line.startsWith('8 A+/A events with nobody assigned:'), 'states the true count (8), not just the 3 named');
    t.eq((line.match(/<a /g) || []).length, 3, 'at most 3 named events');
    t.ok(line.includes('ITB Berlin 2027'), 'names the earliest one');
    t.ok(line.endsWith('Assign someone or mark Skip.'), 'a concrete next step, not just a fact');
    t.ok(!line.includes('top event'), 'no vague "top event" label — states the tier directly (A+/A)');
  });
  t.test('Vertical line: label, true count, named events, no manual writing', () => {
    const g = computeGaps(fresh());
    const [line] = verticalLines(g);
    t.eq(line, 'FX: 1 A/B event, none marked Going: <a href="#events/tradetech-fx-2027">TradeTech FX 2027</a>.');
  });
  t.test('Quarter line: "Q<n> <year>" order, fact then highest-scored options, capped at 3', () => {
    const g = computeGaps(fresh());
    const lines = quarterLines(g);
    t.eq(lines[0].startsWith('Q3 2026: no events marked Going.'), true, 'quarter label reads "Q<n> <year>", not the internal "<year> Q<n>"');
    const q2Line = lines.find((l) => l.startsWith('Q2 2027'));
    t.eq((q2Line.match(/<a /g) || []).length, 3, 'at most 3 named options even though 12 events exist in Q2 2027');
    t.ok(q2Line.includes('Money20/20 Europe 2027 (A+ 98)'), 'names the highest-scored option with its tier and score');
  });
  t.test('Regions line: named regions, then highest-scored options there, capped at 3', () => {
    const g = computeGaps(fresh());
    const line = regionsLine(g);
    t.ok(line.startsWith('No A-tier events in North America, Middle East, Asia-Pacific.'), 'states the fact plainly, no interpretation');
    t.eq((line.match(/<a /g) || []).length, 3, 'at most 3 named options');
  });
  t.test('Months line: fact only, no "quiet season" or any other interpretation', () => {
    const g = computeGaps(fresh());
    t.eq(monthsLine(g), 'No A/B events in: Sep 2026, Dec 2026, Jan 2027, Jul 2027, Aug 2027.');
  });
  t.test('No interpretive language anywhere in the full Gaps box', () => {
    const html = gapsHTML(computeGaps(fresh()));
    t.ok(!/quiet season|market note/i.test(html), 'no labels the data can\'t prove');
  });
  t.test('A line with nothing to report is omitted, not shown empty', () => {
    const store = fresh();
    store.setConferencePlan('tradetech-fx-2027', { status: 'going', reps: ['Daniel'] });
    t.eq(verticalLines(computeGaps(store)), []);
  });
}
