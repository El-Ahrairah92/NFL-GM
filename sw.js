// Offline support: always try the network first (so an update is picked up at once),
// and fall back to the last copy that loaded when there is no connection.
const CACHE = 'gridiron-gm-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const key = url.origin + url.pathname; // the page asks for scripts with a cache-busting ?v=...; store one copy per file
  e.respondWith(
    fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); } return res; })
      .catch(() => caches.open(CACHE).then(c => c.match(key)).then(hit => hit || (req.mode === 'navigate' ? caches.open(CACHE).then(c => c.match(url.origin + url.pathname.replace(/[^/]*$/, '') + 'index.html')) : Response.error())))
  );
});
