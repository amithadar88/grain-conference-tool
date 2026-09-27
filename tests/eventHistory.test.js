import { createStore, memoryStorage } from '../js/store.js';
import { sameSeries, peopleYouKnow } from '../js/eventHistory.js';

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
}
