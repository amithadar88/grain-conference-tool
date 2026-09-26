// App shell: loads the seed data, creates the store, switches tabs, tracks online/offline.
import { createStore, safeStorage } from './store.js';
import { runningToday } from './scoring.js';
import { localToday } from './views/ui.js';
import * as events from './views/events.js';
import * as plan from './views/plan.js';
import * as capture from './views/capture.js';
import * as contacts from './views/contacts.js';
import * as settings from './views/settings.js';

const VIEWS = { events, plan, capture, contacts, settings };
const TAB_OF = { add: 'events' }; // sub-pages highlight their parent tab
const viewEl = document.getElementById('view');
const netEl = document.getElementById('net');

// Buttons that need a connection carry data-needs-net. Toggle them without re-rendering,
// so a flaky connection never wipes what the rep is typing.
function applyNet() {
  const online = navigator.onLine;
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
  window.addEventListener('online', applyNet);
  window.addEventListener('offline', applyNet);
  render(ctx);
}

boot();
