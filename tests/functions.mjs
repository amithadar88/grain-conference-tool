// Command-line checks for the Netlify functions with a FAKE network (no keys, no real calls):
//   node tests/functions.mjs
// The real end-to-end check is the live-site checklist.
import { createRequire } from 'node:module';
import { createRunner } from './runner.js';

const require = createRequire(import.meta.url);
const ai = require('../netlify/functions/ai.js');

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
const { checkUrl, htmlToText } = ai._test;

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
