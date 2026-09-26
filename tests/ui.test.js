import { esc, safeUrl, fmtRange } from '../js/views/ui.js';
import { eventCardHTML } from '../js/views/eventCard.js';
import { scoreAll } from '../js/scoring.js';
import { staffingChip } from '../js/views/plan.js';

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

  t.test('Status + rep -> coloured chip text', () => {
    t.eq([
      staffingChip({ status: 'going', rep: 'Maya' }),
      staffingChip({ status: 'considering', rep: 'Maya' }),
      staffingChip({ status: 'going', rep: null }),
      staffingChip({ status: 'skip', rep: 'Maya' }),
    ], [
      { kind: 'going', text: '✓ Going · Maya' },
      { kind: 'considering', text: 'Considering · Maya' },
      { kind: 'going', text: '✓ Going' },
      { kind: 'skip', text: 'Skip · Maya' },
    ]);
  });
  t.test('Rep but no decision yet -> neutral chip; nothing -> no chip', () => {
    t.eq([staffingChip({ status: null, rep: 'Yoni' }), staffingChip({ status: null, rep: null })], [{ kind: 'rep', text: 'Yoni' }, null]);
  });
}
