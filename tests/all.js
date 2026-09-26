// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';

export const suites = [scoring];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
