// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';
import store from './store.test.js';
import ui from './ui.test.js';
import matching from './matching.test.js';
import signals from './signals.test.js';
import validate from './validate.test.js';

export const suites = [scoring, store, ui, matching, signals, validate];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
