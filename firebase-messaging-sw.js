/**
 * Firebase Messaging Service Worker
 * Para Push Notifications en iOS y Android
 */

// Importar scripts de Firebase (necesario para el SW)
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

// Configurar Firebase en el Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyATEQ0kmd3HPloNlZ872t8C11jiYitLkUk",
  authDomain: "su-voz-a-diario.firebaseapp.com",
  projectId: "su-voz-a-diario",
  storageBucket: "su-voz-a-diario.firebasestorage.app",
  messagingSenderId: "372912228994",
  appId: "1:372912228994:web:f252b44bdbd00d7c56429b"
});

// Inicializar Messaging
const messaging = firebase.messaging();

// Manejar mensajes en segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Push recibido en segundo plano:', payload);
  
  const notificationTitle = payload.notification?.title || 'Su Voz a Diario';
  const notificationOptions = {
    body: payload.notification?.body || 'Tu recordatorio diario',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.url || './#home'
    },
    actions: [
      { action: 'open', title: '📖 Leer ahora' },
      { action: 'close', title: '✕ Cerrar' }
    ],
    requireInteraction: true,
    tag: 'daily-reminder'
  };
  
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Manejar clics en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') return;
  
  const urlToOpen = event.notification?.data?.url || './#home';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Buscar si ya hay una ventana abierta
      for (let client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrir nueva
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

console.log('[firebase-messaging-sw] Service Worker de Firebase cargado');