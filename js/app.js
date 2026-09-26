// App shell: loads the seed data, creates the store, switches tabs, tracks online/offline.
import { createStore, safeStorage } from './store.js';
import { runningToday } from './scoring.js';
import { localToday } from './views/ui.js';
import * as events from './views/events.js';
import * as plan from './views/plan.js';
import * as capture from './views/capture.js';
import * as contacts from './views/contacts.js';
import * as settings from './views/settings.js';
import * as add from './views/addConference.js';

const VIEWS = { events, plan, capture, contacts, settings, add };
const TAB_OF = { add: 'events' }; // sub-pages highlight their parent tab
const viewEl = document.getElementById('view');
const netEl = document.getElementById('net');

// Can we actually reach the server? navigator.onLine alone isn't enough: after a reload with
// DevTools "Offline" (and on some captive Wi-Fi) Chrome keeps saying "online" while every request
// fails, and the saved copy still opens the app. A HEAD request with no-store skips both the
// service worker (it only answers GETs) and the browser cache, so it really goes to the network.
let reachable = true;
let recheck = null;
async function checkNetwork() {
  clearTimeout(recheck);
  if (navigator.onLine) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      await fetch('index.html', { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
      reachable = true;
    } catch {
      reachable = false;
    } finally {
      clearTimeout(timer);
    }
  }
  applyNet();
  if (!navigator.onLine || !reachable) recheck = setTimeout(checkNetwork, 15000); // no "online" event may come
}

// Buttons that need a connection carry data-needs-net. Toggle them without re-rendering,
// so a flaky connection never wipes what the rep is typing.
function applyNet() {
  const online = navigator.onLine && reachable;
  netEl.hidden = online;
  document.querySelectorAll('[data-needs-net]').forEach((b) => {
    b.disabled = !online || b.dataset.blocked === 'true';
    b.title = online ? '' : 'Needs connection';
  });
  document.querySelectorAll('.needs-net-hint').forEach((h) => { h.hidden = online; });
}

async function loadSeed() {
  const get = async (p) => {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  };
  const [conferences, contactsData] = await Promise.all([get('data/conferences.json'), get('data/contacts.json')]);
  return { conferences, contacts: contactsData };
}

function render(ctx) {
  const [name, ...rest] = location.hash.slice(1).split('/');
  const param = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  const view = VIEWS[name] || VIEWS.events;
  const tab = TAB_OF[name] || (VIEWS[name] ? name : 'events');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  ctx.today = localToday();
  view.render(viewEl, ctx, param);
  applyNet();
  window.scrollTo(0, 0);
}

async function boot() {
  let seed;
  try {
    seed = await loadSeed();
  } catch {
    viewEl.innerHTML = '<p class="error pad">Couldn\'t load the event data. Check your connection and reload.</p>';
    return;
  }
  const store = createStore({ seed, storage: safeStorage(window.localStorage) });
  const ctx = { store, today: localToday(), applyNet, go: (hash) => { location.hash = hash; } };
  if (!location.hash) {
    location.replace(`#${runningToday(store.conferences(), ctx.today) ? 'capture' : 'events'}`);
  }
  window.addEventListener('hashchange', () => render(ctx));
  window.addEventListener('online', checkNetwork);
  window.addEventListener('offline', () => { reachable = false; checkNetwork(); });
  render(ctx);
  checkNetwork();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
