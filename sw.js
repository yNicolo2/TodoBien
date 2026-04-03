// Service Worker para Todo Bien Clínica Dental
var CACHE_NAME = 'todobien-v1';
var urlsToCache = [
  './',
  './index.html',
  './admin.html',
  './logo.png',
  './og-image.png',
  './plin.png',
  './yape.png',
  './consu1.jpg',
  './consu2.jpg',
  './espera1.jpg',
  './espera2.jpg',
  './ref1.png',
  './ref2.png'
];

// Instalar service worker y cachear archivos
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

// Activar service worker y limpiar caches antiguos
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Intercept peticiones y servir desde cache si está disponible
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - devolver respuesta cacheada
        if (response) {
          return response;
        }
        
        // Clonar la petición
        var fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(function(response) {
          // Verificar si es una respuesta válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clonar la respuesta
          var responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        }).catch(function() {
          // Si falla la red y no está en cache, devolver offline page
          return caches.match('./index.html');
        });
      })
  );
});

// Manejar notificaciones push (opcional, para futuro)
self.addEventListener('push', function(event) {
  if (event.data) {
    var data = event.data.json();
    var options = {
      body: data.body,
      icon: './logo.png',
      badge: './logo.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Manejar click en notificaciones
self.addEventListener('notificationclick', function(event) {
  console.log('Notificación clickeada');
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});