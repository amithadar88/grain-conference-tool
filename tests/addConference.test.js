import { spanWarningHtml } from '../js/views/addConference.js';

export default function addConferenceTests(t) {
  t.group('Add conference: long-event warning (Task 15 item 3)');

  t.test('A normal multi-day conference (<= 7 days) gets no warning', () => {
    t.eq(spanWarningHtml('2026-10-01', '2026-10-04'), '');
  });
  t.test('More than 7 days after the start date warns, naming the inclusive day count', () => {
    const html = spanWarningHtml('2026-10-01', '2026-10-20');
    t.ok(html.includes('20 days'), 'names the span inclusively (Oct 1 - Oct 20 = 20 days)');
    t.ok(html.includes('series, not one event'), 'explains why it might be wrong');
  });
  t.test('Exactly 7 days after the start date (an 8-day span) does not warn yet', () => {
    t.eq(spanWarningHtml('2026-10-01', '2026-10-08'), '');
  });
  t.test('One day past the threshold (a 9-day span) warns', () => {
    t.ok(spanWarningHtml('2026-10-01', '2026-10-09').includes('9 days'));
  });
  t.test('Missing start or end date: no warning (nothing to check yet)', () => {
    t.eq(spanWarningHtml('', '2026-10-20'), '');
    t.eq(spanWarningHtml('2026-10-01', ''), '');
  });
  t.test('Never blocks saving: it is informational HTML, not a validation error', () => {
    const html = spanWarningHtml('2026-10-01', '2026-10-20');
    t.ok(!html.toLowerCase().includes('error'), 'not styled or worded as a blocking error');
  });
}
