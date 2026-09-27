// Command-line checks for the Netlify functions with a FAKE network (no keys, no real calls):
//   node tests/functions.mjs
// The real end-to-end check is the live-site checklist.
import { createRequire } from 'node:module';
import { createRunner } from './runner.js';

const require = createRequire(import.meta.url);
const ai = require('../netlify/functions/ai.js');
const hubspot = require('../netlify/functions/hubspot.js');
const { pushWithRetry, withAiRetry } = await import('../js/api.js');

const post = (body) => ({ httpMethod: 'POST', body: JSON.stringify(body) });
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const geminiReply = (obj) => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

let calls = [];
function fakeFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    return handler(String(url), opts, calls.length);
  };
}
const parse = (res) => JSON.parse(res.body);

const { t, results } = createRunner();
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const { checkUrl, htmlToText, arcPrompt } = ai._test;

// ---- ai.js ----
test('status reports whether a server key exists, without calling Gemini', async () => {
  delete process.env.GEMINI_API_KEY;
  fakeFetch(() => { throw new Error('should not be called'); });
  const r = parse(await ai.handler(post({ task: 'status' })));
  t.eq([r.ok, r.hasServerKey, r.model], [true, false, 'gemini-3.8-flash']);
});
test('no key anywhere -> no_key', async () => {
  delete process.env.GEMINI_API_KEY;
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))), { ok: false, error: 'no_key' });
});
test('arc: returns the parsed JSON and sends the key in a header, not the URL', async () => {
  process.env.GEMINI_API_KEY = 'server-key';
  const answer = { label: 'Warming - act now', arc: 'x', nextStep: 'y', agreesWithRules: false, disagreementReason: 'z' };
  fakeFetch(() => geminiReply(answer));
  const r = parse(await ai.handler(post({ task: 'arc', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture', reasons: [] } })));
  t.eq([r.ok, r.result, r.model], [true, answer, 'gemini-3.8-flash']);
  t.ok(!calls[0].url.includes('server-key'), 'key not in URL');
});
test('the rep\'s own key overrides the server key', async () => {
  process.env.GEMINI_API_KEY = 'server-key';
  let used = '';
  globalThis.fetch = async (url, opts) => { used = opts.headers['x-goog-api-key']; return geminiReply({}); };
  await ai.handler(post({ task: 'arc', key: 'my-key', encounters: [] }));
  t.eq(used, 'my-key');
});
test('429 from both models -> busy ("AI is busy, try again in a minute")', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(429, { error: { message: 'quota' } }));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.error, calls.length], ['busy', 2]);
  t.ok(calls[1].url.includes('gemini-3.5-flash-lite'), 'fell back to flash-lite');
});
test('primary model 503, fallback works', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch((url) => (url.includes('3.8') ? reply(503, 'down') : geminiReply({ ok: 1 })));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.ok, r.model], [true, 'gemini-3.5-flash-lite']);
});
test('invalid key -> bad_key, no retry', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.error, calls.length], ['bad_key', 1]);
});
test('followup: returns subject + body, sends the key in a header', async () => {
  process.env.GEMINI_API_KEY = 'server-key';
  const answer = { subject: 'Following up from IAMTN', body: 'Hi Ahmed, great meeting you...' };
  fakeFetch(() => geminiReply(answer));
  const r = parse(await ai.handler(post({ task: 'followup', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture' }, rep: 'Maya' })));
  t.eq([r.ok, r.result], [true, answer]);
  t.ok(!calls[0].url.includes('server-key'), 'key not in URL');
});
test('followup prompt: never invents facts, includes the AI read when given', () => {
  const { followupPrompt } = ai._test;
  const p = followupPrompt({ today: '2026-09-26', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture' }, ai: { label: 'Warming - act now', arc: 'x', nextStep: 'Send proposal' }, rep: 'Maya' });
  t.ok(/never invent/i.test(p), 'guards against invented facts');
  t.ok(p.includes('Send proposal'), 'includes the AI next step when given');
});
test('non-JSON answer (even in ``` fences) is handled', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(200, { candidates: [{ content: { parts: [{ text: '```json\n{"a":1}\n```' }] } }] }));
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))).result, { a: 1 });
  fakeFetch(() => reply(200, { candidates: [{ content: { parts: [{ text: 'Sorry, I cannot help' }] } }] }));
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))).error, 'bad_output');
});
test('URL safety: only public http(s) pages', () => {
  const bad = ['http://localhost:8888', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://[::1]/', 'http://intranet', 'https://x.local', 'https://example.com:8443/'];
  const rejected = bad.filter((u) => { try { checkUrl(u); return false; } catch { return true; } });
  t.eq(rejected, bad);
  t.eq(checkUrl('https://www.iamtn.events/summit').hostname, 'www.iamtn.events');
});
test('HTML is reduced to readable text', () => {
  const txt = htmlToText('<html><head><title>IAMTN &amp; Friends</title><style>.x{}</style><script>var a=1</script></head><body><h1>Who attends</h1><p>PSPs&nbsp;and MTOs</p></body></html>');
  t.eq(txt, 'IAMTN & Friends\nWho attends\nPSPs and MTOs');
});
test('intake: unreadable page and no pasted text -> fetch_failed', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(403, 'blocked'));
  t.eq(parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com' }))).error, 'fetch_failed');
});
test('intake: unreadable page but pasted text -> still drafts', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch((url) => (url.includes('example.com') ? reply(403, 'blocked') : geminiReply({ city: 'Lisbon' })));
  const r = parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com', pastedText: 'A payments summit for PSPs.' })));
  t.eq([r.ok, r.draft.city], [true, 'Lisbon']);
});
test('intake: a redirect to an internal address is refused', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(302, '', { location: 'http://127.0.0.1/admin' }));
  t.eq(parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com' }))).error, 'bad_url');
});

// ---- hubspot.js ----
const dana = { email: 'Dana.Levi@vantelopay.com', firstname: 'Dana', lastname: 'Levi', company: 'Vantelo Pay', jobtitle: 'VP Finance', grain_lead_source: 'Money20/20 Europe 2025', grain_conference_summary: 'Warming - act now · 3 meetings' };

test('hubspot: no token -> no_token', async () => {
  t.eq(parse(await hubspot.handler(post({ contacts: [dana] }))), { ok: false, error: 'no_token' });
});
test('hubspot: new contact -> properties created once, contact created as Lead', async () => {
  fakeFetch((url, opts) => {
    if (url.includes('/properties/contacts/')) return reply(404, {});
    if (url.endsWith('/properties/contacts')) return reply(201, {});
    if (url.endsWith('/search')) return reply(200, { results: [] });
    if (url.endsWith('/objects/contacts') && opts.method === 'POST') return reply(201, { id: '101' });
    return reply(500, {});
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq(r.results, [{ email: 'dana.levi@vantelopay.com', action: 'created', id: '101' }]);
  const create = calls.find((c) => c.url.endsWith('/objects/contacts'));
  t.eq([create.body.properties.lifecyclestage, create.body.properties.grain_conference_summary], ['lead', 'Warming - act now · 3 meetings']);
  t.eq(calls.filter((c) => c.url.endsWith('/properties/contacts')).length, 2);
});
test('hubspot: existing contact -> updated, lifecycle stage untouched', async () => {
  fakeFetch((url) => {
    if (url.includes('/properties/contacts/')) return reply(200, {});
    if (url.endsWith('/search')) return reply(200, { results: [{ id: '55' }] });
    if (url.endsWith('/objects/contacts/55')) return reply(200, { id: '55' });
    return reply(500, {});
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq(r.results[0].action, 'updated');
  t.ok(!('lifecyclestage' in calls.find((c) => c.method === 'PATCH').body.properties), 'no stage on update');
});
test('hubspot: created a moment ago (409 on create) -> updates the existing id', async () => {
  fakeFetch((url, opts) => {
    if (url.includes('/properties/contacts/')) return reply(200, {});
    if (url.endsWith('/search')) return reply(200, { results: [] });
    if (url.endsWith('/objects/contacts') && opts.method === 'POST') return reply(409, { message: 'Contact already exists. Existing ID: 77' });
    if (url.endsWith('/objects/contacts/77')) return reply(200, { id: '77' });
    return reply(500, {});
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq([r.results[0].action, r.results[0].id], ['updated', '77']);
});
test('hubspot: bad token -> hubspot_auth', async () => {
  fakeFetch(() => reply(401, {}));
  t.eq(parse(await hubspot.handler(post({ token: 'bad', contacts: [dana] }))).error, 'hubspot_auth');
});
test('hubspot: contact without email is reported, not sent', async () => {
  fakeFetch((url) => (url.includes('/properties/') ? reply(200, {}) : reply(500, {})));
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [{ ...dana, email: '' }] })));
  t.eq(r.results[0], { email: '', action: 'error', message: 'No email' });
});

test('arc prompt: includes today\'s date so deadlines are judged against it', () => {
  const p = arcPrompt({ today: '2026-09-26', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture', reasons: [] } });
  t.ok(p.includes('Today is 2026-09-26'), 'has today');
  t.ok(/deadline/i.test(p.split('Today is')[1]), 'asks to weigh deadlines against today');
});
test('arc prompt: deadlines as an explicit date plus relative time (summaries are read later)', () => {
  const p = arcPrompt({ today: '2026-09-26', person: {}, encounters: [], rules: {} });
  t.ok(p.includes('"Q3 ends 30 Sep 2026, 4 days from today"'), 'gives the example format');
  t.ok(/never.*only relative/i.test(p), 'forbids relative-only wording');
});
test('hubspot: HubSpot 503 -> the status and reason are kept, marked retryable', async () => {
  fakeFetch((url) => (url.includes('/properties/') ? reply(200, {}) : url.endsWith('/search') ? reply(503, { message: 'Service Unavailable' }) : reply(500, {})));
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq(r.results[0], { email: 'dana.levi@vantelopay.com', action: 'error', message: 'HubSpot error 503: Service Unavailable', retryable: true });
});
test('hubspot: a timeout says so and is marked retryable', async () => {
  fakeFetch((url) => {
    if (url.includes('/properties/')) return reply(200, {});
    const e = new Error('aborted'); e.name = 'AbortError'; throw e;
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq(r.results[0], { email: 'dana.levi@vantelopay.com', action: 'error', message: 'HubSpot took too long to answer', retryable: true });
});
test('hubspot: a validation error (400) keeps HubSpot\'s reason and is not retryable', async () => {
  fakeFetch((url, opts) => {
    if (url.includes('/properties/')) return reply(200, {});
    if (url.endsWith('/search')) return reply(200, { results: [] });
    if (url.endsWith('/objects/contacts') && opts.method === 'POST') return reply(400, { message: 'Property values were not valid' });
    return reply(500, {});
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq(r.results[0], { email: 'dana.levi@vantelopay.com', action: 'error', message: 'HubSpot error 400: Property values were not valid', retryable: false });
});

// ---- client retry (js/api.js) ----
function fakePush(answers) {
  const sent = [];
  const push = async (contacts) => { sent.push(contacts.map((c) => c.email)); return answers[sent.length - 1]; };
  return { sent, push };
}
const created = (email) => ({ email, action: 'created', id: '1' });
const transient = (email) => ({ email, action: 'error', message: 'HubSpot took too long to answer', retryable: true });
test('client: a transient per-contact error is retried once, for that contact only', async () => {
  const { sent, push } = fakePush([{ ok: true, results: [created('a'), transient('b')] }, { ok: true, results: [created('b')] }]);
  const r = await pushWithRetry(push, [{ email: 'a' }, { email: 'b' }], 0);
  t.eq(sent, [['a', 'b'], ['b']]);
  t.eq(r.results.map((x) => [x.email, x.action, !!x.retried]), [['a', 'created', false], ['b', 'created', true]]);
});
test('client: a permanent error is not retried', async () => {
  const { sent, push } = fakePush([{ ok: true, results: [{ email: 'a', action: 'error', message: 'HubSpot error 400: bad', retryable: false }] }]);
  const r = await pushWithRetry(push, [{ email: 'a' }], 0);
  t.eq([sent.length, r.results[0].message, !!r.results[0].retried], [1, 'HubSpot error 400: bad', false]);
});
test('client: a whole-request transient failure (e.g. function timed out) is retried once', async () => {
  const { sent, push } = fakePush([{ ok: false, error: 'unavailable', message: 'x' }, { ok: true, results: [created('a')] }]);
  const r = await pushWithRetry(push, [{ email: 'a' }], 0);
  t.eq([sent.length, r.ok, r.results[0].action, r.results[0].retried], [2, true, 'created', true]);
});
test('client: bad token is not retried', async () => {
  const { sent, push } = fakePush([{ ok: false, error: 'hubspot_auth', message: 'HubSpot token invalid or missing permissions' }]);
  const r = await pushWithRetry(push, [{ email: 'a' }], 0);
  t.eq([sent.length, r.ok, r.error], [1, false, 'hubspot_auth']);
});
test('client: still failing after the retry -> latest reason, marked as retried', async () => {
  const { sent, push } = fakePush([{ ok: true, results: [transient('a')] }, { ok: true, results: [{ ...transient('a'), message: 'HubSpot error 502: Bad Gateway' }] }]);
  const r = await pushWithRetry(push, [{ email: 'a' }], 0);
  t.eq([sent.length, r.results[0].message, r.results[0].retried], [2, 'HubSpot error 502: Bad Gateway', true]);
});

// ---- AI retry (js/api.js, shared by the relationship summary, follow-up draft and add-conference calls) ----
test('AI retry: a transient error (timeout/unavailable/busy) is retried once, calling onRetry before the retry', async () => {
  const order = [];
  const call = async () => {
    order.push('call');
    return order.length === 1 ? { ok: false, error: 'timeout', message: 'Took too long' } : { ok: true, result: 'done' };
  };
  const r = await withAiRetry(call, () => order.push('onRetry'));
  t.eq([order, r], [['call', 'onRetry', 'call'], { ok: true, result: 'done' }]);
});
test('AI retry: a permanent error (e.g. a bad key) is not retried', async () => {
  let calls = 0;
  const call = async () => { calls += 1; return { ok: false, error: 'bad_key', message: 'x' }; };
  const r = await withAiRetry(call, () => { throw new Error('should not retry a permanent error'); });
  t.eq([calls, r.error], [1, 'bad_key']);
});
test('AI retry: still failing after the retry returns the second (latest) failure, no further retries', async () => {
  let calls = 0;
  const call = async () => { calls += 1; return { ok: false, error: 'busy', message: `attempt ${calls}` }; };
  const r = await withAiRetry(call);
  t.eq([calls, r.message], [2, 'attempt 2']);
});
test('AI retry: success on the first try never calls onRetry', async () => {
  const r = await withAiRetry(async () => ({ ok: true, result: 1 }), () => { throw new Error('should not retry a success'); });
  t.eq(r, { ok: true, result: 1 });
});

// Run async tests one by one, then report like tests/run.mjs.
t.group('Netlify functions (fake network)');
for (const [name, fn] of tests) {
  try { await fn(); results.push({ group: 'Netlify functions (fake network)', name, ok: true }); }
  catch (e) { results.push({ group: 'Netlify functions (fake network)', name, ok: false, error: e.message }); }
}
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  ok   ${r.name}`);
  else { failed++; console.log(`  FAIL ${r.name}\n       ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
