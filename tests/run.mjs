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

  // Run sw.js in a fake browser.
  const runSw = (networkUp) => {
    const listeners = {};
    const calls = [];
    const saved = new Response('{"saved":true}', { headers: { 'content-type': 'application/json' } });
    const cache = { match: async () => saved.clone(), put: async () => {}, addAll: async () => {} };
    vm.runInNewContext(readFileSync(new URL('sw.js', root), 'utf8'), {
      self: {
        addEventListener: (type, fn) => { listeners[type] = fn; }, location: { origin: 'https://grain.test' },
        skipWaiting: () => { calls.push('skipWaiting'); }, clients: { claim: () => { calls.push('claim'); } },
      },
      caches: { open: async () => cache, keys: async () => ['grain-v1', 'grain-old', 'keep-me-not'], delete: async (k) => { calls.push(`delete ${k}`); } },
      fetch: async () => { if (!networkUp) throw new TypeError('Failed to fetch'); return new Response('{"fresh":true}'); },
      URL, Response, Headers, Promise, setTimeout, clearTimeout,
    });
    const lifecycle = async (type) => { let p; listeners[type]({ waitUntil: (x) => { p = x; } }); await p; };
    const get = async () => {
      let answer;
      listeners.fetch({ request: { method: 'GET', url: 'https://grain.test/data/conferences.json', mode: 'cors' }, respondWith: (p) => { answer = p; } });
      return (await answer).text();
    };
    return { calls, lifecycle, get };
  };
  const down = runSw(false);
  const up = runSw(true);
  const [downBody, upBody] = [await down.get(), await up.get()];
  await up.lifecycle('install');
  await up.lifecycle('activate');
  t.test('sw.js: network first; the saved copy only when the network fails', () => {
    t.eq([upBody, downBody], ['{"fresh":true}', '{"saved":true}']);
  });
  t.test('sw.js: a new version takes over at once (skipWaiting + clients.claim) and drops old caches', () => {
    t.eq([up.calls.includes('skipWaiting'), up.calls.includes('claim'), up.calls.filter((c) => c.startsWith('delete')).length], [true, true, 3]);
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
