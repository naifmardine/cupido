// Service worker do Cupido — instalável + offline, SEM servir versão velha.
// Estratégia network-first: online sempre pega o arquivo mais novo (atualizações
// aparecem na hora); offline cai no cache. Nunca cacheia /api (dados sempre frescos).
const CACHE = 'cupido-v2';
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
  if (req.method !== 'GET' || url.origin !== location.origin) return;      // API/externos → rede direto
  if (url.pathname.startsWith('/api') || url.pathname === '/health') return; // dados nunca cacheados
  // network-first: sempre tenta a versão mais nova e atualiza o cache; offline → cache (ou index)
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone));
      }
      return res;
    }).catch(() => caches.match(req).then((c) => c || caches.match('/')))
  );
});
