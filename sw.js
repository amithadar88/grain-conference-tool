// Offline cache. Network-first: when online, every request goes to the network (so new deploys
// show up immediately) and refreshes the saved copy. Only when the network fails or takes more
// than 3 seconds do we answer from the saved copy. No sync, no queues.
// When you add a file to the app, add it to SHELL and bump CACHE.
const CACHE = 'grain-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'js/app.js',
  'js/store.js',
  'js/scoring.js',
  'js/matching.js',
  'js/signals.js',
  'js/validate.js',
  'js/api.js',
  'js/views/ui.js',
  'js/views/eventCard.js',
  'js/views/events.js',
  'js/views/plan.js',
  'js/views/capture.js',
  'js/views/contacts.js',
  'js/views/settings.js',
  'data/conferences.json',
  'data/contacts.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/')) return;
  e.respondWith(networkFirst(req));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), 3000);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return savedCopy(hit);
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return savedCopy(shell);
    }
    return new Response('Offline and not saved yet', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}

// Tells the page "this came from the saved copy, the network failed": the app shows the offline
// banner even when the browser still claims to be online.
function savedCopy(res) {
  const headers = new Headers(res.headers);
  headers.set('x-grain-saved-copy', '1');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
