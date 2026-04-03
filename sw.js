// Service Worker para Todo Bien
const CACHE_NAME = 'todo-bien-v1';
const urlsToCache = [
  './',
  './index.html',
  './admin/',
  './admin/index.html',
  './manifest.json',
  './manifest-admin.json',
  './logo.png',
  './og-image.png',
  './sw.js',
  './todobien_script.gs',
  './espera1.jpg',
  './espera2.jpg',
  './consu1.jpg',
  './consu2.jpg',
  './ref1.png',
  './ref2.png',
  './yape.png',
  './plin.png'
];

// Instalar service worker y cachear archivos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activar service worker y limpiar caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Intercept peticiones y servir desde cache si está disponible
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).catch(() => {
          if (event.request.destination === 'image') {
            return caches.match('/logo.png');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

