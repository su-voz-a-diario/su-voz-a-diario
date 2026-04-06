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
    
    calendarInitialized: false,
    calendarScrollTop: 0,
  
    
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
        notificationsEnabled: true,
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
        if (!('serviceWorker' in navigator)) return;
        
        // Escuchar mensajes del Service Worker
        navigator.serviceWorker.addEventListener('message', (event) => {
            const { data } = event;
            
            switch (data.type) {
                case 'CHECK_READ_STATUS':
                    // El SW pregunta si ya se leyó hoy
                    const todayStr = this.getTodayDateStr();
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ 
                            isReadToday: this.isRead(todayStr) 
                        });
                    }
                    break;
                    
                case 'NAVIGATE_TO':
                    // Navegar a una ruta específica desde notificación
                    if (data.url) {
                        const path = data.url.replace('./', '').replace('#', '');
                        this.navigate(path || 'home');
                    }
                    break;
                    
                case 'SYNC_COMPLETE':
                    console.log('[App] Sincronización completada');
                    this.showToast('Datos sincronizados correctamente');
                    break;
                    
                default:
                    console.log('[App] Mensaje del SW:', data);
            }
        });
        
        // Notificar al SW que la app está lista
        this.sendToSW({ type: 'APP_READY' });
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
            notificationsEnabled: true,
            autoSaveNotes: true,
            fontSize: 1.08
        };

        const savedSettings = this.storage.get('su-voz-settings', {});
        this.settings = { ...defaultSettings, ...savedSettings };
    },
    
    saveSettings: function() {
    this.storage.set('su-voz-settings', this.settings);

    if (this.settings.notificationsEnabled) {
        this.sendToSW({
            type: 'SCHEDULE_NOTIFICATION',
            time: this.settings.reminderTime
        });
    } else {
        this.sendToSW({ type: 'CANCEL_NOTIFICATIONS' });
    }
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

    if (this.settings.notificationsEnabled && Notification.permission === 'granted') {
        this.sendToSW({
            type: 'SCHEDULE_NOTIFICATION',
            time: this.settings.reminderTime
        });
    }
},
    
    showDailyReminder: function() {
        if (!('Notification' in window)) return;

        if (this.settings.notificationsEnabled && Notification.permission === 'granted') {
            const todayStr = this.getTodayDateStr();
            if (!this.isRead(todayStr)) {
                new Notification('📖 Su Voz a Diario', {
                    body: '¿Ya escuchaste Su voz hoy? Tómate un momento para escucharle.',
                    icon: '/icons/icon-192.png',
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

async addCommunityPost(post) {
    try {
        await addDoc(collection(db, "communityPosts"), {
            ...post,
            createdAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error guardando post:", error);
        return false;
    }
},

async deleteCommunityPost(postId) {
    try {
        await deleteDoc(doc(db, "communityPosts", postId));
        return true;
    } catch (error) {
        console.error("Error eliminando post:", error);
        return false;
    }
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
    this.lastSeenCommunityAt = value || null;

    if (value) {
        localStorage.setItem(this.getCommunityLastSeenKey(), value);
    } else {
        localStorage.removeItem(this.getCommunityLastSeenKey());
    }
},

markCommunityAsSeen: async function() {
    try {
        const posts = await this.getCommunityPosts();

        if (!posts.length) {
            this.saveCommunityLastSeen(null);
            this.communityUnreadCount = 0;
            this.updateCommunityBadge();
            return;
        }

        const latestPost = posts[0];
        const latestValue = latestPost.createdAt?.seconds
            ? String(latestPost.createdAt.seconds)
            : latestPost.date || null;

        this.saveCommunityLastSeen(latestValue);
        this.communityUnreadCount = 0;
        this.updateCommunityBadge();
    } catch (error) {
        console.error('[Community] Error marcando como visto:', error);
    }
},

refreshCommunityBadge: async function() {
    try {
        const posts = await this.getCommunityPosts();
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

        let unread = 0;

        posts.forEach(post => {
            const postValue = post.createdAt?.seconds
                ? String(post.createdAt.seconds)
                : post.date || '';

            if (postValue > lastSeen) {
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
        const existing = document.getElementById('highlight-btn');
        if (existing) existing.remove();
    },

    restoreHighlightsInDOM: function(dateStr) {
    const container = document.querySelector('.reading-text');
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
    
   showHighlightButton: function(selection, dateStr) {
    this.removeHighlightButton();

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const picker = document.createElement('div');
    picker.id = 'highlight-btn';
    picker.className = 'highlight-picker';

    const colors = [
        { color: 'yellow', icon: '🟡', label: 'Amarillo' },
        { color: 'blue', icon: '🔵', label: 'Azul' }
    ];

    colors.forEach(({ color, icon, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'highlight-color-btn';
        btn.setAttribute('aria-label', `Resaltar en ${label}`);
        btn.setAttribute('title', `Resaltar en ${label}`);
        btn.textContent = icon;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (selectedText.length < 3) {
                this.showToast('Selecciona un texto un poco más largo');
                selection.removeAllRanges();
                this.removeHighlightButton();
                return;
            }

            const highlights = this.getHighlights(dateStr);

            const alreadyExists = highlights.some(item =>
                item.text === selectedText && item.color === color
            );

            if (!alreadyExists) {
                highlights.push({
                    text: selectedText,
                    color
                });

                this.saveHighlights(dateStr, highlights);
                this.showToast(`Texto resaltado en ${label.toLowerCase()}`);
            } else {
                this.showToast(`Ese texto ya está resaltado en ${label.toLowerCase()}`);
            }

            selection.removeAllRanges();
            this.removeHighlightButton();
            this.scheduleRender();
        });

        picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    requestAnimationFrame(() => {
        const pickerRect = picker.getBoundingClientRect();
        const margin = 12;

        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        let top;

        if (spaceBelow >= pickerRect.height + 12) {
            top = window.scrollY + rect.bottom + 10;
        } else if (spaceAbove >= pickerRect.height + 12) {
            top = window.scrollY + rect.top - pickerRect.height - 10;
        } else {
            top = window.scrollY + Math.max(
                margin,
                Math.min(
                    window.innerHeight - pickerRect.height - margin,
                    rect.bottom + 10
                )
            );
        }

        let left = window.scrollX + rect.left + (rect.width / 2) - (pickerRect.width / 2);

        const minLeft = window.scrollX + margin;
        const maxLeft = window.scrollX + window.innerWidth - pickerRect.width - margin;

        left = Math.max(minLeft, Math.min(left, maxLeft));

        picker.style.top = `${top}px`;
        picker.style.left = `${left}px`;
    });
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
    
                <div class="reading-card">
                    <div class="section-title">${readingLabel}</div>
                    <h2 class="reading-reference">${reading.reference}</h2>
                    <div class="reading-text" data-reading-date="${reading.date}">
                        ${readingText}
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
    const posts = await this.getCommunityPosts();
    const reactionSummary = await this.getCommunityReactionSummary(posts);

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
                    ${this.communityFormOpen ? 'Cerrar formulario' : '📝 Compartir mi reflexión'}
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
                        ></textarea>
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
                            <button id="test-notification" class="btn-secondary">Probar</button>
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
            reminderTime.addEventListener('change', (e) => {
                this.settings.reminderTime = e.target.value;
                this.saveSettings();
                this.showToast('Hora de recordatorio actualizada');
            });
        }
        
        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', async (e) => {

             // ✅ Validar soporte primero
                if (!('Notification' in window)) {
                    this.settings.notificationsEnabled = false;
                    e.target.checked = false;
                    this.saveSettings();
                    this.showToast('Este dispositivo no soporta notificaciones');
                    return;
                }

            this.settings.notificationsEnabled = e.target.checked;

            if (this.settings.notificationsEnabled && Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();

                if (permission !== 'granted') {
                    this.settings.notificationsEnabled = false;
                    e.target.checked = false;
                    this.saveSettings();
                    this.showToast('No se concedió permiso para notificaciones');
                    return;
                }
            }

            this.saveSettings();
            this.showToast(this.settings.notificationsEnabled ? 'Notificaciones activadas' : 'Notificaciones desactivadas');
        });
    }
        
        if (testNotification) {
            testNotification.addEventListener('click', () => {
                if (!('Notification' in window)) {
                    this.showToast('Este dispositivo no soporta notificaciones');
                    return;
                }

                if (Notification.permission === 'granted') {
                    new Notification('Su Voz a Diario', {
                        body: '¡Las notificaciones funcionan correctamente!',
                        icon: '/icons/icon-192.png'
                   });
                   this.showToast('Notificación de prueba enviada');
               } else {
                   Notification.requestPermission().then(perm => {
                        if (perm === 'granted') {
                            this.showToast('Permiso concedido. Prueba de nuevo.');
                        }
                    });
                }
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
            notificationsEnabled: true,
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
            const readingEl = e.target.closest('.reading-text');
            if (readingEl) {
                const selection = window.getSelection();
                if (selection && selection.toString().trim()) {
                return;
                }

                const now = Date.now();
                const date = readingEl.getAttribute('data-reading-date');

                if (now - this.lastReadingTap < this.readingTapDelay) {
                this.readingMode = !this.readingMode;
                document.body.classList.toggle('reading-mode', this.readingMode);
                this.lastReadingTap = 0;

                    if (date) {
                        this.renderReading(date);
                    }
                } else {
                    this.lastReadingTap = now;
                }

                return;
            }
            
            if (e.target.closest('[data-action="exit-reading-mode"]')) {
                const readingEl = document.querySelector('.reading-text');
                const date = readingEl ? readingEl.getAttribute('data-reading-date') : null;
                this.readingMode = false;
                document.body.classList.remove('reading-mode');
                if (date) this.renderReading(date);
                return;
            }
            
            // Marcar como leído
            const markBtn = e.target.closest('[data-action="mark-read"]');
            if (markBtn) {
                const date = markBtn.getAttribute('data-date');
                this.markAsRead(date);
                this.renderReading(date);
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

        const shareText = `📖 SU VOZ A DIARIO
━━━━━━━━━━
Pasaje: ${reading.reference}
Versión: ${this.currentVersion.toUpperCase()}
━━━━━━━━━━

${cleanText}

━━━━━━━━━━
Compartido desde Su voz a diario`;

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

    const reflectionText = reflectionInput ? reflectionInput.value.trim() : '';
    const typedName = nameInput ? nameInput.value.trim() : '';
    const isAnonymous = anonymousInput ? anonymousInput.checked : true;

    if (!reflectionText) {
        this.showToast('Escribe primero tu reflexión');
        if (reflectionInput) reflectionInput.focus();
        return;
    }

    const todayStr = this.getTodayDateStr();
    const todayReading = this.data.find(r => r.date === todayStr);
    const displayName = isAnonymous ? 'Anónimo' : (typedName || 'Anónimo');

    if (!this.currentUser) {
        this.showToast('No se pudo identificar al usuario');
        return;
    }

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

       if ('vibrate' in navigator) {
        navigator.vibrate(30);
    }

    this.communityFormOpen = false;
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

const communityReactionBtn = e.target.closest('[data-action="community-reaction-toggle"]');
if (communityReactionBtn) {
    const postId = communityReactionBtn.getAttribute('data-post-id');
    const reaction = communityReactionBtn.getAttribute('data-reaction');

    const result = await this.toggleCommunityReaction(postId, reaction);

    if (!result.success) {
        this.showToast(result.message || 'No se pudo guardar la reacción');
        return;
    }

    if ('vibrate' in navigator) {
        navigator.vibrate(15);
    }

    this.renderCommunity().catch(error => {
        console.error('[Community] Error actualizando reacciones:', error);
    });
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
    this.renderReading(date);
    this.showToast('Resaltados eliminados');
    return;
}

// Notas
const noteBtn = e.target.closest('[data-action="toggle-note"]');
if (noteBtn) {
    const date = noteBtn.getAttribute('data-date');
    this.toggleNote(date);
    this.renderReading(date);
    return;
}

const deleteNoteBtn = e.target.closest('[data-action="delete-note"]');
if (deleteNoteBtn) {
    const date = deleteNoteBtn.getAttribute('data-date');
    this.deleteNote(date);
    this.renderReading(date);
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
            if (e.target.matches('.note-textarea')) {
                const date = e.target.getAttribute('data-note-date');
                const field = e.target.getAttribute('data-field');
                if (date && field) {
                    const note = this.getNote(date);
                    note[field] = e.target.value;
                    this.saveNote(date, note);
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

        this.scheduleRender();
    }
});
        
        // Resaltado de texto
        let selectionTimeout;

document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimeout);

    selectionTimeout = setTimeout(() => {
        const selection = window.getSelection();

        if (!selection || selection.isCollapsed) {
            this.removeHighlightButton();
            return;
        }

        const anchorNode = selection.anchorNode;
        if (!anchorNode) return;

        const readingTextEl = document.querySelector('.reading-text');
        if (!readingTextEl || !readingTextEl.contains(anchorNode)) {
            this.removeHighlightButton();
            return;
        }

        const dateStr = readingTextEl.getAttribute('data-reading-date');
        if (dateStr) {
            this.showHighlightButton(selection, dateStr);
        }
    }, 350);
});
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
        
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const isDark = document.body.classList.contains('dark-mode');
                applyTheme(!isDark);
                localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                this.showToast(!isDark ? 'Modo oscuro activado' : 'Modo claro activado');
            });
        }
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
