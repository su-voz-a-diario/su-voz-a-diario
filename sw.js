/**
 * Service Worker - Su Voz a Diario
 * Versión 3.0 con Push Notifications
 */

const CACHE_NAME = 'su-voz-v6';
const DYNAMIC_CACHE = 'su-voz-dynamic-v2';
const REMINDER_STORAGE_KEY = 'reminder-config';

let currentNotificationTimer = null;

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
  console.log('[SW] Instalando v6...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(error => console.error('[SW] Error en instalación:', error))
  );
});

// ========================================
// ACTIVACIÓN
// ========================================
self.addEventListener('activate', event => {
  console.log('[SW] Activado - Iniciando sistema');
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
      self.clients.claim(),
      restoreReminderFromStorage()
    ])
  );
});

// ========================================
// FETCH
// ========================================
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
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(error => console.log('[SW] Error fetch:', error));

  return cached || networkFetch;
}

// ========================================
// SISTEMA DE NOTIFICACIONES
// ========================================
async function saveReminderConfig(time, enabled = true) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const config = JSON.stringify({ time, enabled, updatedAt: Date.now() });
    await cache.put(REMINDER_STORAGE_KEY, new Response(config));
    return true;
  } catch (error) {
    console.error('[SW] Error guardando:', error);
    return false;
  }
}

async function getReminderConfig() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(REMINDER_STORAGE_KEY);
    if (response) {
      return await response.json();
    }
  } catch (error) {
    console.error('[SW] Error leyendo:', error);
  }
  return { time: '08:00', enabled: true };
}

async function restoreReminderFromStorage() {
  const config = await getReminderConfig();
  if (config.enabled) {
    scheduleReminder(config.time);
  }
}

function clearReminder() {
  if (currentNotificationTimer) {
    clearTimeout(currentNotificationTimer);
    currentNotificationTimer = null;
  }
}

function scheduleReminder(timeStr) {
  clearReminder();
  
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  
  let triggerTime = new Date();
  triggerTime.setHours(hours, minutes, 0, 0);
  
  if (triggerTime.getTime() <= now.getTime()) {
    triggerTime.setDate(triggerTime.getDate() + 1);
  }
  
  const delay = triggerTime.getTime() - now.getTime();
  const MAX_SAFE_DELAY = 2147483647;
  
  if (delay > MAX_SAFE_DELAY) {
    currentNotificationTimer = setTimeout(() => {
      restoreReminderFromStorage();
    }, 43200000);
    return;
  }
  
  console.log(`[SW] ⏰ Recordatorio para ${triggerTime}`);
  
  currentNotificationTimer = setTimeout(async () => {
    await showDailyReminderNotification();
    const config = await getReminderConfig();
    if (config.enabled) {
      scheduleReminder(config.time);
    }
  }, delay);
}

async function showDailyReminderNotification() {
  const isReadToday = await checkIfReadToday();
  
  if (isReadToday) {
    console.log('[SW] Ya leyó hoy');
    return;
  }
  
  const options = {
    body: '¿Ya escuchaste Su voz hoy? Tómate un momento para escucharle.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: './#home' },
    actions: [
      { action: 'open', title: '📖 Leer ahora' },
      { action: 'later', title: '⏰ Más tarde' }
    ],
    requireInteraction: true,
    tag: 'daily-reminder'
  };
  
  await self.registration.showNotification('📖 Su Voz a Diario', options);
}

async function checkIfReadToday() {
  try {
    const clients = await self.clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    });
    
    if (clients.length === 0) return false;
    
    const messageChannel = new MessageChannel();
    const client = clients[0];
    
    const readStatusPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);
      
      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data?.isReadToday || false);
      };
    });
    
    client.postMessage({ type: 'CHECK_READ_STATUS' }, [messageChannel.port2]);
    
    return await readStatusPromise;
    
  } catch (error) {
    return false;
  }
}

// ========================================
// PUSH NOTIFICATIONS (FCM)
// ========================================
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    console.log('[SW] Push recibido');
    
    const options = {
      body: data.notification?.body || 'Tu recordatorio diario',
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      vibrate: [200, 100, 200],
      data: { url: './#home' },
      actions: [
        { action: 'open', title: '📖 Leer ahora' },
        { action: 'close', title: '✕ Cerrar' }
      ],
      requireInteraction: true,
      tag: 'daily-reminder'
    };
    
    event.waitUntil(
      self.registration.showNotification(
        data.notification?.title || 'Su Voz a Diario',
        options
      )
    );
  } catch (error) {
    console.error('[SW] Error push:', error);
  }
});

// ========================================
// MENSAJES
// ========================================
self.addEventListener('message', async (event) => {
  if (!event.data) return;
  
  const { type, time } = event.data;
  
  switch (type) {
    case 'APP_READY':
      const config = await getReminderConfig();
      if (config.enabled) {
        scheduleReminder(config.time);
      }
      break;
      
    case 'SCHEDULE_NOTIFICATION':
      await saveReminderConfig(time, true);
      scheduleReminder(time);
      break;
      
    case 'CANCEL_NOTIFICATIONS':
      await saveReminderConfig('08:00', false);
      clearReminder();
      break;
      
    case 'TEST_NOTIFICATION':
      self.registration.showNotification('🧪 Prueba Exitosa', {
        body: '¡El sistema funciona!',
        icon: './icons/icon-192.png'
      });
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

// ========================================
// CLICK EN NOTIFICACIONES
// ========================================
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'later') {
    setTimeout(() => showDailyReminderNotification(), 1800000);
    return;
  }
  
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

console.log('[SW] Service Worker v6 cargado');
