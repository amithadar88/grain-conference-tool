import {
  relationshipSignal, findAsks, seniority, timelineMarkers, summaryLine, hubspotPayload, contactsCsv, cutNote,
} from '../js/signals.js';

const TODAY = '2026-09-26';

// "_expectedSignal" is either a label, or "Rules: <label> / AI: <label>" (Ahmed).
function expectedRulesLabel(expected) {
  const m = expected.match(/^Rules: (.*?) \/ AI:/);
  return m ? m[1] : expected;
}

export default function signalsTests(t, data) {
  const { people, encounters } = data.contacts;
  const encsOf = (id) => encounters.filter((e) => e.personId === id);

  t.group('Relationship signals: every demo person');

  for (const p of people) {
    const expected = expectedRulesLabel(p._expectedSignal);
    t.test(`${p.name} (${p.company}) -> ${expected}`, () => {
      t.eq(relationshipSignal(encsOf(p.id), TODAY).label, expected);
    });
  }

  t.group('Relationship signals: details');

  t.test('Concrete asks include the extended keywords, at word starts', () => {
    t.eq(findAsks('Shortlisted us vs. one competitor. Asked for a security questionnaire and references.'),
      ['shortlist', 'references', 'questionnaire']);
    t.eq(findAsks('~EUR 40M/month in merchant payouts'), ['amount']);
    t.eq(findAsks('Industrial client, great chat, will intro us internally'), []);
  });
  t.test('Ahmed: rules see the proposal ask, but stay Steady because the latest meeting is only warm', () => {
    const s = relationshipSignal(encsOf('p-ahmed'), TODAY);
    t.eq([s.label, s.asks], ['Steady - nurture', ['proposal']]);
  });
  t.test('Mark: reasons explain the tire-kicker label', () => {
    const s = relationshipSignal(encsOf('p-mark'), TODAY);
    t.eq(s.reasons.slice(0, 2), ['4 meetings', 'over 12 months']);
    t.ok(s.reasons.includes('no concrete asks'), 'says no concrete asks');
  });
  t.test('Seniority ranks', () => {
    t.eq(['CFO', 'VP Finance', 'Head of Treasury', 'Finance Director', 'Treasury Manager', 'Analyst', ''].map(seniority), [5, 4, 3, 3, 2, 1, 1]);
  });
  t.test('Jonathan: job change marker, more senior', () => {
    const marks = timelineMarkers(encsOf('p-jonathan')).flatMap((m) => m.marks.map((x) => x.text));
    t.eq(marks, ['Job change: Lumora Remit → Meridia FX ↑ more senior']);
  });
  t.test('Dana: promotions inside the same company are not job changes', () => {
    const marks = timelineMarkers(encsOf('p-dana')).flatMap((m) => m.marks.map((x) => x.type));
    t.eq(marks, ['seniority', 'seniority']);
  });
  t.test('Mark: "Brixa" vs "Brixa Payments Ltd" is not a job change', () => {
    t.eq(timelineMarkers(encsOf('p-mark')).flatMap((m) => m.marks), []);
  });
  t.test('A new job at the latest meeting -> Warming - new role (Sara Mizrahi live demo)', () => {
    const extra = { id: 'x', personId: 'p-sarah', date: '2026-10-15', event: 'IAMTN Annual Summit 2026', nameAsEntered: 'Sara Mizrahi', company: 'Sunmerra Tours', title: '', temperature: 'warm', note: 'Now at Sunmerra.' };
    t.eq(relationshipSignal([...encsOf('p-sarah'), extra], TODAY).label, 'Warming - new role, re-engage');
  });

  t.group('HubSpot payload and CSV');

  t.test('Dana: summary line for the "Grain conference summary" property', () => {
    const encs = encsOf('p-dana');
    t.eq(summaryLine(relationshipSignal(encs, TODAY), encs),
      'Warming - act now · 3 meetings · last met at Money20/20 Europe 2026 · "Now VP Finance. Wants a demo with their CFO before Q4 budget. Asked about…"');
  });
  t.test('Dana: payload fields, lead source = first conference', () => {
    const p = people.find((x) => x.id === 'p-dana');
    const encs = encsOf('p-dana');
    const payload = hubspotPayload(p, encs, relationshipSignal(encs, TODAY));
    t.eq([payload.email, payload.firstname, payload.lastname, payload.company, payload.jobtitle, payload.grain_lead_source],
      ['dana.levi@vantelopay.com', 'Dana', 'Levi', 'Vantelo Pay', 'VP Finance', 'Money20/20 Europe 2025']);
  });
  t.test('Short notes are not cut', () => {
    t.eq(cutNote('Short note.'), 'Short note.');
  });
  t.test('CSV quotes commas, quotes and line breaks; keeps accents', () => {
    const csv = contactsCsv([{ person: { name: 'José García', company: 'Iberitrips S.L.', title: 'CFO', email: '', linkedin: '' },
      encounters: [{ date: '2025-03-06', event: 'ITB Berlin 2025', note: 'Said "yes", then\nleft, fast' }], signal: { label: 'New' } }]);
    t.eq(csv.split('\r\n')[1], 'José García,Iberitrips S.L.,CFO,,,ITB Berlin 2025,ITB Berlin 2025,1,New,"Said ""yes"", then\nleft, fast"');
  });
}
