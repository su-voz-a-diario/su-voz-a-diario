const CACHE_NAME = 'su-voz-v10';
const DYNAMIC_CACHE = 'su-voz-dynamic-v6';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './data/readings.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Firebase compat en Service Worker.
// Firebase documenta compat en SW cuando no estás bundling el worker.
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyATEQ0kmd3HPloNlZ872t8C11jiYitLkUk",
  authDomain: "su-voz-a-diario.firebaseapp.com",
  projectId: "su-voz-a-diario",
  storageBucket: "su-voz-a-diario.firebasestorage.app",
  messagingSenderId: "372912228994",
  appId: "1:372912228994:web:f252b44bdbd00d7c56429b"
});

const messaging = firebase.messaging();

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    for (const asset of STATIC_ASSETS) {
      try {
        const request = new Request(asset, { cache: 'no-cache' });
        const response = await fetch(request);

        if (!response.ok) {
          console.warn('[SW] No se pudo precachear:', asset, response.status);
          continue;
        }

        await cache.put(request, response.clone());
      } catch (error) {
        console.warn('[SW] Error precacheando:', asset, error);
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/readings.json')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  event.respondWith(staleWhileRevalidateStrategy(request));
});

async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'Sin conexión' }),
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
    .catch(() => null);

  if (cached) return cached;

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  return new Response('Sin conexión', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// Background messages con Firebase Messaging
messaging.onBackgroundMessage((payload) => {
  console.log('[sw] Background push recibido:', payload);

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    'Su Voz a Diario';

  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    'Tienes una nueva notificación';

  const url =
    payload?.data?.url ||
    payload?.fcmOptions?.link ||
    './#home';

  const tag =
    payload?.data?.tag ||
    `notif-${Date.now()}`;

  const options = {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    data: { url },
    tag,
    renotify: false,
    requireInteraction: false
  };

  self.registration.showNotification(title, options);
});

// Fallback para push genérico no-Firebase
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (error) {
    data = {};
  }

  const title =
    data?.notification?.title ||
    data?.title ||
    'Su Voz a Diario';

  const body =
    data?.notification?.body ||
    data?.body ||
    'Tienes una nueva notificación';

  const url =
    data?.data?.url ||
    data?.url ||
    './#home';

  const tag =
    data?.data?.tag ||
    data?.tag ||
    `notif-${Date.now()}`;

  const options = {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    data: { url },
    tag,
    renotify: false,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const rawUrl = event.notification?.data?.url || './#home';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(openAppAndNavigate(targetUrl));
});

async function openAppAndNavigate(url) {
  const clientsList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of clientsList) {
    const clientUrl = client.url || '';
    const sameApp = clientUrl.startsWith(self.location.origin);

    if (sameApp && 'focus' in client) {
      await client.focus();

      if ('navigate' in client) {
        return client.navigate(url);
      }

      return;
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(url);
  }
}

console.log('[SW NUEVO] sw.js v9 cargado correctamente');
