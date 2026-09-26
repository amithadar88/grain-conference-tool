// Command-line test run: node tests/run.mjs  (same tests as tests.html)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { createRunner } from './runner.js';
import { runAll } from './all.js';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const data = { conferences: read('data/conferences.json'), contacts: read('data/contacts.json') };

const { t, results } = createRunner();
runAll(t, data);

// Node-only check: the offline cache (sw.js) must list every app file, and only files that exist.
if (existsSync(new URL('sw.js', root))) {
  t.group('Offline cache');
  t.test('sw.js SHELL matches the files on disk', () => {
    const src = readFileSync(new URL('sw.js', root), 'utf8');
    const shell = JSON.parse(src.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
    const missing = shell.filter((f) => f !== './' && !existsSync(new URL(f, root)));
    t.eq(missing, [], 'listed in SHELL but missing on disk');
    const jsFiles = [
      ...readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
      ...readdirSync(new URL('js/views/', root)).filter((f) => f.endsWith('.js')).map((f) => `js/views/${f}`),
    ];
    t.eq(jsFiles.filter((f) => !shell.includes(f)), [], 'app files not in SHELL');
  });

  // Run sw.js in a fake browser: one request with the network down, one with it up.
  const swFetch = async (networkUp) => {
    const listeners = {};
    const saved = new Response('{"saved":true}', { headers: { 'content-type': 'application/json' } });
    const cache = { match: async () => saved.clone(), put: async () => {}, addAll: async () => {} };
    vm.runInNewContext(readFileSync(new URL('sw.js', root), 'utf8'), {
      self: { addEventListener: (type, fn) => { listeners[type] = fn; }, location: { origin: 'https://grain.test' }, skipWaiting() {}, clients: { claim() {} } },
      caches: { open: async () => cache, keys: async () => [] },
      fetch: async () => { if (!networkUp) throw new TypeError('Failed to fetch'); return new Response('{"fresh":true}'); },
      URL, Response, Headers, Promise, setTimeout, clearTimeout,
    });
    let answer;
    listeners.fetch({ request: { method: 'GET', url: 'https://grain.test/data/conferences.json', mode: 'cors' }, respondWith: (p) => { answer = p; } });
    const res = await answer;
    return { mark: res.headers.get('x-grain-saved-copy'), body: await res.text() };
  };
  const [down, up] = [await swFetch(false), await swFetch(true)];
  t.test('sw.js: network down -> the saved copy is served, marked as the saved copy', () => {
    t.eq(down, { mark: '1', body: '{"saved":true}' });
  });
  t.test('sw.js: network up -> the fresh answer, not marked', () => {
    t.eq(up, { mark: null, body: '{"fresh":true}' });
  });
}

let failed = 0;
let group = null;
for (const r of results) {
  if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
  if (r.ok) console.log(`  ok   ${r.name}`);
  else { failed++; console.log(`  FAIL ${r.name}\n       ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
