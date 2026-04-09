/**
 * Service Worker - Su Voz a Diario
 * Versión 3.0 con Sistema de Notificaciones Profesional
 */

const CACHE_NAME = 'su-voz-v6';
const DYNAMIC_CACHE = 'su-voz-dynamic-v2';
const REMINDER_STORAGE_KEY = 'reminder-config';

// Variable para el timer actual
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
  console.log('[SW] Activado - Iniciando sistema de notificaciones');
  event.waitUntil(
    Promise.all([
      // Limpiar cachés antiguas
      caches.keys().then(keys =>
        Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
              console.log('[SW] Eliminando caché antigua:', key);
              return caches.delete(key);
            }
          })
        )
      ),
      self.clients.claim(),
      // Restaurar recordatorios al activar el SW
      restoreReminderFromStorage()
    ])
  );
});

// ========================================
// FETCH (Tu estrategia original)
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
      JSON.stringify({ error: 'Sin conexión. Este recurso no está disponible.' }),
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
// 🚀 NUEVO: SISTEMA DE NOTIFICACIONES PROFESIONAL
// ========================================

// Guardar configuración en IndexedDB (más fiable que cache para este propósito)
async function saveReminderConfig(time, enabled = true) {
  try {
    // Usamos Cache Storage como almacenamiento simple
    const cache = await caches.open(CACHE_NAME);
    const config = JSON.stringify({ time, enabled, updatedAt: Date.now() });
    await cache.put(REMINDER_STORAGE_KEY, new Response(config));
    console.log('[SW] Configuración guardada:', time, enabled);
    return true;
  } catch (error) {
    console.error('[SW] Error guardando configuración:', error);
    return false;
  }
}

async function getReminderConfig() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(REMINDER_STORAGE_KEY);
    if (response) {
      const config = await response.json();
      return config;
    }
  } catch (error) {
    console.error('[SW] Error leyendo configuración:', error);
  }
  // Configuración por defecto
  return { time: '08:00', enabled: true, updatedAt: Date.now() };
}

async function restoreReminderFromStorage() {
  const config = await getReminderConfig();
  console.log('[SW] Restaurando recordatorio:', config);
  if (config.enabled) {
    scheduleReminder(config.time);
  }
}

function clearReminder() {
  if (currentNotificationTimer) {
    clearTimeout(currentNotificationTimer);
    currentNotificationTimer = null;
    console.log('[SW] Timer de notificación cancelado');
  }
}

function scheduleReminder(timeStr) {
  clearReminder(); // Limpiar timer anterior
  
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  
  let triggerTime = new Date();
  triggerTime.setHours(hours, minutes, 0, 0);
  
  // Si ya pasó la hora hoy, programar para mañana
  if (triggerTime.getTime() <= now.getTime()) {
    triggerTime.setDate(triggerTime.getDate() + 1);
  }
  
  const delay = triggerTime.getTime() - now.getTime();
  const MAX_SAFE_DELAY = 2147483647; // ~24.8 días
  
  if (delay > MAX_SAFE_DELAY) {
    console.log('[SW] Delay muy largo, programando en 12 horas');
    // Programar para dentro de 12 horas y volver a intentar
    currentNotificationTimer = setTimeout(() => {
      restoreReminderFromStorage();
    }, 43200000); // 12 horas
    return;
  }
  
  console.log(`[SW] ⏰ Recordatorio programado para ${triggerTime.toLocaleString()} (en ${Math.round(delay/60000)} minutos)`);
  
  currentNotificationTimer = setTimeout(async () => {
    console.log('[SW] 🔔 ¡Hora del recordatorio!');
    await showDailyReminderNotification();
    
    // Reprogramar para el día siguiente
    const config = await getReminderConfig();
    if (config.enabled) {
      scheduleReminder(config.time);
    }
  }, delay);
}

async function showDailyReminderNotification() {
  // Verificar si el usuario ya leyó hoy
  const isReadToday = await checkIfReadToday();
  
  if (isReadToday) {
    console.log('[SW] Usuario ya leyó hoy, omitiendo notificación');
    return;
  }
  
  const title = '📖 Su Voz a Diario';
  const options = {
    body: '¿Ya escuchaste Su voz hoy? Tómate un momento para escucharle.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { 
      url: './#home',
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: '📖 Leer ahora' },
      { action: 'later', title: '⏰ Más tarde' }
    ],
    requireInteraction: true, // Se queda hasta que el usuario interactúe
    silent: false,
    tag: 'daily-reminder', // Evita duplicados
    renotify: true // Permite re-notificar aunque el tag sea igual
  };
  
  try {
    await self.registration.showNotification(title, options);
    console.log('[SW] ✅ Notificación mostrada correctamente');
  } catch (error) {
    console.error('[SW] Error mostrando notificación:', error);
  }
}

async function checkIfReadToday() {
  try {
    const clients = await self.clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    });
    
    if (clients.length === 0) {
      console.log('[SW] No hay ventanas abiertas, asumiendo no leído');
      return false;
    }
    
    // Crear canal de mensaje para comunicación bidireccional
    const messageChannel = new MessageChannel();
    const client = clients[0];
    
    const readStatusPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[SW] Timeout esperando respuesta de la app');
        resolve(false);
      }, 2000);
      
      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data?.isReadToday || false);
      };
    });
    
    client.postMessage({ 
      type: 'CHECK_READ_STATUS',
      timestamp: Date.now()
    }, [messageChannel.port2]);
    
    const isRead = await readStatusPromise;
    console.log('[SW] Estado de lectura hoy:', isRead);
    return isRead;
    
  } catch (error) {
    console.error('[SW] Error verificando estado de lectura:', error);
    return false;
  }
}

function showTestNotification() {
  const options = {
    body: '✅ ¡El sistema de notificaciones funciona correctamente!',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: { url: './#settings' },
    requireInteraction: false,
    silent: false,
    tag: 'test-notification'
  };
  
  self.registration.showNotification('🧪 Prueba Exitosa', options);
  console.log('[SW] Notificación de prueba enviada');
}

// ========================================
// MENSAJES DESDE LA APP (ACTUALIZADO)
// ========================================
self.addEventListener('message', async (event) => {
  if (!event.data) return;
  
  const { type, time } = event.data;
  
  switch (type) {
    case 'APP_READY':
      console.log('[SW] App lista - Verificando recordatorios');
      const config = await getReminderConfig();
      if (config.enabled) {
        scheduleReminder(config.time);
      }
      break;
      
    case 'SCHEDULE_NOTIFICATION':
      console.log('[SW] Programando notificación para:', time);
      await saveReminderConfig(time, true);
      scheduleReminder(time);
      break;
      
    case 'CANCEL_NOTIFICATIONS':
      console.log('[SW] Cancelando notificaciones');
      await saveReminderConfig('08:00', false);
      clearReminder();
      break;
      
    case 'TEST_NOTIFICATION':
      console.log('[SW] Solicitando notificación de prueba');
      showTestNotification();
      break;
      
    case 'CHECK_READ_STATUS':
      // Manejado en el event listener principal
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    default:
      console.log('[SW] Mensaje recibido:', type);
  }
});

// ========================================
// CLICK EN NOTIFICACIONES (MEJORADO)
// ========================================
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const action = event.action;
  const targetUrl = event.notification?.data?.url || './#home';
  
  console.log('[SW] Click en notificación:', action);
  
  if (action === 'later') {
    // Reprogramar para 30 minutos después
    console.log('[SW] Usuario eligió "Más tarde"');
    setTimeout(() => {
      showDailyReminderNotification();
    }, 1800000); // 30 minutos
    return;
  }
  
  // Acción "open" o click normal
  event.waitUntil(openAppAndNavigate(targetUrl));
});

async function openAppAndNavigate(url) {
  const clientsList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  // Buscar ventana existente
  for (const client of clientsList) {
    if ('focus' in client) {
      await client.focus();
      client.postMessage({ type: 'NAVIGATE_TO', url });
      return;
    }
  }

  // Abrir nueva ventana si no existe
  if (self.clients.openWindow) {
    return self.clients.openWindow(url);
  }
}

// ========================================
// PUSH (Mantenido para futuro)
// ========================================
self.addEventListener('push', event => {
  if (!event.data) return;

  try {
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
  } catch (error) {
    console.error('[SW] Error en push:', error);
  }
});

console.log('[SW] Service Worker v6 cargado correctamente');
