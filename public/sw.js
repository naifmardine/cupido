// Service worker do Cupido — deixa o app instalável e o shell instantâneo no mobile,
// mesmo enquanto o servidor "acorda". Nunca cacheia /api (dados sempre frescos).
const CACHE = 'cupido-v1';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/charts.js', '/exif.js', '/bac.js',
  '/manifest.webmanifest', '/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // só mexe em GET da mesma origem; dados/foto (/api) e /health vão sempre à rede
  if (req.method !== 'GET' || url.origin !== location.origin ||
      url.pathname.startsWith('/api') || url.pathname === '/health') return;
  // stale-while-revalidate: responde do cache na hora e atualiza em segundo plano
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
