import { createStore, memoryStorage } from '../js/store.js';
import { dayNumber } from '../js/scoring.js';
import { actNowRows, comingUpRows, yourNextTrip, nextTeamTrips } from '../js/today.js';

const TODAY = '2026-09-26';

export default function todayTests(t, data) {
  const seed = { conferences: data.conferences, contacts: data.contacts };
  const fresh = () => createStore({ seed, storage: memoryStorage(), prefix: 'grain.test.' });

  t.group('Today: Act now selection');

  t.test('Dana (rules Warming - act now) and Ahmed-with-AI-override both appear; Mark (Stalled, no AI) does not', () => {
    const store = fresh();
    store.setAiSummary('p-ahmed', {
      label: 'Warming - act now', arc: 'x', nextStep: 'Send the proposal before Q3 ends',
      agreesWithRules: false, disagreementReason: 'notes show a deadline',
    });
    const ids = actNowRows(store, TODAY).map((r) => r.person.id);
    t.ok(ids.includes('p-dana'), 'Dana (rules act-now) included');
    t.ok(ids.includes('p-ahmed'), 'Ahmed (AI act-now override) included');
    t.ok(!ids.includes('p-mark'), 'Mark (Stalled, no AI) excluded');
  });

  t.test("Ahmed's reason is the AI next step when the AI overrides to act-now", () => {
    const store = fresh();
    store.setAiSummary('p-ahmed', {
      label: 'Warming - act now', arc: 'x', nextStep: 'Send the proposal before Q3 ends',
      agreesWithRules: false, disagreementReason: 'notes show a deadline',
    });
    const row = actNowRows(store, TODAY).find((r) => r.person.id === 'p-ahmed');
    t.eq(row.reason, 'Send the proposal before Q3 ends');
  });

  t.test('Without an AI summary, Ahmed (rules: Steady) is not in Act now', () => {
    // Seed now ships a real AI override for Ahmed (Task 15), so this checks the
    // pre-AI state directly: no aiSummaries at all, same as a brand-new contact.
    const noAiSeed = { conferences: data.conferences, contacts: { ...data.contacts, aiSummaries: {} } };
    const store = createStore({ seed: noAiSeed, storage: memoryStorage(), prefix: 'grain.test.' });
    const ids = actNowRows(store, TODAY).map((r) => r.person.id);
    t.ok(!ids.includes('p-ahmed'), 'Ahmed excluded until the AI overrides');
  });

  t.group('Today: Coming up selection');

  // The seed demo baseline (Decisions.md 4b) pre-stages a few events so Plan/Today look
  // meaningful on first open; these tests clear it where they need a genuine clean slate.
  const BASELINE_IDS = ['iamtn-summit-2026', 'wtm-london-2026', 'crosstech-world-2026', 'mpe-2027', 'dact-treasury-fair-2027'];
  const clearBaseline = (store) => { for (const id of BASELINE_IDS) store.setConferencePlan(id, { status: null, reps: [] }); };

  t.test('The seed demo baseline alone already surfaces a staffed event within 60 days', () => {
    const store = fresh();
    const r = comingUpRows(store, TODAY);
    t.eq(r.mode, 'planned');
    t.ok(r.items.some((i) => i.id === 'iamtn-summit-2026'), 'IAMTN (seed defaultPlan: going) appears');
  });

  t.test('A conference marked Going within 60 days wins over the A/A+ fallback', () => {
    const store = fresh();
    clearBaseline(store);
    const soon = store.conferences().find((c) => {
      const d = dayNumber(c.startDate) - dayNumber(TODAY);
      return d >= 0 && d <= 60;
    });
    if (!soon) return; // seed data has no event in this window right now; nothing to assert
    store.setConferencePlan(soon.id, { status: 'going', reps: ['Maya'] });
    const r = comingUpRows(store, TODAY);
    t.eq(r.mode, 'planned');
    t.ok(r.items.some((i) => i.id === soon.id), 'the staffed event is in the list');
  });

  t.test('With nothing staffed, falls back to undecided A/A+ events, nearest first', () => {
    const store = fresh();
    clearBaseline(store);
    const r = comingUpRows(store, TODAY);
    t.eq(r.mode, 'decide');
    t.ok(r.items.every((i) => ['A+', 'A'].includes(i.tier) && !i.plan.status), 'only undecided A/A+ events');
    for (let i = 1; i < r.items.length; i++) t.ok(r.items[i].daysUntil >= r.items[i - 1].daysUntil, 'nearest first');
  });

  t.test('A staffed event outside the 60-day window does not block the fallback', () => {
    const store = fresh();
    clearBaseline(store);
    const far = store.conferences().find((c) => dayNumber(c.startDate) - dayNumber(TODAY) > 60);
    if (far) store.setConferencePlan(far.id, { status: 'going', reps: ['Maya'] });
    const r = comingUpRows(store, TODAY);
    t.eq(r.mode, 'decide');
  });

  t.group('Today: Your next trip (signed in) / Next team trips (Team view)');

  t.test('With "I am" unset, yourNextTrip is always null — Team view uses nextTeamTrips instead', () => {
    const store = fresh();
    t.eq(yourNextTrip(store, TODAY), null);
  });
  t.test("Maya's own next trip is WTM London (baseline: going, Maya + Daniel)", () => {
    const store = fresh();
    store.updateSettings({ me: 'Maya' });
    const trip = yourNextTrip(store, TODAY);
    t.eq([trip.id, trip.plan.reps], ['wtm-london-2026', ['Maya', 'Daniel']]);
  });
  t.test('Nearest of possibly several assigned events; no 60-day window for trips', () => {
    const store = fresh();
    clearBaseline(store);
    store.updateSettings({ me: 'Maya' });
    store.setConferencePlan('pay360-2027', { status: 'going', reps: ['Maya'] }); // far in the future, well past 60 days
    const trip = yourNextTrip(store, TODAY);
    t.eq(trip.id, 'pay360-2027');
  });
  t.test('A "skip" or undecided assignment is not a trip', () => {
    const store = fresh();
    clearBaseline(store);
    store.updateSettings({ me: 'Maya' });
    store.setConferencePlan('wtm-london-2026', { status: 'skip', reps: ['Maya'] });
    store.setConferencePlan('iamtn-summit-2026', { status: null, reps: ['Maya'] });
    t.eq(yourNextTrip(store, TODAY), null);
  });
  t.test('nextTeamTrips: nearest few trips across everyone, regardless of who (baseline)', () => {
    const store = fresh();
    t.eq(nextTeamTrips(store, TODAY, 3).map((s) => s.id), ['iamtn-summit-2026', 'wtm-london-2026', 'crosstech-world-2026']);
  });
  t.test('nextTeamTrips: with nothing staffed, there are none', () => {
    const store = fresh();
    clearBaseline(store);
    t.eq(nextTeamTrips(store, TODAY), []);
  });
}
