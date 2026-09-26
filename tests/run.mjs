// Command-line test run: node tests/run.mjs  (same tests as tests.html)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
