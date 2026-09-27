import { createStore, memoryStorage } from '../js/store.js';
import { sameSeries, peopleYouKnow, companyGroups, companyCount, peopleYouKnowLabel } from '../js/eventHistory.js';

const TODAY = '2026-09-26';

export default function eventHistoryTests(t, data) {
  const seed = { conferences: data.conferences, contacts: data.contacts };
  const fresh = () => createStore({ seed, storage: memoryStorage(), prefix: 'grain.test.' });
  const conf = (store, id) => store.conference(id);

  t.group('sameSeries: name matching');

  t.test('exact-minus-year matches', () => {
    t.eq(sameSeries('WTM London 2025', 'WTM London'), true);
    t.eq(sameSeries('Money20/20 USA 2025', 'Money20/20 USA'), true);
    t.eq(sameSeries('ITB Berlin 2025', 'ITB Berlin 2027'), true);
  });
  t.test('a short encounter name matches a fuller current name (prefix, whole word)', () => {
    t.eq(sameSeries('EuroFinance 2026', 'EuroFinance International Treasury Management 2027'), true);
    t.eq(sameSeries('MPE 2026', 'MPE 2027 (Merchant Payments Ecosystem)'), true);
  });
  t.test('"(formerly X)" is recognized as the same series as the old name', () => {
    t.eq(sameSeries('IMTC World 2025', 'CrossTech World 2026 (formerly IMTC World)'), true);
  });
  t.test('different regional editions of the same brand are NOT the same series', () => {
    t.eq(sameSeries('Money20/20 Europe 2026', 'Money20/20 USA'), false);
    t.eq(sameSeries('Money20/20 Europe 2026', 'Money20/20 Asia 2027'), false);
  });
  t.test('unrelated events do not match', () => {
    t.eq(sameSeries('Sibos 2026', 'ITB Berlin 2027'), false);
  });

  t.group('peopleYouKnow: real seed data');

  t.test('Money20/20 Europe 2027 lists everyone met at the 2025/2026 editions, not the USA edition', () => {
    const store = fresh();
    const ids = peopleYouKnow(conf(store, 'money2020-europe-2027'), store, TODAY).map((r) => r.person.id).sort();
    t.eq(ids, ['p-dana', 'p-jonathan', 'p-kasia', 'p-mark']);
  });
  t.test('EuroFinance International Treasury Management 2027 matches the shorter "EuroFinance 2026" encounter', () => {
    const store = fresh();
    const ids = peopleYouKnow(conf(store, 'eurofinance-2027'), store, TODAY).map((r) => r.person.id);
    t.eq(ids, ['p-priya']);
  });
  t.test('MPE 2027 (Merchant Payments Ecosystem) matches the shorter "MPE 2026" encounter', () => {
    const store = fresh();
    const ids = peopleYouKnow(conf(store, 'mpe-2027'), store, TODAY).map((r) => r.person.id);
    t.eq(ids, ['p-dana']);
  });
  t.test('each row carries the current rules label, for the expanded card', () => {
    const store = fresh();
    const rows = peopleYouKnow(conf(store, 'money2020-europe-2027'), store, TODAY);
    const dana = rows.find((r) => r.person.id === 'p-dana');
    t.eq(dana.signal.label, 'Warming - act now');
  });

  t.group('peopleYouKnow: boundary rules (does not touch score/tier/matching)');

  t.test('an encounter on/after the conference start date does not count as "previous"', () => {
    const store = fresh();
    const c = conf(store, 'wtm-london-2026'); // starts 2026-11-03
    store.saveCapture(
      { conferenceId: null, event: 'WTM London', date: c.startDate, name: 'Someone New', company: '', title: '', email: '', linkedin: '', temperature: 'warm', note: '', rep: 'Maya' },
      {},
    );
    const ids = peopleYouKnow(c, store, TODAY).map((r) => r.person.name);
    t.ok(!ids.includes('Someone New'), 'same-day/future encounter excluded');
  });
  t.test('an encounter logged directly against this conference id is excluded (it is this instance, not a previous one)', () => {
    const store = fresh();
    const c = conf(store, 'wtm-london-2026');
    store.saveCapture(
      { conferenceId: c.id, event: c.name, date: '2020-01-01', name: 'Backdated Person', company: '', title: '', email: '', linkedin: '', temperature: 'warm', note: '', rep: 'Maya' },
      {},
    );
    const names = peopleYouKnow(c, store, TODAY).map((r) => r.person.name);
    t.ok(!names.includes('Backdated Person'), 'same conferenceId excluded even if dated earlier');
  });

  t.group('companies: distinct companies among people you know (does not touch score/tier/matching)');

  t.test("a person's company for THIS event is the one on their matching encounter, not their current one (job change)", () => {
    const store = fresh();
    const rows = peopleYouKnow(conf(store, 'money2020-europe-2027'), store, TODAY);
    const jonathan = rows.find((r) => r.person.name === 'Jonathan Cohen');
    t.eq(jonathan.company, 'Lumora Remit'); // where he was at the 2025 edition
    t.ok(jonathan.person.company !== 'Lumora Remit', "the person record has since moved on (to Meridia FX) — that must not leak into this event's history");
  });

  t.test('real seed data: 4 contacts at 4 distinct companies for Money20/20 Europe 2027', () => {
    const store = fresh();
    const rows = peopleYouKnow(conf(store, 'money2020-europe-2027'), store, TODAY);
    t.eq(rows.length, 4);
    t.eq(companyCount(rows), 4);
    t.eq(peopleYouKnowLabel(rows), '👥 4 contacts · 🏢 4 companies from a previous edition');
  });

  t.test('one contact, one company: singular wording', () => {
    const store = fresh();
    const rows = peopleYouKnow(conf(store, 'eurofinance-2027'), store, TODAY);
    t.eq(rows.length, 1);
    t.eq(peopleYouKnowLabel(rows), '👥 1 contact · 🏢 1 company from a previous edition');
  });

  t.test('no contacts: empty label (the chip is hidden)', () => {
    t.eq(peopleYouKnowLabel([]), '');
  });

  t.test('company suffixes ("Ltd", "GmbH") normalise to one company, same as person-matching', () => {
    const store = fresh();
    const c = conf(store, 'wtm-london-2026');
    const past = { conferenceId: null, event: 'WTM London', date: '2025-01-01', title: '', email: '', linkedin: '', temperature: 'warm', note: '', rep: 'Maya' };
    store.saveCapture({ ...past, name: 'Amir Suffix A', company: 'Globex Travel' }, {});
    store.saveCapture({ ...past, name: 'Amir Suffix B', company: 'Globex Travel GmbH' }, {});
    const rows = peopleYouKnow(c, store, TODAY);
    const group = companyGroups(rows).find((g) => g.rows.some((r) => r.person.name === 'Amir Suffix A'));
    t.eq(group.rows.map((r) => r.person.name).sort(), ['Amir Suffix A', 'Amir Suffix B']);
  });

  t.test('group heading shows the most recently written variant, even when it is the shorter one', () => {
    const store = fresh();
    const c = conf(store, 'wtm-london-2026');
    const base = { conferenceId: null, event: 'WTM London', title: '', email: '', linkedin: '', temperature: 'warm', note: '', rep: 'Maya' };
    store.saveCapture({ ...base, name: 'Older Encounter', date: '2024-01-01', company: 'Globex Travel GmbH' }, {});
    store.saveCapture({ ...base, name: 'Newer Encounter', date: '2025-06-01', company: 'Globex Travel' }, {});
    const rows = peopleYouKnow(c, store, TODAY);
    const group = companyGroups(rows).find((g) => g.rows.some((r) => r.person.name === 'Newer Encounter'));
    t.eq(group.company, 'Globex Travel', "the newer (2025) row's spelling wins over the older (2024) one, regardless of insertion order");
  });

  t.test('a contact with no company on file gets its own group instead of being dropped, and is not counted as a company', () => {
    const base = fresh();
    const baseCount = companyCount(peopleYouKnow(conf(base, 'wtm-london-2026'), base, TODAY));

    const store = fresh();
    const c = conf(store, 'wtm-london-2026');
    store.saveCapture(
      { conferenceId: null, event: 'WTM London', date: '2025-01-01', name: 'No Company Rep', company: '', title: '', email: '', linkedin: '', temperature: 'warm', note: '', rep: 'Maya' },
      {},
    );
    const rows = peopleYouKnow(c, store, TODAY);
    t.eq(companyCount(rows), baseCount, 'an unknown company does not add to the count');
    const group = companyGroups(rows).find((g) => g.rows.some((r) => r.person.name === 'No Company Rep'));
    t.ok(group && !group.company, 'grouped separately (not dropped from the list)');
  });
}
