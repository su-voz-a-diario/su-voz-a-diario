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

const API_BIBLE_KEY = 'wNtIC6e2aKALJdpFovm2R';
const API_BIBLE_BASE = 'https://rest.api.bible/v1';
const API_BIBLE_ID = '482ddd53705278cc-02';

async function apiBibleFetch(path) {
    const response = await fetch(`${API_BIBLE_BASE}${path}`, {
        method: 'GET',
        headers: {
            'api-key': API_BIBLE_KEY
        }
    });

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        console.error('API.Bible error:', data);
        throw new Error(data?.message || 'Error al consultar API.Bible');
    }

    if (!data) {
        throw new Error('Respuesta inválida de API.Bible');
    }

    return data;
}

async function getBibleChapter(bookId, chapterNumber) {
    const chapterId = `${bookId.toUpperCase()}.${chapterNumber}`;

    const result = await apiBibleFetch(
    `/bibles/${API_BIBLE_ID}/chapters/${chapterId}?content-type=html&include-notes=false&include-titles=true&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=true`
);

    return result.data;
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
    currentVersion: 'rvr60',
    bibleBooks: [
    { id: 'gen', name: 'Génesis', chapters: 50 },
    { id: 'exo', name: 'Éxodo', chapters: 40 },
    { id: 'lev', name: 'Levítico', chapters: 27 },
    { id: 'num', name: 'Números', chapters: 36 },
    { id: 'deu', name: 'Deuteronomio', chapters: 34 },
    { id: 'jos', name: 'Josué', chapters: 24 },
    { id: 'jdg', name: 'Jueces', chapters: 21 },
    { id: 'rut', name: 'Rut', chapters: 4 },
    { id: '1sa', name: '1 Samuel', chapters: 31 },
    { id: '2sa', name: '2 Samuel', chapters: 24 },
    { id: '1ki', name: '1 Reyes', chapters: 22 },
    { id: '2ki', name: '2 Reyes', chapters: 25 },
    { id: '1ch', name: '1 Crónicas', chapters: 29 },
    { id: '2ch', name: '2 Crónicas', chapters: 36 },
    { id: 'ezr', name: 'Esdras', chapters: 10 },
    { id: 'neh', name: 'Nehemías', chapters: 13 },
    { id: 'est', name: 'Ester', chapters: 10 },
    { id: 'job', name: 'Job', chapters: 42 },
    { id: 'psa', name: 'Salmos', chapters: 150 },
    { id: 'pro', name: 'Proverbios', chapters: 31 },
    { id: 'ecc', name: 'Eclesiastés', chapters: 12 },
    { id: 'sng', name: 'Cantares', chapters: 8 },
    { id: 'isa', name: 'Isaías', chapters: 66 },
    { id: 'jer', name: 'Jeremías', chapters: 52 },
    { id: 'lam', name: 'Lamentaciones', chapters: 5 },
    { id: 'ezk', name: 'Ezequiel', chapters: 48 },
    { id: 'dan', name: 'Daniel', chapters: 12 },
    { id: 'hos', name: 'Oseas', chapters: 14 },
    { id: 'jol', name: 'Joel', chapters: 3 },
    { id: 'amo', name: 'Amós', chapters: 9 },
    { id: 'oba', name: 'Abdías', chapters: 1 },
    { id: 'jon', name: 'Jonás', chapters: 4 },
    { id: 'mic', name: 'Miqueas', chapters: 7 },
    { id: 'nam', name: 'Nahúm', chapters: 3 },
    { id: 'hab', name: 'Habacuc', chapters: 3 },
    { id: 'zep', name: 'Sofonías', chapters: 3 },
    { id: 'hag', name: 'Hageo', chapters: 2 },
    { id: 'zec', name: 'Zacarías', chapters: 14 },
    { id: 'mal', name: 'Malaquías', chapters: 4 },
    { id: 'mat', name: 'Mateo', chapters: 28 },
    { id: 'mrk', name: 'Marcos', chapters: 16 },
    { id: 'luk', name: 'Lucas', chapters: 24 },
    { id: 'jhn', name: 'Juan', chapters: 21 },
    { id: 'act', name: 'Hechos', chapters: 28 },
    { id: 'rom', name: 'Romanos', chapters: 16 },
    { id: '1co', name: '1 Corintios', chapters: 16 },
    { id: '2co', name: '2 Corintios', chapters: 13 },
    { id: 'gal', name: 'Gálatas', chapters: 6 },
    { id: 'eph', name: 'Efesios', chapters: 6 },
    { id: 'php', name: 'Filipenses', chapters: 4 },
    { id: 'col', name: 'Colosenses', chapters: 4 },
    { id: '1th', name: '1 Tesalonicenses', chapters: 5 },
    { id: '2th', name: '2 Tesalonicenses', chapters: 3 },
    { id: '1ti', name: '1 Timoteo', chapters: 6 },
    { id: '2ti', name: '2 Timoteo', chapters: 4 },
    { id: 'tit', name: 'Tito', chapters: 3 },
    { id: 'phm', name: 'Filemón', chapters: 1 },
    { id: 'heb', name: 'Hebreos', chapters: 13 },
    { id: 'jas', name: 'Santiago', chapters: 5 },
    { id: '1pe', name: '1 Pedro', chapters: 5 },
    { id: '2pe', name: '2 Pedro', chapters: 3 },
    { id: '1jn', name: '1 Juan', chapters: 5 },
    { id: '2jn', name: '2 Juan', chapters: 1 },
    { id: '3jn', name: '3 Juan', chapters: 1 },
    { id: 'jud', name: 'Judas', chapters: 1 },
    { id: 'rev', name: 'Apocalipsis', chapters: 22 }
    ],
     // ⭐⭐⭐ MAPA DE IDs DE API.BIBLE A NUESTROS IDs ⭐⭐⭐
    bibleApiIdMap: {
        'GEN': 'gen', 'EXO': 'exo', 'LEV': 'lev', 'NUM': 'num', 'DEU': 'deu',
        'JOS': 'jos', 'JDG': 'jdg', 'RUT': 'rut', '1SA': '1sa', '2SA': '2sa',
        '1KI': '1ki', '2KI': '2ki', '1CH': '1ch', '2CH': '2ch', 'EZR': 'ezr',
        'NEH': 'neh', 'EST': 'est', 'JOB': 'job', 'PSA': 'psa', 'PRO': 'pro',
        'ECC': 'ecc', 'SNG': 'sng', 'ISA': 'isa', 'JER': 'jer', 'LAM': 'lam',
        'EZK': 'ezk', 'DAN': 'dan', 'HOS': 'hos', 'JOL': 'jol', 'AMO': 'amo',
        'OBA': 'oba', 'JON': 'jon', 'MIC': 'mic', 'NAM': 'nam', 'HAB': 'hab',
        'ZEP': 'zep', 'HAG': 'hag', 'ZEC': 'zec', 'MAL': 'mal',
        'MAT': 'mat', 'MRK': 'mrk', 'LUK': 'luk', 'JHN': 'jhn', 'ACT': 'act',
        'ROM': 'rom', '1CO': '1co', '2CO': '2co', 'GAL': 'gal', 'EPH': 'eph',
        'PHP': 'php', 'COL': 'col', '1TH': '1th', '2TH': '2th', '1TI': '1ti',
        '2TI': '2ti', 'TIT': 'tit', 'PHM': 'phm', 'HEB': 'heb', 'JAS': 'jas',
        '1PE': '1pe', '2PE': '2pe', '1JN': '1jn', '2JN': '2jn', '3JN': '3jn',
        'JUD': 'jud', 'REV': 'rev'
    },
    getBibleBookById: function(apiBookId) {
        const ourId = this.bibleApiIdMap[apiBookId.toUpperCase()] || apiBookId.toLowerCase();
        return this.bibleBooks.find(b => b.id === ourId);
    },

    getTestamentFromBookId: function(bookId) {
        const book = this.getBibleBookById(bookId);
        if (!book) return 'unknown';

        const oldTestamentIds = new Set([
            'gen','exo','lev','num','deu','jos','jdg','rut','1sa','2sa','1ki','2ki','1ch','2ch','ezr','neh','est',
            'job','psa','pro','ecc','sng','isa','jer','lam','ezk','dan','hos','jol','amo','oba','jon','mic','nam',
            'hab','zep','hag','zec','mal'
        ]);

        return oldTestamentIds.has(book.id) ? 'old' : 'new';
    },

    selectedBibleBook: null,
    selectedBibleChapter: null,
    currentBibleChapterData: null,

    bibleSearchIndexReady: false,
    bibleSearchData: [],
    bibleSearchIndex: new Map(),
    bibleSearchVerseMap: new Map(),

    bibleSearchQuery: '',
    bibleSearchResults: [],
    bibleSearchLoading: false,
    bibleSearchTotal: 0,
    bibleSearchTotalPages: 0,
    bibleSearchPage: 1,
    bibleSearchPageSize: 20,
    searchTimeout: null,
    targetVerse: null,
    bibleSearchFilter: 'all', // 'all', 'old', 'new'
    openNoteDate: null,
    activeNoteField: null,
    homeViewingDate: null,
    communityFormOpen: false,
    currentUser: null,
    communityUnreadCount: 0,
    lastSeenCommunityAt: null,
    openReplyPostId: null,
    replyDrafts: {},
    replyCharLimit: 300,
    previousView: null,
    
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
selectionPanelLocked: false,
activeSelectionSurface: null,
currentSelectedVerse: null,       
currentSelectedText: null,
currentSelectionDate: null,
currentSelectionColorDraft: null,
_savedScrollY: null, 
pushListenersReady: false,
themeListenerReady: false,
lastScrollY: 0,
scrollDirection: 'up',
scrollCompactEnabled: false,
scrollCompactActive: false,
scrollIdleTimer: null,
_selectionPanelEventsBound: false,
    
    // ========================================
    // INICIALIZACIÓN
    // ========================================
   init: async function() {
    console.log('[App] Inicializando...');
    
    this.cacheDOM();
    this.bindSelectionPanelEvents();
    this.showAprilMessageIfNeeded();
    this.loadSettings();
    this.loadStreak();
    this.loadFontSize();
    this.loadCommunityLastSeen();
    localStorage.removeItem('su-voz-last-reminder-date');
       
    const savedVersion = localStorage.getItem('current-version');
    if (savedVersion) {
        this.currentVersion = savedVersion;
    }
       
this.initTheme();
this.initNotifications();
this.setupSWCommunication();
this.bindEvents();
this.bindHeaderControlsToggle();
this.bindScrollChrome();
this.bindKeyboardViewportFix();
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

await this.handleRoute();
this.updateStreakUI();
    
    console.log('[App] Inicialización completada');
},
    
cacheDOM: function() {
    this.$content = document.getElementById('app-content');
    this.$navHome = document.getElementById('nav-home');
    this.$navBible = document.getElementById('nav-bible');
    this.$navCalendar = document.getElementById('nav-calendar');
    this.$navStats = document.getElementById('nav-stats');
    this.$navCommunity = document.getElementById('nav-community');
    this.$headerSettingsBtn = document.getElementById('header-settings-btn');
    this.$communityBadge = document.getElementById('community-badge');
    this.$streakIndicator = document.getElementById('streak-indicator');
    this.$streakCount = document.getElementById('streak-count');
    this.$headerControlsBtn = document.getElementById('header-controls-btn');
    this.$headerControlsDropdown = document.getElementById('header-controls-dropdown');
    this.$selectionPanel = document.getElementById('selectionPanel');
    this.$selectionBackdrop = this.$selectionPanel?.querySelector('.selection-panel-backdrop') || null;
    this.$selectionSheet = this.$selectionPanel?.querySelector('.selection-sheet-full') || null;
    this.$selectionNote = document.getElementById('selectionNote');
    this.$selectionCopyBtn = document.getElementById('copyBtn');
    this.$selectionClearBtn = document.getElementById('clearBtn');
    this.$selectionCloseBtn = document.getElementById('closePanel');
    this.$selectionSaveNoteBtn = document.getElementById('saveNoteBtn');
    this.$selectionNoteBtn = document.getElementById('noteBtn');
    this.$selectionColorButtons = Array.from(document.querySelectorAll('.color-btn'));
    this.$bottomNav = document.querySelector('.bottom-nav');
    this._keyboardHandlersBound = false;
    this._baseViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
},

bindKeyboardViewportFix: function() {

    if (this._keyboardHandlersBound) return;

    const updateKeyboardState = () => {

        const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

        const baseHeight = this._baseViewportHeight || currentHeight;

        const keyboardOpen = (baseHeight - currentHeight) > 140;

        document.body.classList.toggle('keyboard-open', keyboardOpen);

    };

    if (window.visualViewport) {

        window.visualViewport.addEventListener('resize', updateKeyboardState);

        window.visualViewport.addEventListener('scroll', updateKeyboardState);

    } else {

        window.addEventListener('resize', updateKeyboardState);

    }

    document.addEventListener('focusin', (e) => {

        const el = e.target;

        const isTextInput =

            el &&

            (el.tagName === 'TEXTAREA' ||

             (el.tagName === 'INPUT' && /text|search|url|email|tel|password/.test(el.type)));

        if (isTextInput) {

            document.body.classList.add('keyboard-open');

        }

    });

    document.addEventListener('focusout', () => {

        setTimeout(() => {

            const active = document.activeElement;

            const stillTyping =

                active &&

                (active.tagName === 'TEXTAREA' ||

                 (active.tagName === 'INPUT' && /text|search|url|email|tel|password/.test(active.type)));

            if (!stillTyping) {

                document.body.classList.remove('keyboard-open');

            }

        }, 120);

    });

    this._keyboardHandlersBound = true;

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

isReadingLikeView: function(view = this.currentView) {
    return ['home', 'reading', 'bible-reading'].includes(view);
},

setScrollCompactState: function(isCompact) {
    this.scrollCompactActive = false;
    document.body.classList.remove('reading-scroll-compact');
},

resetScrollChrome: function() {
    this.lastScrollY = window.scrollY || window.pageYOffset || 0;
    this.scrollCompactEnabled = false;
    this.scrollCompactActive = false;
    document.body.classList.remove('reading-scroll-compact');

    if (this.scrollIdleTimer) {
        clearTimeout(this.scrollIdleTimer);
        this.scrollIdleTimer = null;
    }
},

handleScrollChrome: function() {
    return;
},

bindScrollChrome: function() {
    document.body.classList.remove('reading-scroll-compact');
    this.scrollCompactEnabled = false;
},

bindHeaderControlsToggle: function() {
    if (!this.$headerControlsBtn) return;

    this.$headerControlsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.$headerControlsDropdown.classList.toggle('show');
    });

    // Cerrar al hacer clic fuera del dropdown
    document.addEventListener('click', (e) => {
        if (
            this.$headerControlsDropdown &&
            !this.$headerControlsDropdown.contains(e.target) &&
            !this.$headerControlsBtn.contains(e.target)
        ) {
            this.$headerControlsDropdown.classList.remove('show');
        }
    });
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
    console.log('[App] showDailyReminder desactivado: ahora se usarán push remotos');
},

checkReminderOnOpen: function() {
    console.log('[App] checkReminderOnOpen desactivado: ahora se usarán push remotos');
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

    if (key && key.startsWith('su-voz-selection-notes-')) {
        const date = key.replace('su-voz-selection-notes-', '');
        const selectionNotes = this.getSelectionNotes(date);
        totalNotes += selectionNotes.length;
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

    getSelectionNotesKey: function(dateStr) {
    return `su-voz-selection-notes-${dateStr}`;
},

getSelectionNotes: function(dateStr) {
    const saved = this.storage.get(this.getSelectionNotesKey(dateStr), []);
    if (!Array.isArray(saved)) return [];

    return saved
        .map(item => ({
            text: (item?.text || '').replace(/\s+/g, ' ').trim(),
            note: (item?.note || '').trim()
        }))
        .filter(item => item.text.length >= 3 && item.note.length > 0);
},

getSelectionNoteByText: function(dateStr, selectedText) {
    const cleanText = (selectedText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return this.getSelectionNotes(dateStr).find(item => item.text.toLowerCase() === cleanText) || null;
},

saveSelectionNoteEntry: function(dateStr, selectedText, noteText) {
    const cleanText = (selectedText || '').replace(/\s+/g, ' ').trim();
    const cleanNote = (noteText || '').trim();

    if (!cleanText || cleanText.length < 3 || !cleanNote) return false;

    const notes = this.getSelectionNotes(dateStr);
    const normalizedText = cleanText.toLowerCase();

    const existingIndex = notes.findIndex(item => item.text.toLowerCase() === normalizedText);

    if (existingIndex >= 0) {
        notes[existingIndex].note = cleanNote;
    } else {
        notes.push({
            text: cleanText,
            note: cleanNote
        });
    }

    this.storage.set(this.getSelectionNotesKey(dateStr), notes);
    return true;
},

deleteSelectionNoteEntry: function(dateStr, selectedText) {
    const cleanText = (selectedText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const notes = this.getSelectionNotes(dateStr);
    const filtered = notes.filter(item => item.text.toLowerCase() !== cleanText);

    if (filtered.length === notes.length) return false;

    if (filtered.length === 0) {
        this.storage.remove(this.getSelectionNotesKey(dateStr));
    } else {
        this.storage.set(this.getSelectionNotesKey(dateStr), filtered);
    }

    return true;
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
            const newestPost = posts[0];
            newestPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('[Community] Scroll al post más reciente');
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
        this.$communityBadge.textContent = this.communityUnreadCount > 9 ? '9+' : String(this.communityUnreadCount);
    } else {
        this.$communityBadge.hidden = true;
        this.$communityBadge.textContent = '0';
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

getSelectionSurfaceFromNode: function(node) {
    if (!node) return null;

    const element = node.nodeType === Node.ELEMENT_NODE
        ? node
        : node.parentElement;

    return element ? element.closest('.selection-surface') : null;
},

restoreHighlightsInDOM: function(dateStr) {
    const shell = document.querySelector(`.reading-text-shell[data-reading-date="${dateStr}"]`);
    const container = shell ? shell.querySelector('.selection-surface') : null;
    if (!container) return;

    const highlights = this.getHighlights(dateStr);
    if (!highlights.length) return;

    highlights.forEach(item => {
        this.highlightTextInElement(container, item.text, item.color);
    });
},

restoreHighlightsInDOMForVerses: function(dateStr) {
    const shell = document.querySelector(`.reading-text-shell[data-reading-date="${dateStr}"]`);
    const container = shell ? shell.querySelector('.verse-container') : null;
    if (!container) return;
    
    const selectionNotes = this.getSelectionNotes(dateStr);
    const normalize = str => (str || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const verseItems = container.querySelectorAll('.verse-item');
    
    // Restaurar íconos de nota
    selectionNotes.forEach(note => {
        const noteText = normalize(note.text);
        
        for (const verseItem of verseItems) {
            const verseText = normalize(verseItem.getAttribute('data-verse-full') || 
                                         verseItem.getAttribute('data-verse-text') || 
                                         verseItem.textContent || '');
            
            if (verseText === noteText || verseText.includes(noteText)) {
                verseItem.setAttribute('data-has-note', 'true');
                if (!verseItem.querySelector('.verse-note-icon')) {
                    const icon = document.createElement('span');
                    icon.className = 'verse-note-icon';
                    icon.textContent = '📝';
                    icon.title = 'Este versículo tiene una nota guardada';
                    verseItem.appendChild(icon);
                }
                break;
            }
        }
    });
},

restoreSelectionNotesInDOM: function(dateStr) {
    const shell = document.querySelector(`.reading-text-shell[data-reading-date="${dateStr}"]`);
    const container = shell ? shell.querySelector('.selection-surface') : null;
    if (!container) return;

    const selectionNotes = this.getSelectionNotes(dateStr);
    if (!selectionNotes.length) return;

    selectionNotes.forEach(item => {
        this.addSelectionNoteMarkerInElement(container, item.text, item.note);
    });
},

addSelectionNoteMarkerInElement: function(container, text, note = '') {
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

                if (node.parentNode && node.parentNode.closest('.selection-note-anchor')) {
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
                length: searchText.length
            });
            startIndex = index + searchText.length;
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

        const anchor = document.createElement('span');
        anchor.className = 'selection-note-anchor';
        anchor.textContent = match;
        anchor.setAttribute('data-selection-note', 'true');
        anchor.setAttribute('title', note || 'Este texto tiene una nota guardada');
        fragment.appendChild(anchor);

        if (after) fragment.appendChild(document.createTextNode(after));

        node.parentNode.replaceChild(fragment, node);
    }
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
                length: searchText.length
            });
            startIndex = index + searchText.length;
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

getSelectionHighlightState: function(selectedText, dateStr) {
    const cleanText = (selectedText || '').replace(/\s+/g, ' ').trim();
    const highlights = this.getHighlights(dateStr);

    const normalize = str => str.replace(/\s+/g, ' ').trim().toLowerCase();

const matching = highlights.filter(item =>
    normalize(item.text) === normalize(cleanText)
);

    return {
        exists: matching.length > 0,
        colors: [...new Set(matching.map(item => item.color))]
    };
},

removeSelectedHighlight: function(selectedText, dateStr, color = null) {
    const cleanText = (selectedText || '').replace(/\s+/g, ' ').trim();
    const normalize = str => (str || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (!cleanText || cleanText.length < 3) {
        this.showToast('Selecciona un texto válido');
        return;
    }

    const highlights = this.getHighlights(dateStr);
    const filtered = highlights.filter(item => {
        const sameText = normalize(item.text) === normalize(cleanText);

        if (!sameText) return true;
        if (color && item.color !== color) return true;

        return false;
    });

    if (filtered.length === highlights.length) {
        this.showToast('Ese texto no tiene un resaltado guardado');
        return;
    }

    if (filtered.length === 0) {
        this.storage.remove(this.getHighlightsKey(dateStr));
        this.sendToSW({ type: 'HIGHLIGHTS_UPDATED', date: dateStr });
    } else {
        this.saveHighlights(dateStr, filtered);
    }

    this.currentSelectionColorDraft = null;

    if (this.$selectionColorButtons.length) {
        this.$selectionColorButtons.forEach(btn => {
            btn.classList.remove('is-active');
        });
    }

    this.showToast(
        color
            ? `Resaltado ${color === 'yellow' ? 'amarillo' : 'azul'} eliminado`
            : 'Resaltado eliminado'
    );

    this.hideSelectionPanel();
    window.getSelection()?.removeAllRanges();
    this.rerenderCurrentReadingView(dateStr, true);
},
    
hideSelectionPanel: function(clearStoredSelection = true) {
    if (this.$selectionPanel) {
        this.$selectionPanel.classList.remove('visible');
        this.$selectionPanel.classList.remove('note-mode');
    }
    
    if (this.$selectionSheet) {
        this.$selectionSheet.style.bottom = '0px';
        this.$selectionSheet.style.maxHeight = '';
    }
    
    // ✅ QUITAR la clase que bloquea el scroll
    document.body.classList.remove('selection-panel-open');
    
    // ✅ RESTAURAR la posición del scroll guardada
    if (this._savedScrollY !== undefined && this._savedScrollY !== null) {
        window.scrollTo(0, this._savedScrollY);
        this._savedScrollY = null;
    }
    
    this.clearVerseSelection();
    this.selectionPanelLocked = false;
    
    if (clearStoredSelection) {
        this.currentSelectedText = null;
        this.currentSelectionDate = null;
        this.activeSelectionSurface = null;
        this.currentSelectionColorDraft = null;
    }
},

saveSelectionNoteFromPanel: function() {
    const dateStr = this.currentSelectionDate;
    const selectedText = (this.currentSelectedText || '').replace(/\s+/g, ' ').trim();
    const noteText = (this.$selectionNote?.value || '').trim();

    if (!dateStr || !selectedText) {
        this.showToast('No hay selección activa');
        return;
    }

    if (!noteText) {
        const deleted = this.deleteSelectionNoteEntry(dateStr, selectedText);

        if (deleted) {
            this.showToast('Nota eliminada');
        } else {
            this.showToast('Escribe una nota');
            return;
        }

        this.hideSelectionPanel();
        window.getSelection()?.removeAllRanges();
        this.rerenderCurrentReadingView(dateStr, true);
        return;
    }

    const saved = this.saveSelectionNoteEntry(dateStr, selectedText, noteText);

    if (!saved) {
        this.showToast('No se pudo guardar la nota');
        return;
    }

    this.showToast('Nota guardada');
    // Actualizar ícono de nota en el versículo actual
if (this.currentSelectedVerse) {
    this.currentSelectedVerse.setAttribute('data-has-note', 'true');
    if (!this.currentSelectedVerse.querySelector('.verse-note-icon')) {
        const icon = document.createElement('span');
        icon.className = 'verse-note-icon';
        icon.textContent = '📝';
        icon.title = 'Este versículo tiene una nota guardada';
        this.currentSelectedVerse.appendChild(icon);
    }
}
    this.hideSelectionPanel();
    window.getSelection()?.removeAllRanges();
    this.rerenderCurrentReadingView(dateStr, true);
},

bindSelectionPanelEvents: function() {
    if (this._selectionPanelEventsBound) return;

    if (this.$selectionBackdrop) {
        this.$selectionBackdrop.addEventListener('click', () => {
            this.hideSelectionPanel();
            window.getSelection()?.removeAllRanges();
        });
    }

    if (this.$selectionCloseBtn) {
        this.$selectionCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideSelectionPanel();
            window.getSelection()?.removeAllRanges();
        });
    }

    if (this.$selectionCopyBtn) {
        this.$selectionCopyBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                await navigator.clipboard.writeText(this.currentSelectedText || '');
                this.showToast('Texto copiado');
            } catch (error) {
                this.showToast('No se pudo copiar');
            }

            this.hideSelectionPanel();
            window.getSelection()?.removeAllRanges();
        });
    }

    if (this.$selectionNoteBtn) {
    this.$selectionNoteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.selectionPanelLocked = true;
        this.expandSelectionPanelForNote(true);

        setTimeout(() => {
            this.$selectionNote?.focus();
        }, 120);
    });
}

    if (this.$selectionClearBtn) {
        this.$selectionClearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const state = this.getSelectionHighlightState(this.currentSelectedText, this.currentSelectionDate);

            if (!state.exists) {
                this.showToast('No se encontró un resaltado guardado para esa selección');
                this.hideSelectionPanel();
                window.getSelection()?.removeAllRanges();
                return;
            }

            if (state.colors.length === 1) {
                this.removeSelectedHighlight(this.currentSelectedText, this.currentSelectionDate, state.colors[0]);
                return;
            }

            this.removeSelectedHighlight(this.currentSelectedText, this.currentSelectionDate);
        });
    }

    if (this.$selectionSaveNoteBtn) {
    this.$selectionSaveNoteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.saveSelectionNoteFromPanel();
    });
}

    if (this.$selectionNote) {
    this.$selectionNote.addEventListener('focus', () => {
        this.selectionPanelLocked = true;
        this.expandSelectionPanelForNote(true);

        setTimeout(() => {
            this.$selectionNote?.scrollIntoView({
                block: 'center',
                behavior: 'smooth'
            });
        }, 180);
    });

    this.$selectionNote.addEventListener('blur', () => {
        setTimeout(() => {
            const stillInsidePanel =
                this.$selectionPanel &&
                document.activeElement &&
                this.$selectionPanel.contains(document.activeElement);

            if (!stillInsidePanel) {
                this.selectionPanelLocked = false;
                this.expandSelectionPanelForNote(false);
            }
        }, 180);
    });
}

    if (this.$selectionColorButtons.length) {
    this.$selectionColorButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const color = btn.getAttribute('data-color');
            if (!color) return;

            this.saveSelectedHighlight(this.currentSelectedText, color, this.currentSelectionDate);
        });
    });
}

if (this.$selectionPanel) {
    this.$selectionPanel.addEventListener('pointerdown', () => {
        this.selectionPanelLocked = true;
    });
}
    
    this._selectionPanelEventsBound = true;
},

expandSelectionPanelForNote: function(expand = true) {
    if (!this.$selectionPanel) return;

    if (expand) {
        this.$selectionPanel.classList.add('note-mode');

        setTimeout(() => {
            this.$selectionNote?.focus();
        }, 120);
    } else {
        this.$selectionPanel.classList.remove('note-mode');
    }
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
    const oldView = this.currentView;

    // ✅ GUARDAR SCROLL AL SALIR DE COMUNIDAD
    if (this.currentView === 'community' && view !== 'community') {
    this.saveCommunityScrollPosition();
    }
    
this.hideSelectionPanel();

if (this.currentView === 'calendar' && view !== 'calendar') {
    this.saveCalendarScroll();
}

if (view !== 'settings' && oldView !== 'settings') {
    this.previousView = oldView;
}

this.currentView = view;
this.updateNavUI();
this.resetScrollChrome();
    
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
} else if (view === 'bible') {
    this.renderBible();
} else if (view === 'bible-search') {
    this.$content.innerHTML = this.renderBibleSearch();
} else if (view === 'bible-reading') {
    await this.renderBibleReading();
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
    this.currentView = 'home';
    this.updateNavUI();
    this.renderHome();
}
},
    
updateNavUI: function() {
    const navBtns = [
        { btn: this.$navHome, views: ['home', 'reading'] },
        { btn: this.$navBible, views: ['bible', 'bible-reading'] },
        { btn: this.$navCalendar, views: ['calendar'] },
        { btn: this.$navCommunity, views: ['community'] },
        { btn: this.$navStats, views: ['stats'] }
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


// ========================================
// NUEVO SISTEMA DE VERSÍCULOS SELECCIONABLES
// ========================================

renderVerseText: function(htmlContent, dateStr) {
    // Crear un contenedor temporal para parsear el HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Extraer versículos del formato API.Bible
    const verses = [];
    const verseSpans = tempDiv.querySelectorAll('.v, [data-verse]');
    
    if (verseSpans.length > 0) {
        // Si hay marcadores de versículo, separar por ellos
        let currentVerse = '';
        let currentVerseNum = '';
        
        const walker = document.createTreeWalker(
            tempDiv,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            null
        );
        
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === Node.ELEMENT_NODE && 
                (node.classList?.contains('v') || node.hasAttribute('data-verse'))) {
                if (currentVerse) {
                    verses.push({
                        number: currentVerseNum,
                        text: currentVerse.trim()
                    });
                }
                currentVerseNum = node.textContent.trim();
                currentVerse = '';
            } else if (node.nodeType === Node.TEXT_NODE) {
    currentVerse += node.textContent;
}
        }
        
        if (currentVerse) {
            verses.push({
                number: currentVerseNum,
                text: currentVerse.trim()
            });
        }
    } else {
        // Si no hay marcadores, intentar separar por números de versículo en el texto
        const plainText = tempDiv.textContent;
        const versePattern = /(\d+)\s+([^\d]+?)(?=\s*\d+\s+|$)/g;
        let match;
        
        while ((match = versePattern.exec(plainText)) !== null) {
            verses.push({
                number: match[1],
                text: match[2].trim()
            });
        }
    }
    
    // Si no se pudieron extraer versículos, mostrar el texto completo
    if (verses.length === 0) {
        const plainText = htmlContent.replace(/<[^>]+>/g, '').trim();
        return `<div class="verse-item verse-selectable" data-verse-text="${this.escapeHtml(plainText)}">${htmlContent}</div>`;
    }
    
    // Renderizar cada versículo como un elemento seleccionable
// Obtener los resaltados guardados para esta fecha
const highlights = this.getHighlights(dateStr);
const normalize = str => (str || '').replace(/\s+/g, ' ').trim().toLowerCase();

// Renderizar cada versículo como un elemento seleccionable
return verses.map(verse => {
    // Verificar si este versículo tiene una nota guardada
    const verseFullText = verse.number + ' ' + verse.text;
    const cleanVerseText = verseFullText.replace(/\s+/g, ' ').trim();
    const existingNote = this.getSelectionNoteByText(dateStr, cleanVerseText);
    const hasNote = existingNote !== null;
    
    // ✅ NUEVO: Verificar si este versículo tiene resaltados guardados
    const verseHighlight = highlights.find(h => {
    const highlightText = normalize(h.text);
    const currentVerseText = normalize(verseFullText);
    return highlightText === currentVerseText;
});
    
    const highlightClass = verseHighlight ? `highlight-${verseHighlight.color}` : '';
    
    return `
        <div class="verse-item verse-selectable ${highlightClass}" 
             data-verse-number="${verse.number}"
             data-verse-text="${this.escapeHtml(verse.text)}"
             data-verse-full="${this.escapeHtml(verseFullText)}"
             data-has-note="${hasNote}">
            <span class="verse-number">${verse.number}</span>
            <span class="verse-text-content">${verse.text}</span>
            ${hasNote ? '<span class="verse-note-icon" title="Este versículo tiene una nota guardada">📝</span>' : ''}
        </div>
    `;
}).join('');
},

renderBibleVerseText: function(htmlContent, dateStr) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const blocks = [];
    let currentVerse = null;

    const pushCurrentVerse = () => {
        if (!currentVerse) return;

        const cleanNumber = this.normalizeBibleText(currentVerse.number);
        const cleanText = this.normalizeBibleText(currentVerse.text);

        if (cleanText) {
            blocks.push({
                type: 'verse',
                number: cleanNumber,
                text: cleanText
            });
        }

        currentVerse = null;
    };

    const addTextToCurrentVerse = (text) => {
    if (!currentVerse) return;
    const cleanText = this.normalizeBibleText(text);
    if (!cleanText) return;
    currentVerse.text += ` ${cleanText}`;
    };

    const processNode = (node) => {
        if (!node) return;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = this.normalizeBibleText(node.nodeValue);
            if (text) {
                addTextToCurrentVerse(text);
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        // Si es título, lo cerramos como bloque independiente
        if (this.isBibleTitleNode(node)) {
            pushCurrentVerse();

            const titleText = this.normalizeBibleText(node.textContent);
            if (titleText) {
                blocks.push({
                    type: 'title',
                    text: titleText
                });
            }
            return;
        }

        // Si es marcador de versículo
    const classList = Array.from(node.classList || []);
const isVerseMarker =
    classList.includes('v') ||
    node.hasAttribute('data-verse') ||
    /^v\d*$/i.test(node.className || '');

if (isVerseMarker) {
    
            pushCurrentVerse();

            currentVerse = {
                number: this.normalizeBibleText(node.textContent),
                text: ''
            };
            return;
        }

        // Recorrer hijos normalmente
        Array.from(node.childNodes).forEach(child => processNode(child));
    };

    Array.from(tempDiv.childNodes).forEach(node => processNode(node));
    pushCurrentVerse();

    if (!blocks.length) {
    const plainText = this.normalizeBibleText(tempDiv.textContent);
    return plainText ? `
        <div class="verse-item verse-selectable" data-verse-text="${this.escapeHtml(plainText)}">
            <span class="verse-text-content">${this.escapeHtml(plainText)}</span>
        </div>
    ` : `
        <p style="text-align: center; color: var(--text-muted);">No se pudo procesar el contenido.</p>
    `;
}

    const highlights = this.getHighlights(dateStr);
    const normalize = str => this.normalizeBibleText(str).toLowerCase();

    return blocks.map(block => {
        if (block.type === 'title') {
            return `
                <div class="bible-section-title" aria-label="Título de sección">
                    ${this.escapeHtml(block.text)}
                </div>
            `;
        }

        const verseFullText = `${block.number} ${block.text}`.trim();
        const existingNote = this.getSelectionNoteByText(dateStr, verseFullText);
        const hasNote = existingNote !== null;

        const verseHighlight = highlights.find(h => {
    const highlightText = normalize(h.text);
    const currentVerseText = normalize(verseFullText);
    return highlightText === currentVerseText;
});

        const highlightClass = verseHighlight ? `highlight-${verseHighlight.color}` : '';

        return `
            <div class="verse-item verse-selectable ${highlightClass}"
                 data-verse-number="${this.escapeHtml(block.number)}"
                 data-verse-text="${this.escapeHtml(block.text)}"
                 data-verse-full="${this.escapeHtml(verseFullText)}"
                 data-has-note="${hasNote}">
                <span class="verse-number">${this.escapeHtml(block.number)}</span>
                <span class="verse-text-content">${this.escapeHtml(block.text)}</span>
                ${hasNote ? '<span class="verse-note-icon" title="Este versículo tiene una nota guardada">📝</span>' : ''}
            </div>
        `;
    }).join('');
},

isBibleTitleNode: function(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

    const classList = Array.from(node.classList || []);

    // API.Bible suele usar clases de títulos/subtítulos tipo s, s1, s2, ms, ms1, etc.
    // También contemplamos headings HTML por seguridad.
    if (classList.some(cls => /^(s|s1|s2|s3|s4|ms|ms1|ms2|d|sp|sr)$/i.test(cls))) {
        return true;
    }

    const tag = node.tagName?.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        return true;
    }

    // Si trae atributo de estilo semántico, también lo tomamos como título
    const dataType = (node.getAttribute('data-type') || '').toLowerCase();
    if (dataType.includes('title') || dataType.includes('heading')) {
        return true;
    }

    return false;
},

normalizeBibleText: function(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
},

handleVerseClick: function(e) {
    const verseItem = e.target.closest('.verse-selectable');
    if (!verseItem) return;
    
    const surface = verseItem.closest('.selection-surface');
    if (!surface) return;
    
    const shell = surface.closest('.reading-text-shell');
    const dateStr = shell?.getAttribute('data-reading-date');
    if (!dateStr) return;
    
    const verseText = verseItem.getAttribute('data-verse-full') || 
                      verseItem.getAttribute('data-verse-text') || 
                      verseItem.textContent.trim();
    
    // Limpiar selección anterior
    this.clearVerseSelection();
    
    // Marcar como seleccionado
    verseItem.classList.add('verse-selected');
    
    // Guardar estado
    this.currentSelectedVerse = verseItem;
    this.currentSelectedText = verseText;
    this.currentSelectionDate = dateStr;
    this.activeSelectionSurface = surface;
    
    // Mostrar panel
    this.showSelectionPanelForVerse();
    
    // Vibración sutil en móviles
    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }
},

clearVerseSelection: function() {
    document.querySelectorAll('.verse-selected').forEach(el => {
        el.classList.remove('verse-selected');
    });
    this.currentSelectedVerse = null;
},

showSelectionPanelForVerse: function() {
    const panel = this.$selectionPanel;
    if (!panel) return;
    
    // ✅ GUARDAR la posición actual del scroll
    this._savedScrollY = window.scrollY;
    
    const highlightState = this.getSelectionHighlightState(
        this.currentSelectedText, 
        this.currentSelectionDate
    );
    
    const existingSelectionNote = this.getSelectionNoteByText(
        this.currentSelectionDate, 
        this.currentSelectedText
    );
    
    if (this.$selectionNote) {
        this.$selectionNote.value = existingSelectionNote?.note || '';
    }
    
    this.currentSelectionColorDraft = highlightState.colors[0] || null;
    
    if (this.$selectionColorButtons.length) {
        this.$selectionColorButtons.forEach(btn => {
            const color = btn.getAttribute('data-color');
            btn.classList.toggle('is-active', highlightState.colors.includes(color));
        });
    }
    
    // Mostrar panel
    panel.classList.add('visible');
    document.body.classList.add('selection-panel-open');
    
    this.positionSelectionSheet();
},

positionSelectionSheet: function() {
    if (!this.$selectionSheet || !this.currentSelectedVerse) return;
    
    const verseRect = this.currentSelectedVerse.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const sheetHeight = this.$selectionSheet.offsetHeight || 220;
    
    // Calcular si el versículo está demasiado cerca del borde inferior
    const verseBottom = verseRect.bottom;
    const spaceBelow = viewportHeight - verseBottom;
    
    if (spaceBelow < sheetHeight + 20) {
        // Si no hay espacio suficiente abajo, hacer scroll para mostrar el versículo
        const scrollNeeded = verseRect.top - (viewportHeight - sheetHeight - 60);
        if (scrollNeeded > 0) {
            window.scrollBy({
                top: scrollNeeded,
                behavior: 'smooth'
            });
        }
    }
    
    // El sheet se queda en la posición fija (bottom: 0)
    this.$selectionSheet.style.bottom = '0px';
},

saveSelectedHighlight: function(selectedText, color, dateStr) {
    const cleanText = (selectedText || '').replace(/\s+/g, ' ').trim();
    
    if (!cleanText || cleanText.length < 3) {
        this.showToast('Selecciona un texto válido');
        return;
    }
    
    const highlights = this.getHighlights(dateStr);
    const normalize = str => (str || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cleanLower = normalize(cleanText);
    
    // Verificar si ya existe este resaltado con el mismo color
    const existingIndex = highlights.findIndex(item => 
        normalize(item.text) === cleanLower && item.color === color
    );
    
    if (existingIndex >= 0) {
        this.showToast(`Este texto ya está resaltado en ${color === 'yellow' ? 'amarillo' : 'azul'}`);
        return;
    }
    
    // Eliminar resaltados previos de otros colores para el mismo texto
    const filteredHighlights = highlights.filter(item => 
        normalize(item.text) !== cleanLower
    );
    
    // Agregar el nuevo resaltado
    filteredHighlights.push({ text: cleanText, color });
    
    // Guardar en localStorage
    this.saveHighlights(dateStr, filteredHighlights);
    
    this.currentSelectionColorDraft = color;
    
    // Actualizar botones de color en el panel
    if (this.$selectionColorButtons.length) {
        this.$selectionColorButtons.forEach(btn => {
            const btnColor = btn.getAttribute('data-color');
            btn.classList.toggle('is-active', btnColor === color);
        });
    }
    
    this.showToast(`Texto resaltado en ${color === 'yellow' ? 'amarillo' : 'azul'}`);
    
    // ✅ CORREGIDO: Aplicar clase CSS inmediatamente al versículo seleccionado
    if (this.currentSelectedVerse) {
        // Remover clases de resaltado anteriores
        this.currentSelectedVerse.classList.remove('highlight-yellow', 'highlight-blue');
        // Agregar la nueva clase
        this.currentSelectedVerse.classList.add(`highlight-${color}`);
    }
    
    // Cerrar el panel
    this.hideSelectionPanel();
    
    // No es necesario re-renderizar todo, solo guardamos el estado
    // this.rerenderCurrentReadingView(dateStr, true);
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

rerenderCurrentReadingView: async function(dateStr = null, force = false) {
    const panelOpen = this.$selectionPanel?.classList.contains('visible');

    if (!force && panelOpen) return;

    if (this.currentView === 'home') {
        this.renderHome();
        return;
    }

    if (this.currentView === 'bible-reading') {
        await this.renderBibleReading();
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
    <div class="reading-text selection-surface verse-container" data-selection-surface="true">
        ${this.renderVerseText(readingText, reading.date)}
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
</div>
            
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
            this.restoreHighlightsInDOMForVerses(reading.date);
            this.restoreSelectionNotesInDOM(reading.date);
    },
    
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

// ========================================
// FUNCIONES DE BÚSQUEDA EN LA BIBLIA
// ========================================

// ========================================
// FUNCIÓN PARA FILTRAR POR TESTAMENTO
// ========================================
filterResultsByTestament: function(results, filter) {
    if (filter === 'all') return results;
    
    // Libros del Antiguo Testamento (Génesis a Malaquías)
    const oldTestamentBooks = ['gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', 
        '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 
        'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 
        'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal'];
    
    // Libros del Nuevo Testamento (Mateo a Apocalipsis)
    const newTestamentBooks = ['mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 
        'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 
        'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev'];
    
    const targetBooks = filter === 'old' ? oldTestamentBooks : newTestamentBooks;
    
    return results.filter(result => {
        const ourBookId = this.bibleApiIdMap[result.bookId.toUpperCase()] || result.bookId.toLowerCase();
        return targetBooks.includes(ourBookId);
    });
},

// ========================================
// FUNCIÓN PARA EXTRAER CAPÍTULO Y VERSÍCULO
// ========================================
extractChapterVerse: function(result) {
    // Si ya tiene chapter y verse definidos, usarlos
    if (result.chapter && result.verse) {
        return {
            chapter: result.chapter,
            verse: result.verse
        };
    }
    
    // Si tiene reference, extraer de ahí (ej: "Juan 3:16")
    if (result.reference) {
        const match = result.reference.match(/(\d+):(\d+)/);
        if (match) {
            return {
                chapter: match[1],
                verse: match[2]
            };
        }
    }
    
    // Si tiene id en formato "JHN.3.16"
    if (result.id) {
        const parts = result.id.split('.');
        if (parts.length >= 3) {
            return {
                chapter: parts[1],
                verse: parts[2]
            };
        }
    }
    
    // Si no se pudo extraer, devolver valores por defecto
    return {
        chapter: '1',
        verse: '1'
    };
},

renderBibleSearch: function() {
    const hasResults = this.bibleSearchResults.length > 0;
    const isLoading = this.bibleSearchLoading;

    let resultsHtml = '';

    if (isLoading) {
        resultsHtml = `
            <div class="loading" style="padding: 40px 20px;">
                <div class="spinner"></div>
                Buscando en la Biblia...
            </div>
        `;
    } else if (hasResults) {
        resultsHtml = `
            ${this.bibleSearchResults.map(result => {
                const book = this.getBibleBookById(result.bookId);
                const bookName = book ? book.name : (result.bookName || result.bookId);
                const chapter = Number(result.chapter || 0);
                const verse = Number(result.verse || 0);

                return `
                    <div class="bible-search-result-item" 
                         data-action="navigate-to-verse"
                         data-book-id="${result.bookId}"
                         data-chapter="${chapter}"
                         data-verse="${verse}">
                        <div class="bible-search-result-reference">
                            ${bookName} ${chapter}:${verse}
                        </div>
                        <div class="bible-search-result-text">
                            ${this.highlightSearchTerm(result.text, this.bibleSearchQuery)}
                        </div>
                    </div>
                `;
            }).join('')}
            ${this.renderBiblePagination()}
        `;
    } else {
        resultsHtml = `
            <div class="bible-search-placeholder">
                <div class="bible-search-icon">🔍</div>
                <h3>Busca en la Biblia</h3>
                <p>Escribe al menos 2 letras para comenzar la búsqueda</p>
                <div class="bible-search-suggestions">
                    <span class="suggestion-tag" data-action="search-suggestion">Jesús</span>
                    <span class="suggestion-tag" data-action="search-suggestion">amor</span>
                    <span class="suggestion-tag" data-action="search-suggestion">fe</span>
                    <span class="suggestion-tag" data-action="search-suggestion">gracia</span>
                </div>
            </div>
        `;
    }

    return `
        <div class="bible-search-view">
            <div class="bible-search-header">
                <button class="back-btn" data-action="back-to-bible-books">← Volver</button>
                <h2>Buscar en la Biblia</h2>
            </div>

            <div class="bible-search-filters">
                <button class="bible-filter-btn ${this.bibleSearchFilter === 'all' ? 'active' : ''}" data-action="set-bible-filter" data-filter="all">
                    📖 Todos
                </button>
                <button class="bible-filter-btn ${this.bibleSearchFilter === 'old' ? 'active' : ''}" data-action="set-bible-filter" data-filter="old">
                    📜 Antiguo Testamento
                </button>
                <button class="bible-filter-btn ${this.bibleSearchFilter === 'new' ? 'active' : ''}" data-action="set-bible-filter" data-filter="new">
                    ✝️ Nuevo Testamento
                </button>
            </div>

            <div class="bible-search-container">
                <div class="bible-search-input-wrapper">
                    <input 
                        type="search" 
                        class="bible-search-input" 
                        id="bible-search-input"
                        placeholder="Ej: Jesús, amor, fe..."
                        value="${this.escapeHtml(this.bibleSearchQuery)}"
                        autocomplete="off"
                        spellcheck="false"
                        autocorrect="off"
                        autocapitalize="none"
                    >
                    <button class="bible-search-clear" data-action="clear-search" style="display: ${this.bibleSearchQuery ? 'flex' : 'none'};">✕</button>
                </div>
            </div>

            <div id="bible-search-stats" class="bible-search-stats" style="display:none;"></div>

            <div id="bible-search-results-container" class="bible-search-results">
                ${resultsHtml}
            </div>
        </div>
    `;
},

highlightSearchTerm: function(text, query) {
    if (!query || !text) return this.escapeHtml(text);

    const original = String(text);
    const tokens = this.tokenizeBibleText(query);

    if (!tokens.length) {
        return this.escapeHtml(original);
    }

    const escapedText = this.escapeHtml(original);
    const normalizedOriginal = this.normalizeBibleWord(original);

    if (!normalizedOriginal) {
        return escapedText;
    }

    let output = escapedText;

    for (const token of tokens) {
        const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapedToken})(?=[^\\p{L}\\p{N}]|$)`, 'giu');

        output = output.replace(regex, (match, prefix, word) => {
            return `${prefix}<mark class="search-highlight">${word}</mark>`;
        });
    }

    return output;
},

normalizeBibleWord: function(text) {
    return (text || '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
},

tokenizeBibleText: function(text) {
    const normalized = this.normalizeBibleWord(text);
    if (!normalized) return [];
    return normalized.split(' ').filter(Boolean);
},

loadLocalBibleSearchData: async function() {
    await this.buildSearchIndexFromAPI();
},
    
buildSearchIndexFromAPI: async function() {
    if (this.bibleSearchIndexReady) return;

    this.bibleSearchIndex = new Map();
    this.bibleSearchVerseMap = new Map();

    const books = this.bibleBooks.map((book, index) => ({
        ...book,
        bookOrder: index + 1
    }));

    for (const book of books) {
        for (let chapter = 1; chapter <= book.chapters; chapter++) {
            try {
                const chapterData = await getBibleChapter(book.id, chapter);
                const verses = this.extractVersesFromBibleHtml(chapterData?.content || '');

                for (const verse of verses) {
                    const verseNumber = Number(verse.number);

                    if (!verse.text || !verseNumber) continue;

                    const verseObj = {
                        id: `${book.id}.${chapter}.${verseNumber}`,
                        bookId: book.id,
                        bookName: book.name,
                        testament: this.getTestamentFromBookId(book.id),
                        bookOrder: book.bookOrder,
                        chapter,
                        verse: verseNumber,
                        text: verse.text
                    };

                    this.bibleSearchVerseMap.set(verseObj.id, verseObj);

                    const words = new Set(this.tokenizeBibleText(verse.text));

                    for (const word of words) {
                        if (!this.bibleSearchIndex.has(word)) {
                            this.bibleSearchIndex.set(word, []);
                        }
                        this.bibleSearchIndex.get(word).push(verseObj.id);
                    }
                }
            } catch (error) {
                console.warn('Error cargando índice bíblico:', book.id, chapter, error);
            }
        }
    }

    this.bibleSearchIndexReady = true;
},

extractVersesFromBibleHtml: function(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent || '';

    const verses = [];
    let currentVerse = null;

    const pushCurrentVerse = () => {
        if (!currentVerse) return;

        const cleanNumber = this.normalizeBibleText(currentVerse.number);
        const cleanText = this.normalizeBibleText(currentVerse.text);

        if (cleanNumber && cleanText) {
            verses.push({
                number: cleanNumber,
                text: cleanText
            });
        }

        currentVerse = null;
    };

    const processNode = (node) => {
        if (!node) return;

        if (node.nodeType === Node.TEXT_NODE) {
            if (currentVerse) {
                currentVerse.text += node.textContent || '';
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        if (this.isBibleTitleNode(node)) {
            pushCurrentVerse();
            return;
        }

        const classList = Array.from(node.classList || []);
        const isVerseMarker =
            classList.includes('v') ||
            node.hasAttribute('data-verse') ||
            /^v\d*$/i.test(node.className || '');

        if (isVerseMarker) {
            pushCurrentVerse();
            currentVerse = {
                number: node.textContent || '',
                text: ''
            };
            return;
        }

        Array.from(node.childNodes).forEach(child => processNode(child));
    };

    Array.from(tempDiv.childNodes).forEach(node => processNode(node));
    pushCurrentVerse();

    return verses;
},

buildLocalBibleSearchIndex: function() {
    this.bibleSearchIndex = new Map();
    this.bibleSearchVerseMap = new Map();

    for (const verse of this.bibleSearchData) {
        if (!verse || !verse.id || !verse.text) continue;

        this.bibleSearchVerseMap.set(verse.id, verse);

        const uniqueWords = new Set(this.tokenizeBibleText(verse.text));

        for (const word of uniqueWords) {
            if (!this.bibleSearchIndex.has(word)) {
                this.bibleSearchIndex.set(word, []);
            }

            this.bibleSearchIndex.get(word).push(verse.id);
        }
    }
},

matchesBibleFilter: function(verse, filter = this.bibleSearchFilter) {
    if (filter === 'all') return true;
    return verse.testament === filter;
},

searchLocalBible: function(query, filter = this.bibleSearchFilter) {
    const normalizedQuery = this.normalizeBibleWord(query);

    if (!normalizedQuery || normalizedQuery.length < 2) {
        return [];
    }

    const tokens = normalizedQuery.split(' ').filter(Boolean);

    if (!tokens.length) {
        return [];
    }

    const tokenMatches = tokens.map(token => this.bibleSearchIndex.get(token) || []);

    if (tokenMatches.some(list => list.length === 0)) {
        return [];
    }

    let intersection = [...tokenMatches[0]];

    for (let i = 1; i < tokenMatches.length; i++) {
        const currentSet = new Set(tokenMatches[i]);
        intersection = intersection.filter(id => currentSet.has(id));
    }

    return intersection
        .map(id => this.bibleSearchVerseMap.get(id))
        .filter(Boolean)
        .filter(verse => this.matchesBibleFilter(verse, filter))
        .sort((a, b) => {
            const orderA = Number(a.bookOrder || 999);
            const orderB = Number(b.bookOrder || 999);

            if (orderA !== orderB) return orderA - orderB;
            if (Number(a.chapter) !== Number(b.chapter)) return Number(a.chapter) - Number(b.chapter);
            return Number(a.verse) - Number(b.verse);
        });
},

applyBibleSearchPagination: function(allResults) {
    this.bibleSearchTotal = allResults.length;
    this.bibleSearchTotalPages = Math.max(1, Math.ceil(allResults.length / this.bibleSearchPageSize));

    if (this.bibleSearchPage > this.bibleSearchTotalPages) {
        this.bibleSearchPage = this.bibleSearchTotalPages;
    }

    const start = (this.bibleSearchPage - 1) * this.bibleSearchPageSize;
    const end = start + this.bibleSearchPageSize;

    this.bibleSearchResults = allResults.slice(start, end);
},

resetBibleSearchState: function() {
    this.bibleSearchQuery = '';
    this.bibleSearchResults = [];
    this.bibleSearchLoading = false;
    this.bibleSearchTotal = 0;
    this.bibleSearchTotalPages = 0;
    this.bibleSearchPage = 1;
},

renderBiblePagination: function() {
    if (this.bibleSearchTotalPages <= 1) return '';

    const current = this.bibleSearchPage;
    const total = this.bibleSearchTotalPages;

    let buttons = `
        <button
            class="btn-secondary bible-page-btn"
            type="button"
            data-action="go-bible-search-page"
            data-page="${current - 1}"
            ${current === 1 ? 'disabled' : ''}
        >
            ← Anterior
        </button>
    `;

    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);

    for (let page = start; page <= end; page++) {
        buttons += `
            <button
                class="bible-page-btn ${page === current ? 'active' : ''}"
                type="button"
                data-action="go-bible-search-page"
                data-page="${page}"
            >
                ${page}
            </button>
        `;
    }

    buttons += `
        <button
            class="btn-secondary bible-page-btn"
            type="button"
            data-action="go-bible-search-page"
            data-page="${current + 1}"
            ${current === total ? 'disabled' : ''}
        >
            Siguiente →
        </button>
    `;

    return `
        <div class="bible-pagination">
            ${buttons}
        </div>
    `;
},

performBibleSearch: async function(query, resetPage = true) {
    const normalizedQuery = (query || '').trim();
    this.bibleSearchQuery = normalizedQuery;

    if (resetPage) {
        this.bibleSearchPage = 1;
    }

    if (!normalizedQuery || normalizedQuery.length < 2) {
        this.resetBibleSearchState();
        this.bibleSearchFilter = 'all';
        this.updateFilterButtonsUI();
        this.updateBibleSearchResults();
        return;
    }

    this.bibleSearchLoading = true;
    this.updateBibleSearchResults();

    try {
        await this.loadLocalBibleSearchData();

        const allMatches = this.searchLocalBible(normalizedQuery, this.bibleSearchFilter);
        this.applyBibleSearchPagination(allMatches);
    } catch (error) {
        console.error('Error en búsqueda bíblica local:', error);
        this.bibleSearchResults = [];
        this.bibleSearchTotal = 0;
        this.bibleSearchTotalPages = 0;
        this.showToast('Error al buscar localmente en la Biblia');
    } finally {
        this.bibleSearchLoading = false;
        this.updateBibleSearchResults();
    }
},

goToBibleSearchPage: function(page) {
    const targetPage = Number(page);

    if (!Number.isInteger(targetPage)) return;
    if (targetPage < 1 || targetPage > this.bibleSearchTotalPages) return;

    this.bibleSearchPage = targetPage;
    this.performBibleSearch(this.bibleSearchQuery, false);

    requestAnimationFrame(() => {
        const container = document.getElementById('bible-search-results-container');
        if (container) {
            container.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
},

setBibleSearchFilter: function(filter) {
    if (!['all', 'old', 'new'].includes(filter)) return;
    if (this.bibleSearchFilter === filter) return;

    this.bibleSearchFilter = filter;
    this.bibleSearchPage = 1;
    this.updateFilterButtonsUI();

    if (this.bibleSearchQuery.trim().length < 2) {
        this.updateBibleSearchResults();
        return;
    }

    this.performBibleSearch(this.bibleSearchQuery, true);
},

clearBibleSearch: function() {
    this.bibleSearchFilter = 'all';
    this.resetBibleSearchState();
    this.updateFilterButtonsUI();
    this.updateBibleSearchResults();
},

updateFilterButtonsUI: function() {
    const filterButtons = document.querySelectorAll('.bible-filter-btn');

    filterButtons.forEach(btn => {
        const filter = btn.getAttribute('data-filter');
        btn.classList.toggle('active', filter === this.bibleSearchFilter);
    });
},

updateBibleSearchResults: function() {
    const activeElement = document.activeElement;
    const isSearchInput = activeElement && activeElement.id === 'bible-search-input';
    const cursorPosition = isSearchInput ? activeElement.selectionStart : 0;

    const hasResults = this.bibleSearchResults.length > 0;
    const isLoading = this.bibleSearchLoading;

    const resultsContainer = document.getElementById('bible-search-results-container');
    const statsContainer = document.getElementById('bible-search-stats');
    const clearButton = document.querySelector('.bible-search-clear');
    const searchInput = document.getElementById('bible-search-input');

    if (searchInput && searchInput.value !== this.bibleSearchQuery) {
        searchInput.value = this.bibleSearchQuery;
    }

    if (clearButton) {
        clearButton.style.display = this.bibleSearchQuery ? 'flex' : 'none';
    }

    if (statsContainer) {
        if (!isLoading && hasResults) {
            const start = ((this.bibleSearchPage - 1) * this.bibleSearchPageSize) + 1;
            const end = Math.min(this.bibleSearchPage * this.bibleSearchPageSize, this.bibleSearchTotal);

            statsContainer.innerHTML = `
                Mostrando ${start}-${end} de ${this.bibleSearchTotal} resultado${this.bibleSearchTotal !== 1 ? 's' : ''}
            `;
            statsContainer.style.display = 'block';
        } else {
            statsContainer.style.display = 'none';
        }
    }

    if (resultsContainer) {
        if (isLoading && !hasResults) {
            resultsContainer.innerHTML = `
                <div class="loading" style="padding: 40px 20px;">
                    <div class="spinner"></div>
                    Buscando en la Biblia...
                </div>
            `;
        } else if (hasResults) {
            const resultsHtml = this.bibleSearchResults.map(result => {
                const book = this.getBibleBookById(result.bookId);
                const bookName = book ? book.name : result.bookName || result.bookId;
                const chapter = Number(result.chapter || 0);
                const verse = Number(result.verse || 0);

                return `
                    <div class="bible-search-result-item"
                         data-action="navigate-to-verse"
                         data-book-id="${result.bookId}"
                         data-chapter="${chapter}"
                         data-verse="${verse}">
                        <div class="bible-search-result-reference">
                            ${bookName} ${chapter}:${verse}
                        </div>
                        <div class="bible-search-result-text">
                            ${this.highlightSearchTerm(result.text, this.bibleSearchQuery)}
                        </div>
                    </div>
                `;
            }).join('');

            resultsContainer.innerHTML = `
                ${resultsHtml}
                ${this.renderBiblePagination()}
            `;
        } else if (this.bibleSearchQuery.trim().length >= 2) {
            resultsContainer.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px; text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 12px;">🔎</div>
                    <div style="font-weight: 600; margin-bottom: 8px;">No se encontraron resultados</div>
                    <div style="color: var(--text-muted);">
                        Intenta con otra palabra exacta o cambia el filtro de testamento.
                    </div>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px; text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 12px;">📖</div>
                    <div style="font-weight: 600; margin-bottom: 8px;">Busca una palabra en la Biblia</div>
                    <div style="color: var(--text-muted);">
                        Ejemplos: Dios, amor, fe, gracia.
                    </div>
                </div>
            `;
        }
    }

    if (isSearchInput) {
        requestAnimationFrame(() => {
            const input = document.getElementById('bible-search-input');
            if (input) {
                input.focus();
                input.setSelectionRange(cursorPosition, cursorPosition);
            }
        });
    }
},

navigateToVerse: function(apiBookId, chapter, verse) {
    // Convertir ID de API a nuestro ID
    const ourBookId = this.bibleApiIdMap[apiBookId.toUpperCase()] || apiBookId.toLowerCase();
    
    // Verificar que el libro existe
    const book = this.bibleBooks.find(b => b.id === ourBookId);
    if (!book) {
        console.error('Libro no encontrado:', apiBookId);
        this.showToast('No se pudo encontrar el libro');
        return;
    }
    
    this.selectedBibleBook = ourBookId;
    this.selectedBibleChapter = parseInt(chapter);
    this.targetVerse = parseInt(verse);
    
    // Navegar directamente a bible-reading
    this.navigate('bible-reading');
},

scrollToTargetVerse: function() {
    if (!this.targetVerse) return;
    
    setTimeout(() => {
        const verseElement = document.querySelector(`.verse-item[data-verse-number="${this.targetVerse}"]`);
        if (verseElement) {
            verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            verseElement.classList.add('verse-searched');
            setTimeout(() => {
                verseElement.classList.remove('verse-searched');
            }, 2000);
        }
        this.targetVerse = null;
    }, 300);
},

renderBible: function() {
    if (!this.selectedBibleBook) {
        this.$content.innerHTML = `
            <div class="bible-view">
                <!-- Header principal SIN botón volver -->
                <div class="bible-header-card">
    <div class="bible-title">📖 Biblia</div>
    <div class="bible-subtitle">Versión Biblia Libre (VBL)</div>
</div>

<!-- Botón de búsqueda -->
<div style="margin-bottom: 16px;">
    <button class="btn-secondary" data-action="open-bible-search" style="justify-content: center;">
        🔍 Buscar en la Biblia
    </button>
</div>

<!-- Grid de libros -->
                <div class="bible-books-grid">
                    ${this.bibleBooks.map(book => `
                        <button
                            class="bible-book-card"
                            type="button"
                            data-action="open-bible-book"
                            data-book-id="${book.id}"
                        >
                            <span class="bible-book-name">${this.escapeHtml(book.name)}</span>
                            <span class="bible-book-meta">${book.chapters} cap.</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        return;
    }

    const book = this.bibleBooks.find(item => item.id === this.selectedBibleBook);

    if (!book) {
        this.selectedBibleBook = null;
        this.selectedBibleChapter = null;
        this.renderBible();
        return;
    }

    const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1);

    this.$content.innerHTML = `
        <div class="bible-view">
            <!-- ⭐⭐ BARRA DE NAVEGACIÓN SUPERIOR CON BOTÓN VOLVER ⭐⭐ -->
            <div class="bible-nav-top">
                <button
                    class="bible-back-btn"
                    type="button"
                    data-action="back-to-bible-books"
                >
                    ← Volver a libros
                </button>
            </div>

            <!-- Header con el nombre del libro -->
            <div class="bible-header-card">
                <div class="bible-title">${this.escapeHtml(book.name)}</div>
                <div class="bible-subtitle">Selecciona un capítulo</div>
            </div>

            <!-- Grid de capítulos -->
            <div class="bible-chapters-grid">
                ${chapters.map(chapter => `
                    <button
                        class="bible-chapter-btn"
                        type="button"
                        data-action="open-bible-chapter"
                        data-book-id="${book.id}"
                        data-chapter="${chapter}"
                    >
                        ${chapter}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
},

renderBibleReading: async function() {
    const requestedBookId = this.selectedBibleBook;
    const requestedChapter = this.selectedBibleChapter;
    const requestedBook = this.bibleBooks.find(b => b.id === requestedBookId);

    if (!requestedBook || !requestedChapter) {
        this.navigate('bible');
        return;
    }

    // ✅ CORREGIDO: Mostrar loading sin usar chapterData
    this.$content.innerHTML = `
        <div class="bible-reading-view">
            <div class="bible-nav-top">
                <button class="bible-back-btn" data-action="back-to-bible-books">
                    ← Volver a libros
                </button>
            </div>

            <h2 style="text-align: center; margin: 1rem 0 0.25rem 0; color: var(--text-primary);">
                ${this.escapeHtml(requestedBook.name)} ${requestedChapter}
            </h2>
            
            <div class="bible-reading-version">Versión Biblia Libre (VBL)</div>

            <div class="loading">
                <div class="spinner"></div>
                Cargando capítulo...
            </div>
        </div>
    `;

    try {
        // Obtener datos de la API
        const chapterData = await getBibleChapter(requestedBookId, requestedChapter);

        // Verificar que seguimos en la misma vista
        if (
            this.currentView !== 'bible-reading' ||
            this.selectedBibleBook !== requestedBookId ||
            this.selectedBibleChapter !== requestedChapter
        ) {
            return;
        }

        this.currentBibleChapterData = chapterData;

        // ✅ CORREGIDO: UN SOLO RENDERIZADO con la estructura correcta
        this.$content.innerHTML = `
            <div class="bible-reading-view">
                <div class="bible-nav-top">
                    <button class="bible-back-btn" data-action="back-to-bible-books">
                        ← Volver a libros
                    </button>
                </div>

                <h2 style="text-align: center; margin: 1rem 0 0.25rem 0; color: var(--text-primary);">
    ${this.escapeHtml(requestedBook.name)} ${requestedChapter}
</h2>
                
                <div class="bible-reading-version">Versión Biblia Libre (VBL)</div>

                <div style="display: flex; gap: 12px; justify-content: center; margin: 16px 0;">
                    <button
                        class="btn-secondary"
                        data-action="bible-prev-chapter"
                        ${requestedChapter > 1 ? '' : 'disabled'}
                        style="flex: 0 1 auto; min-width: 120px;"
                    >
                        ← Anterior
                    </button>

                    <button
                        class="btn-secondary"
                        data-action="bible-next-chapter"
                        ${requestedChapter < requestedBook.chapters ? '' : 'disabled'}
                        style="flex: 0 1 auto; min-width: 120px;"
                    >
                        Siguiente →
                    </button>
                </div>

                <div class="reading-text-shell" data-reading-date="bible-${requestedBookId}-${requestedChapter}">
    <div class="reading-text bible-api-content">
        ${chapterData.content || '<p style="text-align: center; color: var(--text-muted);">No se pudo cargar el contenido.</p>'}
    </div>
</div>
            </div>
        `;

        // Restaurar resaltados y notas
        this.restoreHighlightsInDOMForVerses(`bible-${requestedBookId}-${requestedChapter}`);
        this.restoreSelectionNotesInDOM(`bible-${requestedBookId}-${requestedChapter}`);
        
        // ✅ NUEVO: Hacer scroll al versículo objetivo si existe
if (this.targetVerse) {
    this.scrollToTargetVerse();
}
        
    } catch (error) {
        console.error('Error cargando capítulo bíblico:', error);

        if (
            this.currentView !== 'bible-reading' ||
            this.selectedBibleBook !== requestedBookId ||
            this.selectedBibleChapter !== requestedChapter
        ) {
            return;
        }

        this.$content.innerHTML = `
            <div class="bible-reading-view">
                <div class="bible-nav-top">
                    <button class="bible-back-btn" data-action="back-to-bible-books">
                        ← Volver a libros
                    </button>
                </div>

                <h2 style="text-align: center; margin: 1rem 0;">
                    ${this.escapeHtml(requestedBook.name)} ${requestedChapter}
                </h2>

                <div class="empty-state">
                    <h3>⚠️ No se pudo cargar el capítulo</h3>
                    <p>${this.escapeHtml(error?.message || 'Intenta nuevamente más tarde.')}</p>
                    <button class="btn-primary" data-action="back-to-bible-books" style="margin-top: 20px;">
                        Volver a libros
                    </button>
                </div>
            </div>
        `;
    }
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
        <button class="community-delete-main" data-action="delete-community-post" data-id="${post.id}">
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
                            <button id="test-notification" class="btn-secondary">Probar push remoto</button>
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
    testNotification.addEventListener('click', () => {
        this.showToast('La prueba manual ahora se hace desde Firebase con push remoto.');
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
    highlights: {},
    selectionNotes: {}
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

    if (key && key.startsWith('su-voz-selection-notes-')) {
        const date = key.replace('su-voz-selection-notes-', '');
        allData.selectionNotes[date] = this.getSelectionNotes(date);
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

                if (data.selectionNotes) {
    Object.entries(data.selectionNotes).forEach(([date, selectionNotes]) => {
        const normalized = Array.isArray(selectionNotes)
            ? selectionNotes
                .map(item => ({
                    text: (item?.text || '').replace(/\s+/g, ' ').trim(),
                    note: (item?.note || '').trim()
                }))
                .filter(item => item.text.length >= 3 && item.note.length > 0)
            : [];

        if (normalized.length > 0) {
            this.storage.set(this.getSelectionNotesKey(date), normalized);
        } else {
            this.storage.remove(this.getSelectionNotesKey(date));
        }
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
            vapidKey: 'BMU6FRL_k8YmCub9rDQhDZosJTYzwIB-6J-yXSXlGluWGgzNH0DxT-Zbgph9ofFJR2ge9lE7pNlywLFmjF_zjmA',
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

if (this.$navBible) {
    this.$navBible.addEventListener('click', () => {
        this.selectedBibleBook = null;
        this.selectedBibleChapter = null;
        this.navigate('bible');
    });
}

if (this.$navCalendar) {
    this.$navCalendar.addEventListener('click', () => this.navigate('calendar'));
}

if (this.$navStats) {
    this.$navStats.addEventListener('click', () => this.navigate('stats'));
}

if (this.$navCommunity) {
    this.$navCommunity.addEventListener('click', () => this.navigate('community'));
}

if (this.$headerSettingsBtn) {
    this.$headerSettingsBtn.addEventListener('click', () => {

        if (this.currentView === 'settings') {
            const fallback = this.previousView || 'home';
            this.navigate(fallback);
            return;
        }

        this.previousView = this.currentView;
        this.navigate('settings');
    });
}
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
    const verseItem = e.target.closest('.verse-selectable');
    if (verseItem) {
        e.stopPropagation();
        this.handleVerseClick(e);
        return;
    }

    const noteIcon = e.target.closest('.verse-note-icon');
    if (noteIcon) {
        e.stopPropagation();
        const verseItem = noteIcon.closest('.verse-selectable');
        if (verseItem) {
            // Simular clic en el versículo
            this.handleVerseClick({ target: verseItem });
        }
        return;
    }

const selectionNoteAnchor = e.target.closest('.selection-note-anchor');
if (selectionNoteAnchor) {
    const noteText = selectionNoteAnchor.getAttribute('title') || 'Este texto tiene una nota guardada';
    this.showToast(noteText, 4000);
    return;
}
           
  const openBibleBookBtn = e.target.closest('[data-action="open-bible-book"]');
if (openBibleBookBtn) {
    const bookId = openBibleBookBtn.getAttribute('data-book-id');
    this.selectedBibleBook = bookId;
    this.renderBible();
    return;
}

// Abrir búsqueda
const openSearchBtn = e.target.closest('[data-action="open-bible-search"]');
if (openSearchBtn) {
    this.bibleSearchFilter = 'all';
    this.bibleSearchQuery = '';
    this.bibleSearchResults = [];
    this.bibleSearchLoading = false;
    this.bibleSearchTotal = 0;
    this.bibleSearchTotalPages = 0;
    this.bibleSearchPage = 1;
    this.navigate('bible-search');
    return;
}

// Sugerencia de búsqueda
const suggestionTag = e.target.closest('[data-action="search-suggestion"]');
if (suggestionTag) {
    const query = suggestionTag.textContent.trim();
    this.performBibleSearch(query, true);
    return;
}

// Limpiar búsqueda
const clearSearchBtn = e.target.closest('[data-action="clear-search"]');
if (clearSearchBtn) {
    this.clearBibleSearch();
    return;
}

// Cambiar filtro de testamento
const filterBtn = e.target.closest('[data-action="set-bible-filter"]');
if (filterBtn) {
    const filter = filterBtn.getAttribute('data-filter');
    this.setBibleSearchFilter(filter);
    return;
}

// Ir a página del buscador
const paginationBtn = e.target.closest('[data-action="go-bible-search-page"]');
if (paginationBtn) {
    const page = Number(paginationBtn.getAttribute('data-page'));
    this.goToBibleSearchPage(page);
    return;
}

// Navegar a versículo desde búsqueda
const navigateToVerseBtn = e.target.closest('[data-action="navigate-to-verse"]');
if (navigateToVerseBtn) {
    const bookId = navigateToVerseBtn.getAttribute('data-book-id');
    const chapter = parseInt(navigateToVerseBtn.getAttribute('data-chapter'));
    const verse = parseInt(navigateToVerseBtn.getAttribute('data-verse'));
    this.navigateToVerse(bookId, chapter, verse);
    return;
}

const backToBibleBooksBtn = e.target.closest('[data-action="back-to-bible-books"]');
if (backToBibleBooksBtn) {
    if (this.selectedBibleChapter) {
        this.selectedBibleChapter = null;
        this.navigate('bible');
    } else {
        this.selectedBibleBook = null;
        this.selectedBibleChapter = null;
        this.navigate('bible');
    }
    return;
}
         
const openBibleChapterBtn = e.target.closest('[data-action="open-bible-chapter"]');
if (openBibleChapterBtn) {
    const bookId = openBibleChapterBtn.getAttribute('data-book-id');
    const chapter = Number(openBibleChapterBtn.getAttribute('data-chapter'));

    this.selectedBibleBook = bookId;
    this.selectedBibleChapter = chapter;

    this.navigate('bible-reading');
    return;
}

const prevChapterBtn = e.target.closest('[data-action="bible-prev-chapter"]');
if (prevChapterBtn) {
    if (this.selectedBibleChapter > 1) {
        this.selectedBibleChapter -= 1;
        this.navigate('bible-reading');
    }
    return;
}

const nextChapterBtn = e.target.closest('[data-action="bible-next-chapter"]');
if (nextChapterBtn) {
    const currentBook = this.bibleBooks.find(b => b.id === this.selectedBibleBook);

    if (currentBook && this.selectedBibleChapter < currentBook.chapters) {
        this.selectedBibleChapter += 1;
        this.navigate('bible-reading');
    }
    return;
}
           
           const noteSection = e.target.closest('.note-section');
    if (noteSection) {
        const textarea = noteSection.querySelector('.note-textarea');
        if (!textarea) return;

        this.activeNoteField = textarea.getAttribute('data-field') || null;

        this.$content.querySelectorAll('.note-section').forEach(section => {
            section.classList.remove('active');
        });

        this.$content.querySelectorAll('.note-textarea').forEach(item => {
            item.classList.remove('active');
        });

        noteSection.classList.add('active');
        textarea.classList.add('active');
        textarea.focus();

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

// ✅ NUEVO: Búsqueda en la Biblia
if (e.target.id === 'bible-search-input') {
    const query = e.target.value.trim();
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
        this.performBibleSearch(query);
    }, 300);
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

    this.activeNoteField = field;

    // Quitar active de todas las secciones y textareas
    this.$content.querySelectorAll('.note-section').forEach(section => {
        section.classList.remove('active');
    });

    this.$content.querySelectorAll('.note-textarea').forEach(item => {
        item.classList.remove('active');
    });

    // Activar solo la sección actual
    const currentSection = textarea.closest('.note-section');
    if (currentSection) {
        currentSection.classList.add('active');
    }

    textarea.classList.add('active');

    if ('vibrate' in navigator) {
        navigator.vibrate(20);
    }
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
