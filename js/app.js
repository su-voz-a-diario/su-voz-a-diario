import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    deleteDoc,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import {
    signInAnonymously,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const db = window.firebaseDb;
const auth = window.firebaseAuth;

function isRunningAsInstalledPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent);
}
/**
 * Su Voz a Diario - App de estudio de la palabra de Dios.
 * Versión 2.1 con integración completa con Service Worker
 * Funcionalidades: Rachas, Estadísticas, Notificaciones, PWA, Backup
 */

const App = {
    // ========================================
    // DATOS Y ESTADO
    // ========================================
    data: [],
    currentView: 'home',
    today: new Date(),
    currentVersion: 'rvr60',
    openNoteDate: null,
    activeNoteField: null,
    homeViewingDate: null,
    readingMode: false,
    communityFormOpen: false,
    currentUser: null,
    communityUnreadCount: 0,
    lastSeenCommunityAt: null,
    openReplyPostId: null,
    replyDrafts: {},
    replyCharLimit: 300,
    
    calendarInitialized: false,
    calendarScrollTop: 0,

     // ✅ NUEVAS PROPIEDADES PARA OPTIMIZACIÓN
    communityCache: null,           // Para caché de posts
    communityScrollTop: 0,          // Para guardar scroll
    shouldScrollToLastPost: false,  // Para controlar scroll al último post
  
    
    // Sistema de rachas
    streak: {
        current: 0,
        longest: 0,
        lastReadDate: null
    },

    badgeLevels: [
        { min: 365, key: 'corona', label: 'Corona', icon: '👑' },
        { min: 180, key: 'diamante', label: 'Diamante', icon: '💎' },
        { min: 100, key: 'oro', label: 'Oro', icon: '🥇' },
        { min: 60, key: 'plata', label: 'Plata', icon: '🥈' },
        { min: 30, key: 'bronce', label: 'Bronce', icon: '🥉' },
        { min: 15, key: 'cobre', label: 'Cobre', icon: '🟤' }
    ],

    getCurrentBadge: function() {
    const streakValue = this.streak.longest || 0;

    for (const level of this.badgeLevels) {
        if (streakValue >= level.min) {
            return level;
        }
    }

    return {
        key: 'inicial',
        label: 'Inicio',
        icon: '⭐'
    };
},
    
    // Configuración
    settings: {
    reminderTime: '08:00',
    notificationsEnabled: false,
    autoSaveNotes: true,
    fontSize: 1.08
},

    storage: {
    get(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.error(`[Storage] Error leyendo ${key}:`, error);
            return fallback;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`[Storage] Error guardando ${key}:`, error);
            return false;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`[Storage] Error eliminando ${key}:`, error);
        }
    }
},
    
    // Estado de render y controles
    renderScheduled: false,
    controlsCollapsed: false,
    lastReadingTap: 0,
    readingTapDelay: 400,
    selectionMenuVisible: false,
    selectionUpdateTimer: null,
    selectionHideTimer: null,
    selectionViewportCleanup: null,
    pushListenersReady: false,
    themeListenerReady: false,
    
    // ========================================
    // INICIALIZACIÓN
    // ========================================
   init: async function() {
    console.log('[App] Inicializando...');
    
    this.cacheDOM();
    this.showAprilMessageIfNeeded();
    this.loadSettings();
    this.loadStreak();
    this.loadFontSize();
    this.loadControlsState();
    this.loadCommunityLastSeen();
       
    const savedVersion = localStorage.getItem('current-version');
    if (savedVersion) {
        this.currentVersion = savedVersion;
    }
       
     this.initTheme();
    this.initNotifications();
    this.setupSWCommunication();
    this.bindEvents();
    this.bindFloatingToggle();
    await this.initAuth();
await this.loadData();
await this.refreshCommunityBadge();

const savedToken = localStorage.getItem('su-voz-fcm-token');
if (savedToken && this.currentUser) {
    await this.savePushToken(savedToken);

    if (this.settings.notificationsEnabled) {
        this.setupPushListeners();
    }
}

this.checkReminderOnOpen();
await this.handleRoute();
this.updateStreakUI();
    
    console.log('[App] Inicialización completada');
},
    
cacheDOM: function() {
    this.$content = document.getElementById('app-content');
    this.$navHome = document.getElementById('nav-home');
    this.$navCalendar = document.getElementById('nav-calendar');
    this.$navStats = document.getElementById('nav-stats');
    this.$navSettings = document.getElementById('nav-settings');
    this.$navCommunity = document.getElementById('nav-community');
    this.$communityBadge = document.getElementById('community-badge');
    this.$streakIndicator = document.getElementById('streak-indicator');
    this.$streakCount = document.getElementById('streak-count');
    this.$floatingControls = document.getElementById('floating-controls');
    this.$floatingToggle = document.getElementById('floating-toggle');
},

    showAprilMessageIfNeeded: function() {
    const aprilMessage = document.getElementById('april-message');
    if (!aprilMessage) return;

    const today = this.getTodayDateStr();

    // Mostrar solo el 1 de abril de 2026
    if (today !== '2026-04-01') return;

    aprilMessage.classList.remove('hidden');

    setTimeout(() => {
        aprilMessage.classList.add('hidden');
    }, 4000);
},
    
    // ========================================
    // COMUNICACIÓN CON SERVICE WORKER
    // ========================================
   setupSWCommunication: function() {
    if (!('serviceWorker' in navigator)) {
        console.warn('[App] Service Worker no soportado');
        return;
    }
    
    // Escuchar mensajes del Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
        const { data } = event;
        
        switch (data.type) {
            case 'CHECK_READ_STATUS':
                // El SW pregunta si ya se leyó hoy (para notificaciones)
                const todayStr = this.getTodayDateStr();
                const isReadToday = this.isRead(todayStr);
                
                console.log('[App] SW preguntando estado de lectura. Leído hoy:', isReadToday);
                
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage({ 
                        isReadToday: isReadToday,
                        timestamp: Date.now()
                    });
                }
                break;
                
            case 'NAVIGATE_TO':
                // Navegar a una ruta específica desde notificación
                if (data.url) {
                    const path = data.url.replace('./', '').replace('#', '');
                    console.log('[App] Navegando a:', path);
                    this.navigate(path || 'home');
                    
                    // Si navegamos a home, resetear la fecha de visualización
                    if (path === 'home' || !path) {
                        this.homeViewingDate = null;
                    }
                }
                break;
                
            case 'SYNC_COMPLETE':
                console.log('[App] Sincronización completada');
                this.showToast('✅ Datos sincronizados');
                break;
                
            case 'NOTIFICATION_TESTED':
                console.log('[App] Notificación de prueba completada');
                break;
                
            default:
                console.log('[App] Mensaje del SW:', data.type || data);
        }
    });
    
   navigator.serviceWorker.ready.then(() => {
    this.sendToSW({ type: 'APP_READY' });

    if (navigator.serviceWorker.controller) {
        console.log('[App] SW activo y controlando la página');
    } else {
        console.log('[App] SW listo, pero aún sin controller en esta carga');
    }
});
},
    
    sendToSW: function(message) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(message);
        }
    },
    
    // ========================================
    // SISTEMA DE RACHAS (MEJORADO)
    // ========================================
    loadStreak: function() {
        const defaultStreak = {
            current: 0,
            longest: 0,
            lastReadDate: null
        };

        const savedStreak = this.storage.get('su-voz-streak', {});
        this.streak = { ...defaultStreak, ...savedStreak };
    },
    
   saveStreak: function() {
    this.storage.set('su-voz-streak', this.streak);
    this.updateStreakUI();

    this.sendToSW({
        type: 'STREAK_UPDATED',
        streak: this.streak.current
    });
},
    
    updateStreak: function(dateStr) {
    const yesterday = this.getYesterdayDateStr();
    const today = dateStr;

    if (this.streak.lastReadDate === today) {
        return;
    }

    if (this.streak.lastReadDate === yesterday) {
        this.streak.current += 1;
    } else {
        this.streak.current = 1;
    }

    this.streak.lastReadDate = today;
    this.streak.longest = Math.max(this.streak.longest, this.streak.current);

    if ([7, 30, 100].includes(this.streak.current)) {
        this.showCelebration(this.streak.current);
    }

    this.saveStreak();
},
    
    showCelebration: function(days) {
        const messages = {
            7: '🎉 ¡Una semana completa! Sigue así.',
            30: '🏆 ¡Un mes de constancia! Increíble.',
            100: '🌟 ¡100 días! Eres un ejemplo de dedicación.'
        };
        
        if (messages[days]) {
            this.showToast(messages[days]);
            
            // Confeti sutil si está disponible
            if (typeof confetti === 'function') {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            }
        }
    },
    
   getYesterdayDateStr: function() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
    },
    
    updateStreakUI: function() {
        if (this.$streakIndicator && this.$streakCount) {
            if (this.streak.current > 0) {
                this.$streakIndicator.style.display = 'flex';
                this.$streakCount.textContent = this.streak.current;
            } else {
                this.$streakIndicator.style.display = 'none';
            }
        }
    },
    
    // ========================================
    // CONFIGURACIÓN (MEJORADA CON SW)
    // ========================================
    loadSettings: function() {
        const defaultSettings = {
    reminderTime: '08:00',
    notificationsEnabled: false,
    autoSaveNotes: true,
    fontSize: 1.08
};

        const savedSettings = this.storage.get('su-voz-settings', {});
        this.settings = { ...defaultSettings, ...savedSettings };
    },
    
   saveSettings: function() {
    this.storage.set('su-voz-settings', this.settings);

    if (this.settings.reminderDays) {
        localStorage.setItem('su-voz-reminder-days', JSON.stringify(this.settings.reminderDays));
    }
},

getDeviceId: function() {
    let deviceId = localStorage.getItem('su-voz-device-id');

    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('su-voz-device-id', deviceId);
    }

    return deviceId;
},

getPlatformLabel: function() {
    if (isIOSDevice()) return 'ios';
    if (isAndroidDevice()) return 'android';
    return 'web';
},
    
    loadFontSize: function() {
        const saved = localStorage.getItem('reading-size');
        const parsed = parseFloat(saved);

        if (saved && !Number.isNaN(parsed)) {
            this.settings.fontSize = parsed;
            document.documentElement.style.setProperty('--reading-size', parsed + 'rem');
        } else {
            document.documentElement.style.setProperty('--reading-size', this.settings.fontSize + 'rem');
        }
    },

    loadControlsState: function() {
    const saved = localStorage.getItem('su-voz-controls-collapsed');
    this.controlsCollapsed = saved === 'true';

    if (this.$floatingControls) {
        this.$floatingControls.classList.toggle('collapsed', this.controlsCollapsed);
    }

    if (this.$floatingToggle) {
        this.$floatingToggle.textContent = this.controlsCollapsed ? '☰' : '◀';
    }
},

toggleFloatingControls: function() {
    this.controlsCollapsed = !this.controlsCollapsed;
    localStorage.setItem('su-voz-controls-collapsed', String(this.controlsCollapsed));

    if (this.$floatingControls) {
        this.$floatingControls.classList.toggle('collapsed', this.controlsCollapsed);
    }

    if (this.$floatingToggle) {
        this.$floatingToggle.textContent = this.controlsCollapsed ? '☰' : '◀';
    }
},

bindFloatingToggle: function() {
    if (this.$floatingToggle) {
        this.$floatingToggle.addEventListener('click', () => {
            this.toggleFloatingControls();
        });
    }
},
    
    // ========================================
    // NOTIFICACIONES (MEJORADAS CON SW)
    // ========================================
   initNotifications: function() {
    if (!('Notification' in window)) {
        console.log('[App] Notificaciones no soportadas');
        return;
    }

    console.log('[App] API de notificaciones disponible');
},
    
    showDailyReminder: function() {
    if (!('Notification' in window)) return;

    if (this.settings.notificationsEnabled && Notification.permission === 'granted') {
        const todayStr = this.getTodayDateStr();
        if (!this.isRead(todayStr)) {
            new Notification('📖 Su Voz a Diario', {
                body: '¿Ya escuchaste Su voz hoy? Tómate un momento para escucharle.',
                icon: './icons/icon-192.png',
                vibrate: [200, 100, 200],
                data: { url: '/#home' }
            });
        }
    }
},

checkReminderOnOpen: function() {
    if (!this.settings.notificationsEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const todayStr = this.getTodayDateStr();

    if (this.isRead(todayStr)) return;

    const alreadyShown = localStorage.getItem('su-voz-last-reminder-date');
    if (alreadyShown === todayStr) return;

    const [hour, minute] = (this.settings.reminderTime || '08:00').split(':').map(Number);

    const now = new Date();
    const reminderTime = new Date();
    reminderTime.setHours(hour, minute, 0, 0);

    if (now >= reminderTime) {
        new Notification('📖 Su Voz a Diario', {
            body: '¿Ya escuchaste Su voz hoy? Tómate un momento para escucharle.',
            icon: './icons/icon-192.png'
        });

        localStorage.setItem('su-voz-last-reminder-date', todayStr);
    }
},
    
    // ========================================
    // ESTADÍSTICAS (MEJORADAS)
    // ========================================
    getStats: function() {
        const readDates = this.getReadDates();
        const totalRead = readDates.length;
        const totalAvailable = this.data.length;
        
        // Calcular días consecutivos actuales (más preciso)
        let currentStreak = 0;
        let checkDate = new Date();
        
        while (true) {
            const dateStr = this.formatDateForCompare(checkDate);
            if (readDates.includes(dateStr)) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        
        // Calcular porcentaje
        const percentage = totalAvailable > 0 ? Math.round((totalRead / totalAvailable) * 100) : 0;
        
        // Notas totales
        let totalNotes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('su-voz-note-')) {
                const note = this.storage.get(key, null);
                if (
                note &&
                (
                    note.dios?.trim() ||
                    note.aprendizaje?.trim() ||
                    note.respuesta?.trim() ||
                    note.oracion?.trim()
                )
            ) {
                  totalNotes++;
            }
            }
        }
        
        // Resaltados totales
        let totalHighlights = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
           if (key && key.startsWith('su-voz-highlights-')) {
                const date = key.replace('su-voz-highlights-', '');
                const highlights = this.getHighlights(date);
                totalHighlights += highlights.length;
            }
        }
        
        return {
            totalRead,
            totalAvailable,
            percentage,
            currentStreak,
            longestStreak: this.streak.longest,
            totalNotes,
            totalHighlights
        };
    },
    
    // ========================================
    // FUNCIONES PRINCIPALES
    // ========================================
    markAsRead: function(dateStr) {
    const readDates = this.getReadDates();

    if (readDates.includes(dateStr)) return;

    readDates.push(dateStr);
    this.setReadDates(readDates);
    this.updateStreak(dateStr);

    if ('vibrate' in navigator) {
        navigator.vibrate(50);
    }

    if (readDates.length === 1) {
        this.showToast('🎉 ¡Primera lectura! ¡Felicidades!');
    }

    this.sendToSW({ type: 'READING_COMPLETED', date: dateStr });
},

    getReadDates: function() {
    return this.storage.get('su-voz-read-dates', []);
    },

    setReadDates: function(readDates) {
    this.storage.set('su-voz-read-dates', readDates);
    },
    
    isRead: function(dateStr) {
    return this.getReadDates().includes(dateStr);
    },
    
    getHighlightsKey: function(dateStr) {
        return `su-voz-highlights-${dateStr}`;
    },

    getNoteKey: function(dateStr) {
    return `su-voz-note-${dateStr}`;
    },

   async getCommunityPosts() {
    try {
        const q = query(collection(db, "communityPosts"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));
    } catch (error) {
        console.error("Error cargando posts:", error);
        return [];
    }
},

// ========================================
// MÉTODOS OPTIMIZADOS PARA COMUNIDAD
// ========================================

// Método con caché para posts
getCommunityPostsCached: async function() {
    const CACHE_DURATION = 30000; // 30 segundos de caché
    const now = Date.now();
    
    if (this.communityCache && 
        this.communityCache.posts && 
        (now - this.communityCache.timestamp) < CACHE_DURATION) {
        console.log('[Community] Usando caché de posts');
        return this.communityCache.posts;
    }
    
    console.log('[Community] Cargando posts desde Firestore');
    const posts = await this.getCommunityPosts();
    this.communityCache = {
    posts,
    timestamp: now
};
    return posts;
},

// Invalidar caché (llamar después de publicar/eliminar)
invalidateCommunityCache: function() {
    this.communityCache = null;
    console.log('[Community] Caché invalidada');
},

// Guardar posición de scroll
saveCommunityScrollPosition: function() {
    this.communityScrollTop = window.scrollY || window.pageYOffset || 0;
},

// Restaurar posición de scroll
restoreCommunityScrollPosition: function() {
    if (this.communityScrollTop && this.communityScrollTop > 0) {
        setTimeout(() => {
            window.scrollTo(0, this.communityScrollTop);
            console.log('[Community] Scroll restaurado a:', this.communityScrollTop);
        }, 100);
    }
},

// Scroll al último post (más reciente)
scrollToLastPost: function() {
    setTimeout(() => {
        const posts = document.querySelectorAll('.community-card');
        if (posts.length > 0) {
            const lastPost = posts[posts.length - 1];
            lastPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('[Community] Scroll al último post');
        }
        this.shouldScrollToLastPost = false;
    }, 150);
},

async addCommunityPost(post) {
    try {
        const validation = Sanitizer.validateText(post.text);
        if (!validation.valid) {
            this.showToast(validation.message);
            return false;
        }

        const safePost = {
            reference: Sanitizer.sanitizeReference(post.reference),
            name: Sanitizer.sanitizeUsername(post.name),
            text: Sanitizer.sanitizeText(post.text),
            date: post.date,
            ownerUid: post.ownerUid,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "communityPosts"), safePost);
        return true;
    } catch (error) {
        console.error("Error guardando post:", error);
        return false;
    }
},

async deleteCommunityPost(postId) {
    try {
        const repliesSnapshot = await getDocs(
            query(collection(db, "communityReplies"), orderBy("createdAt", "asc"))
        );

        const reactionSnapshot = await getDocs(collection(db, "communityReactions"));

        const replyDeletes = [];
        repliesSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.postId === postId) {
                replyDeletes.push(deleteDoc(doc(db, "communityReplies", docSnap.id)));
            }
        });

        const reactionDeletes = [];
        reactionSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.postId === postId) {
                reactionDeletes.push(deleteDoc(doc(db, "communityReactions", docSnap.id)));
            }
        });

        await Promise.all([...replyDeletes, ...reactionDeletes]);
        await deleteDoc(doc(db, "communityPosts", postId));

        return true;
    } catch (error) {
        console.error("Error eliminando post:", error);
        return false;
    }
},

async getRepliesByPostId(postId) {
    try {
        const q = query(collection(db, "communityReplies"), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(q);

        return snapshot.docs
            .map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }))
            .filter(reply => reply.postId === postId);
    } catch (error) {
        console.error("Error cargando respuestas:", error);
        return [];
    }
},

async getRepliesSummary(posts) {
    const summary = {};

    posts.forEach(post => {
        summary[post.id] = [];
    });

    if (!posts.length) return summary;

    try {
        const q = query(collection(db, "communityReplies"), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(q);

        snapshot.docs.forEach(docSnap => {
            const reply = {
                id: docSnap.id,
                ...docSnap.data()
            };

            if (!summary[reply.postId]) return;
            summary[reply.postId].push(reply);
        });

        return summary;
    } catch (error) {
        console.error("Error cargando resumen de respuestas:", error);
        return summary;
    }
},

async addCommunityReply(reply) {
    try {
        const cleanText = Sanitizer.sanitizeText(reply.text || '');

        if (!cleanText) {
            return { success: false, message: 'Escribe una respuesta' };
        }

        if (cleanText.length < 3) {
            return { success: false, message: 'Escribe una respuesta un poco más amplia' };
        }

        if (cleanText.length > this.replyCharLimit) {
            return { success: false, message: `Máximo ${this.replyCharLimit} caracteres` };
        }

        await addDoc(collection(db, "communityReplies"), {
            ...reply,
            text: cleanText,
            createdAt: serverTimestamp()
        });

        return { success: true };
    } catch (error) {
        console.error("Error guardando respuesta:", error);
        return { success: false, message: 'No se pudo guardar la respuesta' };
    }
},

async deleteCommunityReply(replyId) {
    try {
        await deleteDoc(doc(db, "communityReplies", replyId));
        return true;
    } catch (error) {
        console.error("Error eliminando respuesta:", error);
        return false;
    }
},

toggleReplyForm(postId) {
    this.openReplyPostId = this.openReplyPostId === postId ? null : postId;
},

updateReplyDraft(postId, value) {
    const cleanValue = (value || '').slice(0, this.replyCharLimit);
    this.replyDrafts[postId] = cleanValue;
},

getReplyDraft(postId) {
    return this.replyDrafts[postId] || '';
},

clearReplyDraft(postId) {
    delete this.replyDrafts[postId];
},

   getEmptyCommunityReactionState: function() {
    return {
        counts: {
         useful: 0,
         thanks: 0
        },
        
        userReactions: {
            useful: false,
            thanks: false
        }
    };
},

getReactionDocId: function(postId, userId) {
    return `${postId}_${userId}`;
},

renderCommunityReactionBar: function(postId, reactionData = null) {
    const state = reactionData || this.getEmptyCommunityReactionState();

  const reactions = [
    { key: 'useful', label: 'Me sirve' },
    { key: 'thanks', label: 'Gracias' }
];

    return `
        <div class="community-reaction-bar" data-post-id="${postId}">
            ${reactions.map(item => `
                <button
                    class="community-reaction-btn ${state.userReactions[item.key] ? 'is-active' : ''}"
                    type="button"
                    data-action="community-reaction-toggle"
                    data-post-id="${postId}"
                    data-reaction="${item.key}"
                    aria-label="${item.label}"
                    title="${item.label}"
                >
                    <span class="community-reaction-icon">${this.getReactionIcon(item.key)}</span>
                    <span class="community-reaction-count">${state.counts[item.key] || 0}</span>
                </button>
            `).join('')}
        </div>
    `;
},

renderReplyBlock: function(post, replies = []) {
    const isOpen = this.openReplyPostId === post.id;
    const draft = this.getReplyDraft(post.id);
    const replyCount = replies.length;

    return `
        <div class="community-reply-block">
            <div class="community-reply-toolbar">
                <button
                    class="community-reply-toggle"
                    type="button"
                    data-action="toggle-reply-form"
                    data-post-id="${post.id}"
                >
                    💬 ${replyCount > 0 ? `Responder · ${replyCount}` : 'Responder'}
                </button>
            </div>

            ${isOpen ? `
                <div class="community-reply-form">
                    <textarea
                        class="community-reply-textarea"
                        data-action="reply-input"
                        data-post-id="${post.id}"
                        placeholder="Escribe una respuesta breve y edificante..."
                        maxlength="${this.replyCharLimit}"
                    >${this.escapeHtml(draft)}</textarea>

                    <div class="community-reply-form-footer">
                        <div class="community-reply-counter">
                            ${draft.length}/${this.replyCharLimit}
                        </div>

                        <div class="community-reply-form-actions">
                            <button
                                class="btn-secondary"
                                type="button"
                                data-action="cancel-reply-form"
                                data-post-id="${post.id}"
                            >
                                Cancelar
                            </button>

                            <button
                                class="btn-primary"
                                type="button"
                                data-action="publish-reply"
                                data-post-id="${post.id}"
                            >
                                Responder
                            </button>
                        </div>
                    </div>
                </div>
            ` : ''}

            ${replies.length ? `
                <div class="community-reply-list">
                    ${replies.map(reply => `
                        <div class="community-reply-item">
                            <div class="community-reply-meta">
                                ${this.escapeHtml(reply.name || 'Anónimo')} · ${this.escapeHtml(this.formatCommunityDateLabel(reply.date || ''))}
                            </div>

                            <div class="community-reply-text">
                                ${this.escapeHtml(reply.text || '')}
                            </div>

                            ${reply.ownerUid === this.currentUser?.uid ? `
                                <div class="community-reply-actions">
                                    <button
                                        class="community-reply-delete"
                                        type="button"
                                        data-action="delete-community-reply"
                                        data-reply-id="${reply.id}"
                                        data-post-id="${post.id}"
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
},

getReactionIcon: function(type) {
    const icons = {
        thanks: `
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20s-6.5-4.35-9-8.28C1.2 8.9 2.3 5.5 5.6 4.4c2.1-.7 4.2.1 5.4 1.9 1.2-1.8 3.3-2.6 5.4-1.9 3.3 1.1 4.4 4.5 2.6 7.32C18.5 15.65 12 20 12 20z"/>
            </svg>
        `,
        useful: `
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 10V5.5A2.5 2.5 0 0 0 11.5 3L8 10v11h9.2a2 2 0 0 0 2-1.64l1.1-7A2 2 0 0 0 18.3 10H14z"/>
                <path d="M8 10H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4"/>
            </svg>
        `
    };

    return icons[type] || '';
},

setReactionButtonLoading: function(buttonEl, isLoading) {
    if (!buttonEl) return;

    buttonEl.disabled = isLoading;

    if (isLoading) {
        buttonEl.classList.add('is-loading');
    } else {
        buttonEl.classList.remove('is-loading');
    }
},

updateSingleReactionButtonUI: function(buttonEl, shouldActivate) {
    if (!buttonEl) return;

    const countEl = buttonEl.querySelector('.community-reaction-count');
    let count = Number(countEl?.textContent || 0);

    if (shouldActivate) {
        buttonEl.classList.add('is-active');
        count += 1;
    } else {
        buttonEl.classList.remove('is-active');
        count = Math.max(0, count - 1);
    }

    if (countEl) {
        countEl.textContent = String(count);
    }
},

getCommunityReactionSummary: async function(posts) {
    const summary = {};

    posts.forEach(post => {
        summary[post.id] = this.getEmptyCommunityReactionState();
    });

    if (!posts.length) return summary;

    try {
        const snapshot = await getDocs(collection(db, "communityReactions"));

        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const postId = data.postId;
            const userId = data.userId;
            const reactions = data.reactions || {};

            if (!summary[postId]) return;

            Object.keys(summary[postId].counts).forEach(key => {
                if (reactions[key] === true) {
                    summary[postId].counts[key] += 1;

                    if (userId === this.currentUser?.uid) {
                        summary[postId].userReactions[key] = true;
                    }
                }
            });
        });

        return summary;
    } catch (error) {
        console.error("Error cargando reacciones:", error);
        return summary;
    }
},

toggleCommunityReaction: async function(postId, reaction) {
    if (!this.currentUser?.uid) {
        return { success: false, message: 'No se pudo identificar al usuario' };
    }

    try {
        const reactionRef = doc(
            db,
            "communityReactions",
            this.getReactionDocId(postId, this.currentUser.uid)
        );

        const existingSnap = await getDoc(reactionRef);

        const emptyReactions = {
            useful: false,
            thanks: false
        };

        let currentReactions = { ...emptyReactions };

        if (existingSnap.exists()) {
            const existingData = existingSnap.data();
            currentReactions = {
                ...emptyReactions,
                ...(existingData.reactions || {})
            };
        }

        currentReactions[reaction] = !currentReactions[reaction];

        const hasAnyReaction = Object.values(currentReactions).some(value => value === true);

        if (!hasAnyReaction) {
            await deleteDoc(reactionRef);
            return { success: true, removed: true };
        }

        await setDoc(reactionRef, {
            postId,
            userId: this.currentUser.uid,
            reactions: currentReactions,
            updatedAt: serverTimestamp()
        });

        return { success: true, removed: false };
    } catch (error) {
        console.error("Error al reaccionar:", error);
        return {
            success: false,
            message: error?.message || 'No se pudo guardar la reacción'
        };
    }
},

getCommunityLastSeenKey: function() {
return 'su-voz-community-last-seen';
},

loadCommunityLastSeen: function() {
    this.lastSeenCommunityAt = localStorage.getItem(this.getCommunityLastSeenKey());
},

saveCommunityLastSeen: function(value) {
    const normalizedValue = value === null || value === undefined ? null : String(value);
    this.lastSeenCommunityAt = normalizedValue;

    if (normalizedValue !== null) {
        localStorage.setItem(this.getCommunityLastSeenKey(), normalizedValue);
    } else {
        localStorage.removeItem(this.getCommunityLastSeenKey());
    }
},

markCommunityAsSeen: async function() {
    try {
        const posts = await this.getCommunityPostsCached();

        if (!posts.length) {
            this.saveCommunityLastSeen(null);
            this.communityUnreadCount = 0;
            this.updateCommunityBadge();
            return;
        }

        const latestPost = posts[0];
        const latestValue = latestPost.createdAt?.seconds || 0;

        this.saveCommunityLastSeen(latestValue);
        this.communityUnreadCount = 0;
        this.updateCommunityBadge();
    } catch (error) {
        console.error('[Community] Error marcando como visto:', error);
    }
},
    
refreshCommunityBadge: async function() {
    try {
        const posts = await this.getCommunityPostsCached();
        const lastSeen = this.lastSeenCommunityAt;

        if (!posts.length) {
            this.communityUnreadCount = 0;
            this.updateCommunityBadge();
            return;
        }

        if (!lastSeen) {
            this.communityUnreadCount = posts.length;
            this.updateCommunityBadge();
            return;
        }

        const lastSeenNumber = Number(lastSeen) || 0;
        let unread = 0;

        posts.forEach(post => {
            const postValue = post.createdAt?.seconds || 0;

            if (postValue > lastSeenNumber) {
                unread++;
            }
        });

        this.communityUnreadCount = unread;
        this.updateCommunityBadge();
    } catch (error) {
        console.error('[Community] Error actualizando badge:', error);
    }
},

updateCommunityBadge: function() {
    if (!this.$communityBadge) return;

    if (this.communityUnreadCount > 0) {
        this.$communityBadge.hidden = false;
        this.$communityBadge.textContent = ''; // sin número
    } else {
        this.$communityBadge.hidden = true;
    }
},
    
   getHighlights: function(dateStr) {
    const saved = this.storage.get(this.getHighlightsKey(dateStr), []);

    if (!Array.isArray(saved)) return [];

    return saved.map(item => {
        if (typeof item === 'string') {
            return { text: item, color: 'yellow' };
        }

        return {
            text: (item.text || '').trim(),
            color: item.color || 'yellow'
        };
    }).filter(item => item.text.length >= 3);
},
    
    hasHighlights: function(dateStr) {
        return this.getHighlights(dateStr).length > 0;
    },
    
    saveHighlights: function(dateStr, highlights) {
    const normalizedMap = new Map();

    highlights.forEach(item => {
        if (!item || !item.text) return;

        const text = item.text.trim();
        const color = item.color || 'yellow';

        if (text.length < 3) return;

        const key = `${text}__${color}`;
        normalizedMap.set(key, { text, color });
    });

    const normalized = Array.from(normalizedMap.values());

    this.storage.set(this.getHighlightsKey(dateStr), normalized);
    this.sendToSW({ type: 'HIGHLIGHTS_UPDATED', date: dateStr });
},
    
   getNote: function(dateStr) {
    return this.storage.get(this.getNoteKey(dateStr), {
        dios: '',
        aprendizaje: '',
        respuesta: '',
        oracion: ''
    });
  },
    
   hasNote: function(dateStr) {
    const note = this.getNote(dateStr);
    return (note.dios?.trim().length > 0) ||
           (note.aprendizaje?.trim().length > 0) ||
           (note.respuesta?.trim().length > 0) ||
           (note.oracion?.trim().length > 0);
    },
    
    saveNote: function(dateStr, noteObj) {
    this.storage.set(this.getNoteKey(dateStr), noteObj);
    this.sendToSW({ type: 'NOTE_SAVED', date: dateStr });
    },
    
   deleteNote: function(dateStr) {
    this.storage.remove(this.getNoteKey(dateStr));
    this.showToast('Reflexión eliminada');
    },
    
    toggleNote: function(dateStr) {
        const isClosing = this.openNoteDate === dateStr;
        this.openNoteDate = isClosing ? null : dateStr;
        this.activeNoteField = null;
    },
    
    changeFontSize: function(delta) {
        let current = this.settings.fontSize;
         current += delta;

        if (current < 0.9) current = 0.9;
        if (current > 1.6) current = 1.6;

        this.settings.fontSize = current;
        localStorage.setItem('reading-size', current);
        document.documentElement.style.setProperty('--reading-size', current + 'rem');

        this.storage.set('su-voz-settings', this.settings);
    },
    
   scheduleRender: function() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;

    requestAnimationFrame(() => {
        this.handleRoute().catch(error => {
            console.error('[Route] Error en render programado:', error);
        }).finally(() => {
            this.renderScheduled = false;
        });
    });
},
    
    showToast: function(message, duration = 3000) {
        // Eliminar toast existente
        const existing = document.querySelector('.toast-message');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
   exportReflectionPDF: function(dateStr) {
    const reading = this.data.find(r => r.date === dateStr);
    if (!reading) return;

    if (!window.jspdf || !window.jspdf.jsPDF) {
        this.showToast('No se pudo generar el PDF');
        return;
    }

    const note = this.getNote(dateStr);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const marginLeft = 20;
    const marginTop = 20;
    const marginBottom = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - marginLeft * 2;

    let y = marginTop;

    const ensureSpace = (needed = 12) => {
        if (y + needed > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
        }
    };

    const addSectionTitle = (title) => {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(title, marginLeft, y);
        y += 6;
    };

    const addParagraph = (text) => {
        const content = (text && text.trim()) ? text : 'Sin contenido.';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);

        const lines = doc.splitTextToSize(content, usableWidth);

        lines.forEach(line => {
            ensureSpace(6);
            doc.text(line, marginLeft, y);
            y += 6;
        });

        y += 4;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Su voz a diario', marginLeft, y);

    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(`Fecha: ${this.formatDateEs(dateStr)}`, marginLeft, y);

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Pasaje: ${reading.reference}`, marginLeft, y);

    y += 14;
    doc.setFontSize(14);
    doc.text('Profundiza en Su voz', marginLeft, y);
    y += 10;

    addSectionTitle('Lo que veo de Dios');
    addParagraph(note.dios);

    addSectionTitle('Lo que aprendo del pasaje');
    addParagraph(note.aprendizaje);

    addSectionTitle('Mi respuesta hoy');
    addParagraph(note.respuesta);

    addSectionTitle('Mi oración');
    addParagraph(note.oracion);

    doc.save(`reflexion-${dateStr}.pdf`);
    this.showToast('Se abrió el PDF para descargar');
    },
    
    resetReadingMode: function() {
    this.readingMode = false;
    this.lastReadingTap = 0;
    document.body.classList.remove('reading-mode');
    },

    escapeRegExp: function(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    
    removeHighlightButton: function() {
    this.removeSelectionMenu();
    },

    getSelectionSurface: function() {
    return document.querySelector('.selection-surface');
},

getSelectionContext: function() {
    const selection = window.getSelection();
    const surface = this.getSelectionSurface();

    if (!selection || !surface || selection.rangeCount === 0) return null;
    if (selection.isCollapsed) return null;

    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) return null;

    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;

    if (!surface.contains(commonAncestor)) return null;

    const shell = commonAncestor.nodeType === Node.ELEMENT_NODE
    ? commonAncestor.closest('.reading-text-shell')
    : commonAncestor.parentElement?.closest('.reading-text-shell');

    const dateStr = shell?.getAttribute('data-reading-date');

    if (!dateStr) return null;

    return { selection, range, text, dateStr, surface };
},

getSelectionAnchorRect: function(range) {
    if (!range) return null;

    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);

    if (rects.length) {
        return rects[rects.length - 1];
    }

    const fallback = range.getBoundingClientRect();
    if (fallback) return fallback;

    return null;
},

scheduleSelectionMenuUpdate: function() {
    if (this.selectionUpdateTimer) {
        clearTimeout(this.selectionUpdateTimer);
    }

    if (this.selectionHideTimer) {
        clearTimeout(this.selectionHideTimer);
        this.selectionHideTimer = null;
    }

    const delay = isAndroidDevice() ? 90 : 45;

    this.selectionUpdateTimer = setTimeout(() => {
        const context = this.getSelectionContext();

        if (!context) {
            this.selectionHideTimer = setTimeout(() => {
                const finalContext = this.getSelectionContext();
                if (!finalContext) {
                    this.removeSelectionMenu();
                }
            }, 120);
            return;
        }

        this.ensureSelectionMenu(context);
    }, delay);
},

    restoreHighlightsInDOM: function(dateStr) {
    const container = document.querySelector('.selection-surface');
    if (!container) return;

    const highlights = this.getHighlights(dateStr);
    if (!highlights.length) return;

    highlights.forEach(item => {
        this.highlightTextInElement(container, item.text, item.color);
    });
},

highlightTextInElement: function(container, text, color = 'yellow') {
    if (!text || !text.trim()) return;

    const searchText = text.trim().toLowerCase();

    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }

                if (node.parentNode && node.parentNode.closest('mark.user-highlight')) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const matches = [];
    let node;

    while ((node = walker.nextNode())) {
        const original = node.nodeValue;
        const lower = original.toLowerCase();
        let startIndex = 0;
        let index;

        while ((index = lower.indexOf(searchText, startIndex)) !== -1) {
            matches.push({
                node,
                index,
                length: text.length
            });
            startIndex = index + text.length;
        }
    }

    for (let i = matches.length - 1; i >= 0; i--) {
        const { node, index, length } = matches[i];

        if (!node.parentNode) continue;

        const original = node.nodeValue;
        const before = original.slice(0, index);
        const match = original.slice(index, index + length);
        const after = original.slice(index + length);

        const fragment = document.createDocumentFragment();

        if (before) fragment.appendChild(document.createTextNode(before));

        const mark = document.createElement('mark');
        mark.className = `user-highlight user-highlight-${color}`;
        mark.textContent = match;
        fragment.appendChild(mark);

        if (after) fragment.appendChild(document.createTextNode(after));

        node.parentNode.replaceChild(fragment, node);
    }
},

saveSelectedHighlight: function(selectedText, color, dateStr) {
    if (!selectedText || selectedText.trim().length < 3) {
        this.showToast('Selecciona un texto un poco más largo');
        return;
    }

    const cleanText = selectedText.trim();
    const highlights = this.getHighlights(dateStr);

    const alreadyExists = highlights.some(item =>
        item.text === cleanText && item.color === color
    );

    if (alreadyExists) {
        this.showToast(`Ese texto ya está resaltado en ${color === 'yellow' ? 'amarillo' : 'azul'}`);
        return;
    }

    highlights.push({ text: cleanText, color });

    this.saveHighlights(dateStr, highlights);
    this.showToast(`Texto resaltado en ${color === 'yellow' ? 'amarillo' : 'azul'}`);
    this.scheduleRender();
},

// ========================================
// SISTEMA DE SELECCIÓN PROFESIONAL
// ========================================

ensureSelectionMenu: function(context) {
    let menu = document.getElementById('selection-menu');

    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'selection-menu';
        menu.className = 'selection-menu';
        menu.setAttribute('data-selection-active', 'true');

        const yellowBtn = document.createElement('button');
        yellowBtn.className = 'selection-menu-btn';
        yellowBtn.type = 'button';
        yellowBtn.innerHTML = '🟡';
        yellowBtn.title = 'Resaltar en amarillo';
        yellowBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.saveSelectedHighlight(this.currentSelectedText, 'yellow', this.currentSelectionDate);
            window.getSelection()?.removeAllRanges();
            this.removeSelectionMenu();
        });

        const blueBtn = document.createElement('button');
        blueBtn.className = 'selection-menu-btn';
        blueBtn.type = 'button';
        blueBtn.innerHTML = '🔵';
        blueBtn.title = 'Resaltar en azul';
        blueBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.saveSelectedHighlight(this.currentSelectedText, 'blue', this.currentSelectionDate);
            window.getSelection()?.removeAllRanges();
            this.removeSelectionMenu();
        });

        const copyBtn = document.createElement('button');
        copyBtn.className = 'selection-menu-btn';
        copyBtn.type = 'button';
        copyBtn.innerHTML = '📋';
        copyBtn.title = 'Copiar texto';
        copyBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                await navigator.clipboard.writeText(this.currentSelectedText || '');
                this.showToast('Texto copiado');
            } catch (error) {
                this.showToast('No se pudo copiar');
            }

            window.getSelection()?.removeAllRanges();
            this.removeSelectionMenu();
        });

        menu.appendChild(yellowBtn);
        menu.appendChild(blueBtn);
        menu.appendChild(copyBtn);
        document.body.appendChild(menu);

        requestAnimationFrame(() => {
            menu.classList.add('visible');
        });

        this.bindSelectionViewportTracking(menu);
    }

    this.currentSelectionRange = context.range.cloneRange();
    this.currentSelectionDate = context.dateStr;
    this.currentSelectedText = context.text;

    this.positionSelectionMenu(menu, context.range);
    this.selectionMenuVisible = true;
},

positionSelectionMenu: function(menu, range) {
    const rect = this.getSelectionAnchorRect(range);
    if (!rect) return;

    const vv = window.visualViewport;
    const viewportWidth = vv ? vv.width : window.innerWidth;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportLeft = vv ? vv.pageLeft : window.scrollX;
    const viewportTop = vv ? vv.pageTop : window.scrollY;

    const menuRect = menu.getBoundingClientRect();
    const safe = 12;
    const gap = 10;

    let left = rect.left + window.scrollX + (rect.width / 2) - (menuRect.width / 2);
    left = Math.max(viewportLeft + safe, Math.min(left, viewportLeft + viewportWidth - menuRect.width - safe));

    const spaceAbove = rect.top - safe;
    const spaceBelow = viewportHeight - rect.bottom - safe;

    let top;
    let arrowPosition;

    if (spaceBelow >= menuRect.height + gap || spaceBelow >= spaceAbove) {
        top = rect.bottom + window.scrollY + gap;
        arrowPosition = 'top';
    } else {
        top = rect.top + window.scrollY - menuRect.height - gap;
        arrowPosition = 'bottom';
    }

    top = Math.max(viewportTop + safe, Math.min(top, viewportTop + viewportHeight - menuRect.height - safe));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    this.updateMenuArrow(menu, arrowPosition);
},

bindSelectionViewportTracking: function(menu) {
    if (this.selectionViewportCleanup) {
        this.selectionViewportCleanup();
        this.selectionViewportCleanup = null;
    }

    let rafId = null;

    const update = () => {
        if (rafId) return;

        rafId = requestAnimationFrame(() => {
            rafId = null;

const context = this.getSelectionContext();
if (!context) {
    this.removeSelectionMenu();
    return;
}

this.currentSelectionRange = context.range.cloneRange();
this.currentSelectionDate = context.dateStr;
this.currentSelectedText = context.text;

this.positionSelectionMenu(menu, context.range);
        });
    };

    const onPointerDownOutside = (e) => {
        if (!menu.contains(e.target)) {
            const context = this.getSelectionContext();
            if (!context) {
                this.removeSelectionMenu();
            }
        }
    };

    window.addEventListener('scroll', update, { passive: true });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('scroll', update, { passive: true });
        window.visualViewport.addEventListener('resize', update, { passive: true });
    }

    document.addEventListener('pointerdown', onPointerDownOutside, true);

    this.selectionViewportCleanup = () => {
        window.removeEventListener('scroll', update);

        if (window.visualViewport) {
            window.visualViewport.removeEventListener('scroll', update);
            window.visualViewport.removeEventListener('resize', update);
        }

        document.removeEventListener('pointerdown', onPointerDownOutside, true);

        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    };
},

updateMenuArrow: function(menu, position) {
    const existingArrow = menu.querySelector('.selection-menu-arrow');
    if (existingArrow) existingArrow.remove();

    const arrow = document.createElement('div');
    arrow.className = `selection-menu-arrow selection-menu-arrow-${position}`;
    menu.appendChild(arrow);
},

removeSelectionMenu: function() {
    const menu = document.getElementById('selection-menu');
    if (menu) {
        menu.remove();
    }

    if (this.selectionViewportCleanup) {
        this.selectionViewportCleanup();
        this.selectionViewportCleanup = null;
    }

    if (this.selectionUpdateTimer) {
        clearTimeout(this.selectionUpdateTimer);
        this.selectionUpdateTimer = null;
    }

    if (this.selectionHideTimer) {
        clearTimeout(this.selectionHideTimer);
        this.selectionHideTimer = null;
    }

    this.selectionMenuVisible = false;
    this.currentSelectionRange = null;
    this.currentSelectedText = null;
    this.currentSelectionDate = null;
},
    
    // ========================================
    // NAVEGACIÓN Y RENDERIZADO
    // ========================================
    loadData: async function() {
        try {
            const response = await fetch('data/readings.json');
            if (!response.ok) throw new Error('Error al cargar lecturas');
            this.data = await response.json();
            this.data.sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (error) {
            console.error('Error loading data:', error);
            this.$content.innerHTML = `
                <div class="empty-state">
                    <h3>⚠️ No se pudieron cargar las lecturas</h3>
                    <p>Por favor, verifica tu conexión a internet.</p>
                    <button class="btn-primary" onclick="location.reload()">Reintentar</button>
                </div>
            `;
        }
    },
    
    navigate: function(view, param = null) {
        let path = `#${view}`;
        if (param) path += `/${param}`;
        history.pushState(null, '', path);
        this.handleRoute().catch(error => {
            console.error('[Route] Error al navegar:', error);
        });
    },
    
    handleRoute: async function() {
    const hash = window.location.hash.substring(1) || 'home';
    const parts = hash.split('/');
    const view = parts[0];
    const param = parts[1] || null;

    // ✅ GUARDAR SCROLL AL SALIR DE COMUNIDAD
    if (this.currentView === 'community' && view !== 'community') {
    this.saveCommunityScrollPosition();
    }
    
    this.resetReadingMode();
    if (this.currentView === 'calendar' && view !== 'calendar') {
    this.saveCalendarScroll();
    }
    this.currentView = view;
    this.updateNavUI();
    
    document.querySelectorAll('.version-btn').forEach(btn => {
        btn.classList.toggle(
            'active',
            btn.getAttribute('data-version') === this.currentVersion
        );
    });
    
    this.$content.classList.remove('fade-in');
    void this.$content.offsetWidth;
    this.$content.classList.add('fade-in');
    
   if (view === 'home') {
    if (!this.homeViewingDate) {
        this.homeViewingDate = this.getTodayDateStr();
    }
    this.renderHome();
} else if (view === 'calendar') {
    this.renderCalendar();
} else if (view === 'community') {
    await this.renderCommunity();
    await this.markCommunityAsSeen();
} else if (view === 'stats') {
    this.renderStats();
} else if (view === 'settings') {
    this.renderSettings();
} else if (view === 'reading' && param) {
    this.renderReading(param);
} else {
    this.renderHome();
}
},
    
   updateNavUI: function() {
    const navBtns = [
        { btn: this.$navHome, views: ['home', 'reading'] },
        { btn: this.$navCalendar, views: ['calendar'] },
        { btn: this.$navCommunity, views: ['community'] },
        { btn: this.$navStats, views: ['stats'] },
        { btn: this.$navSettings, views: ['settings'] }
    ];
    
    navBtns.forEach(({ btn, views }) => {
        if (btn) {
            if (views.includes(this.currentView)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
},
    
    formatDateEs: function(dateStr) {
        const date = new Date(dateStr + 'T12:00:00');
        const options = { day: 'numeric', month: 'long' };
        return date.toLocaleDateString('es-ES', options);
    },
    
    formatDateForCompare: function(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    getReadingIndexByDate: function(dateStr) {
    return this.data.findIndex(item => item.date === dateStr);
},

getHomeViewingDate: function() {
    return this.homeViewingDate || this.getTodayDateStr();
},

changeHomeDay: function(direction) {
    const currentDate = this.getHomeViewingDate();
    const currentIndex = this.getReadingIndexByDate(currentDate);

    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= this.data.length) return;

    this.homeViewingDate = this.data[newIndex].date;
    this.renderHome();
},

    formatCommunityDateLabel: function(dateStr) {
    const today = this.getTodayDateStr();
    const yesterday = this.getYesterdayDateStr();

    if (dateStr === today) return 'Hoy';
    if (dateStr === yesterday) return 'Ayer';

    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short'
    });
},
    
   getTodayDateStr: function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
    },

    saveCalendarScroll: function() {
    this.calendarScrollTop = window.scrollY || window.pageYOffset || 0;
},

restoreCalendarPosition: function() {
    const todayCard = this.$content.querySelector('.calendar-day.today');
    if (!todayCard) return;

    if (this.calendarInitialized) {
        window.scrollTo(0, this.calendarScrollTop || 0);
        return;
    }

    const top = todayCard.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo(0, Math.max(0, top));

    this.calendarInitialized = true;
    this.calendarScrollTop = Math.max(0, top);
},
    
   renderHome: function() {
    const viewingDate = this.getHomeViewingDate();
    const reading = this.data.find(r => r.date === viewingDate);
    this.renderViewContent(reading, true);
},
    
    renderReading: function(dateStr) {
        const reading = this.data.find(r => r.date === dateStr);
        this.renderViewContent(reading, false);
    },

    rerenderCurrentReadingView: function(dateStr = null) {
    if (this.currentView === 'home') {
        this.renderHome();
        return;
    }

    const targetDate = dateStr || this.getTodayDateStr();
    this.renderReading(targetDate);
},
    
    renderViewContent: function(reading, isHome = false) {
        
        if (!reading) {
            this.$content.innerHTML = `
                <div class="empty-state">
                    <h3>📖 No hay lectura programada para este día</h3>
                    <br>
                    <button class="btn-primary" data-nav="calendar">Ver calendario de lecturas</button>
                </div>
            `;
            return;
        }
        
        const dateFormatted = this.formatDateEs(reading.date);
        const readingText = reading.versions?.[this.currentVersion] || reading.text || '';
        const currentBadge = this.getCurrentBadge();

       const introStartDate = '2026-04-07';
        const introEndDate = '2026-04-11';

        const showIntroVideo =
            reading.date >= introStartDate &&
            reading.date <= introEndDate;

const introVideoHtml = showIntroVideo ? `
    <div class="intro-video-card">
        <div class="intro-video-head">
            <div class="intro-video-label">🎬 Video introductorio</div>
            <div class="intro-video-title">Introducción a Deuteronomio</div>
        </div>

       <div class="intro-video-frame">
    <iframe
        src="https://www.youtube.com/embed/LfGZnrbmWaM"
        title="Introducción a Deuteronomio"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen>
    </iframe>
</div>

        <div class="intro-video-note">
            Antes de comenzar la lectura, puedes ver esta introducción.
        </div>
    </div>
` : '';
        
        const currentIndex = reading ? this.getReadingIndexByDate(reading.date) : -1;
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex >= 0 && currentIndex < this.data.length - 1;
        const isRealToday = reading && reading.date === this.getTodayDateStr();
        const readingLabel = isHome
            ? (isRealToday ? '📖 Su voz hoy' : '📖 Su voz este día')
            : '📖 Su voz este día';
        
           this.$content.innerHTML = `
                <div class="reading-date-header">${dateFormatted.toUpperCase()}</div>

                <div class="badge-progress badge-${currentBadge.key}">
                    <span class="badge-progress-icon">${currentBadge.icon}</span>
                    <span class="badge-progress-text">Insignia actual: ${currentBadge.label}</span>
                </div>

                ${introVideoHtml}
    
                <div class="reading-card">
                    <div class="section-title">${readingLabel}</div>
                    <h2 class="reading-reference">${reading.reference}</h2>
                    <div class="reading-text-shell" data-reading-date="${reading.date}">
                        <div class="reading-text selection-surface" data-selection-surface="true">
                            ${readingText}
                        </div>
                    </div>
               </div>
            
            <div class="main-action">
                <button class="btn-secondary ${this.hasNote(reading.date) ? 'has-note' : ''}" data-action="toggle-note" data-date="${reading.date}">
                    ${this.openNoteDate === reading.date ? '✕ Ocultar sección' : '🔎 Profundiza en Su voz'}
                    ${this.hasNote(reading.date) ? ' ✓' : ''}
                </button>
            </div>

           ${this.openNoteDate === reading.date ? `
    <div class="note-box">
        <div class="note-privacy">
            🔒 Estas reflexiones son privadas y solo se guardan en tu dispositivo.
        </div>

        <div class="note-section ${this.activeNoteField === 'dios' ? 'active' : ''}" data-note-section="dios">
            <div class="note-title">👑 Lo que veo de Dios</div>
            <textarea class="note-textarea ${this.activeNoteField === 'dios' ? 'active' : ''}" data-field="dios" data-note-date="${reading.date}" placeholder="¿Qué revela este texto acerca de Dios?">${this.escapeHtml(this.getNote(reading.date).dios)}</textarea>
        </div>

        <div class="note-section ${this.activeNoteField === 'aprendizaje' ? 'active' : ''}" data-note-section="aprendizaje">
            <div class="note-title">📖 Lo que aprendo del pasaje</div>
            <textarea class="note-textarea ${this.activeNoteField === 'aprendizaje' ? 'active' : ''}" data-field="aprendizaje" data-note-date="${reading.date}" placeholder="¿Qué ejemplo, advertencia o enseñanza encuentro aquí?">${this.escapeHtml(this.getNote(reading.date).aprendizaje)}</textarea>
        </div>

        <div class="note-section ${this.activeNoteField === 'respuesta' ? 'active' : ''}" data-note-section="respuesta">
            <div class="note-title">🙏 Mi respuesta hoy</div>
            <textarea class="note-textarea ${this.activeNoteField === 'respuesta' ? 'active' : ''}" data-field="respuesta" data-note-date="${reading.date}" placeholder="¿Qué debo hacer, cambiar o recordar hoy?">${this.escapeHtml(this.getNote(reading.date).respuesta)}</textarea>
        </div>

        <div class="note-section ${this.activeNoteField === 'oracion' ? 'active' : ''}" data-note-section="oracion">
            <div class="note-title">🙏 Mi oración</div>
            <textarea class="note-textarea ${this.activeNoteField === 'oracion' ? 'active' : ''}" data-field="oracion" data-note-date="${reading.date}" placeholder="Pídele a Dios que te ayude a vivir y obedecer lo que has comprendido hoy.">${this.escapeHtml(this.getNote(reading.date).oracion)}</textarea>
        </div>

        <div class="note-actions">
            <button class="btn-secondary" data-action="export-pdf" data-date="${reading.date}">📄 Exportar PDF</button>
            <button class="btn-secondary" data-action="delete-note" data-date="${reading.date}">🗑️ Borrar reflexión</button>
        </div>
    </div>
` : ''}
            
            <div class="main-action">
                ${this.isRead(reading.date)
                    ? `<button class="btn-primary" disabled>✓ Leído hoy</button>`
                    : `<button class="btn-primary" data-action="mark-read" data-date="${reading.date}">✓ Marcar como leído</button>`
                }
            </div>
            
            <div class="action-group">
                <button class="btn-secondary" data-action="share-reading" data-date="${reading.date}">📤 Compartir lectura</button>
                ${this.hasHighlights(reading.date)
                    ? `<button class="btn-secondary" data-action="clear-highlights" data-date="${reading.date}">✨ Quitar resaltados</button>`
                    : ''
                }
            </div>
            
            ${this.readingMode ? `
                <button class="exit-reading-btn" data-action="exit-reading-mode">✕ Salir del modo lectura</button>
            ` : ''}
            
            ${isHome ? `
    <div class="home-reading-bar">
        <button
            class="home-reading-bar-btn"
            data-action="home-prev-day"
            ${hasPrev ? '' : 'disabled'}
            aria-label="Ver día anterior"
            title="Ver día anterior"
        >
            ←
        </button>

        <div class="home-reading-bar-title" title="${reading.reference}">
            ${reading.reference}
        </div>

        <button
            class="home-reading-bar-btn"
            data-action="home-next-day"
            ${hasNext ? '' : 'disabled'}
            aria-label="Ver día siguiente"
            title="Ver día siguiente"
        >
            →
        </button>
    </div>
` : ''}
        `;
            this.restoreHighlightsInDOM(reading.date);
    },
    
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
   renderCalendar: function() {
    if (this.data.length === 0) {
        this.$content.innerHTML = `<div class="empty-state">📅 No hay lecturas disponibles.</div>`;
        return;
    }

    const todayStr = this.getTodayDateStr();

    let html = '<div class="calendar-grid">';

    this.data.forEach(item => {
        const dateStr = this.formatDateEs(item.date);
        const readClass = this.isRead(item.date) ? 'read' : '';
        const isToday = item.date === todayStr;
        const todayClass = isToday ? 'today' : '';

        html += `
            <div class="calendar-day ${readClass} ${todayClass}" data-nav="reading" data-param="${item.date}">
                ${isToday ? '<div class="today-badge">HOY</div>' : ''}
                <div class="cal-date">${dateStr}</div>
                <div class="cal-ref">
                    ${item.reference}
                    ${this.isRead(item.date) ? '<span class="read-badge" title="Leído">✓</span>' : ''}
                    ${this.hasNote(item.date) ? '<span class="note-badge" title="Tiene reflexión">📝</span>' : ''}
                    ${this.hasHighlights(item.date) ? '<span class="highlight-badge" title="Tiene resaltados">✨</span>' : ''}
                </div>
                <div class="cal-arrow">→</div>
            </div>
        `;
    });

    html += '</div>';
    this.$content.innerHTML = html;

    requestAnimationFrame(() => {
    this.restoreCalendarPosition();
});
},

   renderCommunity: async function() {
    const todayStr = this.getTodayDateStr();
    const todayReading = this.data.find(r => r.date === todayStr);
    const todayReference = todayReading ? todayReading.reference : 'Lectura del día';
    
    // Mostrar skeleton loading mientras carga
    this.$content.innerHTML = `
        <div class="community-container">
            <div class="skeleton-loading">
                <div class="skeleton-header"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            </div>
        </div>
    `;
    
   // Cargar posts primero
const posts = await this.getCommunityPostsCached();

// Luego cargar reacciones y respuestas en paralelo
const [reactionSummary, repliesSummary] = await Promise.all([
    this.getCommunityReactionSummary(posts),
    this.getRepliesSummary(posts)
]);
    
    // Renderizar el contenido
    this.$content.innerHTML = `
        <div class="community-container">
            <div class="community-header">
                <div class="community-title">Compartamos Su Voz</div>
                <div class="community-subtitle">
                   Un espacio para compartir lo que Dios te ha hablado a través de su Palabra.
                </div>
            </div>

            <div class="community-intro-card">
                <div class="community-intro-title">Antes de compartir</div>
                <div class="community-intro-text">
                    Este espacio existe para compartir reflexiones edificantes basadas en la lectura del día.
                    Publica con respeto, claridad y sencillez. Evita discusiones, ataques personales,
                    lenguaje ofensivo o contenido ajeno al propósito de esta comunidad.
                    <br><br>
                    Lo que publiques aquí podrá ser visible para otros usuarios y moderado por la aplicación.
                </div>
            </div>

            <div class="main-action">
                <button class="btn-primary" data-action="share-community-reflection">
                   ${this.communityFormOpen ? 'Cerrar formulario' : '📢 Comparte Su voz a otros'}
                </button>
            </div>

            ${this.communityFormOpen ? `
                <div class="community-form-card">
                    <div class="community-form-title">Compartir reflexión</div>

                    <div class="community-form-group">
                        <label class="community-label">Pasaje</label>
                        <input 
                            type="text" 
                            class="community-input" 
                            value="${todayReference}" 
                            readonly
                        >
                    </div>

                    <div class="community-form-group">
                        <label class="community-label">Nombre</label>
                        <input 
                            type="text" 
                            class="community-input" 
                            id="community-name" 
                            placeholder="Se publicará como Anónimo"
                            disabled
                        >
                    </div>

                    <div class="community-form-group community-check-group">
                        <label class="community-check-label">
                            <input type="checkbox" id="community-anonymous" checked>
                            Publicar como Anónimo
                        </label>
                    </div>

                    <div class="community-form-group">
                        <label class="community-label">Tu reflexión</label>
                        <textarea 
                            class="community-textarea" 
                            id="community-reflection" 
                            placeholder="Escribe aquí lo que Dios te habló a través de este pasaje..."
                            maxlength="1200"
                        ></textarea>

                        <div class="community-char-counter" id="community-char-counter">0 / 1200</div>
                    </div>

                    <div class="community-form-actions">
                        <button class="btn-secondary" data-action="cancel-community-form">
                            Cancelar
                        </button>
                        <button class="btn-primary" data-action="publish-community-reflection">
                            Publicar
                        </button>
                    </div>
                </div>
            ` : ''}

            <div class="community-feed">
                ${posts.length ? posts.map(post => {
                    const reactionData = reactionSummary[post.id] || this.getEmptyCommunityReactionState();
                    const replies = repliesSummary[post.id] || [];

                    return `
                        <div class="community-card">
                            <div class="community-ref">${this.escapeHtml(post.reference)}</div>

                            <div class="community-meta">
                                ${this.escapeHtml(post.name)} · ${this.escapeHtml(this.formatCommunityDateLabel(post.date))}
                            </div>

                           <div class="community-text">“${this.escapeHtml(post.text)}”</div>

                                <div class="community-reaction-row">
                                    ${this.renderCommunityReactionBar(post.id, reactionData)}
                                </div>

                                ${this.renderReplyBlock(post, replies)}

                                    ${post.ownerUid === this.currentUser?.uid ? `
                                <div class="community-actions">
                                <button class="btn-secondary danger" data-action="delete-community-post" data-id="${post.id}">
                                    🗑️ Eliminar
                            </button>
                            </div>
                        ` : ''}
                        </div>
                    `;
                }).join('') : `
                    <div class="community-intro-card">
                        <div class="community-intro-title">Aún no hay publicaciones</div>
                        <div class="community-intro-text">
                            Sé la primera persona en compartir una reflexión basada en la lectura del día.
                        </div>
                    </div>
                `}
            </div>
        </div>
    `;
    
    // Restaurar o posicionar scroll según corresponda
    if (this.shouldScrollToLastPost) {
        this.scrollToLastPost();
    } else {
        this.restoreCommunityScrollPosition();
    }
},

    
    renderStats: function() {
        const stats = this.getStats();
        
        this.$content.innerHTML = `
            <div class="stats-container">
                <div class="stat-card">
                    <div class="stat-number">${stats.totalRead}</div>
                    <div class="stat-label">Lecturas completadas</div>
                    <div class="stat-progress">
                        <div class="progress-bar" style="width: ${stats.percentage}%"></div>
                        <div class="progress-text">${stats.percentage}% del plan</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">🔥 ${stats.currentStreak}</div>
                    <div class="stat-label">Días consecutivos</div>
                    <div class="stat-note">🏆 Récord: ${stats.longestStreak} días</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">📝 ${stats.totalNotes}</div>
                    <div class="stat-label">Reflexiones escritas</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">✨ ${stats.totalHighlights}</div>
                    <div class="stat-label">Versículos resaltados</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">📖 ${stats.totalAvailable}</div>
                    <div class="stat-label">Lecturas disponibles</div>
                </div>
            </div>
        `;
    },
    
    renderSettings: function() {
        this.$content.innerHTML = `
            <div class="settings-container">
                <div class="setting-card">
                    <h3>🔔 Notificaciones</h3>
                    <div class="setting-item">
                        <label>⏰ Recordatorio diario</label>
                        <div class="setting-control">
                            <input type="time" id="reminder-time" value="${this.settings.reminderTime}" class="time-input">
                            <button id="test-notification" class="btn-secondary">Probar aviso local</button>
                        </div>
                    </div>
                    <div class="setting-item">
                        <label>📢 Activar notificaciones</label>
                        <label class="switch">
                            <input type="checkbox" id="notifications-toggle" ${this.settings.notificationsEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-card">
                    <h3>🎨 Apariencia</h3>
                    <div class="setting-item">
                        <label>🌓 Tema oscuro</label>
                        <button id="theme-toggle-settings" class="btn-secondary">Cambiar tema</button>
                    </div>
                </div>
                
                <div class="setting-card">
                    <h3>💾 Datos</h3>
                    <div class="setting-item">
                        <button id="export-data" class="btn-secondary">📤 Exportar mis datos</button>
                        <button id="import-data" class="btn-secondary">📥 Importar respaldo</button>
                    </div>
                    <div class="setting-item">
                        <button id="reset-data" class="btn-secondary danger">⚠️ Reiniciar todo</button>
                    </div>
                    <input type="file" id="import-file" accept=".json" style="display: none;">
                </div>
                
               <div class="setting-card about-card">
    <div class="about-header">
        <h3>Su Voz a Diario</h3>
        <span class="about-version">v2.1</span>
    </div>

    <p class="about-description">
        Su Voz a Diario es una herramienta para fomentar una vida constante en la Palabra de Dios.
        A través de lecturas diarias y espacios de reflexión, busca ayudarte a escuchar, entender y responder a la voz de Dios en tu vida.
    </p>

    <div class="about-features">
        <div class="about-feature">📖 Plan de lectura diaria</div>
        <div class="about-feature">📝 Reflexiones personales</div>
        <div class="about-feature">🔥 Sistema de rachas</div>
        <div class="about-feature">✨ Resaltado de textos</div>
        <div class="about-feature">📄 Exportación de notas</div>
    </div>

    <div class="about-divider"></div>

    <p class="about-support-text">
        Si esta aplicación ha sido de bendición para ti, puedes apoyar su desarrollo.
    </p>

    <div class="about-actions">
        <button class="btn-secondary" data-action="donate">Apoyar proyecto</button>
        <a href="mailto:appsuvoz@gmail.com" class="btn-secondary">
            ✉️ Contactar
        </a>
    </div>
</div>
        `;
        
        // Bindear eventos de configuración
        const reminderTime = document.getElementById('reminder-time');
        const notificationsToggle = document.getElementById('notifications-toggle');
        const testNotification = document.getElementById('test-notification');
        const exportBtn = document.getElementById('export-data');
        const importBtn = document.getElementById('import-data');
        const resetBtn = document.getElementById('reset-data');
        const importFile = document.getElementById('import-file');
        const themeToggleSettings = document.getElementById('theme-toggle-settings');
        
if (reminderTime) {
    reminderTime.addEventListener('change', async (e) => {
        this.settings.reminderTime = e.target.value;
        this.saveSettings();

        const savedToken = localStorage.getItem('su-voz-fcm-token');
        if (savedToken && this.currentUser && this.settings.notificationsEnabled) {
            const updated = await this.savePushToken(savedToken);

            if (!updated) {
                console.warn('[App] No se pudo actualizar el token al cambiar la hora');
            }
        }

        this.showToast('Hora de recordatorio actualizada');
    });
}

if (notificationsToggle) {
    notificationsToggle.addEventListener('change', async (e) => {
        if (e.target.checked) {
            const ok = await this.enableNotificationsFlow();

            if (!ok) {
                e.target.checked = false;
                this.settings.notificationsEnabled = false;
                this.saveSettings();
                return;
            }
        } else {
            this.settings.notificationsEnabled = false;
            this.saveSettings();
            localStorage.removeItem('su-voz-last-reminder-date');

            const savedToken = localStorage.getItem('su-voz-fcm-token');
            if (savedToken && this.currentUser) {
                await this.savePushToken(savedToken);
            }

            this.showToast('Notificaciones desactivadas');
        }
    });
}
        if (testNotification) {
            testNotification.addEventListener('click', async () => {
                if (!('Notification' in window)) {
                    this.showToast('Este dispositivo no soporta notificaciones');
                    return;
                }

                if (Notification.permission !== 'granted') {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') {
                        this.showToast('No se concedió permiso para notificaciones');
                        return;
                    }
                }

                new Notification('Su Voz a Diario', {
                    body: 'Prueba local de notificación',
                    icon: './icons/icon-192.png'
                });

                this.showToast('Aviso local enviado');
            });
        }
        
        if (themeToggleSettings) {
            themeToggleSettings.addEventListener('click', () => {
                const toggleBtn = document.getElementById('theme-toggle');
                if (toggleBtn) toggleBtn.click();
            });
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportAllData());
        }
        
        if (importBtn) {
            importBtn.addEventListener('click', () => importFile.click());
        }
        
        if (importFile) {
            importFile.addEventListener('change', (e) => this.importData(e.target.files[0]));
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('⚠️ ¿Estás seguro? Se borrarán TODOS tus datos:\n- Lecturas marcadas\n- Rachas\n- Reflexiones\n- Resaltados\n\nEsta acción no se puede deshacer.')) {
                    this.resetAllData();
                }
            });
        }
    },
    
   exportAllData: function() {
    const allData = {
        version: '2.1',
        exportDate: new Date().toISOString(),
        readDates: this.getReadDates(),
        streak: this.streak,
        settings: this.settings,
        notes: {},
        highlights: {}
    };
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key && key.startsWith('su-voz-note-')) {
            const date = key.replace('su-voz-note-', '');
            allData.notes[date] = this.storage.get(key, {
                dios: '',
                aprendizaje: '',
                respuesta: '',
                oracion: ''
            });
        }

        if (key && key.startsWith('su-voz-highlights-')) {
            const date = key.replace('su-voz-highlights-', '');
            allData.highlights[date] = this.getHighlights(date);
        }
    }

    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `su-voz-backup-${this.getTodayDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showToast('Datos exportados correctamente');
},
    
    importData: function(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.readDates) {
                   this.storage.set('su-voz-read-dates', data.readDates);
                }
                if (data.streak) {
                    this.streak = data.streak;
                    this.saveStreak();
                }
                if (data.settings) {
                    this.settings = { ...this.settings, ...data.settings };
                    this.saveSettings();
                    // Recargar configuración visual
                    this.initTheme();
                    this.loadFontSize();
                }
                if (data.notes) {
                    Object.entries(data.notes).forEach(([date, note]) => {
                        this.storage.set(this.getNoteKey(date), note);
                    });
                }

                if (data.highlights) {
                    Object.entries(data.highlights).forEach(([date, highlights]) => {
                        this.storage.set(this.getHighlightsKey(date), highlights);
                    });
                }
                
                this.showToast('✅ Datos importados correctamente');
                setTimeout(() => location.reload(), 1500);
            } catch (error) {
                console.error('Error importando:', error);
                alert('Error al importar: archivo inválido o corrupto');
            }
        };
        reader.readAsText(file);
    },
    
    resetAllData: function() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('su-voz-') || key === 'theme' || key === 'reading-size' || key === 'current-version')) {
                keys.push(key);
            }
        }

        keys.forEach(key => this.storage.remove(key));

        this.streak = { current: 0, longest: 0, lastReadDate: null };
        this.settings = {
    reminderTime: '08:00',
    notificationsEnabled: false,
    autoSaveNotes: true,
    fontSize: 1.08
};

        this.showToast('🗑️ Todos los datos han sido reiniciados');
        setTimeout(() => location.reload(), 1000);
    },

 initAuth: async function() {
        return new Promise((resolve) => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    this.currentUser = user;
                    console.log('[Auth] Usuario anónimo activo:', user.uid);
                    resolve();
                } else {
                    try {
                        const cred = await signInAnonymously(auth);
                        this.currentUser = cred.user;
                        console.log('[Auth] Sesión anónima iniciada:', cred.user.uid);
                        resolve();
                    } catch (error) {
                        console.error('[Auth] Error en autenticación anónima:', error);
                        this.showToast('No se pudo iniciar la sesión de comunidad');
                        resolve();
                    }
                }
            });
        });
    },

enableNotificationsFlow: async function() {
    if (!('Notification' in window)) {
        this.showToast('Este dispositivo no soporta notificaciones');
        return false;
    }

    if (!('serviceWorker' in navigator)) {
        this.showToast('Este dispositivo no soporta Service Worker');
        return false;
    }

    if (isIOSDevice() && !isRunningAsInstalledPWA()) {
        this.showToast('En iPhone, instala la app en pantalla de inicio');
        return false;
    }

    let permission = Notification.permission;

    if (permission !== 'granted') {
        permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
        this.showToast('No se concedió permiso para notificaciones');
        return false;
    }

    const ok = await this.initPushNotifications();

    if (!ok) {
        this.settings.notificationsEnabled = false;
        this.saveSettings();
        this.showToast('No se pudo activar el canal de notificaciones');
        return false;
    }

    this.settings.notificationsEnabled = true;
    this.saveSettings();

    const savedToken = localStorage.getItem('su-voz-fcm-token');
    if (savedToken && this.currentUser) {
        await this.savePushToken(savedToken);
    }

    this.setupPushListeners();
    this.showToast('Notificaciones activadas');
    return true;
},

    // ========================================
    // PUSH NOTIFICATIONS (NUEVO)
    // ========================================
initPushNotifications: async function() {
    console.log('[App] Iniciando Push Notifications...');

    if (!window.firebaseMessaging || !window.fcmGetToken) {
        console.warn('[App] Firebase Messaging no disponible');
        return false;
    }

    try {
        const messaging = window.firebaseMessaging;
        const registration = await navigator.serviceWorker.ready;

        if (!registration) {
            console.warn('[App] No hay Service Worker listo para Push');
            return false;
        }

        console.log('[App] Service Worker listo para Push');

        const currentToken = await window.fcmGetToken(messaging, {
            vapidKey: 'BEZwr3qHRWvEeEFjsd2aMKqQjcunxXtznMYIBNrek5b-FiLXRK-WChKUpsaVS8c4YiL_BQKO8nQ6GQGmW8-8Bx4',
            serviceWorkerRegistration: registration
        });

        if (!currentToken) {
            console.warn('[App] No se pudo obtener token FCM');
            return false;
        }

        console.log('[App] Token FCM obtenido correctamente');
        localStorage.setItem('su-voz-fcm-token', currentToken);

        return true;
    } catch (error) {
        console.error('[App] Error inicializando Push:', error);
        return false;
    }
},

savePushToken: async function(token) {
    if (!token || !this.currentUser?.uid) {
        console.warn('[App] No se pudo guardar token: falta token o usuario');
        return false;
    }

    try {
        const deviceId = this.getDeviceId();
        const tokenRef = doc(db, 'pushTokens', deviceId);

        await setDoc(tokenRef, {
            token,
            uid: this.currentUser.uid,
            deviceId,
            platform: this.getPlatformLabel(),
            userAgent: navigator.userAgent || '',
            reminderTime: this.settings.reminderTime,
            notificationsEnabled: !!this.settings.notificationsEnabled,
            lastActive: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        console.log('[App] Token Push guardado en Firestore');
        return true;
    } catch (error) {
        console.error('[App] Error guardando token:', error);
        return false;
    }
},

    setupPushListeners: function() {
    if (this.pushListenersReady) return;

    if (!window.firebaseMessaging || !window.fcmOnMessage) {
        console.warn('[App] Listeners no disponibles');
        return;
    }
    
    const messaging = window.firebaseMessaging;
    
    window.fcmOnMessage(messaging, (payload) => {
        console.log('[App] 📨 Push recibido:', payload);
        if (payload.notification) {
            this.showToast(payload.notification.body || 'Nueva notificación');
        }
    });
    
    this.pushListenersReady = true;
    console.log('[App] ✅ Listeners Push configurados');
},
    
    // ========================================
    // EVENTOS
    // ========================================
    bindEvents: function() {
        // Navegación
        if (this.$navHome) {
            this.$navHome.addEventListener('click', () => {
             this.homeViewingDate = null;
            this.navigate('home');
            });
        }
        if (this.$navCalendar) this.$navCalendar.addEventListener('click', () => this.navigate('calendar'));
        if (this.$navStats) this.$navStats.addEventListener('click', () => this.navigate('stats'));
        if (this.$navSettings) this.$navSettings.addEventListener('click', () => this.navigate('settings'));
        if (this.$navCommunity) this.$navCommunity.addEventListener('click', () => this.navigate('community'));
        window.addEventListener('popstate', () => {
            this.handleRoute().catch(error => {
            console.error('[Route] Error en popstate:', error);
        });
    });
        
        // Controles de fuente y versión
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="font-increase"]')) {
                this.changeFontSize(0.05);
            }
            if (e.target.closest('[data-action="font-decrease"]')) {
                this.changeFontSize(-0.05);
            }
            
            const versionBtn = e.target.closest('[data-version]');
            if (versionBtn) {
                this.currentVersion = versionBtn.getAttribute('data-version');
                localStorage.setItem('current-version', this.currentVersion);
                document.querySelectorAll('.version-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-version') === this.currentVersion);
                });
                this.handleRoute().catch(error => {
                console.error('[Route] Error cambiando versión:', error);
                });
                
                this.showToast(`Versión cambiada a ${this.currentVersion.toUpperCase()}`);
            }
        });
        
        // Eventos del contenido
       this.$content.addEventListener('click', async (e) => {
            // Activar modo lectura solo si se hace clic directo en el bloque,
            // no cuando se está seleccionando texto
            const readingEl = e.target.closest('.selection-surface');
                if (readingEl) {
                const selection = window.getSelection();
                if (selection && selection.toString().trim()) {
                return;
                }

                if (this.selectionMenuVisible) {
                return;
                }

                 const now = Date.now();
                const shell = readingEl.closest('.reading-text-shell');
                const date = shell ? shell.getAttribute('data-reading-date') : null;

                if (now - this.lastReadingTap < this.readingTapDelay) {
                this.readingMode = !this.readingMode;
                document.body.classList.toggle('reading-mode', this.readingMode);
                this.lastReadingTap = 0;

                    if (date) {
                        this.rerenderCurrentReadingView(date);
                    }
                } else {
                    this.lastReadingTap = now;
                }

                return;
            }
            
            if (e.target.closest('[data-action="exit-reading-mode"]')) {
                const readingShell = document.querySelector('.reading-text-shell');
                const date = readingShell ? readingShell.getAttribute('data-reading-date') : null;
                this.readingMode = false;
                document.body.classList.remove('reading-mode');
                if (date) this.rerenderCurrentReadingView(date);
                return;
            }
            
            // Marcar como leído
            const markBtn = e.target.closest('[data-action="mark-read"]');
            if (markBtn) {
                const date = markBtn.getAttribute('data-date');
                this.markAsRead(date);
                this.rerenderCurrentReadingView(date);
                return;
            }
            
            // Compartir
          const shareBtn = e.target.closest('[data-action="share-reading"]');
          if (shareBtn) {
            const date = shareBtn.getAttribute('data-date');
            const reading = this.data.find(r => r.date === date);

        if (reading) {
        const rawHtml = reading.versions?.[this.currentVersion] || reading.text || '';

        const cleanText = rawHtml
            .replace(/<\/p>\s*<p>/g, '\n\n')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();

       const appLink = 'https://su-voz-a-diario.github.io/su-voz-a-diario/';

        const shareText = `📖 SU VOZ A DIARIO
        ━━━━━━━━━━
        Pasaje: ${reading.reference}
        Versión: ${this.currentVersion.toUpperCase()}
        ━━━━━━━━━━

        ${cleanText}

        ━━━━━━━━━━
        Sigue escuchando Su voz en:
        ${appLink}`;

       if (navigator.share) {
           navigator.share({ title: 'Su voz a diario', text: shareText })
                .catch(() => {});
       } else if (navigator.clipboard) {
            navigator.clipboard.writeText(shareText).then(() => this.showToast('Lectura copiada al portapapeles'));
        }
    }
    return;
}

const prevDayBtn = e.target.closest('[data-action="home-prev-day"]');
if (prevDayBtn) {
    this.changeHomeDay(-1);
    return;
}

const nextDayBtn = e.target.closest('[data-action="home-next-day"]');
if (nextDayBtn) {
    this.changeHomeDay(1);
    return;
}
           
const donateBtn = e.target.closest('[data-action="donate"]');
if (donateBtn) {
    window.open('https://paypal.me/suvozadiario', '_blank');
    this.showToast('Serás redirigido a PayPal');
    return;
}

const shareCommunityBtn = e.target.closest('[data-action="share-community-reflection"]');
if (shareCommunityBtn) {
    this.communityFormOpen = !this.communityFormOpen;

    if ('vibrate' in navigator) {
        navigator.vibrate(25);
    }

   this.handleRoute().catch(error => {
    console.error('[Route] Error actualizando comunidad:', error);
    });
    return;
}

const cancelCommunityBtn = e.target.closest('[data-action="cancel-community-form"]');
if (cancelCommunityBtn) {
    this.communityFormOpen = false;

    if ('vibrate' in navigator) {
        navigator.vibrate(20);
    }

    this.handleRoute().catch(error => {
        console.error('[Route] Error actualizando comunidad:', error);
    });
    return;
}
           
const publishCommunityBtn = e.target.closest('[data-action="publish-community-reflection"]');
if (publishCommunityBtn) {
    const nameInput = document.getElementById('community-name');
    const anonymousInput = document.getElementById('community-anonymous');
    const reflectionInput = document.getElementById('community-reflection');

    let reflectionText = reflectionInput ? reflectionInput.value.trim() : '';

    if (reflectionText.length > 1200) {
    this.showToast('La reflexión no puede exceder 1200 caracteres');
    if (reflectionInput) reflectionInput.focus();
    return;
}

    const validation = Sanitizer.validateText(reflectionText);
    if (!validation.valid) {
        this.showToast(validation.message);

        if (reflectionInput) {
            reflectionInput.focus();
            reflectionInput.classList.add('error');

            setTimeout(() => {
                reflectionInput.classList.remove('error');
            }, 2000);
        }

        return;
    }

    reflectionText = Sanitizer.sanitizeText(reflectionText);

    const typedName = nameInput ? nameInput.value.trim() : '';
    const isAnonymous = anonymousInput ? anonymousInput.checked : true;
    const displayName = isAnonymous
        ? 'Anónimo'
        : (Sanitizer.sanitizeUsername(typedName) || 'Anónimo');

    if (!this.currentUser) {
        this.showToast('No se pudo identificar al usuario');
        return;
    }

    const todayStr = this.getTodayDateStr();
    const todayReading = this.data.find(r => r.date === todayStr);

    const newPost = {
        reference: todayReading ? todayReading.reference : 'Lectura del día',
        name: displayName,
        text: reflectionText,
        date: todayStr,
        ownerUid: this.currentUser.uid
    };

    const success = await this.addCommunityPost(newPost);

    if (!success) {
        this.showToast('No se pudo publicar la reflexión');
        return;
    }

    // ✅ NUEVO: Invalidar caché y marcar para scroll al último
    this.invalidateCommunityCache();
    this.shouldScrollToLastPost = true;  // Esto hará que al recargar vaya al nuevo post

    if ('vibrate' in navigator) {
        navigator.vibrate(30);
    }

    this.communityFormOpen = false;

    if (reflectionInput) reflectionInput.value = '';
    if (nameInput) nameInput.value = '';
    if (anonymousInput) anonymousInput.checked = true;
    if (nameInput) {
        nameInput.disabled = true;
        nameInput.placeholder = 'Se publicará como Anónimo';
    }

    this.showToast('Reflexión publicada correctamente');

    this.handleRoute().catch(error => {
        console.error('[Route] Error actualizando comunidad:', error);
    });
    return;
}
           
const deleteCommunityBtn = e.target.closest('[data-action="delete-community-post"]');
if (deleteCommunityBtn) {
    const postId = deleteCommunityBtn.getAttribute('data-id');

    if (confirm('¿Deseas eliminar esta reflexión?')) {
        const success = await this.deleteCommunityPost(postId);

        if (!success) {
            this.showToast('No se pudo eliminar la reflexión');
            return;
        }

         this.invalidateCommunityCache(); 

        if ('vibrate' in navigator) {
            navigator.vibrate(20);
        }

        this.showToast('Reflexión eliminada');
        this.handleRoute().catch(error => {
            console.error('[Route] Error actualizando comunidad:', error);
        });
    }

    return;
}

const toggleReplyBtn = e.target.closest('[data-action="toggle-reply-form"]');
if (toggleReplyBtn) {
    const postId = toggleReplyBtn.getAttribute('data-post-id');
    this.toggleReplyForm(postId);
    this.renderCommunity().catch(error => {
        console.error('[Community] Error actualizando formulario de respuesta:', error);
    });
    return;
}

const cancelReplyBtn = e.target.closest('[data-action="cancel-reply-form"]');
if (cancelReplyBtn) {
    const postId = cancelReplyBtn.getAttribute('data-post-id');
    this.openReplyPostId = null;
    this.clearReplyDraft(postId);
    this.renderCommunity().catch(error => {
        console.error('[Community] Error cerrando formulario de respuesta:', error);
    });
    return;
}

const publishReplyBtn = e.target.closest('[data-action="publish-reply"]');
if (publishReplyBtn) {
    const postId = publishReplyBtn.getAttribute('data-post-id');
    const text = this.getReplyDraft(postId).trim();

    if (!text) {
        this.showToast('Escribe una respuesta');
        return;
    }

    if (!this.currentUser) {
        this.showToast('No se pudo identificar al usuario');
        return;
    }

    const result = await this.addCommunityReply({
        postId,
        name: 'Anónimo',
        text,
        date: this.getTodayDateStr(),
        ownerUid: this.currentUser.uid
    });

    if (!result.success) {
        this.showToast(result.message || 'No se pudo guardar la respuesta');
        return;
    }

    this.invalidateCommunityCache(); 

    this.clearReplyDraft(postId);
    this.openReplyPostId = null;
    this.showToast('Respuesta publicada');

    this.renderCommunity().catch(error => {
        console.error('[Community] Error actualizando respuestas:', error);
    });
    return;
}

const deleteReplyBtn = e.target.closest('[data-action="delete-community-reply"]');
if (deleteReplyBtn) {
    const replyId = deleteReplyBtn.getAttribute('data-reply-id');

    if (confirm('¿Deseas eliminar esta respuesta?')) {
        const success = await this.deleteCommunityReply(replyId);

        if (!success) {
            this.showToast('No se pudo eliminar la respuesta');
            return;
        }

        this.invalidateCommunityCache();
        this.showToast('Respuesta eliminada');
        this.renderCommunity().catch(error => {
            console.error('[Community] Error actualizando respuestas:', error);
        });
    }

    return;
}

const communityReactionBtn = e.target.closest('[data-action="community-reaction-toggle"]');
if (communityReactionBtn) {
    e.preventDefault();
    e.stopPropagation();

    const postId = communityReactionBtn.getAttribute('data-post-id');
    const reaction = communityReactionBtn.getAttribute('data-reaction');

    if (!postId || !reaction) {
        return;
    }

    const wasActive = communityReactionBtn.classList.contains('is-active');

    this.setReactionButtonLoading(communityReactionBtn, true);

    try {
        const result = await this.toggleCommunityReaction(postId, reaction);

        if (!result.success) {
            this.showToast(result.message || 'No se pudo guardar la reacción');
            return;
        }

        this.updateSingleReactionButtonUI(communityReactionBtn, !wasActive);

        if ('vibrate' in navigator) {
            navigator.vibrate(15);
        }
    } catch (error) {
        console.error('[Community] Error actualizando reacción:', error);
        this.showToast('No se pudo guardar la reacción');
    } finally {
        this.setReactionButtonLoading(communityReactionBtn, false);
    }

    return;
}
            
// Exportar PDF
const pdfBtn = e.target.closest('[data-action="export-pdf"]');
if (pdfBtn) {
    const date = pdfBtn.getAttribute('data-date');
    this.exportReflectionPDF(date);
    return;
}

// Quitar resaltados
const clearBtn = e.target.closest('[data-action="clear-highlights"]');
if (clearBtn) {
    const date = clearBtn.getAttribute('data-date');
    this.storage.remove(this.getHighlightsKey(date));
    this.removeHighlightButton();
    this.rerenderCurrentReadingView(date);
    this.showToast('Resaltados eliminados');
    return;
}

// Notas
const noteBtn = e.target.closest('[data-action="toggle-note"]');
if (noteBtn) {
    const date = noteBtn.getAttribute('data-date');
    this.toggleNote(date);
    this.rerenderCurrentReadingView(date);
    return;
}

const deleteNoteBtn = e.target.closest('[data-action="delete-note"]');
if (deleteNoteBtn) {
    const date = deleteNoteBtn.getAttribute('data-date');
    this.deleteNote(date);
    this.rerenderCurrentReadingView(date);
    return;
}

// Navegación desde calendario
const navItem = e.target.closest('[data-nav]');
if (navItem) {
    const targetView = navItem.getAttribute('data-nav');
    const param = navItem.getAttribute('data-param');
    if (targetView === 'reading' && param) {
        this.navigate('reading', param);
        }
}
});
        
        // Auto-guardado de notas
       this.$content.addEventListener('input', (e) => {
        if (e.target.matches('.community-reply-textarea')) {
    const postId = e.target.getAttribute('data-post-id');
    if (postId) {
        this.updateReplyDraft(postId, e.target.value);

        const counter = e.target
            .closest('.community-reply-form')
            ?.querySelector('.community-reply-counter');

        if (counter) {
            counter.textContent = `${this.getReplyDraft(postId).length}/${this.replyCharLimit}`;
        }
    }
    return;
}
    if (e.target.matches('.note-textarea')) {
        const date = e.target.getAttribute('data-note-date');
        const field = e.target.getAttribute('data-field');

        if (date && field) {
            const note = this.getNote(date);
            note[field] = e.target.value;
            this.saveNote(date, note);
        }
    }

    if (e.target.id === 'community-reflection') {
        const counter = document.getElementById('community-char-counter');
        if (!counter) return;

        const currentLength = e.target.value.length;
        const maxLength = 1200;

        counter.textContent = `${currentLength} / ${maxLength}`;

        counter.classList.remove('warning', 'danger');

        if (currentLength >= 1000 && currentLength < 1200) {
            counter.classList.add('warning');
        }

        if (currentLength >= 1200) {
            counter.classList.add('danger');
        }
    }
});

        this.$content.addEventListener('change', (e) => {
    if (e.target.id === 'community-anonymous') {
        const nameInput = document.getElementById('community-name');
        if (!nameInput) return;

        if (e.target.checked) {
            nameInput.value = '';
            nameInput.disabled = true;
            nameInput.placeholder = 'Se publicará como Anónimo';
        } else {
            nameInput.disabled = false;
            nameInput.placeholder = 'Escribe tu nombre';
            nameInput.focus();
        }
    }
});

        // Detectar campo activo de reflexión
this.$content.addEventListener('focusin', (e) => {
    const textarea = e.target.closest('.note-textarea');
    if (!textarea) return;

    const field = textarea.getAttribute('data-field');
    if (!field) return;

    if (this.activeNoteField !== field) {
        this.activeNoteField = field;

        if ('vibrate' in navigator) {
            navigator.vibrate(20);
        }
    }
});

document.addEventListener('selectionchange', () => {
    const surface = this.getSelectionSurface();
    if (!surface) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        this.removeSelectionMenu();
        return;
    }

    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;

    if (!surface.contains(commonAncestor)) {
        this.removeSelectionMenu();
        return;
    }

    this.scheduleSelectionMenuUpdate();
});

document.addEventListener('pointerup', () => {
    this.scheduleSelectionMenuUpdate();
}, true);
},
    
    initTheme: function() {
        const savedTheme = localStorage.getItem('theme');
        const toggleBtn = document.getElementById('theme-toggle');
        
        const applyTheme = (isDark) => {
            if (isDark) {
                document.body.classList.add('dark-mode');
                document.body.classList.remove('light-mode');
                if (toggleBtn) toggleBtn.textContent = '☀️';
            } else {
                document.body.classList.remove('dark-mode');
                document.body.classList.add('light-mode');
                if (toggleBtn) toggleBtn.textContent = '🌙';
            }
        };
        
        if (savedTheme === 'dark') {
            applyTheme(true);
        } else if (savedTheme === 'light') {
            applyTheme(false);
        } else {
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(systemDark);
        }
        
        if (toggleBtn && !this.themeListenerReady) {
    toggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.contains('dark-mode');
        applyTheme(!isDark);
        localStorage.setItem('theme', !isDark ? 'dark' : 'light');
        this.showToast(!isDark ? 'Modo oscuro activado' : 'Modo claro activado');
    });

    this.themeListenerReady = true;
}
    }
};

// ================================
// MANEJO GLOBAL DE ERRORES
// ================================
class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.setupGlobalHandler();
    }
    
    setupGlobalHandler() {
        window.addEventListener('error', (e) => {
            this.logError({
                type: 'error',
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                timestamp: new Date().toISOString()
            });
            
           const errorMessage = (e.message || '');

            if (!errorMessage.includes('NetworkError')) {
                App.showToast('Ocurrió un error. Por favor, recarga la página.');
        }
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            this.logError({
                type: 'unhandledRejection',
                reason: e.reason,
                timestamp: new Date().toISOString()
            });
        });
    }

    logError(errorData) {
        this.errorLog.push(errorData);

        if (this.errorLog.length > 50) {
            this.errorLog.shift();
        }

        console.error('[ErrorHandler]', errorData);
    }
}

const errorHandler = new ErrorHandler();

// ================================
// SANITIZADOR BÁSICO DE CONTENIDO
// ================================
const Sanitizer = {
    
    sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';

        let cleaned = text.trim();

        // Limitar longitud
        cleaned = cleaned.substring(0, 1200);

        // Eliminar HTML
        cleaned = cleaned.replace(/<[^>]*>/g, '');

        // Quitar scripts peligrosos
        cleaned = cleaned.replace(/javascript:/gi, '');
        cleaned = cleaned.replace(/on\w+=/gi, '');

        // Normalizar espacios
        cleaned = cleaned.replace(/\s+/g, ' ');

        return cleaned.trim();
    },

    sanitizeUsername(name) {
        if (!name) return 'Anónimo';

        let cleaned = name.trim().substring(0, 30);

        cleaned = cleaned.replace(/[^a-zA-ZáéíóúñÑüÁÉÍÓÚÜ\s]/g, '');

        return cleaned || 'Anónimo';
    },

    sanitizeReference(ref) {
        if (!ref) return 'Lectura del día';

        let cleaned = ref.trim().substring(0, 100);

        cleaned = cleaned.replace(/[^a-zA-Z0-9\s:;.,\-]/g, '');

        return cleaned || 'Lectura del día';
    },

    validateText(text) {
        if (!text || text.trim().length === 0) {
            return { valid: false, message: 'Escribe tu reflexión' };
        }

        if (text.length < 10) {
            return { valid: false, message: 'Escribe un poco más (mínimo 10 caracteres)' };
        }

        if (text.length > 1200) {
            return { valid: false, message: 'Texto demasiado largo' };
        }

        return { valid: true };
    }
};

// Inicializar la app
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(error => {
        console.error('[App] Error al inicializar:', error);
    });
});

window.addEventListener('load', () => {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;

    setTimeout(() => {
        splash.style.opacity = '0';

        setTimeout(() => {
            splash.remove();
        }, 800);
    }, 1800);
});
