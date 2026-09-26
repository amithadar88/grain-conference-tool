// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';
import store from './store.test.js';
import ui from './ui.test.js';

export const suites = [scoring, store, ui];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
