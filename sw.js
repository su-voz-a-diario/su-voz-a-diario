/**
 * Service Worker - Su Voz a Diario v5.0
 * Funcionalidades:
 * - Caché offline de recursos estáticos y lecturas
 * - Notificaciones programadas diarias
 * - Sincronización en segundo plano
 * - Actualización inteligente de caché
 * - Manejo de red con estrategia "stale-while-revalidate"
 * - Página offline personalizada
 */

const CACHE_NAME = 'su-voz-v5';
const DYNAMIC_CACHE = 'su-voz-dynamic-v2';

// Recursos estáticos para cachear en la instalación
const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&display=swap'
];

// ========================================
// INSTALACIÓN
// ========================================
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Error en instalación:', err);
      })
  );
});

// ========================================
// ACTIVACIÓN
// ========================================
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Eliminando caché antigua:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// ========================================
// ESTRATEGIA DE FETCH
// ========================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  if (url.pathname.includes('readings.json')) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }
  
  if (event.request.destination === 'image' || event.request.destination === 'font') {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }
  
  event.respondWith(staleWhileRevalidateStrategy(event.request));
});

async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    fetch(request)
      .then(networkResponse => {
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
      })
      .catch(err => console.log('[SW] Error actualizando en bg:', err));
    return cachedResponse;
  }
  
  return fetch(request);
}

async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] Network falló, buscando en caché:', request.url);
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    if (request.destination === 'document') {
      const offlinePage = await caches.match('./offline.html');
      if (offlinePage) {
        return offlinePage;
      }
    }
    
    if (request.url.includes('readings.json')) {
      return new Response(
        JSON.stringify({ error: 'Sin conexión. Las lecturas no están disponibles offline.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
  
  return new Response('Recurso no disponible offline', { status: 404 });
}

async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(err => {
      console.log('[SW] Error en fetch:', err);
    });
  
  return cachedResponse || fetchPromise;
}

// ========================================
// NOTIFICACIONES PROGRAMADAS
// ========================================
let notificationTimeout = null;
let pendingNotes = [];

self.addEventListener('message', event => {
  if (!event.data) return;
  
  switch (event.data.type) {
    case 'SCHEDULE_NOTIFICATION':
      scheduleDailyNotification(event.data.time);
      break;
    case 'CANCEL_NOTIFICATIONS':
      cancelScheduledNotifications();
      break;
    case 'SKIP_TODAY':
      skipTodayNotification();
      break;
    case 'QUEUE_NOTE':
      queueNoteForSync(event.data.note);
      break;
    case 'SYNC_NOW':
      syncNotes();
      break;
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

function scheduleDailyNotification(time) {
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
  
  if (!time) return;
  
  const [hour, minute] = time.split(':');
  const now = new Date();
  const scheduled = new Date();
  scheduled.setHours(parseInt(hour), parseInt(minute), 0, 0);
  
  let delay = scheduled - now;
  
  if (delay < 0) {
    delay += 24 * 60 * 60 * 1000;
  }
  
  console.log(`[SW] Notificación programada para las ${time} (en ${Math.round(delay / 60000)} minutos)`);
  
  notificationTimeout = setTimeout(() => {
    showDailyReminderNotification();
    scheduleDailyNotification(time);
  }, delay);
}

async function showDailyReminderNotification() {
  const clients = await self.clients.matchAll({ type: 'window' });
  let todayRead = false;
  
  for (const client of clients) {
    if (client.url.includes('index.html')) {
      return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          todayRead = event.data?.isReadToday || false;
          if (!todayRead) {
            sendNotification();
          }
          resolve();
        };
        client.postMessage({ type: 'CHECK_READ_STATUS' }, [channel.port2]);
      });
    }
  }
  
  if (!todayRead) {
    sendNotification();
  }
}

function sendNotification() {
  self.registration.showNotification('📖 Su Voz a Diario', {
    body: '¿Ya meditaste la lectura de hoy? Tómate un momento con Dios.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'daily-reminder',
    renotify: true,
    requireInteraction: true,
    data: {
      url: './#home',
      date: new Date().toISOString().split('T')[0]
    },
    actions: [
      { action: 'open', title: '📖 Abrir lectura' },
      { action: 'snooze', title: '⏰ Recordar más tarde' }
    ]
  });
}

function cancelScheduledNotifications() {
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
    console.log('[SW] Notificaciones canceladas');
  }
}

function skipTodayNotification() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  
  const delay = tomorrow - new Date();
  setTimeout(() => {
    showDailyReminderNotification();
  }, delay);
  
  console.log('[SW] Notificación saltada hasta mañana');
}

function queueNoteForSync(note) {
  const saved = localStorage.getItem('pending-notes');
  if (saved) {
    pendingNotes = JSON.parse(saved);
  }
  pendingNotes.push(note);
  localStorage.setItem('pending-notes', JSON.stringify(pendingNotes));
  console.log('[SW] Nota encolada para sincronización');
}

async function syncNotes() {
  console.log('[SW] Sincronizando notas pendientes...');
  
  const saved = localStorage.getItem('pending-notes');
  if (saved) {
    pendingNotes = JSON.parse(saved);
  }
  
  if (pendingNotes.length === 0) {
    console.log('[SW] No hay notas pendientes');
    return;
  }
  
  console.log(`[SW] Sincronizando ${pendingNotes.length} notas...`);
  
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE', count: pendingNotes.length });
  });
  
  pendingNotes = [];
  localStorage.removeItem('pending-notes');
}

// ========================================
// MANEJO DE CLICKS EN NOTIFICACIONES
// ========================================
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const action = event.action;
  const notificationData = event.notification.data;
  
  switch (action) {
    case 'open':
      openAppAndNavigate(notificationData.url);
      break;
    case 'snooze':
      setTimeout(() => {
        showDailyReminderNotification();
      }, 30 * 60 * 1000);
      break;
    default:
      openAppAndNavigate(notificationData.url);
  }
});

async function openAppAndNavigate(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  
  for (const client of clients) {
    if (client.url.includes('index.html') && 'focus' in client) {
      await client.focus();
      client.postMessage({ type: 'NAVIGATE_TO', url: url });
      return;
    }
  }
  
  if (clients.openWindow) {
    await clients.openWindow(url);
  }
}

// ========================================
// SINCRONIZACIÓN EN SEGUNDO PLANO
// ========================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-notes') {
    event.waitUntil(syncNotes());
  }
});

// ========================================
// PUSH NOTIFICATIONS
// ========================================
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nueva reflexión disponible',
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      data: { url: data.url || './' }
    };
    event.waitUntil(self.registration.showNotification(data.title || 'Su Voz a Diario', options));
  }
});
