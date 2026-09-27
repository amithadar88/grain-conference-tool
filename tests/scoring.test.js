import {
  scoreAll, roundScore, tierFor, sizeRating, borderline, filterEvents,
  defaultCaptureConference, runningToday, gapDays, windowMonths, monthLabel,
  shortWhy, oneLineSummary,
} from '../js/scoring.js';

export default function scoringTests(t, data) {
  const confs = data.conferences.conferences;
  const scored = scoreAll(confs);
  const byId = (id) => scored.find((s) => s.id === id);

  t.group('Scoring');

  t.test('Money20/20 Europe = 98, A+ (sanity check from Decisions.md)', () => {
    t.eq([byId('money2020-europe-2027').score, byId('money2020-europe-2027').tier], [98, 'A+']);
  });
  t.test('EuroFinance = 95, A+', () => {
    t.eq([byId('eurofinance-2027').score, byId('eurofinance-2027').tier], [95, 'A+']);
  });
  t.test('PAY360 = 90, A+ only thanks to the cluster bonus (base 85)', () => {
    const s = byId('pay360-2027');
    t.eq([s.base, s.bonus, s.score, s.tier], [85, 5, 90, 'A+']);
  });
  t.test('MPE = 88, A; nearest cluster partner is DACT Treasury Fair (overlapping dates)', () => {
    const s = byId('mpe-2027');
    t.eq([s.score, s.tier, s.bonus], [88, 'A', 5]);
    t.eq([s.cluster.id, s.cluster.gap], ['dact-treasury-fair-2027', 0]);
  });
  t.test('IAMTN = 76, A (300 of the right people)', () => {
    t.eq([byId('iamtn-summit-2026').score, byId('iamtn-summit-2026').tier], [76, 'A']);
  });
  t.test('Money20/20 USA = 73, B, borderline, biggest drag = Travel (−10 pts)', () => {
    const s = byId('money2020-usa-2026');
    t.eq([s.score, s.tier, s.borderline, s.drag.text], [73, 'B', 'Borderline: 2 pts below A', 'Travel (−10 pts)']);
  });
  t.test('Web Summit = 39, D', () => {
    t.eq([byId('web-summit-2026').score, byId('web-summit-2026').tier], [39, 'D']);
  });
  t.test('CES = 8, D (140,000 irrelevant people are worth nothing)', () => {
    const s = byId('ces-2027');
    t.eq([s.score, s.tier, s.points.audienceSize], [8, 'D', 0]);
  });
  t.test('Rounding happens before the tier: 54.9999999 -> 55 -> B', () => {
    t.eq(tierFor(roundScore(54.9999999)).tier, 'B');
  });
  t.test('Float noise is cleaned before rounding: 72.49999999999 -> 73', () => {
    t.eq(roundScore(72.49999999999), 73);
  });
  t.test('Every seed size rating matches the attendee thresholds', () => {
    const wrong = confs.filter((c) => sizeRating(c.audienceSize) !== c.ratings.audienceSize.score).map((c) => c.id);
    t.eq(wrong, []);
  });
  t.test('IAMTN pros/cons/drag come from the ratings', () => {
    const s = byId('iamtn-summit-2026');
    t.eq(s.pros.map((p) => p.factor), ['icpFit', 'buyerAccess', 'audienceMarket', 'travelEffort']);
    t.eq(s.cons.map((p) => p.factor), ['audienceSize']);
    t.eq(s.drag.text, 'Audience size (−10 pts)');
  });
  t.test('Borderline labels', () => {
    t.eq([borderline(76), borderline(75), borderline(58), borderline(65)],
      ['Borderline: 1 pt above the A line', 'Borderline: right on the A line', 'Borderline: 3 pts above the B line', null]);
  });
  t.test('Cluster gap: overlapping events count as 0 days', () => {
    t.eq(gapDays({ startDate: '2027-01-01', endDate: '2027-01-05' }, { startDate: '2027-01-03', endDate: '2027-01-04' }), 0);
    t.eq(gapDays({ startDate: '2027-01-01', endDate: '2027-01-05' }, { startDate: '2027-01-12', endDate: '2027-01-13' }), 7);
  });
  t.test('Every score is a whole number between 0 and 100', () => {
    t.eq(scored.filter((s) => !Number.isInteger(s.score) || s.score < 0 || s.score > 100).map((s) => s.id), []);
  });

  t.group('Planning window');

  t.test('Window is Sep 2026 - Sep 2027 (13 months)', () => {
    const m = windowMonths();
    t.eq([m.length, monthLabel(m[0]), monthLabel(m[12])], [13, 'Sep 2026', 'Sep 2027']);
  });
  // Gaps now measure the team's plan (status/reps), not just the event list — see
  // tests/gaps.test.js and js/gaps.js.

  t.group('Event list');

  t.test('Default sort is by score, highest first', () => {
    t.eq(filterEvents(scored, {}).slice(0, 3).map((s) => s.id), ['money2020-europe-2027', 'eurofinance-2027', 'pay360-2027']);
  });
  t.test('Date sort starts with Sibos', () => {
    t.eq(filterEvents(scored, { sort: 'date' })[0].id, 'sibos-2026');
  });
  t.test('Filters combine: Europe + A+ gives the three must-attends', () => {
    t.eq(filterEvents(scored, { region: 'Europe', tier: 'A+' }).length, 3);
  });
  t.test('Search ignores case and accents', () => {
    t.ok(filterEvents(scored, { q: 'BERLÍN' }).some((s) => s.id === 'itb-berlin-2027'), 'finds ITB Berlin');
  });

  t.group('Capture preselect');

  t.test('Nothing running on 2026-09-26, so the next event (Sibos) is preselected', () => {
    t.eq([runningToday(confs, '2026-09-26'), defaultCaptureConference(confs, '2026-09-26').id], [null, 'sibos-2026']);
  });
  t.test('During Money20/20 Europe, it is the one running today', () => {
    const c = byId('money2020-europe-2027').conf;
    t.eq(defaultCaptureConference(confs, c.startDate).id, 'money2020-europe-2027');
  });

  t.group('One-line summary on the card');

  const conf = (scores, whys = {}) => ({
    id: 'x', name: 'X', region: 'Europe', startDate: '2027-01-10', endDate: '2027-01-11',
    ratings: Object.fromEntries(['icpFit', 'buyerAccess', 'audienceMarket', 'audienceSize', 'travelEffort']
      .map((k, i) => [k, { score: scores[i], why: whys[k] || `${k} reason` }])),
  });
  const one = (c) => oneLineSummary(scoreAll([c])[0]);

  t.test('Short why: drop brackets, keep the first clause', () => {
    t.eq([
      shortWhy('Very senior banking executives; meetings are possible but mostly bank-to-bank'),
      shortWhy('30,000+ attendees (diminishing returns)'),
      shortWhy('50,000+ double opt-in 1:1 meetings; 1,000+ CEOs and founders'),
      shortWhy('UK and European travel trade, Grain\'s home market'),
    ], ['Very senior banking executives', '30,000+ attendees', '50,000+ double opt-in 1:1 meetings', 'UK and European travel trade']);
  });
  t.test('Short why: long clauses are cut at a word, max 45 characters', () => {
    const s = shortWhy('Money transfer operators and cross-border payment companies: the densest ICP room in the list');
    t.eq(s, 'Money transfer operators and cross-border…');
    t.ok(s.length <= 45, 'at most 45 characters');
  });
  t.test('Strongest pro (most points among 4-5s) + biggest drag', () => {
    // buyerAccess 5 earns 30 pts, icpFit 4 earns 26.25: buyer access wins. Drag = audience market (rated 1, -15).
    t.eq(one(conf([4, 5, 1, 3, 4], { buyerAccess: 'Hosted buyers and CFOs; very senior' })), '✅ Hosted buyers and CFOs; very senior · 🔻 Drag: Audience market');
  });
  t.test('No pros -> only the drag', () => {
    t.eq(one(conf([3, 3, 1, 3, 3])), '🔻 Drag: ICP fit');
  });
  t.test('All 5s (no drag) -> only the pro', () => {
    t.eq(one(conf([5, 5, 5, 5, 5], { icpFit: 'All PSPs' })), '✅ All PSPs');
  });
  t.test('Real data: IAMTN', () => {
    t.eq(oneLineSummary(byId('iamtn-summit-2026')).startsWith('✅ Money transfer operators and cross-border payment companies: the densest ICP room in the list · 🔻 Drag: '), true);
  });
}
