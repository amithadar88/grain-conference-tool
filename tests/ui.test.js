import { esc, safeUrl, fmtRange, initials } from '../js/views/ui.js';
import { eventCardHTML, clusterBadge } from '../js/views/eventCard.js';
import { scoreAll } from '../js/scoring.js';
import { staffingChip, matchesPlanFilters } from '../js/views/plan.js';
import { eventPickerGroups } from '../js/views/capture.js';

export default function uiTests(t, data) {
  t.group('Display safety');

  t.test('Typed text is shown literally, never as HTML', () => {
    t.eq(esc('<b>AT&T</b> "quote" \'x\''), '&lt;b&gt;AT&amp;T&lt;/b&gt; &quot;quote&quot; &#39;x&#39;');
  });
  t.test('Only http(s) links are allowed', () => {
    t.eq([safeUrl('javascript:alert(1)'), safeUrl('https://x.com')], ['', 'https://x.com']);
  });
  t.test('Date ranges read naturally', () => {
    t.eq([fmtRange('2026-09-28', '2026-10-01'), fmtRange('2027-06-08', '2027-06-10'), fmtRange('2026-12-30', '2027-01-02')],
      ['28 Sep – 1 Oct 2026', '8–10 Jun 2027', '30 Dec 2026 – 2 Jan 2027']);
  });
  t.test('Header initials: up to the first two words, uppercased; empty for Team view', () => {
    t.eq([initials('Maya'), initials('Maya Cohen'), initials(''), initials(undefined)], ['M', 'MC', '', '']);
  });
  t.test('Event card escapes a hostile name and handles missing website/notes', () => {
    const conf = { ...data.conferences.conferences.find((c) => c.id === 'ces-2027'), name: '<img src=x onerror=alert(1)>', website: undefined, notes: undefined };
    const html = eventCardHTML(scoreAll([conf])[0], { today: '2026-09-26' });
    t.ok(!html.includes('<img'), 'no raw <img>');
    t.ok(!html.includes('undefined'), 'no "undefined" text');
  });
  t.test('Every seed event renders a card without "undefined"', () => {
    const bad = scoreAll(data.conferences.conferences).filter((s) => eventCardHTML(s, { today: '2026-09-26' }).includes('undefined')).map((s) => s.id);
    t.eq(bad, []);
  });

  t.group('Plan: staffing at a glance');

  t.test('Status + reps -> coloured chip text', () => {
    t.eq([
      staffingChip({ status: 'going', reps: ['Maya'] }),
      staffingChip({ status: 'considering', reps: ['Maya'] }),
      staffingChip({ status: 'going', reps: [] }),
      staffingChip({ status: 'skip', reps: ['Maya'] }),
      staffingChip({ status: 'going', reps: ['Maya', 'Daniel'] }),
    ], [
      { kind: 'going', text: '✓ Going · Maya' },
      { kind: 'considering', text: 'Considering · Maya' },
      { kind: 'going', text: '✓ Going' },
      { kind: 'skip', text: 'Skip · Maya' },
      { kind: 'going', text: '✓ Going · Maya, Daniel' },
    ]);
  });
  t.test('Reps but no decision yet -> neutral chip; nothing -> no chip', () => {
    t.eq([staffingChip({ status: null, reps: ['Yoni'] }), staffingChip({ status: null, reps: [] })], [{ kind: 'rep', text: 'Yoni' }, null]);
  });

  t.group('Plan: filters');

  const s = (tier) => ({ tier });
  t.test('Mine: only events where I\'m one of the assigned reps', () => {
    t.eq(matchesPlanFilters(s('B'), { status: null, reps: ['Maya', 'Daniel'] }, { mine: true, status: '', tier: '' }, 'Maya'), true);
    t.eq(matchesPlanFilters(s('B'), { status: null, reps: ['Daniel'] }, { mine: true, status: '', tier: '' }, 'Maya'), false);
  });
  t.test('Status: exact match, "undecided" means no status set', () => {
    t.eq(matchesPlanFilters(s('B'), { status: 'going', reps: [] }, { mine: false, status: 'going', tier: '' }, 'Maya'), true);
    t.eq(matchesPlanFilters(s('B'), { status: 'considering', reps: [] }, { mine: false, status: 'going', tier: '' }, 'Maya'), false);
    t.eq(matchesPlanFilters(s('B'), { status: null, reps: [] }, { mine: false, status: 'undecided', tier: '' }, 'Maya'), true);
    t.eq(matchesPlanFilters(s('B'), { status: 'going', reps: [] }, { mine: false, status: 'undecided', tier: '' }, 'Maya'), false);
  });
  t.test('Tier: "hide C & D" excludes only C and D', () => {
    const state = { mine: false, status: '', tier: 'hide-cd' };
    const plan = { status: null, reps: [] };
    t.eq(['A+', 'A', 'B', 'C', 'D'].map((tier) => matchesPlanFilters(s(tier), plan, state, 'Maya')), [true, true, true, false, false]);
  });
  t.test('Filters combine (all must pass)', () => {
    const plan = { status: 'going', reps: ['Maya'] };
    t.eq(matchesPlanFilters(s('C'), plan, { mine: true, status: 'going', tier: 'hide-cd' }, 'Maya'), false); // tier fails
    t.eq(matchesPlanFilters(s('B'), plan, { mine: true, status: 'going', tier: 'hide-cd' }, 'Maya'), true);
  });

  t.group('Cluster badge');

  t.test('Says what the +5 is for, with the exact gap on hover', () => {
    t.eq([clusterBadge({ name: 'CrossTech World', gap: 4 }), clusterBadge({ name: 'DACT', gap: 0 }), clusterBadge({ name: 'X', gap: 1 }), clusterBadge(null)], [
      { text: '🔗 +5 · same week as CrossTech World', title: 'Cluster bonus +5: CrossTech World is 4 days away, in the same region' },
      { text: '🔗 +5 · same days as DACT', title: 'Cluster bonus +5: DACT overlaps, in the same region' },
      { text: '🔗 +5 · same week as X', title: 'Cluster bonus +5: X is 1 day away, in the same region' },
      null,
    ]);
  });

  t.group('Capture: grouped event picker');

  const confs = data.conferences.conferences;
  const ids = (groups) => groups.map((g) => [g.label, g.label === 'All events' ? g.items.length : g.items.map((c) => c.id)]);

  t.test('My events, then Happening soon (next 30 days), then All events', () => {
    const plans = { 'wtm-london-2026': { reps: ['Maya'] }, 'sibos-2026': { reps: ['Yoni'] } };
    t.eq(ids(eventPickerGroups(confs, (id) => plans[id] || {}, 'Maya', '2026-09-26')), [
      ['My events', ['wtm-london-2026']],
      ['Happening soon', ['sibos-2026', 'iamtn-summit-2026', 'money2020-usa-2026', 'itb-asia-2026']],
      ['All events', confs.length],
    ]);
  });
  t.test('Nothing assigned to me -> no "My events" group; an event running today counts as soon', () => {
    const g = eventPickerGroups(confs, () => ({}), 'Maya', '2026-09-29');
    t.eq([g[0].label, g[0].items[0].id], ['Happening soon', 'sibos-2026']);
  });
}
