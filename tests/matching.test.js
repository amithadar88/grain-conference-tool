import {
  norm, normCompany, sameCompany, namesSimilar, normLinkedin, findMatches,
  normUrl, findConferenceDuplicates,
} from '../js/matching.js';

export default function matchingTests(t, data) {
  const { people, encounters, notSamePairs, liveDemoScript } = data.contacts;
  const confs = data.conferences.conferences;
  const match = (capture, selfId = null) => findMatches(capture, people, encounters, notSamePairs, selfId);
  const demo = (type) => liveDemoScript.find((d) => d.type === type).capture;

  t.group('Matching: normalising');

  t.test('Accents, casing and punctuation', () => {
    t.eq(norm('  José  GARCÍA '), 'jose garcia');
  });
  t.test('Company suffixes are ignored', () => {
    t.eq([normCompany('Iberitrips S.L.'), normCompany('Vantelo Pay B.V.'), normCompany('Alpveldt Reisen GmbH'), normCompany('Brixa Payments Ltd')],
      ['iberitrips', 'vantelo pay', 'alpveldt reisen', 'brixa payments']);
  });
  t.test('Brixa = Brixa Payments; empty company is unknown, not different', () => {
    t.eq([sameCompany('Brixa', 'Brixa Payments Ltd'), sameCompany('Atlasbeds', 'Sunmerra Tours'), sameCompany('', 'Atlasbeds')], [true, false, null]);
  });
  t.test('Nicknames, typos and initials', () => {
    t.eq([
      namesSimilar('Jon Cohen', 'Jonathan Cohen'),
      namesSimilar('Kasia Nowak', 'Katarzyna Nowak'),
      namesSimilar('Tom Becker', 'Thomas Becker'),
      namesSimilar('Dana Levy', 'Dana Levi'),
      namesSimilar('Mark Thomson', 'Mark Thompson'),
      namesSimilar('K. Nowak', 'Katarzyna Nowak'),
      namesSimilar('Jose Garcia', 'José García'),
    ], [true, true, true, true, true, true, true]);
  });
  t.test('Different first names with the same last name are not similar', () => {
    t.eq([namesSimilar('David Cohen', 'Jonathan Cohen'), namesSimilar('Dana Levi', 'Mark Levi')], [false, false]);
  });
  t.test('LinkedIn URLs are compared by profile slug', () => {
    t.eq(normLinkedin('https://www.LinkedIn.com/in/jonathan-cohen-fx/'), 'linkedin.com/in/jonathan-cohen-fx');
  });

  t.group('Matching: live demo script');

  t.test('Sara Mizrahi @ Sunmerra Tours -> low-confidence suggestion: Sarah Mizrahi', () => {
    const r = match(demo('low-confidence job change'));
    t.eq([r.auto, r.candidates.map((c) => [c.person.id, c.level])], [null, [['p-sarah', 'low']]]);
  });
  t.test('Dana Levy @ Vantelo Pay -> high-confidence suggestion: Dana Levi, 3 meetings', () => {
    const r = match(demo('high-confidence variant'));
    t.eq(r.candidates.map((c) => [c.person.id, c.level, c.meetings]), [['p-dana', 'high', 3]]);
  });
  t.test('David Cohen, no company -> both David Cohens as candidates', () => {
    const r = match(demo('ambiguous same name'));
    t.eq(r.candidates.map((c) => c.person.id).sort(), ['p-david-c', 'p-david-t']);
  });
  t.test('K. Nowak + known email -> auto-linked to Katarzyna Nowak', () => {
    const r = match(demo('email auto-link'));
    t.eq([r.auto.person.id, r.auto.via], ['p-kasia', 'email']);
  });

  t.group('Matching: edge cases');

  t.test('The two David Cohens are never suggested as each other (notSamePairs)', () => {
    const r = match({ name: 'David Cohen', company: 'Tranzio Wholesale' }, 'p-david-t');
    t.eq(r.candidates.map((c) => c.person.id), []);
  });
  t.test('Same LinkedIn -> auto-link even with a new company and nickname', () => {
    const r = match({ name: 'Jon Cohen', company: 'Somewhere New', linkedin: 'https://linkedin.com/in/jonathan-cohen-fx/' });
    t.eq([r.auto.person.id, r.auto.via], ['p-jonathan', 'linkedin']);
  });
  t.test('José García typed without accents, suffix dropped -> high confidence', () => {
    const r = match({ name: 'Jose Garcia', company: 'Iberitrips' });
    t.eq(r.candidates.map((c) => [c.person.id, c.level]), [['p-jose', 'high']]);
  });
  t.test('Very short or single-word names do not crash and do not match everyone', () => {
    t.eq([match({ name: 'Da' }).candidates.length, match({ name: 'Priya' }).candidates.length], [0, 0]);
  });
  t.test('Empty capture returns nothing', () => {
    t.eq(match({}), { auto: null, candidates: [] });
  });

  t.group('Conference duplicates');

  t.test('URL keeps subdomain and path: Money20/20 Europe and USA differ', () => {
    t.ok(normUrl('https://europe.money2020.com') !== normUrl('https://us.money2020.com'), 'different editions');
    t.eq(normUrl('HTTPS://www.aiconnects.us/airline-travel-payments-b2b-summit-2027/?utm=x#top'), 'aiconnects.us/airline-travel-payments-b2b-summit-2027');
  });
  t.test('Same link warns', () => {
    const d = findConferenceDuplicates({ name: 'Some Summit', website: 'europe.money2020.com/' }, confs);
    t.eq(d.map((x) => [x.conf.id, x.reason]), [['money2020-europe-2027', 'link']]);
  });
  t.test('Same name, different year warns', () => {
    const d = findConferenceDuplicates({ name: 'Money20/20 Europe 2028', website: '' }, confs);
    t.eq(d.map((x) => [x.conf.id, x.reason]), [['money2020-europe-2027', 'name']]);
  });
  t.test('Another Money20/20 edition on another subdomain does not warn', () => {
    t.eq(findConferenceDuplicates({ name: 'Money20/20 Middle East', website: 'https://middleeast.money2020.com' }, confs).length, 0);
  });
}
