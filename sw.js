/* ask.netcn.org service worker：HTML 网络优先，静态资源缓存优先。
   只缓存同源 GET；不缓存搜索 API 以外的 JSON。 */
const VERSION = 'ask-2026-11-19a';
const CORE = [
  '/',
  '/assets/css/main.css',
  '/shell/netcn-shell.css',
  '/shell/netcn-ui.css',
  '/shell/shell.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/apple-touch-icon.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('/')))
    );
    return;
  }

  if (/^\/assets\/|\/shell\/|\/data\/hub-search-/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});
