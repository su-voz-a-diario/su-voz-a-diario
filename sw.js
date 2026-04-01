/**
 * Service Worker - Su Voz a Diario
 * Versión estable para PWA
 */

const CACHE_NAME = 'su-voz-v5';
const DYNAMIC_CACHE = 'su-voz-dynamic-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './data/readings.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png'
];

// ========================================
// INSTALACIÓN
// ========================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(error => {
        console.error('[SW] Error en instalación:', error);
      })
  );
});

// ========================================
// ACTIVACIÓN
// ========================================
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
              return caches.delete(key);
            }
          })
        )
      ),
      self.clients.claim()
    ])
  );
});

// ========================================
// FETCH
// ========================================
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Solo manejar GET
  if (request.method !== 'GET') return;

  // Solo manejar mismo origen
  if (url.origin !== self.location.origin) return;

  // JSON de lecturas: network first
  if (url.pathname.includes('/data/readings.json')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Imágenes: cache first
  if (request.destination === 'image') {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // HTML / CSS / JS: stale while revalidate
  event.respondWith(staleWhileRevalidateStrategy(request));
});

async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);

    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'Sin conexión. Este recurso no está disponible.' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(error => {
      console.log('[SW] Error fetch:', error);
    });

  return cached || networkFetch;
}

// ========================================
// MENSAJES DESDE LA APP
// ========================================
self.addEventListener('message', event => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'APP_READY':
      console.log('[SW] App lista');
      break;

    case 'CHECK_READ_STATUS':
      break;

    case 'NAVIGATE_TO':
      break;

    case 'SYNC_COMPLETE':
      console.log('[SW] Sync completa');
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    default:
      console.log('[SW] Mensaje recibido:', event.data);
  }
});

// ========================================
// CLICK EN NOTIFICACIONES
// ========================================
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || './#home';

  event.waitUntil(openAppAndNavigate(targetUrl));
});

async function openAppAndNavigate(url) {
  const clientsList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of clientsList) {
    if ('focus' in client) {
      await client.focus();
      client.postMessage({ type: 'NAVIGATE_TO', url });
      return;
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(url);
  }
}

// ========================================
// PUSH (opcional futuro)
// ========================================
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body || 'Nueva reflexión disponible',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    data: { url: data.url || './#home' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Su Voz a Diario', options)
  );
});
