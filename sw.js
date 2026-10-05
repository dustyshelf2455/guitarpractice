// Service worker: precache the whole app so it works offline after first load.
// Bump VERSION whenever any file changes, so phones pick up the new version.

const VERSION = 'timebox-v12';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/lounge.css',
  'fonts/fraunces-normal.woff2',
  'fonts/fraunces-italic.woff2',
  'js/main.js',
  'js/util.js',
  'js/defaults.js',
  'js/engine.js',
  'js/plan.js',
  'js/store.js',
  'js/state.js',
  'js/stats.js',
  'js/transfer.js',
  'js/charts.js',
  'js/music.js',
  'js/diagrams.js',
  'js/notation.js',
  'js/audio.js',
  'js/wakelock.js',
  'js/views/common.js',
  'js/views/sheets.js',
  'js/views/session.js',
  'js/views/focus.js',
  'js/views/diagram-editor.js',
  'js/views/metronome.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // cache: 'reload' skips the HTTP cache so a new version never precaches stale files.
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('timebox-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App shell for navigations (any route is the same page; routing uses the hash).
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy));
      }
      return res;
    })),
  );
});
