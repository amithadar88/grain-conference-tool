import { validateDraft, validateArc, validateConference } from '../js/validate.js';

const good = () => ({
  city: 'Lisbon', country: 'Portugal', region: 'Europe', verticals: ['payments', 'fintech'],
  audienceSize: 2500, description: 'A payments conference.',
  ratings: {
    icpFit: { score: 4, why: 'Mostly PSPs' },
    buyerAccess: { score: 3, why: 'Mixed seniority' },
    audienceMarket: { score: 5, why: 'European crowd' },
    travelEffort: { score: 4, why: 'Short flight' },
  },
});

export default function validateTests(t) {
  t.group('AI output checks');

  t.test('A good intake draft passes', () => {
    t.eq(validateDraft(good()), { ok: true, errors: [] });
  });
  t.test('Scores 0 or 6, or not whole numbers, are rejected', () => {
    for (const bad of [0, 6, 3.5, '4']) {
      const d = good();
      d.ratings.icpFit.score = bad;
      t.ok(!validateDraft(d).ok, `score ${JSON.stringify(bad)} should fail`);
    }
  });
  t.test('Unknown region, missing reason, non-integer size are rejected', () => {
    const a = good(); a.region = 'Europe/Africa';
    const b = good(); b.ratings.travelEffort.why = ' ';
    const c = good(); c.audienceSize = 2500.5;
    t.eq([validateDraft(a).ok, validateDraft(b).ok, validateDraft(c).ok, validateDraft(null).ok], [false, false, false, false]);
  });
  t.test('Arc summary: unknown label rejected; disagreement needs a reason', () => {
    const arc = { label: 'Warming - act now', arc: 'Two meetings…', nextStep: 'Send the proposal this week.', agreesWithRules: false, disagreementReason: 'Explicit proposal request with a Q3 deadline.' };
    t.eq(validateArc(arc).ok, true);
    t.eq(validateArc({ ...arc, label: 'Hot lead' }).ok, false);
    t.eq(validateArc({ ...arc, disagreementReason: '' }).ok, false);
  });
  t.test('Conference save check: end before start, missing ratings', () => {
    const c = { name: 'X', startDate: '2027-03-10', endDate: '2027-03-09', region: 'Europe', audienceSize: 100, ratings: {} };
    t.eq(validateConference(c).errors, ['End date is before the start date', 'Set all four ratings (1-5)']);
  });
}
