/*
 * service-worker.js — deixa o Fodinha funcionando sem internet.
 * Ao publicar uma nova versão, aumente CACHE_VERSION para os aparelhos baixarem os arquivos novos.
 * Todos os caminhos são relativos à pasta do site (funciona em subdiretório do GitHub Pages).
 */
var CACHE_VERSION = 'fodinha-v1.1.1';
var APP_FILES = [
  './',
  'index.html',
  'manifest.json',
  'assets/css/app.css',
  'assets/js/runtime.js',
  'assets/js/storage.js',
  'assets/js/app.js',
  'assets/fonts/bricolage-grotesque-latin-wght-normal.woff2',
  'assets/fonts/figtree-latin-wght-normal.woff2',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-48.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (cache) { return cache.addAll(APP_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('fodinha-') === 0 && k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Arquivos do app: cache primeiro (abre na hora, inclusive offline) e atualiza em segundo plano. */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE_VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () { return null; });
      if (hit) { event.waitUntil(net); return hit; }
      return net.then(function (res) {
        if (res) return res;
        if (req.mode === 'navigate') return cache.match('index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    });
  }));
});
