const CACHE_NAME = 'su-voz-v7';
const DYNAMIC_CACHE = 'su-voz-dynamic-v3';

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

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
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
  if (response?.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'Sin conexión' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then(response => {
      if (response?.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || networkFetch;
}

self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = {};
  }

  const title = data.notification?.title || 'Su Voz a Diario';
  const body = data.notification?.body || '¿Ya escuchaste Su voz hoy?';
  const link = data.webpush?.fcm_options?.link || 'https://su-voz-a-diario.github.io/su-voz-a-diario/#home';

  const options = {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    data: { url: link },
    tag: 'daily-reminder'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || 'https://su-voz-a-diario.github.io/su-voz-a-diario/#home';
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
      return client.navigate ? client.navigate(url) : undefined;
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(url);
  }
}
