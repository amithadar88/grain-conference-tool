// App shell: loads the seed data, creates the store, switches tabs, tracks online/offline.
import { createStore, safeStorage } from './store.js';
import { esc, localToday, initials } from './views/ui.js';
import * as today from './views/today.js';
import * as events from './views/events.js';
import * as plan from './views/plan.js';
import * as capture from './views/capture.js';
import * as contacts from './views/contacts.js';
import * as settings from './views/settings.js';
import * as add from './views/addConference.js';

const VIEWS = { today, events, plan, capture, contacts, settings, add };
const TAB_OF = { add: 'events' }; // sub-pages highlight their parent tab
const viewEl = document.getElementById('view');
const netEl = document.getElementById('net');
const userBtn = document.getElementById('user-btn');
const userDropdown = document.getElementById('user-dropdown');

// Header user icon: generic person icon for "Team (everyone)", initials once someone is
// chosen. No switcher inside the pages — this is the one place "I am" is set from.
function personIconSVG() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
}
function renderUserMenu(store) {
  const me = store.settings().me;
  userBtn.innerHTML = me ? `<span class="user-initials">${esc(initials(me))}</span>` : personIconSVG();
  const options = ['', ...store.team()];
  userDropdown.innerHTML = options.map((name) => {
    const label = name || 'Team (everyone)';
    const active = name === me;
    return `<button type="button" class="user-option" data-me="${esc(name)}" role="menuitemradio" aria-checked="${active}">
      <span>${esc(label)}</span>${active ? '<span aria-hidden="true">✓</span>' : ''}
    </button>`;
  }).join('');
}
function closeUserMenu() {
  userDropdown.hidden = true;
  userBtn.setAttribute('aria-expanded', 'false');
}
function setupUserMenu(store, ctx) {
  renderUserMenu(store);
  store.onChange(() => renderUserMenu(store));
  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = userDropdown.hidden;
    userDropdown.hidden = !open;
    userBtn.setAttribute('aria-expanded', String(open));
  });
  userDropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-me]');
    if (!opt) return;
    store.updateSettings({ me: opt.dataset.me });
    closeUserMenu();
    render(ctx); // Today/Plan read "I am" directly, so the current page needs a fresh render
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.user-menu')) closeUserMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUserMenu(); });
}

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
    // no-cache: always revalidate with the server, so an edited seed file (or a stale
    // browser disk cache) never wins over a fresh deploy, on localhost or Netlify.
    const r = await fetch(p, { cache: 'no-cache' });
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
  setupUserMenu(store, ctx);
  if (!location.hash) location.replace('#today');
  window.addEventListener('hashchange', () => render(ctx));
  window.addEventListener('online', checkNetwork);
  window.addEventListener('offline', () => { reachable = false; checkNetwork(); });
  render(ctx);
  checkNetwork();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
