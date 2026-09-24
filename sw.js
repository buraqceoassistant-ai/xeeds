/* Service worker: сайт открывается и работает без интернета.
   Данные приложения живут в localStorage, здесь кэшируются только файлы сайта
   (данные для входа — только зашифрованный data/vault.json).
   BUILD подставляется при деплое (см. .github/workflows/pages.yml) — новая сборка
   получает новый кэш, старый удаляется. Запросы на другие домены (плитки карты,
   Google Таблица) не перехватываются. */
const BUILD = '__BUILD__';
const CACHE = 'logi-' + BUILD;
const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'css/design-system.css',
  'css/app.css',
  'css/mobile.css',
  'js/vendor/react.production.min.js',
  'js/vendor/react-dom.production.min.js',
  'js/dc-runtime.js',
  'js/logi-engine.js',
  'js/xlsx-io.js',
  'js/auth.js',
  'data/vault.json',
  'js/logi-gs-script.js',
  'js/app-shell.js',
  'js/vendor/leaflet/leaflet.js',
  'js/vendor/leaflet/leaflet.css',
  'js/vendor/leaflet/images/layers.png',
  'js/vendor/leaflet/images/layers-2x.png',
  'js/vendor/leaflet/images/marker-icon.png',
  'js/vendor/leaflet/images/marker-icon-2x.png',
  'js/vendor/leaflet/images/marker-shadow.png',
  'img/logo.png',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/barlow-400-latin.woff2',
  'fonts/barlow-400-latin-ext.woff2',
  'fonts/barlow-500-latin.woff2',
  'fonts/barlow-500-latin-ext.woff2',
  'fonts/barlow-700-latin.woff2',
  'fonts/barlow-700-latin-ext.woff2',
  'fonts/barlow-condensed-400-latin.woff2',
  'fonts/barlow-condensed-400-latin-ext.woff2',
  'fonts/barlow-condensed-600-latin.woff2',
  'fonts/barlow-condensed-600-latin-ext.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('logi-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Страница — из кэша той же сборки, что и остальные файлы (иначе новая страница может
  // встретиться со старыми скриптами и данными). Новая сборка ставится в фоне и
  // включается со следующего открытия.
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then(hit => hit || fetch(req)));
    return;
  }

  // Файлы сайта: из кэша этой сборки, недостающие — из сети с сохранением.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
