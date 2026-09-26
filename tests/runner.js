// Tiny test runner shared by tests.html (browser) and tests/run.mjs (command line).
export function createRunner() {
  const results = [];
  let group = '';
  const t = {
    group(name) { group = name; },
    test(name, fn) {
      try {
        fn();
        results.push({ group, name, ok: true });
      } catch (e) {
        results.push({ group, name, ok: false, error: e && e.message ? e.message : String(e) });
      }
    },
    eq(actual, expected, label = '') {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`${label ? label + ': ' : ''}expected ${b}, got ${a}`);
    },
    ok(cond, label = 'expected true') {
      if (!cond) throw new Error(label);
    },
  };
  return { t, results };
}
