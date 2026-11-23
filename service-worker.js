/*
 * service-worker.js — deixa o Fodinha funcionando sem internet e garante atualizações limpas.
 *
 * AO PUBLICAR UMA NOVA VERSÃO: troque APP_VERSION aqui E o "?v=" dos arquivos no index.html
 * (os dois precisam ter o mesmo número). Assim o celular nunca mistura arquivos antigos e novos.
 * Todos os caminhos são relativos à pasta do site (funciona em subdiretório do GitHub Pages).
 */
var APP_VERSION = '1.2.0';
var CACHE_VERSION = 'fodinha-v' + APP_VERSION;
var Q = '?v=' + APP_VERSION;
var APP_FILES = [
  './',
  'index.html',
  'manifest.json',
  'assets/css/app.css' + Q,
  'assets/js/runtime.js' + Q,
  'assets/js/storage.js' + Q,
  'assets/js/app.js' + Q,
  'assets/fonts/bricolage-grotesque-latin-wght-normal.woff2',
  'assets/fonts/figtree-latin-wght-normal.woff2',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-48.png'
];

/* Instala baixando tudo direto do servidor (sem cache HTTP), para todos os arquivos serem da mesma versão. */
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (cache) {
    return cache.addAll(APP_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('fodinha-') === 0 && k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  /* Página: busca a versão mais nova na internet; sem internet, usa a guardada. */
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put('index.html', copy); }); }
      return res;
    }).catch(function () {
      return caches.match('index.html').then(function (hit) { return hit || caches.match('./'); });
    }));
    return;
  }

  /* Arquivos do app (CSS/JS com ?v=, fontes, ícones): guardados primeiro, internet se faltar. */
  event.respondWith(caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return new Response('', { status: 504, statusText: 'Offline' }); });
  }));
});
