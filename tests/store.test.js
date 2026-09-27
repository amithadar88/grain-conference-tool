import { createStore, memoryStorage } from '../js/store.js';

export default function storeTests(t, data) {
  const seed = { conferences: data.conferences, contacts: data.contacts };
  const fresh = (storage = memoryStorage()) => ({ storage, store: createStore({ seed, storage, prefix: 'grain.test.' }) });
  const capture = (over = {}) => ({
    conferenceId: 'iamtn-summit-2026', event: 'IAMTN Annual Summit 2026', date: '2026-10-14',
    name: 'Priya Raman', company: 'Skyloop OTA', title: '', email: '', linkedin: '',
    temperature: 'hot', note: 'Follow-up on the call.', rep: 'Maya', ...over,
  });

  t.group('Store (seed + overlay)');

  t.test('Seed data is visible without any overlay', () => {
    const { store } = fresh();
    t.eq([store.conferences().length, store.people().length, store.encounters().length],
      [data.conferences.conferences.length, data.contacts.people.length, data.contacts.encounters.length]);
  });
  t.test('Adding an encounter to a known person shows up in merged data and survives a reload', () => {
    const { storage, store } = fresh();
    store.saveCapture(capture({ title: 'VP Payments' }), { link: { personId: 'p-priya', via: 'confirmed' } });
    const again = createStore({ seed, storage, prefix: 'grain.test.' });
    t.eq([again.encountersFor('p-priya').length, again.person('p-priya').title], [2, 'VP Payments']);
  });
  t.test('A new person is created, with "not the same" pairs and unresolved suggestions recorded', () => {
    const { store } = fresh();
    const r = store.saveCapture(capture({ name: 'David Cohen', company: '' }), { rejectedIds: ['p-david-t'], unresolvedIds: ['p-david-c'] });
    t.eq([r.isNew, store.person(r.personId).name, store.unresolvedFor(r.personId)], [true, 'David Cohen', ['p-david-c']]);
    t.ok(store.notSamePairs().some(([a, b]) => a === r.personId && b === 'p-david-t'), 'pair saved');
  });
  t.test('"Other event…" encounter saves with conferenceId null and shows on the timeline', () => {
    const { store } = fresh();
    store.saveCapture(capture({ conferenceId: null, event: 'Payments dinner, London' }), { link: { personId: 'p-priya' } });
    const last = store.encountersFor('p-priya').at(-1);
    t.eq([last.conferenceId, last.event], [null, 'Payments dinner, London']);
  });
  t.test('Merging a new person into an existing one moves the encounters', () => {
    const { store } = fresh();
    const r = store.saveCapture(capture({ name: 'Dana Levy', company: 'Vantelo Pay' }), { unresolvedIds: ['p-dana'] });
    store.mergeInto(r.personId, 'p-dana');
    t.eq([store.person(r.personId), store.encountersFor('p-dana').length, store.unresolvedFor(r.personId)], [null, 4, []]);
  });
  t.test('Reset clears the overlay and "I am" (back to Team view), keeps other settings', () => {
    const { store } = fresh();
    store.updateSettings({ me: 'Maya', geminiKey: 'k' });
    store.setConferencePlan('pay360-2027', { status: 'going', reps: ['Maya'] }); // no seed defaultPlan: should go back to null
    store.saveCapture(capture(), { link: { personId: 'p-priya' } });
    store.resetOverlay();
    t.eq([store.encountersFor('p-priya').length, store.conferencePlan('pay360-2027').status, store.settings().me, store.settings().geminiKey],
      [1, null, '', 'k']);
  });
  t.test('Reset restores the seed demo baseline (a conference with a defaultPlan)', () => {
    const { store } = fresh();
    store.setConferencePlan('iamtn-summit-2026', { status: 'skip', reps: [] });
    t.eq(store.conferencePlan('iamtn-summit-2026'), { status: 'skip', reps: [] });
    store.resetOverlay();
    t.eq(store.conferencePlan('iamtn-summit-2026'), { status: 'going', reps: ['Shira'] });
  });
  t.test('Seeded AI summaries (Task 15) load for a fresh visitor and survive Reset demo data', () => {
    const { store } = fresh();
    for (const id of ['p-ahmed', 'p-mark']) {
      const s = store.aiSummary(id);
      t.ok(s && s.label && s.arc && s.nextStep, `${id} has a seeded summary`);
    }
    // Dana and Jonathan are not seeded (their runs came from the fallback model): their
    // cards should show the normal Generate state, not a pre-filled summary.
    t.eq([store.aiSummary('p-dana'), store.aiSummary('p-jonathan')], [null, null]);
    store.resetOverlay();
    t.ok(store.aiSummary('p-ahmed').label === 'Warming - act now', 'seeded summaries are not part of the overlay, so Reset leaves them in place');
  });
  t.test('Corrupted saved data does not crash the app', () => {
    const storage = memoryStorage();
    storage.setItem('grain.test.overlay.v1', '{not json');
    storage.setItem('grain.test.settings.v1', 'null');
    const { store } = fresh(storage);
    t.eq([store.people().length, store.settings().me], [data.contacts.people.length, '']);
  });
  t.test('An old overlay missing newer fields still works', () => {
    const storage = memoryStorage();
    storage.setItem('grain.test.overlay.v1', JSON.stringify({ conferencePlans: { 'ces-2027': { status: 'skip' } } }));
    const { store } = fresh(storage);
    t.eq(store.conferencePlan('ces-2027').status, 'skip');
    store.saveCapture(capture(), { link: { personId: 'p-priya' } });
    t.eq(store.encountersFor('p-priya').length, 2);
  });
  t.test('Overlay entries pointing at ids that no longer exist are ignored, not fatal', () => {
    const storage = memoryStorage();
    storage.setItem('grain.test.overlay.v1', JSON.stringify({
      personPatches: { 'p-gone': { title: 'CFO' } },
      addedEncounters: [{ id: 'e-x', personId: 'p-gone', date: '2026-01-01', event: 'Old', nameAsEntered: 'Gone', temperature: 'warm', note: '' }],
    }));
    const { store } = fresh(storage);
    t.eq([store.people().length, store.person('p-gone')], [data.contacts.people.length, null]);
  });
  t.test('Capture draft survives a reload and is cleared on demand', () => {
    const { storage, store } = fresh();
    store.setDraft({ name: 'Half typed' });
    const again = createStore({ seed, storage, prefix: 'grain.test.' });
    t.eq(again.draft().name, 'Half typed');
    again.clearDraft();
    t.eq(again.draft(), {});
  });
  t.test('Team names default to contacts.json until set in Settings', () => {
    const { store } = fresh();
    t.eq(store.team(), data.contacts.team);
    store.updateSettings({ team: ['Noa', 'Amit'] });
    t.eq(store.team(), ['Noa', 'Amit']);
  });

  t.group('Needs review: every open suggestion in one place');

  t.test('Lists all skipped suggestions; "Different" and "Same person" remove them', () => {
    const { store } = fresh();
    const dana = store.saveCapture(capture({ name: 'Dana Levy', company: 'Vantelo Pay' }), { unresolvedIds: ['p-dana'] }).personId;
    const david = store.saveCapture(capture({ name: 'David Cohen', company: '' }), { unresolvedIds: ['p-david-t', 'p-david-c'] }).personId;
    t.eq(store.unresolvedPairs(), [[dana, 'p-dana'], [david, 'p-david-t'], [david, 'p-david-c']]);
    store.resolveDifferent(david, 'p-david-t');
    store.mergeInto(dana, 'p-dana');
    t.eq(store.unresolvedPairs(), [[david, 'p-david-c']]);
  });
  t.test('A pair whose candidate no longer exists is not listed', () => {
    const { store } = fresh();
    const a = store.saveCapture(capture({ name: 'Sam One', company: 'X' })).personId;
    const b = store.saveCapture(capture({ name: 'Sam One', company: 'X' }), { unresolvedIds: [a] }).personId;
    const c = store.saveCapture(capture({ name: 'Sam One', company: 'Y' }), { unresolvedIds: [a] }).personId;
    store.mergeInto(b, a);
    store.mergeInto(a, 'p-priya'); // the candidate itself is merged away
    t.eq(store.unresolvedPairs().filter(([from]) => from === c), []);
  });
}
