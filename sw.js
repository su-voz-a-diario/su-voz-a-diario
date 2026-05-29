const APP_VERSION = 'v70';
const CACHE_NAME = `su-voz-${APP_VERSION}`;
const DYNAMIC_CACHE = `su-voz-dynamic-${APP_VERSION}`;
const OFFICIAL_ORIGIN = 'https://suvoz.app';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json?v=70',
  './css/styles.css?v=70',
  './js/app.js?v=70',
  './js/core/constants.js',
  './js/core/defaults.js',
  './js/services/storageService.js',
  './js/utils/dates.js',
  './js/utils/dom.js',
  './js/utils/formatters.js',
  './js/utils/platform.js',
  './js/utils/progress.js',
  './js/utils/text.js',
  './data/readings.json',
  './data/readings/index.json',
  './data/readings/2026-04.json',
  './data/readings/2026-05.json',
  './data/readings/2026-06.json',
  './data/rv1909.json',
  './data/rv1909_strong_map.json',
  './data/strong-hebrew-clean.json',
  './icons/icon-48.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/splash.png'
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
        const request = new Request(asset, { cache: 'reload' });
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
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map(key => {
          const isSuVozCache = key.startsWith('su-voz-');
          const isCurrentCache = key === CACHE_NAME || key === DYNAMIC_CACHE;

          if (isSuVozCache && !isCurrentCache) {
            return caches.delete(key);
          }

          return Promise.resolve();
        })
      );

      await self.clients.claim();

      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      clientsList.forEach(client => {
        client.postMessage({
          type: 'SW_ACTIVATED',
          version: APP_VERSION
        });
      });
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (
    self.location.hostname.includes('github.io') &&
    (
      request.mode === 'navigate' ||
      request.destination === 'document'
    )
  ) {
    const targetUrl = new URL('/', OFFICIAL_ORIGIN);
    targetUrl.search = url.search;
    targetUrl.hash = url.hash;
    event.respondWith(Response.redirect(targetUrl.href, 302));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style'
  ) {
    event.respondWith(networkFirstStrategy(request, { bypassHttpCache: true }));
    return;
  }

  if (url.pathname.includes('/data/readings.json')) {
    event.respondWith(networkFirstStrategy(request, { bypassHttpCache: true }));
    return;
  }

  if (url.pathname.includes('/data/readings/')) {
    event.respondWith(staleWhileRevalidateStrategy(request));
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

async function networkFirstStrategy(request, options = {}) {
  try {
    const networkRequest = options.bypassHttpCache
      ? new Request(request, { cache: 'reload' })
      : request;
    const response = await fetch(networkRequest);
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
    badge: './icons/icon-48.png',
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
    badge: './icons/icon-48.png',
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

console.log(`[SW] sw.js ${APP_VERSION} cargado correctamente`);
