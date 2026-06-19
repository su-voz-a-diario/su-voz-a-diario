import {
    formatDateEs,
    formatDateForCompare,
    getDateStrInTimeZone,
    getTodayDateStr,
    getYesterdayDateStr
} from './utils/dates.js';

import {
    escapeBibleHtml
} from './utils/text.js';

import {
    escapeHtml
} from './utils/dom.js';

import {
    getHighlightColorLabel,
    getVerseImageFormat,
    getVerseImageTemplate,
    validateVerseImageState,
    renderIntroVideoHtml
} from './utils/formatters.js';

import {
    findReadingByDate,
    findBookById,
    findBookByReference,
    getChapterFromReading,
    calculateProgressForBookId,
    calculateReadingStats,
    calculateUpdatedStreak,
    isDateRead
} from './utils/progress.js';

import {
    isRunningAsInstalledPWA,
    isIOSDevice,
    isAndroidDevice,
    getPlatformLabel
} from './utils/platform.js';

import {
    shouldShowIntroVideo,
    getIntroVideoConfig
} from './core/constants.js';

import {
    DEFAULT_SETTINGS,
    DEFAULT_STREAK
} from './core/defaults.js';

import {
    get as storageGet,
    set as storageSet,
    remove as storageRemove
} from './services/storageService.js';

import {
    BibleRepository
} from './bible/BibleRepository.js';

import {
    LocalRv1909Provider,
    RV1909_VERSION_ID
} from './bible/LocalRv1909Provider.js';

import {
    REMOTE_BIBLE_VERSIONS,
    RemoteBibleProvider
} from './bible/RemoteBibleProvider.js';

import {
    FirebaseBibleApiClient
} from './bible/FirebaseBibleApiClient.js';

import {
    BIBLE_REMOTE_INTERNAL_TEST,
    createBibleReadingKey,
    getInternalBibleTestVersion,
    parseBibleReadingKey,
    resolveInternalBibleVersion,
    setBibleAdminState,
    canAccessRemoteBibleVersions
} from './bible/bibleInternalTest.js';

window.BIBLE_REMOTE_INTERNAL_TEST = BIBLE_REMOTE_INTERNAL_TEST;

function getFirebaseFunction(name) {
    const fn = window.firebaseFns?.[name];

    if (typeof fn !== 'function') {
        throw new Error(`Firebase no disponible: ${name}`);
    }

    return fn;
}

const collection = (dbArg, ...args) => getFirebaseFunction('collection')(dbArg || window.firebaseDb, ...args);
const addDoc = (...args) => getFirebaseFunction('addDoc')(...args);
const getDocs = (...args) => getFirebaseFunction('getDocs')(...args);
const query = (...args) => getFirebaseFunction('query')(...args);
const orderBy = (...args) => getFirebaseFunction('orderBy')(...args);
const where = (...args) => getFirebaseFunction('where')(...args);
const limit = (...args) => getFirebaseFunction('limit')(...args);
const startAfter = (...args) => getFirebaseFunction('startAfter')(...args);
const serverTimestamp = (...args) => getFirebaseFunction('serverTimestamp')(...args);
const deleteDoc = (...args) => getFirebaseFunction('deleteDoc')(...args);
const doc = (dbArg, ...args) => getFirebaseFunction('doc')(dbArg || window.firebaseDb, ...args);
const setDoc = (...args) => getFirebaseFunction('setDoc')(...args);
const getDoc = (...args) => getFirebaseFunction('getDoc')(...args);
const onSnapshot = (...args) => getFirebaseFunction('onSnapshot')(...args);
const signInAnonymously = (authArg, ...args) => getFirebaseFunction('signInAnonymously')(authArg || window.firebaseAuth, ...args);
const onAuthStateChanged = (authArg, ...args) => getFirebaseFunction('onAuthStateChanged')(authArg || window.firebaseAuth, ...args);
const db = null;
const auth = null;

const LOCAL_BIBLE_PATH = './data/rv1909.json';
const STRONG_HEBREW_PATH = './data/strong-hebrew-clean.json';
const STRONG_GREEK_PATH = './data/strong-greek-dictionary.json';

const localRv1909Provider = new LocalRv1909Provider({
    dataPath: LOCAL_BIBLE_PATH
});
const firebaseBibleApiClient = new FirebaseBibleApiClient();
const remoteBibleProvider = new RemoteBibleProvider({
    versions: REMOTE_BIBLE_VERSIONS,
    client: firebaseBibleApiClient,
    canUseDisabledVersion: versionId => (
        canAccessRemoteBibleVersions()
    )
});
const bibleRepository = new BibleRepository([
    localRv1909Provider,
    remoteBibleProvider
], {
    versionResolver: versionId => versionId
});

async function loadRV1909Bible() {
    return localRv1909Provider.loadBible();
}

async function getBibleChapter(bookId, chapterNumber) {
    const versionId = window.App?.currentBibleVersion || RV1909_VERSION_ID;
    const chapterData = await bibleRepository.getChapter(
        versionId,
        bookId,
        chapterNumber
    );

const content = `
        <div class="verse-container">
            ${chapterData.verses.map(verse => {
const verseNumber = verse.number;
const text = verse.text;
const safeText = escapeBibleHtml(text);

const strongTokens = window.App?.getVerseStrongTokens(
    chapterData.bookId,
    chapterNumber,
    verseNumber
);

const tokenizedText = window.App?.tokenizeVerseText(
    text,
    strongTokens
) || safeText;

                return `
                    <p
                        class="verse-item verse-selectable"
                        data-verse-number="${verseNumber}"
                        data-verse-text="${safeText}"
                        data-verse-full="${safeText}"
                    >
                        <span class="verse-number" data-verse-number="${verseNumber}">${verseNumber}</span>
<span class="verse-text">${tokenizedText}</span>
                    </p>
                `;
            }).join('')}
        </div>
    `;

    return {
        ...chapterData,
        content
    };
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
    readingIndex: [],
    readingIndexLoaded: false,
    readingIndexLoadPromise: null,
    monthlyReadingsCache: {},
    monthlyReadingsLoadPromises: {},
    currentView: 'home',
    currentVersion: 'rvr60',
    currentBibleVersion: 'rv1909',
    isBibleAudioPlaying: false,
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
    { id: 'psa', name: 'Salmos', chapters: 150, startChapter: 100, endChapter: 150 },
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
        const rawId = String(apiBookId || '');
        const ourId = this.bibleApiIdMap[rawId.toUpperCase()] || rawId.toLowerCase();
        return this.bibleBooks.find(b => b.id === ourId);
    },

    getTestamentFromBookId: function(bookId) {
        const book = this.getBibleBookById(bookId);
        if (!book) return 'unknown';

        const oldTestamentIds = this.getOldTestamentIds();

        return oldTestamentIds.has(book.id) ? 'old' : 'new';
    },

    getOldTestamentIds: function() {
        return new Set([
            'gen','exo','lev','num','deu','jos','jdg','rut','1sa','2sa','1ki','2ki','1ch','2ch','ezr','neh','est',
            'job','psa','pro','ecc','sng','isa','jer','lam','ezk','dan','hos','jol','amo','oba','jon','mic','nam',
            'hab','zep','hag','zec','mal'
        ]);
    },

    getBibleBooksByTestament: function(testament = 'old') {
        const oldTestamentIds = this.getOldTestamentIds();
        const target = testament === 'new' ? 'new' : 'old';

        return this.bibleBooks.filter(book => {
            const isOld = oldTestamentIds.has(book.id);
            return target === 'old' ? isOld : !isOld;
        });
    },

    getBibleBookAliases: function(book) {
        const aliases = [book.name];
        const lowerName = String(book.name || '').toLowerCase();

        if (lowerName === 'salmos') aliases.push('Salmo');
        if (lowerName === 'cantares') aliases.push('Cantar de los Cantares');
        if (lowerName === 'apocalipsis') aliases.push('Revelación');

        return aliases;
    },

    parseBibleReferenceQuery: function(query) {
        const normalizedQuery = this.normalizeBibleWord(query);

        if (!normalizedQuery) return null;

        const candidates = this.bibleBooks
            .flatMap(book => this.getBibleBookAliases(book).map(alias => ({
                book,
                alias: this.normalizeBibleWord(alias)
            })))
            .filter(item => item.alias)
            .sort((a, b) => b.alias.length - a.alias.length);

        for (const item of candidates) {
            if (
                normalizedQuery !== item.alias &&
                !normalizedQuery.startsWith(`${item.alias} `)
            ) {
                continue;
            }

            const remainder = normalizedQuery.slice(item.alias.length).trim();
            const match = remainder.match(/^(\d{1,3})(?:\s*[: ]\s*(\d{1,3}))?$/);

            if (!match) continue;

            const chapter = Number(match[1]);
            const verse = match[2] ? Number(match[2]) : null;

            if (!Number.isInteger(chapter) || chapter < 1 || chapter > item.book.chapters) {
                return null;
            }

            if (verse !== null && (!Number.isInteger(verse) || verse < 1)) {
                return null;
            }

            return {
                bookId: item.book.id,
                bookName: item.book.name,
                chapter,
                verse
            };
        }

        return null;
    },

    tokenizeVerseText: function(text, tokens = []) {

    if (!tokens || tokens.length === 0) {

        return escapeBibleHtml(text);

    }

    const words = text.split(/\s+/);

    return words.map((word, index) => {

        const token = tokens[index] || {};

        const cleanWord = word.trim();

        const strong = token.strong || '';

        const original = token.original || '';

        const transliteration = token.transliteration || '';

        const definition = token.definition || '';

        return `

            <span

                class="strong-word"

                data-word="${escapeBibleHtml(cleanWord)}"

                data-strong="${escapeBibleHtml(strong)}"

                data-original="${escapeBibleHtml(original)}"

                data-transliteration="${escapeBibleHtml(transliteration)}"

                data-definition="${escapeBibleHtml(definition)}"

            >

                ${escapeBibleHtml(cleanWord)}

            </span>

        `;

    }).join(' ');

},

    selectedBibleBook: null,
    selectedBibleChapter: null,
    bibleChapterPickerMode: false,
    bibleLibraryTestament: 'old',
    currentBibleChapterData: null,
    strongHebrew: {},
    strongHebrewReady: false,
    strongGreek: {},
    strongGreekReady: false,
    strongDictionaryEntries: [],
    strongDictionaryReady: false,
    strongDictionaryLoading: false,
    strongDictionaryLoadPromise: null,
    strongDictionaryQuery: '',
    strongDictionaryFilter: 'all',
    strongDictionaryResults: [],
    strongDictionarySelectedId: null,
    strongDictionaryBibleContext: null,
    strongDictionaryConsultedWord: '',
    pendingStrongContext: null,
    strongVerseData: {},
    strongVerseDataReady: false,

    bibleSearchIndexReady: false,
    bibleSearchData: [],
    bibleSearchIndex: new Map(),
    bibleSearchVerseMap: new Map(),

    bibleSearchQuery: '',
    bibleSearchResults: [],
    bibleSearchLoading: false,
    bibleSearchError: '',
    bibleSearchRequestId: 0,
    bibleSearchTotal: 0,
    bibleSearchTotalPages: 0,
    bibleSearchPage: 1,
    bibleSearchPageSize: 20,
    searchTimeout: null,
    bibleSearchComposing: false,
    targetVerse: null,
    bibleSearchFilter: 'all', // 'all', 'old', 'new'
    bibleReaderPickerOpen: false,
    bibleReaderPickerTestament: 'old',
    bibleReaderPickerBook: null,
    bibleVersionPickerOpen: false,
    bibleReadingSettingsOpen: false,
    bibleReadingSettings: {
        textSize: 'normal',
        spacing: 'comfortable',
        focusMode: false
    },
    bibleMemoryFilter: 'all',
    openNoteDate: null,
    activeNoteField: null,
    homeViewingDate: null,
    communityFormOpen: false,
    currentUser: null,
    communityUnreadCount: 0,
    _communityActivityUnsubscribe: null,
    _communityMarkSeenPromise: null,
    openReplyPostId: null,
    replyDrafts: {},
    replyCharLimit: 300,
    communityPageSize: 20,
    communityLastVisible: null,
    communityHasMorePosts: true,
    communityLoadingMore: false,
    communityPostsLoaded: false,
    previousView: null,
    dailyReadingVoice: {
        utterance: null,
        status: 'idle',
        date: null
    },
    bibleChapterVoice: {
        utterance: null,
        status: 'idle',
        verses: [],
        currentVerseIndex: 0,
        executionToken: null,
        key: null,
        reference: null
    },
    
    calendarInitialized: false,
    calendarScrollTop: 0,
    calendarBookOpenState: {},
    calendarActiveFilter: 'all',
    selectedStatsDate: null,

     // ✅ NUEVAS PROPIEDADES PARA OPTIMIZACIÓN
    communityCache: null,           // Para caché de posts
    communityScrollTop: 0,          // Para guardar scroll
    shouldScrollToLastPost: false,  // Para controlar scroll al último post
  
    
    // Sistema de rachas
    streak: { ...DEFAULT_STREAK },

    
    // Configuración
    settings: { ...DEFAULT_SETTINGS },

    storage: {
    get: storageGet,
    set: storageSet,
    remove: storageRemove
},
    
// Estado de render y controles
renderScheduled: false,
selectionPanelLocked: false,
activeSelectionSurface: null,
currentSelectedVerse: null,       
currentSelectedText: null,
currentSelectionDate: null,
verseImageText: '',
verseImageReference: '',
verseImageVersionLabel: '',
verseImageSource: 'home',
currentSelectionColorDraft: null,
_savedScrollY: null, 
pushListenersReady: false,
_nativePushActionListenersReady: false,
_nativePushRegistrationListenersReady: false,
_pushRouteReady: false,
_pendingPushHash: null,
themeListenerReady: false,
_selectionPanelEventsBound: false,
_authInitPromise: null,
_authListenerReady: false,
_lastAuthError: null,
    
    // ========================================
    // INICIALIZACIÓN
    // ========================================
   init: async function() {
    console.log('[App] Inicializando...');

    this.cacheDOM();
    this.bindSelectionPanelEvents();
    this.bindVerseImageEditorEvents();
    this.showAprilMessageIfNeeded();
    this.loadSettings();
    this.loadStreak();
    this.loadFontSize();
    this.loadBibleReadingSettings();
    localStorage.removeItem('su-voz-last-reminder-date');
       
    const savedVersion = localStorage.getItem('current-version');
    if (savedVersion) {
        this.currentVersion = savedVersion;
    }

    const savedBibleVersion = localStorage.getItem('current-bible-version');
    if (savedBibleVersion) {
        this.currentBibleVersion = savedBibleVersion;
    } else {
        this.currentBibleVersion = 'rv1909';
    }
       
this.initTheme();
this.initNotifications();
this.setupSWCommunication();
this.bindEvents();
this.bindStrongNativeLongPress();
this.bindHeaderControlsToggle();
this.bindKeyboardViewportFix();
this.setupAndroidBackButton();
this.setupNativePushActionListeners();
await this.loadData();

await this.handleRoute();
this._pushRouteReady = true;

if (this._pendingPushHash) {
    const pendingPushHash = this._pendingPushHash;
    this._pendingPushHash = null;
    await this.navigateToPushHash(pendingPushHash);
}

this.updateStreakUI();

this.initAuth().then(async () => {
    try {
        if (!this.currentUser?.uid) {
            console.warn('[Community] Badge omitido: no hay usuario autenticado');
            return;
        }

        await this.subscribeToCommunityActivity();

        const savedToken = localStorage.getItem('su-voz-fcm-token');

        if (savedToken && this.currentUser) {
            await this.savePushToken(savedToken);

            if (this.settings.notificationsEnabled) {
                this.setupPushListeners();
            }
        }
    } catch (error) {
        console.warn('[App] Servicios secundarios no disponibles al iniciar:', error);
    }
});

console.log('[App] Inicialización completada');
	},

    isCapacitorAndroid: function() {
        return window.Capacitor?.getPlatform?.() === 'android' &&
            window.Capacitor?.isNativePlatform?.();
    },

    setupAndroidBackButton: function() {
        if (!this.isCapacitorAndroid() || this._androidBackButtonListenerReady) return;

        const AppPlugin = this.getCapacitorPlugin('App');

        if (!AppPlugin?.addListener) {
            console.warn('[Android Back] El plugin @capacitor/app no está disponible');
            return;
        }

        this._androidBackButtonListenerReady = true;

        Promise.resolve(
            AppPlugin.addListener('backButton', (event) => {
                this.handleAndroidBackButton(event);
            })
        ).catch(error => {
            this._androidBackButtonListenerReady = false;
            console.error('[Android Back] No se pudo registrar el listener:', error);
        });
    },

    handleAndroidBackButton: function(event = {}) {
        if (!this.isCapacitorAndroid()) return;

        if (this.$verseImagePanel?.classList.contains('visible')) {
            this.closeVerseImageEditor();
            return;
        }

        const noteViewPanel = document.getElementById('noteViewPanel');
        if (noteViewPanel?.classList.contains('visible')) {
            noteViewPanel.classList.remove('visible');
            document.body.classList.remove('selection-panel-open');
            this.clearVerseSelection();
            return;
        }

        if (this.$selectionPanel?.classList.contains('visible')) {
            this.hideSelectionPanel();
            window.getSelection()?.removeAllRanges();
            return;
        }

        const strongSheetPanel = document.getElementById('strongSheetPanel');
        if (strongSheetPanel?.classList.contains('visible')) {
            this.closeStrongSheet();
            return;
        }

        if (this.bibleReaderPickerOpen) {
            this.closeBibleReaderPicker();
            return;
        }

        if (this.bibleVersionPickerOpen) {
            this.closeBibleVersionPicker();
            return;
        }

        if (this.bibleReadingSettingsOpen) {
            this.bibleReadingSettingsOpen = false;
            this.mountBibleReadingSettingsPanel();
            this.updateBibleReaderContextBarUI();
            return;
        }

        if (this.$headerControlsDropdown?.classList.contains('show')) {
            this.$headerControlsDropdown.classList.remove('show');
            return;
        }

        if (this.communityFormOpen) {
            this.communityFormOpen = false;
            this.handleRoute().catch(error => {
                console.error('[Android Back] Error cerrando formulario de comunidad:', error);
            });
            return;
        }

        if (this.currentView !== 'home') {
            if (event.canGoBack) {
                history.back();
                return;
            }

            history.replaceState(null, '', '#home');
            this.handleRoute().catch(error => {
                console.error('[Android Back] Error regresando a Inicio:', error);
            });
            return;
        }

        const AppPlugin = this.getCapacitorPlugin('App');
        AppPlugin?.exitApp?.();
    },

    getCapacitorPlugin: function(name) {
        return window.Capacitor?.Plugins?.[name] || null;
    },

ensureSinaiTemplateButton: function() {
    if (document.querySelector('.verse-template-btn[data-template="sinai"]')) return;

    const templateGrid = document.querySelector('.verse-template-grid')
        || document.querySelector('.verse-template-btn')?.parentElement;

    if (!templateGrid) return;

    const button = document.createElement('button');
    button.className = 'verse-template-btn';
    button.type = 'button';
    button.dataset.template = 'sinai';
    button.textContent = 'Sinaí';

    templateGrid.appendChild(button);
},

normalizeVerseImageActionLabels: function() {
    if (this.$verseImageDownloadBtn) {
        this.$verseImageDownloadBtn.textContent = 'Descargar';
    }

    if (this.$verseImageShareBtn) {
        this.$verseImageShareBtn.textContent = 'Compartir imagen';
    }
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
    this.$selectionShareImageBtn = document.getElementById('shareImageBtn');
    this.$selectionStrongBtn = document.getElementById('strongSearchBtn');
    this.$selectionClearBtn = document.getElementById('clearBtn');
    this.$selectionCloseBtn = document.getElementById('closePanel');
    this.$selectionSaveNoteBtn = document.getElementById('saveNoteBtn');
    this.$selectionNoteBtn = document.getElementById('noteBtn');
    this.$selectionColorButtons = Array.from(document.querySelectorAll('.color-btn'));

    this.$verseImagePanel = document.getElementById('verseImagePanel');
    this.$verseImageCanvas = document.getElementById('verseImagePreview');
    this.$verseImageDownloadBtn = document.getElementById('downloadVerseImageBtn');
    this.$verseImageShareBtn = document.getElementById('shareVerseImageFinalBtn');
    this.normalizeVerseImageActionLabels();
    this.ensureSinaiTemplateButton();
    this.$verseTemplateButtons = Array.from(document.querySelectorAll('.verse-template-btn'));
    this.$verseFormatButtons = Array.from(document.querySelectorAll('.verse-format-btn'));
    this.$verseTextSizeButtons = Array.from(document.querySelectorAll('.verse-text-size-btn'));
    this.$verseLinkToggleBtn = document.getElementById('verseLinkToggleBtn');

    this.verseImageTemplate = 'midnight';
    this.verseImageFormat = 'post';
    this.verseImageTextSize = 'normal';
    this.verseImageShowLink = true;

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
            case 'SW_ACTIVATED':
                console.log('[App] Service Worker actualizado:', data.version);
                break;

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
        const savedStreak = this.storage.get('su-voz-streak', {});
        this.streak = { ...DEFAULT_STREAK, ...savedStreak };
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

    this.streak = calculateUpdatedStreak(this.streak, today, yesterday);

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
    
   getYesterdayDateStr,
    
    updateStreakUI: function() {
        if (this.$streakIndicator && this.$streakCount) {
            if (this.streak.current > 0) {
                const streakLabel = this.streak.current === 1 ? 'día' : 'días';
                this.$streakIndicator.style.display = 'flex';
                this.$streakCount.textContent = `${this.streak.current} ${streakLabel}`;
                this.$streakIndicator.setAttribute(
                    'aria-label',
                    `Ver tu camino de lectura. Racha actual: ${this.streak.current} ${streakLabel}`
                );
            } else {
                this.$streakIndicator.style.display = 'none';
            }
        }
    },

    // ========================================
// SISTEMA DE RACHAS MEJORADO: PERGAMINO DEL PEREGRINO
// ========================================

// Datos de hitos por libro (empieza con Deuteronomio)
hitosPorLibro: {
    'deu': {
        nombreCompleto: 'Deuteronomio',
        totalCapitulos: 34,
        tema: 'El llamado a la obediencia y al amor',
        hitos: [
            { capitulo: 1,  icono: '🏕️', titulo: 'Campamento base', descripcion: 'El pueblo está listo para entrar. Moisés comienza a recordar.' },
            { capitulo: 5,  icono: '🗻', titulo: 'Los Diez Mandamientos', descripcion: 'La Ley santa de Dios resuena de nuevo.' },
            { capitulo: 6,  icono: '📜', titulo: 'El Gran Shemá', descripcion: '“Oye, Israel: Jehová nuestro Dios, Jehová uno es.”' },
            { capitulo: 8,  icono: '🍞', titulo: 'No solo de pan', descripcion: 'Él te sustentó con maná en el desierto.' },
            { capitulo: 11, icono: '⛰️', titulo: 'Entre Gerizim y Ebal', descripcion: 'La bendición y la maldición ante tus ojos.' },
            { capitulo: 17, icono: '🏛️', titulo: 'Mitad del camino', descripcion: 'Instrucciones para reyes y jueces justos.' },
            { capitulo: 18, icono: '🔮', titulo: 'Profeta como Moisés', descripcion: 'Dios levantará un profeta de entre tus hermanos.' },
            { capitulo: 28, icono: '⚡', titulo: 'Bendiciones y maldiciones', descripcion: 'La vida y la muerte, la bendición y la maldición.' },
            { capitulo: 30, icono: '❤️', titulo: 'Escoge la vida', descripcion: 'Ama a Jehová tu Dios, obedece Su voz.' },
            { capitulo: 31, icono: '💪', titulo: 'Esfuérzate y sé valiente', descripcion: 'Moisés pasa el liderazgo a Josué.' },
            { capitulo: 32, icono: '🎵', titulo: 'Cántico de Moisés', descripcion: 'La Roca, cuya obra es perfecta.' },
            { capitulo: 34, icono: '👑', titulo: 'Fin del Peregrinaje', descripcion: 'Moisés contempla la tierra prometida. ¡Libro completado!' }
        ],
        colores: {
            inicio: '#8B4513',
            medio: '#DAA520',
            final: '#FFD700',
            completado: '#FFD700'
        }
    }
    // Aquí se añadirán más libros cuando corresponda: 'jos', 'jdg', etc.
},

// Obtener libro actual basado en la lectura mostrada en Inicio
getLibroActual: function(dateStr = this.getTodayDateStr(), reading = null) {
    const targetDate = dateStr || this.getTodayDateStr();
    const targetReading = reading || findReadingByDate(this.data, targetDate);
    const metadata = this.getReadingMetadataByDate(targetDate);
    
    if (!targetReading) return null;

    const libroPorId = findBookById(
        metadata?.bookId || targetReading.bookId,
        this.bibleBooks
    );

    if (libroPorId) return libroPorId;

    return findBookByReference(targetReading.reference, this.bibleBooks);
},

// Obtener capítulo actual
getCapituloActual: function() {
    const hoy = this.getTodayDateStr();
    const lecturaHoy = findReadingByDate(this.data, hoy);
    
    return getChapterFromReading(lecturaHoy);
},

// Calcular progreso en el libro actual
getProgresoLibro: function(libroId) {
    const readDates = this.getReadDates();
    const metadataByDate = new Map(
        this.readingIndex.map(reading => [reading.date, reading])
    );
    const readings = this.data.length > 0
        ? this.data.map(reading => ({
            ...reading,
            bookId: reading.bookId || metadataByDate.get(reading.date)?.bookId
        }))
        : this.readingIndex;

    return calculateProgressForBookId(
        libroId,
        this.bibleBooks,
        readings,
        readDates
    );
},

// Verificar si alcanzó un hito hoy
verificarHitoDelDia: function() {
    const libroActual = this.getLibroActual();
    if (!libroActual) return;
    
    const capitulo = this.getCapituloActual();
    if (!capitulo) return;
    
    // Obtener hitos para este libro (si existen en el mapa, si no, mostrar progreso simple)
    const hitosLibro = this.hitosPorLibro[libroActual.id]?.hitos;
    
    if (!hitosLibro) return;
    
    const hitoDelDia = hitosLibro.find(h => h.capitulo === capitulo);
    
    if (hitoDelDia) {
        // Mostrar solo una vez por hito
        const keyHito = `hito_${libroActual.id}_${capitulo}`;
        if (!localStorage.getItem(keyHito)) {
            this.mostrarBannerHito(hitoDelDia, libroActual.nombre);
            localStorage.setItem(keyHito, 'visto');
        }
    }
    
    // Verificar si completó el libro
    const progreso = this.getProgresoLibro(libroActual.id);
    if (progreso.porcentaje === 100) {
        const keyLibroCompleto = `libro_completo_${libroActual.id}`;
        if (!localStorage.getItem(keyLibroCompleto)) {
            this.mostrarBannerLibroCompleto(libroActual, progreso);
            localStorage.setItem(keyLibroCompleto, 'visto');
        }
    }
},

// Banner para hitos dentro del libro
mostrarBannerHito: function(hito, nombreLibro) {
    const libroActual = this.getLibroActual();
    const totalCapitulos = libroActual ? libroActual.capitulosTotales : 34;
    
    const banner = document.createElement('div');
    banner.className = 'hito-banner';
    banner.innerHTML = `
        <div class="hito-banner-content">
            <div class="hito-banner-icono">${hito.icono}</div>
            <div class="hito-banner-titulo">${hito.titulo}</div>
            <div class="hito-banner-libro">${nombreLibro} · Capítulo ${hito.capitulo} de ${totalCapitulos}</div>
            ...
        </div>
    `;
    document.body.appendChild(banner);
    
    setTimeout(() => { if (banner) banner.remove(); }, 8000);
},

// Banner épico al completar un libro
mostrarBannerLibroCompleto: function(libro, progreso) {
    const banner = document.createElement('div');
    banner.className = 'libro-completo-banner';
    banner.innerHTML = `
        <div class="libro-completo-content">
            <div class="libro-completo-icono">👑</div>
            <div class="libro-completo-titulo">¡${libro.nombre} Completado!</div>
            <div class="libro-completo-subtitulo">Has meditado en los ${progreso.total} capítulos</div>
            <div class="libro-completo-versiculo">"Esfuérzate y sé valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas."</div>
            <div class="libro-completo-ref">— Josué 1:9</div>
            ${this.obtenerMensajeLibro(libro.id)}
            <button class="btn-primary libro-completo-btn" onclick="this.closest('.libro-completo-banner').remove()">
                🎉 Amén, Gloria a Dios
            </button>
        </div>
    `;
    document.body.appendChild(banner);
    
    if ('vibrate' in navigator) navigator.vibrate([50, 100, 50, 100, 50]);
    
    setTimeout(() => { if (banner) banner.remove(); }, 10000);
},

obtenerMensajeLibro: function(libroId) {
    const mensajes = {
        'deu': '<p style="margin:10px 0;color:#e2c28b;">Has escuchado el eco del Shemá. La obediencia a Su voz es tu tesoro.</p>'
    };
    return mensajes[libroId] || '';
},

// Método helper para saber cuántos capítulos se han meditado
getProgresoLibroVisual: function(dateStr = this.getHomeViewingDate(), reading = null) {
    const libroActual = this.getLibroActual(dateStr, reading);
    if (!libroActual) return '';
    
    const progreso = this.getProgresoLibro(libroActual.id);
    const startChapter = progreso.startChapter || 1;
    const endChapter = progreso.endChapter || progreso.total;
    const total = progreso.total;
    const leidos = progreso.leidos.length;
    const ultimoLeido = leidos > 0 ? Math.max(...progreso.leidos) : 0;
    
    // Crear visualización de los capítulos como un scroll horizontal
    let html = '<div class="pergamino-libro">';
    html += `<div class="pergamino-titulo">📖 ${progreso.libroNombre}</div>`;

    // Subtítulo adaptado para rangos de lectura (ej. Salmos 100-150)
    let subtituloText = `Capítulo ${ultimoLeido || startChapter} de ${endChapter}`;
    if (startChapter > 1) {
        subtituloText += ` (${leidos} de ${total} meditados)`;
    }
    html += `<div class="pergamino-subtitulo">${subtituloText}</div>`;
    html += '<div class="pergamino-capitulos">';
    
    for (let i = startChapter; i <= endChapter; i++) {
        const leido = progreso.leidos.includes(i);
        const clase = leido ? 'capitulo-leido' : 'capitulo-pendiente';
        const titulo = leido ? `Capítulo ${i} - Meditado ✓` : `Capítulo ${i} - Pendiente`;
        
        html += `<span class="pergamino-capitulo ${clase}" title="${titulo}">${i}</span>`;
    }
    
    html += '</div>';
    
    // Barra de progreso
    const porcentaje = progreso.porcentaje;
    html += `
        <div class="pergamino-progreso">
            <div class="pergamino-barra-fondo">
                <div class="pergamino-barra-lleno" style="width:${porcentaje}%"></div>
            </div>
            <div class="pergamino-porcentaje">${porcentaje}% completado</div>
        </div>
    `;
    
    html += '</div>';
    
    return html;
},
    
    // ========================================
    // CONFIGURACIÓN (MEJORADA CON SW)
    // ========================================
    loadSettings: function() {
        const savedSettings = this.storage.get('su-voz-settings', {});
        this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
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
        deviceId = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('su-voz-device-id', deviceId);
    }

    return deviceId;
},

getPlatformLabel: function() {
    return getPlatformLabel();
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

loadBibleReadingSettings: function() {
    const saved = this.storage.get('su-voz-bible-reading-settings', {});
    const textSize = ['small', 'normal', 'large'].includes(saved.textSize) ? saved.textSize : 'normal';
    const spacing = ['compact', 'comfortable'].includes(saved.spacing) ? saved.spacing : 'comfortable';

    this.bibleReadingSettings = {
        textSize,
        spacing,
        focusMode: !!saved.focusMode
    };
},

saveBibleReadingSettings: function() {
    this.storage.set('su-voz-bible-reading-settings', this.bibleReadingSettings);
},

getBibleReaderClassNames: function() {
    const settings = this.bibleReadingSettings || {};
    const textSize = ['small', 'normal', 'large'].includes(settings.textSize) ? settings.textSize : 'normal';
    const spacing = ['compact', 'comfortable'].includes(settings.spacing) ? settings.spacing : 'comfortable';

    return [
        'bible-reader-view',
        `bible-reader-text-${textSize}`,
        `bible-reader-spacing-${spacing}`,
        settings.focusMode ? 'bible-reader-focus-mode' : ''
    ].filter(Boolean).join(' ');
},

applyBibleReadingSettingsToDOM: function() {
    const readerView = this.$content?.querySelector('.bible-reader-view');

    if (!readerView) return;

    readerView.classList.remove(
        'bible-reader-text-small',
        'bible-reader-text-normal',
        'bible-reader-text-large',
        'bible-reader-spacing-compact',
        'bible-reader-spacing-comfortable',
        'bible-reader-focus-mode'
    );

    this.getBibleReaderClassNames()
        .split(' ')
        .filter(className => className !== 'bible-reader-view')
        .forEach(className => readerView.classList.add(className));
},

openStrongForWord: function(strongWord) {
    const word = strongWord.dataset.word || strongWord.textContent.trim();
    const strong = strongWord.dataset.strong || '—';
    const original = strongWord.dataset.original || '—';
    const transliteration = strongWord.dataset.transliteration || '—';
    const definition = strongWord.dataset.definition || 'Información Strong no disponible para esta palabra.';

    document.getElementById('strongSheetWord').textContent = word;
    document.getElementById('strongSheetNumber').textContent = strong;
    document.getElementById('strongSheetOriginal').textContent = original;
    document.getElementById('strongSheetTransliteration').textContent = transliteration;
    document.getElementById('strongSheetDefinition').textContent = definition;

    const panel = document.getElementById('strongSheetPanel');
    if (!panel) return;

    panel.classList.add('visible');
    panel.setAttribute('aria-hidden', 'false');
},

closeStrongSheet: function() {
    const panel = document.getElementById('strongSheetPanel');
    if (!panel) return;

    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
},

bindStrongNativeLongPress: function() {
    let strongPressTimer = null;
    let startX = 0;
    let startY = 0;
    let pressedWord = null;

    const LONG_PRESS_MS = 700;
    const MOVE_LIMIT = 14;

    this.$content.addEventListener('touchstart', (e) => {
        const strongWord = e.target.closest('.strong-word');

        if (!strongWord) return;

        const touch = e.touches[0];

        startX = touch.clientX;
        startY = touch.clientY;
        pressedWord = strongWord;

        strongPressTimer = setTimeout(() => {
            this.openStrongForWord(pressedWord);
            strongPressTimer = null;
        }, LONG_PRESS_MS);
    }, { passive: true });

    this.$content.addEventListener('touchmove', (e) => {
        if (!strongPressTimer || !pressedWord) return;

        const touch = e.touches[0];
        const movedX = Math.abs(touch.clientX - startX);
        const movedY = Math.abs(touch.clientY - startY);

        if (movedX > MOVE_LIMIT || movedY > MOVE_LIMIT) {
            clearTimeout(strongPressTimer);
            strongPressTimer = null;
            pressedWord = null;
        }
    }, { passive: true });

    this.$content.addEventListener('touchend', () => {
        if (strongPressTimer) {
            clearTimeout(strongPressTimer);
            strongPressTimer = null;
        }

        pressedWord = null;
    }, { passive: true });
},

bindHeaderControlsToggle: function() {
    if (!this.$headerControlsBtn) return;

    const toggleHeaderControls = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.$headerControlsDropdown.classList.toggle('show');
    };

    this.$headerControlsBtn.addEventListener('click', toggleHeaderControls);

    this.$headerControlsDropdown?.addEventListener('click', (e) => {
        const strongBetaBtn = e.target.closest('[data-action="open-strong-dictionary"]');

        if (!strongBetaBtn) return;

        e.preventDefault();
        e.stopPropagation();
        this.$headerControlsDropdown.classList.remove('show');
        // Acceso secundario temporal: Strong se conserva en beta sin interferir con la lectura.
        this.strongDictionaryBibleContext = null;
        this.strongDictionaryConsultedWord = '';
        this.navigate('strong-dictionary');
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
        const planReadings = this.getCalendarReadings();
        const planDateSet = new Set(planReadings.map(reading => reading.date));
        const planReadingMap = new Map(planReadings.map(reading => [reading.date, reading]));
        const validReadDates = readDates.filter(date => planDateSet.has(date));
        const todayStr = this.getTodayDateStr();
        const groups = this.getCalendarBookGroups(planReadings);
        const readDateSet = new Set(validReadDates);
        let reflectionDays = 0;
        let prayerDays = 0;
        let totalHighlights = 0;
        let totalSelectionNotes = 0;
        const activityDays = {
            read: validReadDates,
            reflection: [],
            prayer: [],
            highlight: []
        };
        const moments = {
            selectionNotes: [],
            highlights: [],
            reflections: []
        };
        let momentOrder = 0;
        const getReadingMomentMeta = (date) => {
            const reading = planReadingMap.get(date);

            return {
                date,
                reference: reading?.reference || 'Lectura del día'
            };
        };

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);

            if (key && key.startsWith('su-voz-note-')) {
                const date = key.replace('su-voz-note-', '');
                const note = this.storage.get(key, null);

                if (!planDateSet.has(date) || !note) continue;

                const hasReflection = Boolean(
                    note.dios?.trim() ||
                    note.aprendizaje?.trim() ||
                    note.respuesta?.trim() ||
                    note.oracion?.trim()
                );
                const hasPrayer = Boolean(note.oracion?.trim());

                if (hasReflection) reflectionDays++;
                if (hasReflection) {
                    activityDays.reflection.push(date);
                    const fragment = [
                        note.dios,
                        note.aprendizaje,
                        note.respuesta,
                        note.oracion
                    ].find(value => String(value || '').trim());

                    if (fragment) {
                        moments.reflections.push({
                            ...getReadingMomentMeta(date),
                            type: 'Reflexión',
                            fragment: String(fragment).trim(),
                            order: momentOrder++
                        });
                    }
                }
                if (hasPrayer) {
                    prayerDays++;
                    activityDays.prayer.push(date);
                }
            }

            if (key && key.startsWith('su-voz-selection-notes-')) {
                const date = key.replace('su-voz-selection-notes-', '');

                if (!planDateSet.has(date)) continue;

                const selectionNotes = this.getSelectionNotes(date);
                totalSelectionNotes += selectionNotes.length;
                selectionNotes.slice().reverse().forEach(item => {
                    moments.selectionNotes.push({
                        ...getReadingMomentMeta(date),
                        type: 'Nota',
                        fragment: item.note || item.text || '',
                        order: momentOrder++
                    });
                });
            }

            if (key && key.startsWith('su-voz-highlights-')) {
                const date = key.replace('su-voz-highlights-', '');

                if (!planDateSet.has(date)) continue;

                const highlights = this.getHighlights(date);
                totalHighlights += highlights.length;
                if (highlights.length > 0) activityDays.highlight.push(date);
                highlights.slice().reverse().forEach(item => {
                    moments.highlights.push({
                        ...getReadingMomentMeta(date),
                        type: 'Resaltado',
                        fragment: item.text || '',
                        order: momentOrder++
                    });
                });
            }
        }

        const stats = calculateReadingStats({
            readDates,
            planReadings,
            reflectionDays,
            prayerDays,
            totalHighlights,
            totalSelectionNotes
        });

        return {
            ...stats,
            activityDays,
            moments: {
                selectionNotes: moments.selectionNotes
                    .filter(item => item.fragment)
                    .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order)
                    .slice(0, 3),
                highlights: moments.highlights
                    .filter(item => item.fragment)
                    .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order)
                    .slice(0, 3),
                reflections: moments.reflections
                    .filter(item => item.fragment)
                    .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order)
                    .slice(0, 3)
            },
            books: groups.map(group => {
                const meta = this.getCalendarBookMeta(group, readDateSet, todayStr);
                const firstPending = group.items.find(item => !readDateSet.has(item.date));
                const completedItems = group.items.filter(item => readDateSet.has(item.date));
                const lastCompleted = completedItems[completedItems.length - 1];

                return {
                    id: group.id,
                    name: group.name,
                    total: meta.total,
                    completed: meta.completed,
                    percent: meta.total > 0 ? Math.round((meta.completed / meta.total) * 100) : 0,
                    state: meta.stateKey,
                    label: meta.stateLabel,
                    firstDate: meta.firstDate,
                    lastDate: meta.lastDate,
                    continueDate: firstPending?.date || group.items[0]?.date || '',
                    reviewDate: lastCompleted?.date || group.items[group.items.length - 1]?.date || ''
                };
            })
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

    // ======= NUEVO SISTEMA DE PERGAMINO =======
    // Verificar si la lectura de hoy alcanzó un hito del libro
    setTimeout(() => this.verificarHitoDelDia(), 500);
    // =========================================

    if ('vibrate' in navigator) {
        navigator.vibrate(50);
    }

    this.sendToSW({ type: 'READING_COMPLETED', date: dateStr });
    
    // Actualizar UI si estamos en home
    if (this.currentView === 'home') {
        this.renderHome().catch(error => {
            console.warn('[Readings] No se pudo refrescar Inicio después de marcar lectura:', error);
        });
    }
},

    getReadDates: function() {
    return this.storage.get('su-voz-read-dates', []);
    },

    setReadDates: function(readDates) {
    this.storage.set('su-voz-read-dates', readDates);
    },
    
    isRead: function(dateStr) {
    return isDateRead(this.getReadDates(), dateStr);
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

   async getCommunityPosts(options = {}) {
    try {
        const pageSize = options.pageSize || this.communityPageSize || 20;
        const constraints = [
            orderBy("createdAt", "desc")
        ];

        if (options.startAfterDoc) {
            constraints.push(startAfter(options.startAfterDoc));
        }

        constraints.push(limit(pageSize));

        const q = query(collection(db, "communityPosts"), ...constraints);
        const snapshot = await getDocs(q);

        const posts = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        return {
            posts,
            lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
            hasMore: snapshot.docs.length === pageSize
        };
    } catch (error) {
        console.error("Error cargando posts:", error);
        const firebaseUnavailable = !window.firebaseDb ||
            !window.firebaseFns?.getDocs ||
            String(error?.message || '').includes('Firebase no disponible');

        return {
            posts: [],
            lastVisible: null,
            hasMore: false,
            firebaseUnavailable
        };
    }
},

// ========================================
// MÉTODOS OPTIMIZADOS PARA COMUNIDAD
// ========================================

// Método con caché para posts
getCommunityPostsCached: async function(options = {}) {
    const CACHE_DURATION = 30000; // 30 segundos de caché
    const now = Date.now();

    if (!this.currentUser?.uid) {
        throw new Error('Auth no disponible: falta currentUser.uid');
    }
    
    if (!options.forceRefresh &&
        this.communityCache &&
        this.communityCache.posts &&
        (
            (now - this.communityCache.timestamp) < CACHE_DURATION ||
            this.communityCache.posts.length > this.communityPageSize
        )) {
        console.log('[Community] Usando caché de posts');
        this.communityLastVisible = this.communityCache.lastVisible || null;
        this.communityHasMorePosts = Boolean(this.communityCache.hasMore);
        this.communityPostsLoaded = true;
        return this.communityCache.posts;
    }
    
    console.log('[Community] Cargando primera página desde Firestore');
    const page = await this.getCommunityPosts({
        pageSize: this.communityPageSize
    });

    if (page.firebaseUnavailable) {
        this.communityPostsLoaded = false;
        throw new Error('Firebase no disponible para cargar Comunidad');
    }

    const posts = page.posts;

    this.communityLastVisible = page.lastVisible;
    this.communityHasMorePosts = page.hasMore;
    this.communityPostsLoaded = true;
    this.communityCache = {
        posts,
        lastVisible: page.lastVisible,
        hasMore: page.hasMore,
        timestamp: now
    };
    return posts;
},

loadMoreCommunityPosts: async function() {
    if (this.communityLoadingMore || !this.communityHasMorePosts) {
        return this.communityCache?.posts || [];
    }

    this.communityLoadingMore = true;

    try {
        if (!this.communityPostsLoaded || !this.communityCache?.posts) {
            await this.getCommunityPostsCached();
        }

        if (!this.communityLastVisible) {
            this.communityHasMorePosts = false;
            if (this.communityCache) {
                this.communityCache.hasMore = false;
            }
            return this.communityCache?.posts || [];
        }

        const page = await this.getCommunityPosts({
            pageSize: this.communityPageSize,
            startAfterDoc: this.communityLastVisible
        });

        const existingPosts = this.communityCache?.posts || [];
        const existingIds = new Set(existingPosts.map(post => post.id));
        const nextPosts = page.posts.filter(post => !existingIds.has(post.id));
        const posts = [...existingPosts, ...nextPosts];

        this.communityLastVisible = page.lastVisible || this.communityLastVisible;
        this.communityHasMorePosts = page.hasMore;
        this.communityPostsLoaded = true;
        this.communityCache = {
            posts,
            lastVisible: this.communityLastVisible,
            hasMore: this.communityHasMorePosts,
            timestamp: Date.now()
        };

        return posts;
    } catch (error) {
        console.error('[Community] Error cargando más posts:', error);
        return this.communityCache?.posts || [];
    } finally {
        this.communityLoadingMore = false;
    }
},

getCommunityPostIdBatches: function(posts, batchSize = 10) {
    const ids = [...new Set(
        (posts || [])
            .map(post => post?.id)
            .filter(Boolean)
    )];
    const batches = [];

    for (let index = 0; index < ids.length; index += batchSize) {
        batches.push(ids.slice(index, index + batchSize));
    }

    return batches;
},

// Invalidar caché (llamar después de publicar/eliminar)
invalidateCommunityCache: function() {
    this.communityCache = null;
    this.communityLastVisible = null;
    this.communityHasMorePosts = true;
    this.communityLoadingMore = false;
    this.communityPostsLoaded = false;
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
        const batches = this.getCommunityPostIdBatches(posts);
        const snapshots = await Promise.all(
            batches.map(batch => getDocs(
                query(collection(db, "communityReplies"), where("postId", "in", batch))
            ))
        );

        snapshots.forEach(snapshot => {
            snapshot.docs.forEach(docSnap => {
                const reply = {
                    id: docSnap.id,
                    ...docSnap.data()
                };

                if (!summary[reply.postId]) return;
                summary[reply.postId].push(reply);
            });
        });

        Object.keys(summary).forEach(postId => {
            summary[postId].sort((a, b) => {
                const aValue = a.createdAt?.seconds || 0;
                const bValue = b.createdAt?.seconds || 0;
                return aValue - bValue;
            });
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

getCommunityDraftKey: function() {
    return 'su-voz-community-draft';
},

getCommunityDraft: function() {
    return this.storage.get(this.getCommunityDraftKey(), '');
},

saveCommunityDraft: function(value) {
    const draft = value || '';

    if (!draft.trim()) {
        this.clearCommunityDraft();
        return;
    }

    this.storage.set(this.getCommunityDraftKey(), draft);
},

clearCommunityDraft: function() {
    this.storage.remove(this.getCommunityDraftKey());
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
    { key: 'useful', label: 'Me habló' },
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
                    <span class="community-reaction-label">${item.label}</span>
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
    const latestReply = replyCount ? replies[replyCount - 1] : null;
    const latestReplyText = latestReply?.text || '';
    const latestReplyPreview = latestReplyText.length > 92
        ? `${latestReplyText.slice(0, 92).trim()}...`
        : latestReplyText;
    const replyCountLabel = replyCount === 1
        ? '1 hermano participó'
        : `${replyCount} hermanos participaron`;
    const replyToggleLabel = isOpen
        ? 'Cerrar conversación'
        : (replyCount > 0 ? 'Ver conversación' : 'Responder a este eco');

    return `
        <div class="community-reply-block">
            <div class="community-reply-toolbar">
                ${replyCount > 0 ? `
                    <div class="community-reply-count">
                        ${replyCountLabel}
                        <span>La comunidad está conversando</span>
                    </div>
                ` : (isOpen ? '<div class="community-reply-count is-empty">Sé el primero en responder</div>' : '<div></div>')}

                <button
                    class="community-reply-toggle"
                    type="button"
                    data-action="toggle-reply-form"
                    data-post-id="${post.id}"
                >
                    ${replyToggleLabel}
                </button>
            </div>

            ${replyCount > 0 && !isOpen ? `
                <button
                    class="community-reply-preview"
                    type="button"
                    data-action="toggle-reply-form"
                    data-post-id="${post.id}"
                    aria-label="Ver último eco de la conversación"
                >
                    <span>Último eco</span>
                    <strong>“${this.escapeHtml(latestReplyPreview)}”</strong>
                </button>
            ` : ''}

            ${isOpen ? `
                <div class="community-reply-form">
                    <div class="community-reply-form-title">Comparte cómo este eco te edificó</div>
                    <textarea
                        class="community-reply-textarea"
                        data-action="reply-input"
                        data-post-id="${post.id}"
                        placeholder="Escribe una respuesta breve que anime a la comunidad..."
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

            ${isOpen && replies.length ? `
                <div class="community-reply-list">
                    <div class="community-reply-list-title">Conversación edificante</div>
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
        const batches = this.getCommunityPostIdBatches(posts);
        const snapshots = await Promise.all(
            batches.map(batch => getDocs(
                query(collection(db, "communityReactions"), where("postId", "in", batch))
            ))
        );

        snapshots.forEach(snapshot => {
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

markCommunityAsSeen: async function() {
    this.communityUnreadCount = 0;
    this.updateCommunityBadge();

    if (this._communityMarkSeenPromise) {
        return this._communityMarkSeenPromise;
    }

    this._communityMarkSeenPromise = (async () => {
        const user = this.currentUser || await this.initAuth();

        if (!user?.uid) {
            console.warn('[Community] No se pudo marcar la actividad como vista: falta autenticación');
            return;
        }

        await setDoc(doc(db, 'userActivity', user.uid), {
            unreadCommunityCount: 0,
            lastCommunitySeenAt: serverTimestamp()
        }, { merge: true });
    })()
        .catch(error => {
            console.error('[Community] Error marcando como visto:', error);
        })
        .finally(() => {
            this._communityMarkSeenPromise = null;
        });

    return this._communityMarkSeenPromise;
},

subscribeToCommunityActivity: async function() {
    const user = this.currentUser || await this.initAuth();

    if (!user?.uid) {
        console.warn('[Community] No se pudo escuchar la actividad: falta autenticación');
        return;
    }

    if (this._communityActivityUnsubscribe) {
        this._communityActivityUnsubscribe();
        this._communityActivityUnsubscribe = null;
    }

    const activityRef = doc(db, 'userActivity', user.uid);
    const activitySnapshot = await getDoc(activityRef);

    if (!activitySnapshot.exists()) {
        await setDoc(activityRef, {
            unreadCommunityCount: 0,
            lastCommunitySeenAt: serverTimestamp()
        });
    }

    this._communityActivityUnsubscribe = onSnapshot(
        activityRef,
        snapshot => {
            const rawCount = snapshot.exists()
                ? snapshot.data()?.unreadCommunityCount
                : 0;
            const count = Number.isInteger(rawCount) && rawCount > 0
                ? rawCount
                : 0;

            this.communityUnreadCount = count;
            this.updateCommunityBadge();

            if (this.currentView === 'community' && count > 0) {
                this.markCommunityAsSeen();
            }
        },
        error => {
            console.error('[Community] Error escuchando actividad:', error);
        }
    );
},

updateCommunityBadge: function() {
    const count = Math.max(0, Number(this.communityUnreadCount) || 0);

    if (this.$communityBadge) {
        if (count > 0) {
            this.$communityBadge.hidden = false;
            this.$communityBadge.dataset.count = String(count);
            this.$communityBadge.textContent = count > 99 ? '99+' : String(count);
        } else {
            this.$communityBadge.hidden = true;
            this.$communityBadge.textContent = '0';
            delete this.$communityBadge.dataset.count;
        }
    }

    this.syncAppBadge(count);
},

syncAppBadge: function(count) {
    try {
        if (count > 0 && 'setAppBadge' in navigator) {
            Promise.resolve(navigator.setAppBadge(count)).catch(error => {
                console.warn('[Community] No se pudo actualizar el badge de la PWA:', error);
            });
            return;
        }

        if (count === 0 && 'clearAppBadge' in navigator) {
            Promise.resolve(navigator.clearAppBadge()).catch(error => {
                console.warn('[Community] No se pudo limpiar el badge de la PWA:', error);
            });
        }
    } catch (error) {
        console.warn('[Community] Badging API no disponible:', error);
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

    getDevotionalSteps: function() {
        return [
            {
                id: 'dios',
                label: 'Dios',
                title: 'Cómo se muestra Dios aquí',
                icon: '👑',
                context: 'Observa al Padre, al Hijo y al Espíritu Santo en el pasaje.',
                questions: [
                    '¿Qué obras o acciones de Dios aparecen?',
                    '¿Qué revela este texto acerca de su carácter?',
                    '¿Qué declara Dios o qué se dice de Él?'
                ],
                placeholder: '¿Qué revela este texto acerca de Dios?'
            },
            {
                id: 'aprendizaje',
                label: 'Enseñanza',
                title: 'La enseñanza de este pasaje',
                icon: '📖',
                context: 'Busca la enseñanza principal del texto.',
                questions: [
                    '¿Qué intenta comunicar el pasaje?',
                    '¿Qué aprendes de los personajes o circunstancias?',
                    '¿Es una enseñanza positiva, una advertencia o una corrección?'
                ],
                placeholder: '¿Qué ejemplo, advertencia o enseñanza encuentro aquí?'
            },
            {
                id: 'respuesta',
                label: 'Práctica',
                title: 'Lo que pondré en práctica',
                icon: '✅',
                context: 'Escribe una respuesta concreta para hoy.',
                questions: [
                    '¿Qué debo hacer, cambiar o recordar?',
                    '¿Con quién? ¿Qué? ¿Cómo? ¿Dónde? ¿Cuándo?',
                    'Evita respuestas generales; busca algo específico.'
                ],
                placeholder: '¿Qué debo hacer, cambiar o recordar hoy?'
            },
            {
                id: 'oracion',
                label: 'Oración',
                title: 'Mi oración delante de Dios',
                icon: '🙏',
                context: 'Responde a Dios en oración.',
                questions: [
                    'Agradece por la palabra recibida.',
                    'Pide ayuda específica para obedecer.',
                    'Presenta delante de Dios tu decisión o entrega.'
                ],
                placeholder: 'Pídele a Dios que te ayude a vivir y obedecer lo que has comprendido hoy.'
            }
        ];
    },

    getActiveDevotionalStep: function() {
        const steps = this.getDevotionalSteps();
        return steps.findIndex(step => step.id === this.activeNoteField) >= 0
            ? this.activeNoteField
            : steps[0].id;
    },

    setActiveDevotionalStep: function(stepId) {
        const steps = this.getDevotionalSteps();
        if (steps.some(step => step.id === stepId)) {
            this.activeNoteField = stepId;
        }
    },

    renderDevotionalGuide: function(reading) {
        const steps = this.getDevotionalSteps();
        const activeStepId = this.getActiveDevotionalStep();
        const activeIndex = Math.max(0, steps.findIndex(step => step.id === activeStepId));
        const activeStep = steps[activeIndex];
        const note = this.getNote(reading.date);
        const progress = ((activeIndex + 1) / steps.length) * 100;

        return `
            <div class="note-box devotional-flow" data-devotional-flow="v42">
                <div class="note-privacy">🔒 Estas reflexiones son privadas y solo se guardan en tu dispositivo.</div>

                <div class="devotional-flow-header">
                    <div>
                        <div class="devotional-step-count">Paso ${activeIndex + 1} de ${steps.length}</div>
                        <div class="devotional-flow-title">Profundiza en Su voz</div>
                    </div>
                    <div class="devotional-progress" aria-hidden="true">
                        <span class="devotional-progress-fill" style="width: ${progress}%"></span>
                    </div>
                </div>

                <div class="devotional-stepper" role="tablist" aria-label="Pasos de reflexión">
                    ${steps.map((step, index) => `
                        <button
                            class="devotional-step-tab devotional-chip ${step.id === activeStep.id ? 'active is-active' : ''} ${note[step.id]?.trim() ? 'completed is-complete' : ''}"
                            type="button"
                            data-action="devotional-step"
                            data-step="${step.id}"
                            data-date="${reading.date}"
                            role="tab"
                            aria-selected="${step.id === activeStep.id ? 'true' : 'false'}">
                            <span class="devotional-step-index">${index + 1}</span>
                            <span class="devotional-step-label">${step.label}</span>
                        </button>
                    `).join('')}
                </div>

                <div class="note-section devotional-step-card active" data-note-section="${activeStep.id}" data-devotional-card="true">
                    <div class="note-title">${activeStep.icon} ${activeStep.title}</div>
                    <p class="devotional-step-context">${activeStep.context}</p>
                    <ul class="devotional-question-list">
                        ${activeStep.questions.map(question => `<li>${question}</li>`).join('')}
                    </ul>
                    <textarea
                        class="note-textarea devotional-textarea active"
                        data-field="${activeStep.id}"
                        data-note-date="${reading.date}"
                        placeholder="${activeStep.placeholder}">${this.escapeHtml(note[activeStep.id] || '')}</textarea>
                </div>

                <div class="devotional-nav">
                    <button class="devotional-nav-btn devotional-prev-btn" type="button" data-action="devotional-prev" data-date="${reading.date}" ${activeIndex === 0 ? 'disabled' : ''}>Anterior</button>
                    <button class="devotional-nav-btn devotional-nav-btn-primary devotional-next-btn" type="button" data-action="devotional-next" data-date="${reading.date}" ${activeIndex === steps.length - 1 ? 'disabled' : ''}>Siguiente</button>
                </div>

                <div class="note-actions devotional-actions">
                    <button class="btn-secondary" data-action="delete-note" data-date="${reading.date}">🗑️ Borrar reflexión</button>
                </div>
            </div>
        `;
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

    getVerseImageFormat(formatKey) {
    return getVerseImageFormat(formatKey);
},

validateVerseImageState: function() {
    const safeState = validateVerseImageState({
        template: this.verseImageTemplate,
        format: this.verseImageFormat,
        textSize: this.verseImageTextSize
    });

    this.verseImageTemplate = safeState.template;
    this.verseImageFormat = safeState.format;
    this.verseImageTextSize = safeState.textSize;

    return safeState;
},

applyVerseImageFormat: function() {
    const canvas = this.$verseImageCanvas;

    if (!canvas) return;

    this.validateVerseImageState();

    const format = this.getVerseImageFormat(this.verseImageFormat);

    canvas.width = format.width;
    canvas.height = format.height;

    canvas.dataset.format = format.key;

    const previewWrap = canvas.closest('.verse-image-preview-wrap');

    if (previewWrap) {
        previewWrap.classList.remove(
            'format-post',
            'format-story',
            'format-square'
        );

        previewWrap.classList.add(`format-${format.key}`);
    }
},

    renderVerseImagePreview: function() {
    const canvas = this.$verseImageCanvas;
    if (!canvas) return null;
        
    this.applyVerseImageFormat();
        
    const ctx = canvas.getContext('2d');
    const selectedText = (this.verseImageText || this.currentSelectedText || '').replace(/\s+/g, ' ').trim();
    const reference = this.verseImageReference || this.getSelectedTextReferenceLabelSync();
    const versionLabel = this.verseImageVersionLabel || this.getSelectedTextVersionLabel();
    const sourceLabel = this.verseImageSource === 'bible'
        ? 'Pasaje bíblico'
        : 'Lectura bíblica diaria';
    this.validateVerseImageState();
    this.verseImageShowLink = true;

    const template = this.getVerseImageTemplate(this.verseImageTemplate);

    if (template.key === 'sinai') {
        const backgroundImage = this.getLoadedVerseImageBackground(template.backgroundImage);

        if (template.backgroundImage && !backgroundImage) {
            this.loadVerseImageBackground(template.backgroundImage).then((image) => {
                if (image && this.verseImageTemplate === 'sinai') {
                    this.renderVerseImagePreview();
                }
            });
        }

        try {
            this.drawVerseImageBackgroundSinai(ctx, canvas, template, backgroundImage);
        } catch (error) {
            console.warn('[Verse image] No se pudo dibujar Sinaí. Usando fondo estándar.', error);
            this.drawVerseImageBackgroundPremium(ctx, canvas, template);
        }
    } else {
        this.drawVerseImageBackgroundPremium(ctx, canvas, template);
    }

    this.drawVerseImageTextPremium(ctx, canvas, selectedText, reference, template, versionLabel, sourceLabel);

    canvas.classList.remove('is-refreshing');
    void canvas.offsetWidth;
    canvas.classList.add('is-refreshing');

    return canvas;
},

getVerseImageTemplate(templateKey) {
    return getVerseImageTemplate(templateKey);
},

getLoadedVerseImageBackground: function(src) {
    if (!src || !this._verseImageBackgroundCache) return null;

    const entry = this._verseImageBackgroundCache[src];

    return entry?.status === 'loaded' ? entry.image : null;
},

loadVerseImageBackground: function(src) {
    if (!src || typeof Image === 'undefined') {
        return Promise.resolve(null);
    }

    this._verseImageBackgroundCache = this._verseImageBackgroundCache || {};

    const cached = this._verseImageBackgroundCache[src];

    if (cached?.status === 'loaded') return Promise.resolve(cached.image);
    if (cached?.status === 'failed') return Promise.resolve(null);
    if (cached?.promise) return cached.promise;

    const promise = new Promise((resolve) => {
        const image = new Image();

        image.onload = () => {
            this._verseImageBackgroundCache[src] = {
                status: 'loaded',
                image
            };
            resolve(image);
        };

        image.onerror = () => {
            this._verseImageBackgroundCache[src] = {
                status: 'failed',
                image: null
            };
            resolve(null);
        };

        image.src = src;
    });

    this._verseImageBackgroundCache[src] = {
        status: 'loading',
        promise
    };

    return promise;
},

drawImageCover: function(ctx, image, canvas) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = canvas.width / canvas.height;
    const drawHeight = imageRatio > canvasRatio
        ? canvas.height
        : canvas.width / imageRatio;
    const drawWidth = imageRatio > canvasRatio
        ? canvas.height * imageRatio
        : canvas.width;
    const drawX = (canvas.width - drawWidth) / 2;
    const drawY = (canvas.height - drawHeight) / 2;

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
},

drawVerseImageBackgroundPremium: function(ctx, canvas, template) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, template.background[0]);
    gradient.addColorStop(0.52, template.background[1]);
    gradient.addColorStop(1, template.background[2]);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.9;

    ctx.fillStyle = template.accent;
    ctx.beginPath();
    ctx.arc(900, 230, 310, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(155, 1090, 380, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = template.border;
    ctx.lineWidth = 2;

   const frameX = 105;
const frameY = canvas.height * 0.10;
const frameW = canvas.width - 210;
const frameH = canvas.height * 0.78;

for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.06 + i * 0.018;

    this.roundRect(
        ctx,
        frameX + i * 10,
        frameY + i * 10,
        frameW - i * 20,
        frameH - i * 20,
        46
    );

    ctx.stroke();
}

    ctx.restore();

    const cardX = 88;
const cardY = canvas.height * 0.088;
const cardW = canvas.width - 176;
const cardH = canvas.height * 0.825;
const cardRadius = 52;

ctx.fillStyle = template.card;
this.roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
ctx.fill();

ctx.strokeStyle = template.border;
ctx.lineWidth = 2.5;
this.roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
ctx.stroke();

ctx.fillStyle = template.accent;
this.roundRect(
    ctx,
    cardX + 118,
    cardY + 76,
    cardW - 236,
    5,
    5
);
ctx.fill();
},

drawVerseImageBackgroundSinai: function(ctx, canvas, template, backgroundImage = null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (backgroundImage) {
        this.drawImageCover(ctx, backgroundImage, canvas);
        ctx.fillStyle = 'rgba(3,8,20,0.60)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const textShade = ctx.createLinearGradient(0, canvas.height * 0.16, 0, canvas.height * 0.84);
        textShade.addColorStop(0, 'rgba(3,8,20,0.18)');
        textShade.addColorStop(0.32, 'rgba(3,8,20,0.44)');
        textShade.addColorStop(0.62, 'rgba(3,8,20,0.40)');
        textShade.addColorStop(1, 'rgba(3,8,20,0.18)');

        ctx.fillStyle = textShade;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        const verticalGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        verticalGradient.addColorStop(0, '#030814');
        verticalGradient.addColorStop(0.34, template.background[0]);
        verticalGradient.addColorStop(0.68, template.background[1]);
        verticalGradient.addColorStop(1, template.background[2]);

        ctx.fillStyle = verticalGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const distantLight = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.28,
        canvas.width * 0.04,
        canvas.width * 0.5,
        canvas.height * 0.28,
        canvas.width * 0.72
    );
    distantLight.addColorStop(0, 'rgba(223,189,120,0.24)');
    distantLight.addColorStop(0.36, 'rgba(223,189,120,0.10)');
    distantLight.addColorStop(1, 'rgba(223,189,120,0)');

    ctx.fillStyle = distantLight;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(255,247,232,0.18)';
    ctx.lineWidth = 1;

    for (let y = canvas.height * 0.18; y < canvas.height * 0.86; y += 34) {
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.14, y);
        ctx.lineTo(canvas.width * 0.86, y + Math.sin(y * 0.018) * 8);
        ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,247,232,0.16)';

    for (let i = 0; i < 70; i++) {
        const x = ((i * 149) % 860) + 110;
        const y = ((i * 211) % Math.floor(canvas.height * 0.70)) + canvas.height * 0.12;
        const radius = i % 5 === 0 ? 1.4 : 0.75;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    const vignette = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.46,
        canvas.width * 0.18,
        canvas.width * 0.5,
        canvas.height * 0.46,
        canvas.width * 0.78
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.62, backgroundImage ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.16)');
    vignette.addColorStop(1, backgroundImage ? 'rgba(0,0,0,0.66)' : 'rgba(0,0,0,0.58)');

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frameX = 105;
    const frameY = canvas.height * 0.10;
    const frameW = canvas.width - 210;
    const frameH = canvas.height * 0.78;

    ctx.save();
    ctx.strokeStyle = 'rgba(226,191,122,0.17)';
    ctx.lineWidth = 2;

    for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.08 + i * 0.016;
        this.roundRect(
            ctx,
            frameX + i * 11,
            frameY + i * 11,
            frameW - i * 22,
            frameH - i * 22,
            46
        );
        ctx.stroke();
    }

    ctx.restore();

    const cardX = 88;
    const cardY = canvas.height * 0.088;
    const cardW = canvas.width - 176;
    const cardH = canvas.height * 0.825;
    const cardRadius = 52;

    ctx.fillStyle = 'rgba(255,250,240,0.058)';
    this.roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
    ctx.fill();

    ctx.strokeStyle = 'rgba(226,191,122,0.14)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
    ctx.stroke();

    ctx.fillStyle = 'rgba(226,191,122,0.22)';
    this.roundRect(
        ctx,
        cardX + 118,
        cardY + 76,
        cardW - 236,
        5,
        5
    );
    ctx.fill();
},

getVerseImageLayout: function(canvas) {
    const safeState = this.validateVerseImageState();
    const format = canvas.dataset.format || safeState.format;

    const layouts = {
        post: {
            headerY: 250,
            quoteY: 345,
            textCenterYShort: 585,
            textCenterYMedium: 625,
            textCenterYLong: 655,
            textMaxWidth: 620,
            textFontSize: 48,
            lineHeight: 60,
            referenceY: 930,
            subtitleY: 1005,
            dividerY: 1052,
            linkY: 1115
        },

        story: {
            headerY: 350,
            quoteY: 470,
            textCenterYShort: 820,
            textCenterYMedium: 875,
            textCenterYLong: 930,
            textMaxWidth: 680,
            textFontSize: 54,
            lineHeight: 68,
            referenceY: 1370,
            subtitleY: 1460,
            dividerY: 1515,
            linkY: 1595
        },

    square: {
    headerY: 220,
    quoteY: 315,

    textCenterYShort: 535,
    textCenterYMedium: 560,
    textCenterYLong: 545,

    textMaxWidth: 720,

    textFontSize: 48,
    lineHeight: 58,

    referenceY: 785,
    subtitleY: 840,
    dividerY: 880,
    linkY: 935
    }
    };

   const layout = { ...(layouts[format] || layouts.post) };

const textSize = safeState.textSize;

const sizeProfiles = {
    compact: {
        fontDelta: -6,
        lineDelta: -8,
        widthDelta: 70
    },

    normal: {
        fontDelta: 0,
        lineDelta: 0,
        widthDelta: 0
    },

    large: {
        fontDelta: 6,
        lineDelta: 7,
        widthDelta: -55
    }
};

const profile = sizeProfiles[textSize] || sizeProfiles.normal;

layout.textFontSize += profile.fontDelta;
layout.lineHeight += profile.lineDelta;
layout.textMaxWidth += profile.widthDelta;

return layout;
},

drawVerseImageTextPremium: function(ctx, canvas, text, reference, template, versionLabel = '', sourceLabel = 'Lectura bíblica diaria') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const layout = this.getVerseImageLayout(canvas);
    const isSinaiTemplate = template.key === 'sinai';
    const headerFont = isSinaiTemplate
        ? '600 26px "Cormorant Garamond", Georgia, serif'
        : '500 26px Inter, Arial, sans-serif';
    const quoteFont = isSinaiTemplate
        ? '96px "Cormorant Garamond", Georgia, serif'
        : '96px Merriweather, Georgia, serif';
    const verseFont = isSinaiTemplate
        ? `600 ${layout.textFontSize}px "Cormorant Garamond", Georgia, serif`
        : `500 ${layout.textFontSize}px "Cormorant Garamond", serif`;
    const referenceFont = isSinaiTemplate
        ? '600 34px "Cormorant Garamond", Georgia, serif'
        : '600 34px Inter, Arial, sans-serif';
    const subtitleFont = isSinaiTemplate
        ? '500 24px "Cormorant Garamond", Georgia, serif'
        : '500 24px Inter, Arial, sans-serif';
    const linkFont = isSinaiTemplate
        ? '500 20px "Cormorant Garamond", Georgia, serif'
        : '500 20px Inter, Arial, sans-serif';
    ctx.shadowColor = isSinaiTemplate ? 'rgba(0,0,0,0.38)' : 'transparent';
    ctx.shadowBlur = isSinaiTemplate ? 7 : 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = isSinaiTemplate ? 2 : 0;

    ctx.fillStyle = template.muted;
    ctx.font = headerFont;
    ctx.fillText('SU VOZ A DIARIO', canvas.width / 2, layout.headerY);

    ctx.fillStyle = template.accent;
    ctx.font = quoteFont;
    ctx.fillText('“', canvas.width / 2, layout.quoteY);

   ctx.fillStyle = template.quote;

/* Tipografía mucho más elegante */
ctx.font = verseFont;

const cleanText = text.length > 430
    ? `${text.slice(0, 430).trim()}…`
    : text;

/* Más aire visual */
const lines = this.getCanvasTextLines(ctx, cleanText, layout.textMaxWidth);

const maxLines = 11;

const finalLines = lines.length > maxLines
    ? [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`]
    : lines;

/* Interlineado editorial */
const lineHeight = isSinaiTemplate
    ? layout.lineHeight + 4
    : layout.lineHeight;

const totalHeight = finalLines.length * lineHeight;

/* Ajuste dinámico según cantidad de líneas */
let centerY = layout.textCenterYShort;

if (finalLines.length >= 7) {
    centerY = layout.textCenterYMedium;
}

if (finalLines.length >= 9) {
    centerY = layout.textCenterYLong;
}

const startY = centerY - totalHeight / 2;

finalLines.forEach((line, index) => {
    ctx.fillText(
        line,
        canvas.width / 2,
        startY + index * lineHeight
    );
});

    ctx.fillStyle = template.reference;
    ctx.font = referenceFont;
    const referenceWithVersion = versionLabel
        ? `${reference} · ${versionLabel}`
        : reference;

    ctx.fillText(referenceWithVersion, canvas.width / 2, layout.referenceY);
    
    ctx.fillStyle = template.muted;
    ctx.font = subtitleFont;
    ctx.fillText(sourceLabel, canvas.width / 2, layout.subtitleY);
    
   if (this.verseImageShowLink) {
    if (isSinaiTemplate) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
    }

    ctx.fillStyle = template.border;
    this.roundRect(ctx, 360, layout.dividerY, 360, 2, 2);
    ctx.fill();

    if (isSinaiTemplate) {
        ctx.shadowColor = 'rgba(0,0,0,0.32)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 1;
    }

    ctx.fillStyle = template.muted;
    ctx.font = linkFont;
    ctx.fillText(
        'suvoz.app',
        canvas.width / 2,
        layout.linkY
    );
}

ctx.shadowColor = 'transparent';
ctx.shadowBlur = 0;
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 0;
},

    openVerseImageEditor: async function() {
    if (!this.$verseImagePanel || !this.$verseImageCanvas) {
        this.showToast('El editor de imagen no está disponible');
        return;
    }

const selectedText = (this.currentSelectedText || '').replace(/\s+/g, ' ').trim();

if (!selectedText) {
    this.showToast('Selecciona un texto primero');
    return;
}

	this.verseImageText = selectedText;
	this.verseImageReference = await this.getSelectedTextReferenceLabel();
this.verseImageVersionLabel = this.getSelectedTextVersionLabel();
this.verseImageSource = this.getSelectedTextSource();

this.hideSelectionPanel();

setTimeout(() => {
    this.validateVerseImageState();

    this.$verseTemplateButtons.forEach(button => {
        button.classList.toggle(
            'is-active',
            button.dataset.template === this.verseImageTemplate
        );
    });

    this.renderVerseImagePreview();

    this.$verseImagePanel.classList.add('visible');
    this.$verseImagePanel.setAttribute('aria-hidden', 'false');

    document.body.classList.add('verse-image-open');
}, 180);

return;
},

closeVerseImageEditor: function() {
    if (!this.$verseImagePanel) return;

    this.$verseImagePanel.classList.remove('visible');
    this.$verseImagePanel.setAttribute('aria-hidden', 'true');

    document.body.classList.remove('verse-image-open');
},

getVerseImageBlob: function() {
    return new Promise((resolve) => {
        const canvas = this.renderVerseImagePreview();

        if (!canvas) {
            resolve(null);
            return;
        }

        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/png', 0.95);
    });
},

blobToBase64: function(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = String(reader.result || '');
            const separatorIndex = result.indexOf(',');

            if (separatorIndex < 0) {
                reject(new Error('No se pudo codificar la imagen'));
                return;
            }

            resolve(result.slice(separatorIndex + 1));
        };
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(blob);
    });
},

shareImageBlobNative: async function(blob, fileName, title, text) {
    const Filesystem = this.getCapacitorPlugin('Filesystem');
    const Share = this.getCapacitorPlugin('Share');

    if (!Filesystem?.writeFile || !Filesystem?.getUri || !Share?.share) {
        throw new Error('Los plugins nativos para compartir imágenes no están disponibles');
    }

    const base64Data = await this.blobToBase64(blob);
    const path = `shared-images/${Date.now()}-${fileName}`;

    await Filesystem.writeFile({
        path,
        data: base64Data,
        directory: 'CACHE',
        recursive: true
    });

    const { uri } = await Filesystem.getUri({
        path,
        directory: 'CACHE'
    });

    if (!uri) {
        throw new Error('No se obtuvo la ruta temporal de la imagen');
    }

    await Share.share({
        title,
        text,
        files: [uri],
        dialogTitle: 'Compartir imagen'
    });
},

saveImageBlobNative: async function(blob, fileName) {
    const ImageSaver = this.getCapacitorPlugin('ImageSaver');

    if (!ImageSaver?.saveImage) {
        throw new Error('El guardado nativo de imágenes no está disponible');
    }

    const base64Data = await this.blobToBase64(blob);
    const result = await ImageSaver.saveImage({
        data: base64Data,
        fileName,
        mimeType: 'image/png',
        album: 'Su Voz a Diario'
    });

    if (!result?.uri) {
        throw new Error('Android no confirmó el guardado de la imagen');
    }

    return result;
},

shareImageBlobWeb: async function(blob, fileName, title, text) {
    const file = new File([blob], fileName, { type: 'image/png' });

    if (!navigator.share ||
        !navigator.canShare ||
        !navigator.canShare({ files: [file] })) {
        return false;
    }

    await navigator.share({
        title,
        text,
        files: [file]
    });

    return true;
},

isSecureFileShareContext: function() {
    const hostname = String(window.location.hostname || '').toLowerCase();
    const isLocalhost = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1';

    return window.isSecureContext ||
        window.location.protocol === 'https:' ||
        isLocalhost;
},

downloadImageBlobWeb: function(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
},

restoreImageEditorInteractionState: function() {
    const panelIsVisible = this.$verseImagePanel?.classList.contains('visible');
    const sheet = this.$verseImagePanel?.querySelector('.verse-image-sheet');

    this.$selectionPanel?.classList.remove('visible', 'note-mode', 'note-view-mode');
    document.body.classList.remove('selection-panel-open', 'keyboard-open');

    if (document.body.style.overflow === 'hidden') {
        document.body.style.removeProperty('overflow');
    }

    if (document.documentElement.style.overflow === 'hidden') {
        document.documentElement.style.removeProperty('overflow');
    }

    if (this.$verseImagePanel) {
        this.$verseImagePanel.style.removeProperty('pointer-events');
    }

    if (sheet) {
        sheet.style.removeProperty('pointer-events');
        sheet.style.removeProperty('overflow-y');
    }

    if (panelIsVisible) {
        this.$verseImagePanel.setAttribute('aria-hidden', 'false');
        document.body.classList.add('verse-image-open');
        return;
    }

    document.body.classList.remove('verse-image-open');
},

downloadVerseImage: async function() {
    const blob = await this.getVerseImageBlob();

    if (!blob) {
        this.showToast('No se pudo crear la imagen');
        return;
    }

    const reference = this.verseImageReference || await this.getSelectedTextReferenceLabel();
    const safeReference = reference
        .replace(/[^\wáéíóúÁÉÍÓÚñÑ-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();

    const fileName = safeReference
        ? `su-voz-${safeReference}.png`
        : 'su-voz-a-diario.png';

    try {
        if (this.isCapacitorAndroid()) {
            await this.saveImageBlobNative(blob, fileName);
            this.showToast('Imagen guardada en Galería');
            return;
        }

        if (isIOSDevice()) {
            if (!this.isSecureFileShareContext()) {
                this.showToast(
                    'En iPhone, la descarga directa desde navegador puede estar limitada. Prueba desde suvoz.app o usa Compartir para guardar la imagen.',
                    6000
                );
                return;
            }

            const shared = await this.shareImageBlobWeb(
                blob,
                fileName,
                reference,
                'Guarda esta imagen en Fotos desde el menú Compartir'
            );

            if (!shared) {
                this.showToast(
                    'En iPhone, la descarga directa desde navegador puede estar limitada. Prueba desde suvoz.app o usa Compartir para guardar la imagen.',
                    6000
                );
                return;
            }

            this.showToast('Si elegiste “Guardar imagen”, la imagen ya quedó guardada en Fotos.', 4500);
            return;
        }

        this.downloadImageBlobWeb(blob, fileName);
        this.showToast('Imagen descargada');
    } catch (error) {
        if (error?.name === 'AbortError') {
            console.log('[Verse Image] Guardado cancelado por el usuario');
            return;
        }

        if (isIOSDevice()) {
            console.warn('[Verse Image] No se pudo abrir el guardado de iOS:', error);
            this.showToast(
                'En iPhone, la descarga directa desde navegador puede estar limitada. Prueba desde suvoz.app o usa Compartir para guardar la imagen.',
                6000
            );
            return;
        }

        console.error('[Verse Image] Error guardando:', error);
        this.showToast('No se pudo guardar la imagen');
    } finally {
        this.restoreImageEditorInteractionState();
    }
},

shareVerseImageFromEditor: async function() {
    const blob = await this.getVerseImageBlob();

    if (!blob) {
        this.showToast('No se pudo crear la imagen');
        return;
    }

    const reference = this.verseImageReference || await this.getSelectedTextReferenceLabel();
    const fileName = 'su-voz-a-diario.png';

    try {
        if (this.isCapacitorAndroid()) {
            await this.shareImageBlobNative(
                blob,
                fileName,
                reference,
                `${reference} · https://suvoz.app`
            );

            this.closeVerseImageEditor();
            this.hideSelectionPanel();
            window.getSelection()?.removeAllRanges();
            return;
        }

        if (isIOSDevice() && !this.isSecureFileShareContext()) {
            this.showToast(
                'Para compartir archivos desde iPhone, prueba desde la versión publicada en HTTPS.',
                5500
            );
            return;
        }

        const shared = await this.shareImageBlobWeb(
            blob,
            fileName,
            reference,
            `${reference} · https://suvoz.app`
        );

        if (!shared) {
            const message = isIOSDevice()
                ? 'Para compartir archivos desde iPhone, prueba desde la versión publicada en HTTPS.'
                : 'Tu navegador no permite compartir archivos';

            this.showToast(message, 5500);
            return;
        }

        this.showToast('Imagen compartida');
    } catch (error) {
        if (error?.name === 'AbortError') {
            console.log('[Verse Image] Compartir cancelado por el usuario');
            return;
        }

        console.error('[Verse Image] Error compartiendo:', error);
        this.showToast('No se pudo compartir la imagen');
    } finally {
        this.restoreImageEditorInteractionState();
    }
},

    shareSelectedTextAsImage: async function() {
    const selectedText = (this.currentSelectedText || '').replace(/\s+/g, ' ').trim();

    if (!selectedText) {
        this.showToast('Selecciona un texto primero');
        return;
    }

    const reference = await this.getSelectedTextReferenceLabel();
    const versionLabel = this.getSelectedTextVersionLabel();

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;

    const ctx = canvas.getContext('2d');

    this.drawVerseImageBackground(ctx, canvas);
    this.drawVerseImageContent(ctx, canvas, selectedText, reference, versionLabel);

    canvas.toBlob(async (blob) => {
        if (!blob) {
            this.showToast('No se pudo crear la imagen');
            return;
        }

        try {
            const fileName = 'su-voz-a-diario.png';

            if (this.isCapacitorAndroid()) {
                await this.shareImageBlobNative(blob, fileName, reference, reference);
            } else {
                const shared = await this.shareImageBlobWeb(
                    blob,
                    fileName,
                    reference,
                    reference
                );

                if (!shared) {
                    this.showToast('Tu navegador no permite compartir archivos');
                    return;
                }
            }

            this.hideSelectionPanel();
            window.getSelection()?.removeAllRanges();
        } catch (error) {
            if (error?.name === 'AbortError') {
                console.log('[Share Image] Compartir cancelado por el usuario');
                return;
            }

            console.error('[Share Image] Error:', error);
            this.showToast('No se pudo compartir la imagen');
        }
    }, 'image/png', 0.95);
},

getSelectedTextReferenceLabelSync: function() {
    if (this.getSelectedTextSource() === 'bible') {
        return this.getBibleSelectionReferenceLabel();
    }

    const dateStr = this.currentSelectionDate || this.homeViewingDate || this.getTodayDateStr();
    const reading = this.data.find(item => item.date === dateStr);

    if (reading?.reference) {
        return reading.reference;
    }

    return 'Su voz a diario';
},

getSelectedTextReferenceLabel: async function() {
    if (this.getSelectedTextSource() === 'bible') {
        return this.getBibleSelectionReferenceLabel();
    }

    const dateStr = this.currentSelectionDate || this.homeViewingDate || this.getTodayDateStr();
    const reading = await this.getReadingByDate(dateStr);

    if (reading?.reference) {
        return reading.reference;
    }

    return this.getSelectedTextReferenceLabelSync();
},

getSelectedTextSource: function() {
    const dateStr = this.currentSelectionDate || '';

    return dateStr.startsWith('bible-') ? 'bible' : 'home';
},

getSelectedTextVersionLabel: function() {
    if (this.getSelectedTextSource() === 'bible') {
        return this.currentBibleChapterData?.versionLabel ||
            this.getBibleVersionLabel(this.currentBibleVersion);
    }

    return this.getBibleVersionLabel(this.currentVersion);
},

buildVerseCopyText: function({ text, book, chapter, verse, version } = {}) {
    const cleanText = String(text || '').trim();
    const cleanBook = String(book || '').trim();
    const cleanChapter = String(chapter || '').trim();
    const cleanVerse = String(verse || '').trim();
    const cleanVersion = String(version || '').trim();
    const reference = [
        cleanBook,
        cleanChapter && cleanVerse ? `${cleanChapter}:${cleanVerse}` : cleanChapter
    ]
        .filter(Boolean)
        .join(' ');

    if (reference && cleanVersion) {
        return `${cleanText}\n\n${reference} — ${cleanVersion}`;
    }

    if (reference) {
        return `${cleanText}\n\n${reference}`;
    }

    if (cleanVersion) {
        return `${cleanText}\n\n${cleanVersion}`;
    }

    return cleanText;
},

getSelectedVerseCopyData: async function() {
    const verseItem = this.currentSelectedVerse;
    const text = (
        verseItem?.getAttribute('data-verse-text') ||
        verseItem?.querySelector('.verse-text-content, .verse-text')?.textContent ||
        this.currentSelectedText ||
        ''
    )
        .replace(/\s+/g, ' ')
        .trim();
    const verse = String(verseItem?.getAttribute('data-verse-number') || '').trim();
    const version = this.getSelectedTextVersionLabel() || 'Biblia';

    if (this.getSelectedTextSource() === 'bible') {
        const readingKey = parseBibleReadingKey(this.currentSelectionDate);
        const bookId = readingKey?.bookId || '';
        const book = this.bibleBooks.find(item => item.id === bookId);

        return {
            text,
            book: book?.name || bookId || 'Biblia',
            chapter: readingKey?.chapter || '',
            verse,
            version: version || 'RV1909'
        };
    }

    const dateStr = this.currentSelectionDate || this.homeViewingDate || this.getTodayDateStr();
    const reading = await this.getReadingByDate(dateStr);
    const referenceMatch = String(reading?.reference || '').match(/^(.+?)\s+(\d+):/);
    let chapter = referenceMatch?.[2] || '';

    if (chapter && verseItem && this.activeSelectionSurface) {
        let currentChapter = Number(chapter);
        let previousVerse = null;
        const verseItems = Array.from(
            this.activeSelectionSurface.querySelectorAll('.verse-selectable')
        );

        for (const item of verseItems) {
            const itemVerse = Number(item.getAttribute('data-verse-number'));

            if (Number.isFinite(itemVerse)) {
                if (previousVerse !== null && itemVerse <= previousVerse) {
                    currentChapter += 1;
                }

                previousVerse = itemVerse;
            }

            if (item === verseItem) {
                chapter = String(currentChapter);
                break;
            }
        }
    }

    return {
        text,
        book: referenceMatch?.[1] || '',
        chapter,
        verse,
        version: version || 'Biblia'
    };
},

copyTextToClipboard: async function(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            console.warn('[Clipboard] Se usará el método alternativo:', error);
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    try {
        textarea.select();

        if (!document.execCommand('copy')) {
            throw new Error('No se pudo copiar el texto');
        }
    } finally {
        textarea.remove();
    }
},

getBibleVersionLabel: function(versionKey) {
    const normalized = String(versionKey || '').trim().toLowerCase();
    const labels = {
        rvr60: 'RVR60',
        ntv: 'NTV',
        rv1909: 'Reina-Valera 1909',
        nbla: 'NBLA',
        nvi: 'NVI',
        'biblia-libre': 'Biblia Libre'
    };

    return labels[normalized] || String(versionKey || '').trim().toUpperCase();
},

getBibleSelectionReferenceLabel: function() {
    const dateStr = this.currentSelectionDate || '';
    const readingKey = parseBibleReadingKey(dateStr);

    if (!readingKey) {
        return 'Biblia';
    }

    const { bookId, chapter } = readingKey;
    const book = this.bibleBooks.find(item => item.id === bookId);
    const bookName = book?.name || bookId;
    const selectedVerses = Array.from(
        this.activeSelectionSurface?.querySelectorAll('.verse-selected') || []
    )
        .map(item => Number(item.getAttribute('data-verse-number')))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    const verseNumber = Number(this.currentSelectedVerse?.getAttribute('data-verse-number'));

    if (!selectedVerses.length && Number.isFinite(verseNumber)) {
        selectedVerses.push(verseNumber);
    }

    if (!selectedVerses.length) {
        return `${bookName} ${chapter}`;
    }

    const firstVerse = selectedVerses[0];
    const lastVerse = selectedVerses[selectedVerses.length - 1];
    const verseLabel = firstVerse === lastVerse
        ? String(firstVerse)
        : `${firstVerse}-${lastVerse}`;

    return `${bookName} ${chapter}:${verseLabel}`;
},

cleanStrongVerseText: function(text) {
    return String(text || '')
        .replace(/^\s*\d+\s+/, ' ')
        .replace(/[.,;:!?¡¿()[\]{}"“”'‘’`´…]/g, ' ')
        .replace(/[—–-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
},

normalizeStrongVerseWord: function(word) {
    return String(word || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
},

extractStrongVerseKeywords: function(text) {
    const stopWords = new Set([
        'a', 'al', 'ante', 'aquel', 'aquella', 'aquellas', 'aquellos', 'asi', 'aun', 'cada', 'como', 'con', 'contra',
        'cual', 'cuando', 'de', 'del', 'desde', 'donde', 'e', 'el', 'ella',
        'ellas', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'esas', 'ese',
        'esos', 'esta', 'estas', 'este', 'estos', 'fue', 'ha', 'han', 'hasta',
        'hay', 'la', 'las', 'lo', 'los', 'manera', 'mas', 'me', 'mi', 'mis', 'ni', 'no',
        'o', 'os', 'para', 'pero', 'por', 'porque', 'que', 'se', 'ser', 'si', 'sin',
        'sobre', 'su', 'sus', 'tal', 'te', 'todo', 'tu', 'tus', 'un', 'una',
        'unas', 'uno', 'unos', 'y', 'ya'
    ]);

    const seen = new Set();

    return this.cleanStrongVerseText(text)
        .split(/\s+/)
        .map(word => word.trim())
        .filter(Boolean)
        .filter(word => {
            const normalized = this.normalizeStrongVerseWord(word);

            if (!normalized || normalized.length < 3 || stopWords.has(normalized) || seen.has(normalized)) {
                return false;
            }

            seen.add(normalized);
            return true;
        })
        .slice(0, 16);
},

openStrongDictionaryFromSelectedVerse: function() {
    // Conservado para una futura Biblia de Estudio Strong con datos palabra a Strong.
    if (this.getSelectedTextSource() !== 'bible') {
        this.showToast('Strong está disponible desde los versículos de Biblia');
        return;
    }

    const verseText = this.currentSelectedText || '';
    const reference = this.getBibleSelectionReferenceLabel();
    const keywords = this.extractStrongVerseKeywords(verseText);
    const readingKey = parseBibleReadingKey(this.currentSelectionDate);
    const bookId = readingKey?.bookId || '';
    const chapter = readingKey?.chapter || '';
    const verse = Number(this.currentSelectedVerse?.getAttribute('data-verse-number')) || '';

    if (!verseText.trim()) {
        this.showToast('No se encontró texto del versículo');
        return;
    }

    this.hideSelectionPanel();
    window.getSelection()?.removeAllRanges();

    this.openStrongDictionaryFromBible({
        source: 'bible-verse',
        reference,
        verseText,
        keywords,
        bookId,
        chapter,
        verse,
        query: keywords.length === 1 ? keywords[0] : ''
    });
},

drawVerseImageBackground: function(ctx, canvas) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);

    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.48, '#2b2118');
    gradient.addColorStop(1, '#111827');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.beginPath();
    ctx.arc(880, 210, 260, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(214,181,109,0.13)';
    ctx.beginPath();
    ctx.arc(170, 1120, 340, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    this.roundRect(ctx, 74, 108, 932, 1134, 42);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 74, 108, 932, 1134, 42);
    ctx.stroke();
},

drawVerseImageContent: function(ctx, canvas, text, reference, versionLabel = '') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(248,243,234,0.96)';
    ctx.font = '54px Merriweather, Georgia, serif';

    const lines = this.getCanvasTextLines(ctx, `“${text}”`, 790);
    const maxLines = 9;
    const finalLines = lines.length > maxLines
        ? [...lines.slice(0, maxLines - 1), lines[maxLines - 1] + '…']
        : lines;

    const lineHeight = 74;
    const totalHeight = finalLines.length * lineHeight;
    let startY = 620 - totalHeight / 2;

    finalLines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, startY + index * lineHeight);
    });

    ctx.fillStyle = '#d6b56d';
    ctx.font = '700 38px Inter, Arial, sans-serif';
    const referenceWithVersion = versionLabel
        ? `${reference} · ${versionLabel}`
        : reference;

    ctx.fillText(referenceWithVersion, canvas.width / 2, 1035);

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '500 30px Inter, Arial, sans-serif';
    ctx.fillText('Su voz a diario', canvas.width / 2, 1138);

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '24px Inter, Arial, sans-serif';
    ctx.fillText('Lectura bíblica diaria', canvas.width / 2, 1182);
},

getCanvasTextLines: function(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;

        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines;
},

roundRect: function(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
},
    
   exportReflectionPDF: async function(dateStr) {
    const reading = await this.getReadingByDate(dateStr);
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

// ✅ APLICAR COLORES DE RESALTADO GUARDADOS
const highlights = this.getHighlights(dateStr);
const normalizeText = str => (str || '').replace(/\s+/g, ' ').trim().toLowerCase();

highlights.forEach(hl => {
    const hlTextNormalized = normalizeText(hl.text);
    
    for (const verseItem of verseItems) {
        const verseFull = normalizeText(
            verseItem.getAttribute('data-verse-full') ||
            verseItem.getAttribute('data-verse-text') ||
            verseItem.textContent || ''
        );
        
        if (verseFull === hlTextNormalized) {
            verseItem.classList.add(`highlight-${hl.color}`);
            break; // un versículo solo puede tener un color activo
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
            ? `Resaltado ${this.getHighlightColorLabel(color)} eliminado`
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
        this.$selectionPanel.classList.remove('note-view-mode');
    }
    
    if (this.$selectionSheet) {
        this.$selectionSheet.style.bottom = '0px';
        this.$selectionSheet.style.maxHeight = '';
    }
    
    document.body.classList.remove('selection-panel-open');
    document.body.classList.remove('keyboard-open');
    
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

openSelectionNoteViewer: function(verseItem) {
    if (!verseItem || !this.$selectionPanel) return;

    // Obtener la fecha correcta desde el shell más cercano
    const surface = verseItem.closest('.selection-surface');
    const shell = surface ? surface.closest('.reading-text-shell') : null;
    const dateStr = shell ? shell.getAttribute('data-reading-date') : null;

    if (!dateStr) {
        this.showToast('No se pudo determinar la fecha de la lectura');
        return;
    }

    const textEl = verseItem.querySelector('.verse-text-content');
    const selectedText = (
        verseItem.getAttribute('data-verse-full') ||
        verseItem.getAttribute('data-verse-text') ||
        textEl?.textContent ||
        verseItem.textContent ||
        ''
    )
        .replace('📝', '')
        .replace(/\s+/g, ' ')
        .trim();

    const noteEntry = this.getSelectionNoteByText(dateStr, selectedText);

    if (!noteEntry) {
        this.showToast('No se encontró la nota');
        return;
    }

    this.clearVerseSelection();
    verseItem.classList.add('verse-selected');

    this.currentSelectedVerse = verseItem;
    this.currentSelectedText = selectedText;
    this.currentSelectionDate = dateStr;
    this.selectionPanelLocked = true;
    this._savedScrollY = window.scrollY;

    this.renderSelectionNoteViewer(noteEntry);

    const notePanel = document.getElementById('noteViewPanel');
    if (notePanel) {
        notePanel.classList.add('visible');
    }

    document.body.classList.add('selection-panel-open');

    if ('vibrate' in navigator) {
        navigator.vibrate(8);
    }
},

renderSelectionNoteViewer: function(noteEntry) {
    const quoted = document.getElementById('selectionNoteQuoted');
    const body = document.getElementById('selectionNoteBody');

    if (quoted) quoted.textContent = noteEntry.text || '';
    if (body) body.textContent = noteEntry.note || '';

    if (this.$selectionNote) {
        this.$selectionNote.value = noteEntry.note || '';
    }
},

deleteSelectionNoteFromViewer: function() {
    const dateStr = this.currentSelectionDate;
    const selectedText = this.currentSelectedText;

    if (!dateStr || !selectedText) {
        this.showToast('No hay nota activa');
        return;
    }

    const deleted = this.deleteSelectionNoteEntry(dateStr, selectedText);

    if (!deleted) {
        this.showToast('No se pudo quitar la nota');
        return;
    }

    this.showToast('Nota eliminada');

    this.hideSelectionPanel();
    window.getSelection()?.removeAllRanges();

    this.rerenderCurrentReadingView(dateStr, true);
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

bindVerseImageEditorEvents: function() {
    if (this._verseImageEditorEventsBound) return;

    document.addEventListener('click', async (e) => {
        const closeBtn = e.target.closest('[data-action="close-verse-image-panel"]');

        if (closeBtn) {
            e.preventDefault();
            this.closeVerseImageEditor();
            return;
        }

        const templateBtn = e.target.closest('.verse-template-btn');

        if (templateBtn) {
            e.preventDefault();

            this.verseImageTemplate = templateBtn.dataset.template || 'midnight';
            this.validateVerseImageState();

            this.$verseTemplateButtons.forEach(button => {
                button.classList.toggle(
                    'is-active',
                    button.dataset.template === this.verseImageTemplate
                );
            });

            this.renderVerseImagePreview();
            return;
        }

        const formatBtn = e.target.closest('.verse-format-btn');

if (formatBtn) {
    e.preventDefault();

    this.verseImageFormat = formatBtn.dataset.format || 'post';
    this.validateVerseImageState();

    this.$verseFormatButtons.forEach(button => {
        button.classList.toggle(
            'is-active',
            button.dataset.format === this.verseImageFormat
        );
    });

    this.applyVerseImageFormat();
    this.renderVerseImagePreview();
    return;
    }

    const textSizeBtn = e.target.closest('.verse-text-size-btn');

if (textSizeBtn) {
    e.preventDefault();

    this.verseImageTextSize = textSizeBtn.dataset.textSize || 'normal';
    this.validateVerseImageState();

    this.$verseTextSizeButtons.forEach(button => {
        button.classList.toggle(
            'is-active',
            button.dataset.textSize === this.verseImageTextSize
        );
    });

    this.renderVerseImagePreview();
    return;
    }

    });

    this.$verseImageDownloadBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.downloadVerseImage();
    });

    this.$verseImageShareBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.shareVerseImageFromEditor();
    });

    this._verseImageEditorEventsBound = true;
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
                const copyData = await this.getSelectedVerseCopyData();
                const copyText = this.buildVerseCopyText(copyData);

                await this.copyTextToClipboard(copyText);
                this.showToast('Texto copiado');
            } catch (error) {
                this.showToast('No se pudo copiar');
            }

            this.hideSelectionPanel();
            window.getSelection()?.removeAllRanges();
        });
    }

if (this.$selectionShareImageBtn) {
    this.$selectionShareImageBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!this.currentSelectedText || !this.currentSelectedText.trim()) {
            this.showToast('Selecciona un texto primero');
            return;
        }

        await this.openVerseImageEditor();
    });
}

    if (this.$selectionStrongBtn) {
        this.$selectionStrongBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.openStrongDictionaryFromSelectedVerse();
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
        document.body.classList.add('keyboard-open');
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
                document.body.classList.remove('keyboard-open');
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

document.addEventListener('click', (e) => {
    const noteIcon = e.target.closest('.verse-note-icon');
    if (!noteIcon) return;

    e.preventDefault();
    e.stopPropagation();

    const verseItem = noteIcon.closest('.verse-item');

    this.openSelectionNoteViewer(verseItem);
}, true);

const editSelectionNoteBtn = document.getElementById('editSelectionNoteBtn');
if (editSelectionNoteBtn) {
    editSelectionNoteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const notePanel = document.getElementById('noteViewPanel');

        notePanel?.classList.remove('visible');

        if (this.$selectionPanel) {
            this.$selectionPanel.classList.add('visible');
            this.$selectionPanel.classList.add('note-mode');
            this.$selectionPanel.classList.remove('note-view-mode');
        }

        document.body.classList.add('selection-panel-open');

        this.selectionPanelLocked = true;

        if (this.$selectionNote) {
            const existingNote = this.getSelectionNoteByText(
                this.currentSelectionDate,
                this.currentSelectedText
            );

            this.$selectionNote.value = existingNote?.note || '';
        }

        this.positionSelectionSheet();

        setTimeout(() => {
            this.$selectionNote?.focus();
        }, 180);
    });
}

const deleteSelectionNoteBtn = document.getElementById('deleteSelectionNoteBtn');
if (deleteSelectionNoteBtn) {
    deleteSelectionNoteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const notePanel = document.getElementById('noteViewPanel');

    this.deleteSelectionNoteFromViewer();

    // Cierra panel visual
    notePanel?.classList.remove('visible');

    document.body.classList.remove('selection-panel-open');
});
}

// ========================================
// CIERRE PANEL DE NOTA (NUEVO)
// ========================================

const noteViewPanel = document.getElementById('noteViewPanel');
const closeNoteViewPanel = document.getElementById('closeNoteViewPanel');
const noteBackdrop = noteViewPanel?.querySelector('.note-view-backdrop');

const closeNoteViewer = () => {
    if (noteViewPanel) {
        noteViewPanel.classList.remove('visible');
    }

    document.body.classList.remove('selection-panel-open');

    this.clearVerseSelection();
};

// Botón X
closeNoteViewPanel?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeNoteViewerWithAnimation();
});

// Tap fuera (fondo oscuro)
noteBackdrop?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeNoteViewerWithAnimation();
});

// ========================================
// SWIPE PARA CERRAR PANEL DE NOTA
// ========================================

const noteViewSheet = noteViewPanel?.querySelector('.note-view-sheet');

let noteStartY = 0;
let noteCurrentY = 0;
let noteDragging = false;

const closeNoteViewerWithAnimation = () => {
    if (!noteViewPanel || !noteViewSheet) return;

    noteViewSheet.style.transition = 'transform 0.24s cubic-bezier(0.32, 0.72, 0, 1)';
    noteViewSheet.style.transform = 'translateY(100%)';

    setTimeout(() => {
        noteViewPanel.classList.remove('visible');
        noteViewSheet.style.transition = '';
        noteViewSheet.style.transform = '';
        document.body.classList.remove('selection-panel-open');
        this.clearVerseSelection();
    }, 240);
};

noteViewSheet?.addEventListener('touchstart', (e) => {
    noteStartY = e.touches[0].clientY;
    noteCurrentY = noteStartY;
    noteDragging = true;

    noteViewSheet.style.transition = 'none';
}, { passive: true });

noteViewSheet?.addEventListener('touchmove', (e) => {
    if (!noteDragging) return;

    noteCurrentY = e.touches[0].clientY;
    const diff = Math.max(0, noteCurrentY - noteStartY);

    noteViewSheet.style.transform = `translateY(${diff}px)`;
}, { passive: true });

noteViewSheet?.addEventListener('touchend', () => {
    if (!noteDragging) return;

    const diff = Math.max(0, noteCurrentY - noteStartY);
    noteDragging = false;

    if (diff > 90) {
        closeNoteViewerWithAnimation();
        return;
    }

    noteViewSheet.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';
    noteViewSheet.style.transform = 'translateY(0)';

    setTimeout(() => {
        noteViewSheet.style.transition = '';
    }, 280);
});
    
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

renderViewHeader: function(title, subtitle = '', meta = '') {
    return `
        <section class="view-hero">
            ${meta ? `<div class="view-hero-meta">${this.escapeHtml(meta)}</div>` : ''}
            <div class="view-hero-kicker">Su Voz a Diario</div>
            <h2>${this.escapeHtml(title)}</h2>
            ${subtitle ? `<p>${this.escapeHtml(subtitle)}</p>` : ''}
        </section>
    `;
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

            try {
                await this.loadReadingIndex();
            } catch (indexError) {
                console.warn('[Readings] No se pudo cargar el índice liviano. Se usará readings.json como fallback.', indexError);
            }
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

    loadReadingIndex: async function() {
        if (this.readingIndexLoaded) {
            return this.readingIndex;
        }

        if (this.readingIndexLoadPromise) {
            return this.readingIndexLoadPromise;
        }

        this.readingIndexLoadPromise = fetch('data/readings/index.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error al cargar índice de lecturas: ${response.status}`);
                }

                return response.json();
            })
            .then(index => {
                if (!Array.isArray(index)) {
                    throw new Error('El índice de lecturas no es un arreglo');
                }

                this.readingIndex = index;
                this.readingIndexLoaded = true;
                return this.readingIndex;
            })
            .finally(() => {
                this.readingIndexLoadPromise = null;
            });

        return this.readingIndexLoadPromise;
    },

    loadMonthlyReadings: async function(month, file) {
        const monthKey = String(month || '').trim();
        const filePath = String(file || `data/readings/${monthKey}.json`).trim();

        if (!monthKey || !filePath) {
            throw new Error('Mes o archivo mensual inválido');
        }

        if (this.monthlyReadingsCache[monthKey]) {
            return this.monthlyReadingsCache[monthKey];
        }

        if (this.monthlyReadingsLoadPromises[monthKey]) {
            return this.monthlyReadingsLoadPromises[monthKey];
        }

        this.monthlyReadingsLoadPromises[monthKey] = fetch(filePath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error al cargar lecturas de ${monthKey}: ${response.status}`);
                }

                return response.json();
            })
            .then(readings => {
                if (!Array.isArray(readings)) {
                    throw new Error(`El archivo mensual ${filePath} no es un arreglo`);
                }

                this.monthlyReadingsCache[monthKey] = readings;
                return readings;
            })
            .finally(() => {
                delete this.monthlyReadingsLoadPromises[monthKey];
            });

        return this.monthlyReadingsLoadPromises[monthKey];
    },

    getReadingByDate: async function(dateStr) {
        const targetDate = String(dateStr || '').trim();

        if (!targetDate) return null;

        try {
            const index = await this.loadReadingIndex();
            const indexEntry = index.find(item => item.date === targetDate);

            if (indexEntry) {
                const monthlyReadings = await this.loadMonthlyReadings(indexEntry.month, indexEntry.file);
                const reading = monthlyReadings.find(item => item.date === targetDate);

                if (reading) return reading;

                console.warn('[Readings] La lectura no existe dentro del archivo mensual:', targetDate, indexEntry.file);
            }
        } catch (error) {
            console.warn('[Readings] Falló la carga mensual. Se usará readings.json como fallback.', error);
        }

        return this.data.find(item => item.date === targetDate) || null;
    },

    getReadingMetadataByDate: function(dateStr) {
        const targetDate = String(dateStr || '').trim();

        if (!targetDate) return null;

        const metadataSource = this.readingIndexLoaded && this.readingIndex.length > 0
            ? this.readingIndex
            : this.data;

        const item = metadataSource.find(reading => reading.date === targetDate);

        if (!item) return null;

        return {
            date: item.date,
            reference: item.reference,
            bookId: item.bookId || null,
            month: item.month || String(item.date || '').slice(0, 7),
            file: item.file || null
        };
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

    if (oldView === 'home' && view !== 'home') {
        this.stopDailyReadingVoice(true);
    }

    if (oldView === 'bible-reading' && view !== 'bible-reading') {
        this.stopBibleChapterVoice(true);
        this.bibleReaderPickerOpen = false;
        document.body.classList.remove('bible-picker-open');
        this.bibleReadingSettingsOpen = false;
    }

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
    await this.renderHome();
} else if (view === 'bible') {
    this.renderBible();
} else if (view === 'bible-search') {
    this.$content.innerHTML = this.renderBibleSearch();
    requestAnimationFrame(() => {
        const searchInput = document.getElementById('bible-search-input');
        searchInput?.focus();
    });
} else if (view === 'bible-memory') {
    this.$content.innerHTML = this.renderBibleMemoryView();
} else if (view === 'strong-dictionary') {
    await this.renderStrongDictionaryView();
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
    this.scrollWindowInstantly(0);
    await this.renderReading(param);
    this.resetReadingScrollPosition();
    requestAnimationFrame(() => {
        this.resetReadingScrollPosition();
        requestAnimationFrame(() => {
            this.resetReadingScrollPosition();
        });
    });
} else {
    this.currentView = 'home';
    this.updateNavUI();
    await this.renderHome();
}
},
    
updateNavUI: function() {
    const navBtns = [
        { btn: this.$navHome, views: ['home', 'reading'] },
        { btn: this.$navBible, views: ['bible', 'bible-reading', 'bible-search', 'bible-memory', 'strong-dictionary'] },
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
    
    formatDateEs,
    
    formatDateForCompare,

    getReadingIndexByDate: function(dateStr) {
    return this.data.findIndex(item => item.date === dateStr);
},

getHomeViewingDate: function() {
    return this.homeViewingDate || this.getTodayDateStr();
},

changeHomeDay: async function(direction) {
    const currentDate = this.getHomeViewingDate();
    const currentIndex = this.getReadingIndexByDate(currentDate);

    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= this.data.length) return;

    this.stopDailyReadingVoice(true);
    this.homeViewingDate = this.data[newIndex].date;
    await this.renderHome();
},

getCleanDailyReadingText: function(reading, rawText = '') {
    if (!reading) return '';

    const sourceText = rawText || reading.versions?.[this.currentVersion] || reading.text || '';
    const tempDiv = document.createElement('div');

    tempDiv.innerHTML = sourceText
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '. ');

    const passageText = (tempDiv.textContent || '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();

    return [reading.reference, passageText].filter(Boolean).join('. ');
},

isNativeTextToSpeechAvailable: function() {
    return !!(window.Capacitor?.Plugins?.TextToSpeech);
},

getNativeTextToSpeechChunks: function(text, maxLength = 2800) {
    const cleanText = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return [];

    const sentences = cleanText.match(/[^.!?;:]+[.!?;:]?|[^.!?;:]+$/g) || [cleanText];
    const chunks = [];
    let current = '';

    sentences.forEach(sentence => {
        const normalized = sentence.trim();
        if (!normalized) return;

        if ((current + ' ' + normalized).trim().length <= maxLength) {
            current = (current + ' ' + normalized).trim();
            return;
        }

        if (current) chunks.push(current);

        if (normalized.length <= maxLength) {
            current = normalized;
            return;
        }

        for (let i = 0; i < normalized.length; i += maxLength) {
            chunks.push(normalized.slice(i, i + maxLength));
        }

        current = '';
    });

    if (current) chunks.push(current);
    return chunks;
},

speakWithNativeTextToSpeech: async function(text) {
    const plugin = window.Capacitor?.Plugins?.TextToSpeech;
    if (!plugin) return false;

    const chunks = this.getNativeTextToSpeechChunks(text);
    if (!chunks.length) return false;

    await plugin.stop();

    for (const chunk of chunks) {
        await plugin.speak({
            text: chunk,
            lang: 'es-MX',
            rate: 0.92,
            pitch: 1.0,
            volume: 1.0,
            category: 'ambient',
            queueStrategy: 1
        });
    }

    return true;
},

stopNativeTextToSpeech: async function() {
    const plugin = window.Capacitor?.Plugins?.TextToSpeech;
    if (!plugin) return;

    try {
        await plugin.stop();
    } catch (error) {
        console.warn('[Native TTS] No se pudo detener:', error);
    }
},

selectSpanishVoice: function(voices = []) {
    return voices.find(voice => voice.lang === 'es-MX')
        || voices.find(voice => voice.lang === 'es-ES')
        || voices.find(voice => voice.lang?.toLowerCase().startsWith('es'))
        || null;
},

renderDailyReadingVoiceControl: function(reading) {
    if (!this.isNativeTextToSpeechAvailable() && (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined')) {
        return `
            <div class="daily-reading-voice daily-reading-voice-unsupported" role="note">
                La lectura en voz alta no está disponible en este navegador.
            </div>
        `;
    }

    const isSameReading = this.dailyReadingVoice.date === reading.date;
    const status = isSameReading ? this.dailyReadingVoice.status : 'idle';
    const isReading = status === 'speaking';
    const isPaused = status === 'paused';
    const label = isReading
        ? 'Escuchando lectura'
        : (isPaused ? 'Continuar lectura' : 'Escuchar lectura');
    const icon = isReading ? 'pause' : 'play';
    const ariaLabel = isReading
        ? 'Pausar lectura en voz alta'
        : (isPaused ? 'Continuar lectura en voz alta' : 'Escuchar lectura en voz alta');

    return `
        <div class="daily-reading-voice" data-voice-date="${reading.date}">
            <button
                class="daily-reading-voice-main"
                type="button"
                data-action="daily-reading-voice-toggle"
                data-date="${reading.date}"
                aria-label="${ariaLabel}"
            >
                <span class="daily-reading-voice-icon daily-reading-voice-icon-${icon}" aria-hidden="true"></span>
                <span class="daily-reading-voice-label">${label}</span>
            </button>
            ${isReading || isPaused ? `
                <button
                    class="daily-reading-voice-stop"
                    type="button"
                    data-action="daily-reading-voice-stop"
                    aria-label="Detener lectura en voz alta"
                    title="Detener"
                >
                    <span aria-hidden="true"></span>
                </button>
            ` : ''}
        </div>
    `;
},

getBibleChapterVoiceVerses: function(chapterData, bookName, chapterNumber) {
    if (!Array.isArray(chapterData?.verses)) return [];

    const chapterTitle = `${bookName} capítulo ${chapterNumber}.`;

    return chapterData.verses
        .map((verse, index) => {
            const text = String(verse?.text || '')
                .replace(/\s+/g, ' ')
                .replace(/\s+([,.;:!?])/g, '$1')
                .trim();

            if (!text) return null;

            return {
                number: Number(verse.number) || index + 1,
                text,
                spokenText: index === 0 ? `${chapterTitle} ${text}` : text
            };
        })
        .filter(Boolean);
},

getBibleChapterVoiceStatus: function(key = null) {
    if (key && this.bibleChapterVoice.key !== key) return 'idle';
    return this.bibleChapterVoice.status || 'idle';
},

renderBibleChapterVoiceControl: function(bookName, chapterNumber) {
    if (!this.isNativeTextToSpeechAvailable() && (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined')) {
        return `
            <div class="daily-reading-voice daily-reading-voice-unsupported" role="note">
                La lectura en voz alta no está disponible en este navegador.
            </div>
        `;
    }

    const key = `${bookName}-${chapterNumber}`;
    const reference = `${bookName} ${chapterNumber}`;
    const status = this.getBibleChapterVoiceStatus(key);
    const isPlaying = status === 'playing';
    const isPaused = status === 'paused';
    const label = isPlaying
        ? 'Pausar capítulo'
        : (isPaused ? 'Reanudar capítulo' : 'Escuchar capítulo');
    const icon = isPlaying ? 'pause' : 'play';
    const ariaLabel = isPlaying
        ? 'Pausar capítulo en voz alta'
        : (isPaused ? 'Reanudar capítulo en voz alta' : 'Escuchar capítulo en voz alta');

    return `
        <div class="daily-reading-voice" data-bible-voice-key="${this.escapeHtml(key)}">
            <button
                class="daily-reading-voice-main"
                type="button"
                data-action="bible-chapter-voice-toggle"
                data-key="${this.escapeHtml(key)}"
                data-reference="${this.escapeHtml(reference)}"
                aria-label="${ariaLabel}"
            >
                <span class="daily-reading-voice-icon daily-reading-voice-icon-${icon}" aria-hidden="true"></span>
                <span class="daily-reading-voice-label">${label}</span>
            </button>
            ${isPlaying || isPaused ? `
                <button
                    class="daily-reading-voice-stop"
                    type="button"
                    data-action="bible-chapter-voice-stop"
                    aria-label="Detener capítulo en voz alta"
                    title="Detener"
                >
                    <span aria-hidden="true"></span>
                </button>
            ` : ''}
        </div>
    `;
},

createBibleChapterVoiceToken: function() {
    return {
        id: Symbol('bible-chapter-voice'),
        cancelWait: null
    };
},

isBibleChapterVoiceTokenActive: function(token) {
    return !!token
        && this.bibleChapterVoice.executionToken === token
        && this.bibleChapterVoice.status === 'playing';
},

invalidateBibleChapterVoiceToken: function() {
    const token = this.bibleChapterVoice.executionToken;

    if (token?.cancelWait) {
        token.cancelWait();
        token.cancelWait = null;
    }

    this.bibleChapterVoice.executionToken = null;
},

stopBibleChapterSpeechEngine: function(silent = false) {
    if (this.isNativeTextToSpeechAvailable()) {
        this.stopNativeTextToSpeech();
    }

    if ('speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch (error) {
            if (!silent) console.warn('[Bible Voice] No se pudo detener el motor:', error);
        }
    }
},

speakBibleChapterVerse: async function(verse, token) {
    if (!this.isBibleChapterVoiceTokenActive(token)) return false;

    const text = String(verse?.spokenText || verse?.text || '').trim();
    if (!text) return true;

    let speechPromise;

    if (this.isNativeTextToSpeechAvailable()) {
        const plugin = window.Capacitor.Plugins.TextToSpeech;
        speechPromise = plugin.speak({
            text,
            lang: 'es-MX',
            rate: 0.92,
            pitch: 1.0,
            volume: 1.0,
            category: 'ambient',
            queueStrategy: 0
        }).then(
            () => ({ type: 'completed' }),
            error => ({ type: 'error', error })
        );
    } else {
        if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
            throw new Error('La lectura en voz alta no está disponible en este navegador.');
        }

        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = this.selectSpanishVoice(voices);

        if (spanishVoice) utterance.voice = spanishVoice;
        utterance.lang = spanishVoice?.lang || 'es-MX';
        utterance.rate = 0.92;
        utterance.pitch = 1;

        this.bibleChapterVoice.utterance = utterance;

        speechPromise = new Promise(resolve => {
            utterance.onend = () => resolve({ type: 'completed' });
            utterance.onerror = error => resolve({ type: 'error', error });
            window.speechSynthesis.speak(utterance);
        });
    }

    let cancelWait = null;
    const cancellationPromise = new Promise(resolve => {
        cancelWait = () => resolve({ type: 'cancelled' });
        token.cancelWait = cancelWait;
    });
    const result = await Promise.race([speechPromise, cancellationPromise]);

    if (token.cancelWait === cancelWait) {
        token.cancelWait = null;
    }

    if (result.type === 'error') {
        if (!this.isBibleChapterVoiceTokenActive(token)) return false;
        throw result.error;
    }

    return result.type === 'completed' && this.isBibleChapterVoiceTokenActive(token);
},

playBibleChapterVoiceSequence: async function(token) {
    try {
        while (this.isBibleChapterVoiceTokenActive(token)) {
            const index = this.bibleChapterVoice.currentVerseIndex;
            const verse = this.bibleChapterVoice.verses[index];

            if (!verse) break;

            const completed = await this.speakBibleChapterVerse(verse, token);
            if (!completed || !this.isBibleChapterVoiceTokenActive(token)) return;

            this.bibleChapterVoice.currentVerseIndex = index + 1;
        }

        if (!this.isBibleChapterVoiceTokenActive(token)) return;

        this.isBibleAudioPlaying = false;
        this.bibleChapterVoice = {
            utterance: null,
            status: 'idle',
            verses: [],
            currentVerseIndex: 0,
            executionToken: null,
            key: null,
            reference: null
        };
        this.updateBibleChapterVoiceUI();
    } catch (error) {
        if (!this.isBibleChapterVoiceTokenActive(token)) return;

        console.warn('[Bible Voice] No se pudo leer el capítulo:', error);
        this.showToast('No se pudo continuar la lectura en voz alta');
        this.stopBibleChapterVoice(true);
    }
},

startBibleChapterVoice: function(key, verses, reference = '') {
    if (!Array.isArray(verses) || !verses.length) return;

    this.stopDailyReadingVoice(true);
    this.stopBibleChapterVoice(true);

    const token = this.createBibleChapterVoiceToken();
    this.isBibleAudioPlaying = true;
    this.bibleChapterVoice = {
        utterance: null,
        status: 'playing',
        verses: verses.map(verse => ({ ...verse })),
        currentVerseIndex: 0,
        executionToken: token,
        key,
        reference
    };
    this.updateBibleChapterVoiceUI();
    this.playBibleChapterVoiceSequence(token);
},

pauseBibleChapterVoice: function() {
    if (this.bibleChapterVoice.status !== 'playing') return;

    this.invalidateBibleChapterVoiceToken();
    this.stopBibleChapterSpeechEngine(true);
    this.isBibleAudioPlaying = false;
    this.bibleChapterVoice.utterance = null;
    this.bibleChapterVoice.status = 'paused';
    this.updateBibleChapterVoiceUI();
},

resumeBibleChapterVoice: function() {
    if (
        this.bibleChapterVoice.status !== 'paused'
        || !this.bibleChapterVoice.verses.length
    ) {
        return;
    }

    const token = this.createBibleChapterVoiceToken();
    this.bibleChapterVoice.executionToken = token;
    this.bibleChapterVoice.status = 'playing';
    this.bibleChapterVoice.utterance = null;
    this.isBibleAudioPlaying = true;
    this.updateBibleChapterVoiceUI();
    this.playBibleChapterVoiceSequence(token);
},

toggleBibleChapterVoice: function(key, verses, reference = '') {
    const status = this.getBibleChapterVoiceStatus(key);

    if (status === 'playing') {
        this.pauseBibleChapterVoice();
        return;
    }

    if (status === 'paused') {
        this.resumeBibleChapterVoice();
        return;
    }

    this.startBibleChapterVoice(key, verses, reference);
},

stopBibleChapterVoice: function(silent = false) {
    this.invalidateBibleChapterVoiceToken();
    this.bibleChapterVoice.status = 'stopped';
    this.stopBibleChapterSpeechEngine(silent);
    this.isBibleAudioPlaying = false;
    this.bibleChapterVoice = {
        utterance: null,
        status: 'idle',
        verses: [],
        currentVerseIndex: 0,
        executionToken: null,
        key: null,
        reference: null
    };
    this.updateBibleChapterVoiceUI();
},

updateBibleChapterVoiceUI: function() {
    const control = document.querySelector('.daily-reading-voice[data-bible-voice-key]');

    if (control) {
        const mainBtn = control.querySelector('[data-action="bible-chapter-voice-toggle"]');

        if (mainBtn) {
            const key = control.getAttribute('data-bible-voice-key');
            const status = this.getBibleChapterVoiceStatus(key);
            const isPlaying = status === 'playing';
            const isPaused = status === 'paused';
            const icon = mainBtn.querySelector('.daily-reading-voice-icon');
            const label = mainBtn.querySelector('.daily-reading-voice-label');

            if (icon) {
                icon.className = `daily-reading-voice-icon daily-reading-voice-icon-${isPlaying ? 'pause' : 'play'}`;
            }

            if (label) {
                label.textContent = isPlaying
                    ? 'Pausar capítulo'
                    : (isPaused ? 'Reanudar capítulo' : 'Escuchar capítulo');
            }

            mainBtn.setAttribute(
                'aria-label',
                isPlaying
                    ? 'Pausar capítulo en voz alta'
                    : (isPaused ? 'Reanudar capítulo en voz alta' : 'Escuchar capítulo en voz alta')
            );

            const currentStopBtn = control.querySelector('[data-action="bible-chapter-voice-stop"]');
            if ((isPlaying || isPaused) && !currentStopBtn) {
                control.insertAdjacentHTML('beforeend', `
                    <button
                        class="daily-reading-voice-stop"
                        type="button"
                        data-action="bible-chapter-voice-stop"
                        aria-label="Detener capítulo en voz alta"
                        title="Detener"
                    >
                        <span aria-hidden="true"></span>
                    </button>
                `);
            } else if (!isPlaying && !isPaused && currentStopBtn) {
                currentStopBtn.remove();
            }
        }
    }

    this.updateBibleReaderContextBarUI();
},

startDailyReadingVoice: async function(date, text) {
    const cleanText = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;

    this.stopBibleChapterVoice(true);
    this.stopDailyReadingVoice(true);

    if (this.isNativeTextToSpeechAvailable()) {
        this.dailyReadingVoice = { utterance: null, status: 'speaking', date };
        this.updateDailyReadingVoiceUI();

        try {
            await this.speakWithNativeTextToSpeech(cleanText);
        } catch (error) {
            console.warn('[Voice] Error iniciando lectura nativa:', error);
        }

        this.dailyReadingVoice = { utterance: null, status: 'idle', date: null };
        this.updateDailyReadingVoiceUI();
        return;
    }

    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        this.showToast('La lectura en voz alta no está disponible en este navegador');
        return;
    }

    try {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = this.selectSpanishVoice(voices);

        if (spanishVoice) utterance.voice = spanishVoice;
        utterance.lang = spanishVoice?.lang || 'es-MX';
        utterance.rate = 0.92;
        utterance.pitch = 1;

        utterance.onend = () => {
            if (this.dailyReadingVoice.utterance !== utterance) return;

            this.dailyReadingVoice = { utterance: null, status: 'idle', date: null };
            this.updateDailyReadingVoiceUI();
        };

        utterance.onerror = (error) => {
            if (this.dailyReadingVoice.utterance !== utterance) return;

            console.warn('[Voice] No se pudo leer la lectura:', error);
            this.dailyReadingVoice = { utterance: null, status: 'idle', date: null };
            this.updateDailyReadingVoiceUI();
        };

        this.dailyReadingVoice = { utterance, status: 'speaking', date };
        window.speechSynthesis.speak(utterance);
        this.updateDailyReadingVoiceUI();
    } catch (error) {
        console.warn('[Voice] Error iniciando lectura:', error);
        this.dailyReadingVoice = { utterance: null, status: 'idle', date: null };
        this.updateDailyReadingVoiceUI();
    }
},

pauseOrResumeDailyReadingVoice: function(date, text) {
    if (this.isNativeTextToSpeechAvailable()) {
        if (this.dailyReadingVoice.status === 'speaking' && this.dailyReadingVoice.date === date) {
            this.stopDailyReadingVoice();
            return;
        }

        this.startDailyReadingVoice(date, text);
        return;
    }

    if (!('speechSynthesis' in window)) return;

    if (this.dailyReadingVoice.status === 'speaking' && this.dailyReadingVoice.date === date) {
        window.speechSynthesis.pause();
        this.dailyReadingVoice.status = 'paused';
        this.updateDailyReadingVoiceUI();
        return;
    }

    if (this.dailyReadingVoice.status === 'paused' && this.dailyReadingVoice.date === date) {
        window.speechSynthesis.resume();
        this.dailyReadingVoice.status = 'speaking';
        this.updateDailyReadingVoiceUI();
        return;
    }

    this.startDailyReadingVoice(date, text);
},

stopDailyReadingVoice: function(silent = false) {
    if (this.isNativeTextToSpeechAvailable()) {
        this.stopNativeTextToSpeech();
    }

    if ('speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch (error) {
            if (!silent) console.warn('[Voice] No se pudo detener la lectura:', error);
        }
    }

    this.dailyReadingVoice = { utterance: null, status: 'idle', date: null };
    this.updateDailyReadingVoiceUI();
},

updateDailyReadingVoiceUI: function() {
    const control = document.querySelector('.daily-reading-voice[data-voice-date]');
    if (!control) return;

    const mainBtn = control.querySelector('[data-action="daily-reading-voice-toggle"]');
    if (!mainBtn) return;

    const isSameReading = this.dailyReadingVoice.date === control.getAttribute('data-voice-date');
    const status = isSameReading ? this.dailyReadingVoice.status : 'idle';
    const isReading = status === 'speaking';
    const isPaused = status === 'paused';
    const icon = mainBtn.querySelector('.daily-reading-voice-icon');
    const label = mainBtn.querySelector('.daily-reading-voice-label');

    if (icon) {
        icon.className = `daily-reading-voice-icon daily-reading-voice-icon-${isReading ? 'pause' : 'play'}`;
    }

    if (label) {
        label.textContent = isReading
            ? 'Escuchando lectura'
            : (isPaused ? 'Continuar lectura' : 'Escuchar lectura');
    }

    mainBtn.setAttribute(
        'aria-label',
        isReading
            ? 'Pausar lectura en voz alta'
            : (isPaused ? 'Continuar lectura en voz alta' : 'Escuchar lectura en voz alta')
    );

    const currentStopBtn = control.querySelector('[data-action="daily-reading-voice-stop"]');
    if ((isReading || isPaused) && !currentStopBtn) {
        control.insertAdjacentHTML('beforeend', `
            <button
                class="daily-reading-voice-stop"
                type="button"
                data-action="daily-reading-voice-stop"
                aria-label="Detener lectura en voz alta"
                title="Detener"
            >
                <span aria-hidden="true"></span>
            </button>
        `);
    } else if (!isReading && !isPaused && currentStopBtn) {
        currentStopBtn.remove();
    }
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
   const verseStudyBtn = e.target.closest('[data-action="open-verse-study"]');

if (verseStudyBtn) {
    e.preventDefault();
    e.stopPropagation();

    this.openVerseStudy({
        bookId: verseStudyBtn.dataset.bookId,
        chapter: verseStudyBtn.dataset.chapter,
        verse: verseStudyBtn.dataset.verse,
        verseText: verseStudyBtn.dataset.verseText
    });

    return;
}

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

    if (this.$selectionStrongBtn) {
        this.$selectionStrongBtn.hidden = this.getSelectedTextSource() !== 'bible';
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

getHighlightColorLabel: function(color) {
    return getHighlightColorLabel(color);
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
        this.showToast(`Este texto ya está resaltado en ${this.getHighlightColorLabel(color)}`);
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
    
    this.showToast(`Texto resaltado en ${this.getHighlightColorLabel(color)}`);
    
    // ✅ CORREGIDO: Aplicar clase CSS inmediatamente al versículo seleccionado
  this.hideSelectionPanel();
this.rerenderCurrentReadingView(dateStr, true);
},
    
   getTodayDateStr,



scrollWindowInstantly: function(top = 0) {
    const html = document.documentElement;
    const targetTop = Math.max(0, top);

    html.classList.add('no-smooth-scroll');
    document.body.classList.add('no-smooth-scroll');
    html.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    html.scrollTop = targetTop;
    document.body.scrollTop = targetTop;
    window.scrollTo(0, targetTop);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            html.style.scrollBehavior = '';
            document.body.style.scrollBehavior = '';
            html.classList.remove('no-smooth-scroll');
            document.body.classList.remove('no-smooth-scroll');
        });
    });
},

resetReadingScrollPosition: function() {
    if (this.$content) {
        this.$content.scrollTop = 0;
    }

    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    this.scrollWindowInstantly(0);
},

    saveCalendarScroll: function() {
    this.calendarScrollTop = window.scrollY || window.pageYOffset || 0;
},

restoreCalendarPosition: function() {
    const calendarCards = Array.from(this.$content.querySelectorAll('.calendar-day[data-calendar-date]'));
    if (!calendarCards.length) return;

    const todayStr = this.getTodayDateStr();
    const targetCard = this.$content.querySelector('.calendar-day[data-calendar-today="true"]')
        || calendarCards.reduce((closest, card) => {
            const closestDate = new Date(`${closest.dataset.calendarDate}T12:00:00`);
            const cardDate = new Date(`${card.dataset.calendarDate}T12:00:00`);
            const todayDate = new Date(`${todayStr}T12:00:00`);

            return Math.abs(cardDate - todayDate) < Math.abs(closestDate - todayDate)
                ? card
                : closest;
        }, calendarCards[0]);

    if (this.calendarInitialized) {
        this.scrollWindowInstantly(this.calendarScrollTop || 0);
        return;
    }

    const top = targetCard.getBoundingClientRect().top + window.scrollY - 130;
    this.scrollWindowInstantly(top);

    this.calendarInitialized = true;
    this.calendarScrollTop = Math.max(0, top);
},
    
   renderHome: async function() {
    this.stopDailyReadingVoice(true);

    const viewingDate = this.getHomeViewingDate();
    const reading = await this.getReadingByDate(viewingDate);
    
    // Verificar si está viendo el día de hoy
    const isToday = viewingDate === this.getTodayDateStr();
    
    // Si es hoy Y hay lectura, mostrar el pergamino de progreso
    if (isToday && reading) {
        const pergaminoHtml = this.getProgresoLibroVisual(viewingDate, reading);
        
        // Construir la vista con el pergamino incluido
        const dateFormatted = this.formatDateEs(reading.date);
        const readingText = reading.versions?.[this.currentVersion] || reading.text || '';

        // Video intro (si aplica)
        const showIntroVideo = shouldShowIntroVideo(reading.date);
        const introVideoConfig = showIntroVideo ? getIntroVideoConfig(reading.date) : null;
        const introVideoHtml = introVideoConfig ? renderIntroVideoHtml(introVideoConfig) : '';

        const currentIndex = reading ? this.getReadingIndexByDate(reading.date) : -1;
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex >= 0 && currentIndex < this.data.length - 1;
        const isRealToday = reading && reading.date === this.getTodayDateStr();
        const readingLabel = isRealToday ? '📖 Su voz hoy' : '📖 Su voz este día';

        this.$content.innerHTML = `

            ${this.renderViewHeader(
                'Lectura bíblica del día',
                'Un momento diario para escuchar, meditar y responder a la Palabra.',
                dateFormatted.toUpperCase()
            )}

            <!-- 📜 PERGAMINO DE PROGRESO (SOLO HOY) -->
            ${pergaminoHtml}

            ${introVideoHtml}

            <div class="reading-card">
                <div class="section-title">${readingLabel}</div>
                <h2 class="reading-reference">${reading.reference}</h2>
                ${this.renderDailyReadingVoiceControl(reading)}
                <div class="reading-text-shell" data-reading-date="${reading.date}">
                    <div class="reading-text selection-surface verse-container" data-selection-surface="true">
                        ${this.renderVerseText(readingText, reading.date)}
                    </div>
                </div>
            </div>

            <div class="main-action">
                <button class="reading-action-card reading-action-primary ${this.hasNote(reading.date) ? 'has-note' : ''}" data-action="toggle-note" data-date="${reading.date}">
                    <span class="reading-action-icon">🔎</span>
                    <span class="reading-action-content">
                        <span class="reading-action-title">
                            ${this.openNoteDate === reading.date ? 'Ocultar sección' : 'Profundiza en Su voz'}
                            ${this.hasNote(reading.date) ? '<span class="reading-action-check">✓</span>' : ''}
                            ${this.hasNote(reading.date) ? '<span class="reading-action-dot"></span>' : ''}
                        </span>
                        <span class="reading-action-subtitle">Explora más sobre este pasaje</span>
                    </span>
                    <span class="reading-action-chevron"></span>
                </button>
            </div>

            ${this.openNoteDate === reading.date ? this.renderDevotionalGuide(reading) : ''}

            <div class="action-group">
                <button class="reading-action-card reading-action-read" data-action="mark-read" data-date="${reading.date}" ${this.isRead(reading.date) ? 'disabled' : ''}>
                    <span class="reading-action-icon reading-action-icon-check">✓</span>
                    <span class="reading-action-content">
                        <span class="reading-action-title">${this.isRead(reading.date) ? 'Leído hoy' : 'Marcar como leído'}</span>
                        <span class="reading-action-subtitle">${this.isRead(reading.date) ? '¡Buen trabajo! Sigue así' : 'Guarda tu avance de hoy'}</span>
                    </span>
                </button>
                <button class="reading-action-card reading-action-share" data-action="share-reading" data-date="${reading.date}">
                    <span class="reading-action-icon">📤</span>
                    <span class="reading-action-content">
                        <span class="reading-action-title">Compartir lectura</span>
                        <span class="reading-action-subtitle">Comparte inspiración con otros</span>
                    </span>
                    <span class="reading-action-chevron"></span>
                </button>
            </div>

            <div class="home-reading-bar">
                <button class="home-reading-bar-btn" data-action="home-prev-day" ${hasPrev ? '' : 'disabled'} aria-label="Ver día anterior" title="Ver día anterior">←</button>
                <div class="home-reading-bar-title" title="${reading.reference}">${reading.reference}</div>
                <button class="home-reading-bar-btn" data-action="home-next-day" ${hasNext ? '' : 'disabled'} aria-label="Ver día siguiente" title="Ver día siguiente">→</button>
            </div>
        `;
        
        this.restoreHighlightsInDOMForVerses(reading.date);
        this.restoreSelectionNotesInDOM(reading.date);
        
    } else {
        // Si NO es hoy, usar la vista normal
        this.renderViewContent(reading, true);
    }
},
    
    renderReading: async function(dateStr) {
        this.homeViewingDate = dateStr;
        await this.renderHome();
    },

rerenderCurrentReadingView: async function(dateStr = null, force = false) {
    const panelOpen = this.$selectionPanel?.classList.contains('visible');

    if (!force && panelOpen) return;

    if (this.currentView === 'home') {
        await this.renderHome();
        return;
    }

    if (this.currentView === 'bible-reading') {
        await this.renderBibleReading();
        return;
    }

    const targetDate = dateStr || this.getTodayDateStr();
    await this.renderReading(targetDate);
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

       const showIntroVideo = shouldShowIntroVideo(reading.date);
       const introVideoConfig = showIntroVideo ? getIntroVideoConfig(reading.date) : null;
       const introVideoHtml = introVideoConfig ? renderIntroVideoHtml(introVideoConfig) : '';
        const progressHtml = isHome
            ? this.getProgresoLibroVisual(reading.date, reading)
            : '';
        
        const currentIndex = reading ? this.getReadingIndexByDate(reading.date) : -1;
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex >= 0 && currentIndex < this.data.length - 1;
        const isRealToday = reading && reading.date === this.getTodayDateStr();
        const readingLabel = isHome
            ? (isRealToday ? '📖 Su voz hoy' : '📖 Su voz este día')
            : '📖 Su voz este día';
        
        this.$content.innerHTML = `

    ${isHome ? this.renderViewHeader(
        'Lectura bíblica del día',
        'Un momento diario para escuchar, meditar y responder a la Palabra.',
        dateFormatted.toUpperCase()
    ) : `
        <div class="reading-date-header">${dateFormatted.toUpperCase()}</div>
    `}

    ${progressHtml}

    ${introVideoHtml}
    
                <div class="reading-card">
                    <div class="section-title">${readingLabel}</div>
                    <h2 class="reading-reference">${reading.reference}</h2>
                    ${isHome ? this.renderDailyReadingVoiceControl(reading) : ''}
                    <div class="reading-text-shell" data-reading-date="${reading.date}">
    <div class="reading-text selection-surface verse-container" data-selection-surface="true">
        ${this.renderVerseText(readingText, reading.date)}
    </div>
</div>
               </div>
            
            <div class="main-action">
    <button class="reading-action-card reading-action-primary ${this.hasNote(reading.date) ? 'has-note' : ''}" data-action="toggle-note" data-date="${reading.date}">
        <span class="reading-action-icon">🔎</span>

        <span class="reading-action-content">
            <span class="reading-action-title">
                ${this.openNoteDate === reading.date ? 'Ocultar sección' : 'Profundiza en Su voz'}
                ${this.hasNote(reading.date) ? '<span class="reading-action-check">✓</span>' : ''}
                ${this.hasNote(reading.date) ? '<span class="reading-action-dot"></span>' : ''}
            </span>

            <span class="reading-action-subtitle">
                Explora más sobre este pasaje
            </span>
        </span>

        <span class="reading-action-chevron"></span>
    </button>
</div>

           ${this.openNoteDate === reading.date ? this.renderDevotionalGuide(reading) : ''}
            
         <div class="action-group">
    <button class="reading-action-card reading-action-read" data-action="mark-read" data-date="${reading.date}" ${this.isRead(reading.date) ? 'disabled' : ''}>
        <span class="reading-action-icon reading-action-icon-check">✓</span>

        <span class="reading-action-content">
            <span class="reading-action-title">
                ${this.isRead(reading.date) ? 'Leído hoy' : 'Marcar como leído'}
            </span>

            <span class="reading-action-subtitle">
                ${this.isRead(reading.date) ? '¡Buen trabajo! Sigue así' : 'Guarda tu avance de hoy'}
            </span>
        </span>
    </button>

    <button class="reading-action-card reading-action-share" data-action="share-reading" data-date="${reading.date}">
        <span class="reading-action-icon">📤</span>

        <span class="reading-action-content">
            <span class="reading-action-title">Compartir lectura</span>
            <span class="reading-action-subtitle">Comparte inspiración con otros</span>
        </span>

        <span class="reading-action-chevron"></span>
    </button>
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
    
    escapeHtml,

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

renderBibleSearchResults: function() {
    const hasResults = this.bibleSearchResults.length > 0;
    const isLoading = this.bibleSearchLoading;
    const searchError = String(this.bibleSearchError || '').trim();
    const hasQuery = this.bibleSearchQuery && this.bibleSearchQuery.trim().length >= 2;
    const versionLabel = this.getBibleVersionLabel(this.currentBibleVersion);

    if (isLoading) {
        return `
            <div class="bible-search-loading" id="bible-search-results-container">
                <div class="spinner"></div>
                <p>Buscando en la Biblia...</p>
            </div>
        `;
    }

    if (searchError) {
        return `
            <div class="bible-search-placeholder bible-search-empty" id="bible-search-results-container" role="alert">
                <div class="bible-search-icon">⚠</div>
                <h3>No se pudo completar la búsqueda</h3>
                <p>${this.escapeHtml(searchError)}</p>
            </div>
        `;
    }

    if (hasResults) {
        return `
            <div class="bible-search-results-head" id="bible-search-results-container">
                <div class="bible-search-stats">
                    ${this.bibleSearchTotal} resultado${this.bibleSearchTotal === 1 ? '' : 's'} para “${this.escapeHtml(this.bibleSearchQuery)}”
                </div>
            </div>

            <div class="bible-search-results" aria-live="polite">
                ${this.bibleSearchResults.map(result => {
                    const book = this.getBibleBookById(result.bookId);
                    const bookName = book ? book.name : (result.bookName || result.bookId);
                    const chapter = Number(result.chapter || 0);
                    const verse = Number(result.verse || 0);

                    return `
                        <button
                            class="bible-search-result-item"
                            type="button"
                            data-action="navigate-to-verse"
                            data-book-id="${result.bookId}"
                            data-chapter="${chapter}"
                            data-verse="${verse}"
                        >
                            <span class="bible-search-result-reference">
                                ${this.escapeHtml(bookName)} ${chapter}:${verse}
                            </span>

                            <span class="bible-search-result-text">
                                ${this.highlightSearchTerm(result.text, this.bibleSearchQuery)}
                            </span>

                            <span class="bible-search-result-open">
                                Abrir pasaje
                            </span>
                        </button>
                    `;
                }).join('')}
            </div>

            ${this.renderBiblePagination()}
        `;
    }

    if (hasQuery) {
        return `
            <div class="bible-search-placeholder bible-search-empty" id="bible-search-results-container">
                <div class="bible-search-icon">⌕</div>
                <h3>No encontramos resultados</h3>
                <p>No encontramos resultados. Prueba con otra palabra o referencia.</p>
            </div>
        `;
    }

    return `
        <div class="bible-search-placeholder bible-search-start" id="bible-search-results-container">
            <div class="bible-search-icon">⌕</div>
            <h3>Empieza con una referencia o tema</h3>
            <p>Las referencias se abren en ${this.escapeHtml(versionLabel)}. Las búsquedas por palabra usan RV1909.</p>

            <div class="bible-search-suggestions">
                <button class="suggestion-tag" type="button" data-action="search-suggestion" data-query="Juan 3:16">Juan 3:16</button>
                <button class="suggestion-tag" type="button" data-action="search-suggestion" data-query="Salmo 23">Salmo 23</button>
                <button class="suggestion-tag" type="button" data-action="search-suggestion" data-query="gracia">gracia</button>
                <button class="suggestion-tag" type="button" data-action="search-suggestion" data-query="pacto">pacto</button>
            </div>
        </div>
    `;
},

renderBibleSearch: function() {
    const versionLabel = this.getBibleVersionLabel(this.currentBibleVersion);
    return `
        <div class="bible-search-view bible-search-modern">
            <div class="bible-search-hero">
                <div class="bible-search-topline">
                    <button
                        class="bible-search-back"
                        type="button"
                        data-action="back-to-bible-books"
                    >
                        ← Biblia
                    </button>

                    <span>${this.escapeHtml(versionLabel)}</span>
                </div>

                <h2>Buscar en la Biblia</h2>
                <p>Encuentra pasajes por referencia, palabra o tema y abre el versículo directamente.</p>
            </div>

            <div class="bible-search-panel">
                <div class="bible-search-input-wrapper">
                    <span class="bible-search-input-icon">🔍</span>

                    <input
                        type="search"
                        class="bible-search-input"
                        id="bible-search-input"
                        placeholder="Buscar Juan 3:16, gracia, pacto…"
                        value="${this.escapeHtml(this.bibleSearchQuery)}"
                        autocomplete="off"
                        inputmode="search"
                    />

                    <button
                        class="bible-search-clear"
                        type="button"
                        data-action="clear-search"
                        aria-label="Limpiar búsqueda"
                        ${this.bibleSearchQuery ? '' : 'hidden'}
                    >
                        ×
                    </button>
                </div>

                <p class="bible-search-index-note">
                    Las búsquedas de palabras se realizan sobre RV1909. Los resultados pueden abrirse en cualquier versión disponible.
                </p>

                <div class="bible-search-filters">
                    <button
                        class="bible-filter-btn ${this.bibleSearchFilter === 'all' ? 'active' : ''}"
                        type="button"
                        data-action="set-bible-filter"
                        data-filter="all"
                    >
                        Todos
                    </button>

                    <button
                        class="bible-filter-btn ${this.bibleSearchFilter === 'old' ? 'active' : ''}"
                        type="button"
                        data-action="set-bible-filter"
                        data-filter="old"
                    >
                        Antiguo
                    </button>

                    <button
                        class="bible-filter-btn ${this.bibleSearchFilter === 'new' ? 'active' : ''}"
                        type="button"
                        data-action="set-bible-filter"
                        data-filter="new"
                    >
                        Nuevo
                    </button>
                </div>
            </div>

            <div class="bible-search-results-shell" id="bible-search-results-shell">
                ${this.renderBibleSearchResults()}
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
    if (this.bibleSearchIndexReady) return;

    const bible = await localRv1909Provider.loadBible();
    const verses = [];

    bible.forEach((sourceBook, sourceBookIndex) => {
        const bookId = localRv1909Provider.getCanonicalBookId(sourceBook?.abbrev);
        const book = this.bibleBooks.find(item => item.id === bookId);

        if (!bookId || !book || !Array.isArray(sourceBook?.chapters)) {
            console.warn('[BibleSearch] Libro local omitido del índice', {
                sourceBookIndex,
                abbreviation: sourceBook?.abbrev
            });
            return;
        }

        sourceBook.chapters.forEach((chapterVerses, chapterIndex) => {
            if (!Array.isArray(chapterVerses)) return;

            chapterVerses.forEach((text, verseIndex) => {
                const normalizedText = String(text || '').trim();

                if (!normalizedText) return;

                verses.push({
                    id: `${bookId}.${chapterIndex + 1}.${verseIndex + 1}`,
                    bookId,
                    bookName: book.name,
                    testament: this.getTestamentFromBookId(bookId),
                    bookOrder: this.bibleBooks.indexOf(book) + 1,
                    chapter: chapterIndex + 1,
                    verse: verseIndex + 1,
                    text: normalizedText
                });
            });
        });
    });

    this.bibleSearchData = verses;
    this.buildLocalBibleSearchIndex();
    this.bibleSearchIndexReady = true;

    console.info('[BibleSearch] Índice local listo', {
        versionId: RV1909_VERSION_ID,
        verseCount: verses.length
    });
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
    this.bibleSearchError = '';
    this.bibleSearchRequestId += 1;
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
    const inputQuery = String(query || '');
    const normalizedQuery = inputQuery.trim();
    const activeVersionId = String(this.currentBibleVersion || RV1909_VERSION_ID)
        .trim()
        .toLowerCase();
    const requestId = this.bibleSearchRequestId;
    this.bibleSearchQuery = inputQuery;
    this.bibleSearchError = '';

    if (resetPage) {
        this.bibleSearchPage = 1;
    }

    if (!normalizedQuery || normalizedQuery.length < 2) {
        this.bibleSearchResults = [];
        this.bibleSearchLoading = false;
        this.bibleSearchError = '';
        this.bibleSearchTotal = 0;
        this.bibleSearchTotalPages = 0;
        this.bibleSearchPage = 1;
        this.updateBibleSearchResults();
        return;
    }

    const referenceQuery = this.parseBibleReferenceQuery(normalizedQuery);

    if (referenceQuery) {
        this.bibleSearchLoading = false;
        this.bibleSearchResults = [];
        this.bibleSearchTotal = 0;
        this.bibleSearchTotalPages = 0;

        console.info('[BibleSearch] Referencia detectada', {
            query: normalizedQuery,
            versionId: activeVersionId,
            reference: referenceQuery,
            indexLoaded: this.bibleSearchIndexReady
        });

        this.navigateToVerse(
            referenceQuery.bookId,
            referenceQuery.chapter,
            referenceQuery.verse
        );
        return;
    }

    this.bibleSearchLoading = true;
    this.updateBibleSearchResults();

    console.info('[BibleSearch] Inicio', {
        query: normalizedQuery,
        searchVersionId: RV1909_VERSION_ID,
        activeVersionId,
        source: 'local',
        page: this.bibleSearchPage
    });

    try {
        await this.loadLocalBibleSearchData();
        const allMatches = this.searchLocalBible(
            normalizedQuery,
            this.bibleSearchFilter
        );

        if (requestId !== this.bibleSearchRequestId) return;

        console.info('[BibleSearch] Respuesta', {
            query: normalizedQuery,
            searchVersionId: RV1909_VERSION_ID,
            activeVersionId,
            source: 'local',
            resultCount: allMatches.length,
            results: allMatches
        });

        this.applyBibleSearchPagination(allMatches);
    } catch (error) {
        if (requestId !== this.bibleSearchRequestId) return;

        console.error('[BibleSearch] Error', {
            query: normalizedQuery,
            searchVersionId: RV1909_VERSION_ID,
            activeVersionId,
            source: 'local',
            message: error?.message,
            code: error?.code,
            details: error?.details,
            error
        });
        this.bibleSearchResults = [];
        this.bibleSearchTotal = 0;
        this.bibleSearchTotalPages = 0;
        this.bibleSearchError = 'No se pudo completar la búsqueda local. Intenta de nuevo.';
        this.showToast(this.bibleSearchError);
    } finally {
        if (requestId !== this.bibleSearchRequestId) return;

        this.bibleSearchLoading = false;
        this.updateBibleSearchResults();
    }
},

goToBibleSearchPage: function(page) {
    const targetPage = Number(page);

    if (!Number.isInteger(targetPage)) return;
    if (targetPage < 1 || targetPage > this.bibleSearchTotalPages) return;

    this.bibleSearchPage = targetPage;
    this.bibleSearchRequestId += 1;
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

    this.bibleSearchRequestId += 1;
    this.performBibleSearch(this.bibleSearchQuery, true);
},

clearBibleSearch: function() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = null;
    this.bibleSearchComposing = false;
    this.bibleSearchFilter = 'all';
    this.resetBibleSearchState();
    const searchInput = document.getElementById('bible-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
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

updateBibleSearchClearButton: function() {
    const clearButton = this.$content?.querySelector('.bible-search-clear');

    if (clearButton) {
        clearButton.hidden = !this.bibleSearchQuery;
    }
},

scheduleBibleSearch: function(query) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
        this.searchTimeout = null;

        if (this.currentView !== 'bible-search') return;
        if (this.bibleSearchComposing) return;
        this.performBibleSearch(query);
    }, 300);
},

updateBibleSearchResults: function() {
    if (this.currentView !== 'bible-search' || !this.$content) return;
    if (this.bibleSearchComposing) return;

    const resultsShell = document.getElementById('bible-search-results-shell');

    if (resultsShell) {
        resultsShell.innerHTML = this.renderBibleSearchResults();
    }

    this.updateBibleSearchClearButton();
},

navigateToVerse: function(apiBookId, chapter, verse) {
    // Convertir ID de API a nuestro ID
    const rawBookId = String(apiBookId || '');
    const ourBookId = this.bibleApiIdMap[rawBookId.toUpperCase()] || rawBookId.toLowerCase();
    
    // Verificar que el libro existe
    const book = this.bibleBooks.find(b => b.id === ourBookId);
    if (!book) {
        console.error('Libro no encontrado:', apiBookId);
        this.showToast('No se pudo encontrar el libro');
        return;
    }
    
    this.selectedBibleBook = ourBookId;
    this.selectedBibleChapter = Number.parseInt(chapter, 10);
    const targetVerse = Number.parseInt(verse, 10);
    this.targetVerse = Number.isInteger(targetVerse) && targetVerse > 0
        ? targetVerse
        : null;
    this.saveBibleLastLocation(this.selectedBibleBook, this.selectedBibleChapter);
    
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

getBibleLastLocation: function() {
    try {
        const saved = sessionStorage.getItem('su-voz-bible-last-location');
        if (!saved) return null;

        const location = JSON.parse(saved);

        if (location?.mode === 'books') {
            return { mode: 'books', bookId: null, chapter: null };
        }

        const bookId = location?.bookId;
        const chapter = Number(location?.chapter);
        const book = this.bibleBooks.find(item => item.id === bookId);

        if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
            sessionStorage.removeItem('su-voz-bible-last-location');
            return null;
        }

        return { mode: 'chapter', bookId, chapter };
    } catch (error) {
        sessionStorage.removeItem('su-voz-bible-last-location');
        return null;
    }
},

saveBibleLastLocation: function(bookId, chapter) {
    const book = this.bibleBooks.find(item => item.id === bookId);
    const chapterNumber = Number(chapter);

    if (!book || !Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > book.chapters) {
        return false;
    }

    sessionStorage.setItem('su-voz-bible-last-location', JSON.stringify({
        mode: 'chapter',
        bookId,
        chapter: chapterNumber
    }));

    return true;
},

saveBibleBooksMode: function() {
    sessionStorage.setItem('su-voz-bible-last-location', JSON.stringify({
        mode: 'books',
        bookId: null,
        chapter: null
    }));
},

restoreBibleLastLocation: function() {
    if (this.selectedBibleBook && this.selectedBibleChapter) {
        return this.saveBibleLastLocation(this.selectedBibleBook, this.selectedBibleChapter);
    }

    const location = this.getBibleLastLocation();

    if (!location || location.mode === 'books') {
        this.selectedBibleBook = null;
        this.selectedBibleChapter = null;
        return false;
    }

    this.selectedBibleBook = location.bookId;
    this.selectedBibleChapter = location.chapter;
    return true;
},

renderBible: function() {
    const book = this.selectedBibleBook
        ? this.bibleBooks.find(item => item.id === this.selectedBibleBook)
        : null;

    const activeTestament = this.bibleLibraryTestament === 'new' ? 'new' : 'old';
    const visibleBooks = this.getBibleBooksByTestament(activeTestament);
    const lastLocation = this.getBibleLastLocation();
    const continueBook = lastLocation?.mode === 'chapter'
        ? this.bibleBooks.find(item => item.id === lastLocation.bookId)
        : null;
    const continueLabel = continueBook
        ? `${continueBook.name} ${lastLocation.chapter}`
        : 'Génesis 1';
    const todayStr = this.getTodayDateStr();
    const todayReading = this.getReadingMetadataByDate(todayStr);
    const todayLabel = todayReading?.reference || 'Lectura del día';

    const renderBookCard = (item) => `
        <button
            class="bible-library-book ${book?.id === item.id ? 'is-selected' : ''}"
            type="button"
            data-action="open-bible-book"
            data-book-id="${item.id}"
        >
            <span class="bible-library-book-name">${this.escapeHtml(item.name)}</span>
            <span class="bible-library-book-meta">${item.chapters} cap.</span>
        </button>
    `;

    const renderBookSection = (title, books) => `
        <section class="bible-library-section">
            <div class="bible-library-section-header">
                <div>
                    <h3>${title}</h3>
                </div>
                <span>${books.length} libros</span>
            </div>

            <div class="bible-library-grid">
                ${books.map(renderBookCard).join('')}
            </div>
        </section>
    `;

    const chapters = book
        ? Array.from({ length: book.chapters }, (_, i) => i + 1)
        : [];

    this.$content.innerHTML = `
        <div class="bible-library-view">
            <div class="bible-library-hero">
                <div class="bible-library-kicker">${this.escapeHtml(this.getBibleVersionLabel(this.currentBibleVersion))}</div>
                <h2>Biblia</h2>
                <p>Lee, busca y profundiza en la Palabra.</p>

                <div class="bible-library-actions">
                    <button
                        class="bible-library-action-btn primary"
                        type="button"
                        data-action="open-bible-continue"
                    >
                        <span>Continuar leyendo</span>
                        <small>${this.escapeHtml(continueLabel)}</small>
                    </button>

                    <button
                        class="bible-library-action-btn"
                        type="button"
                        data-action="open-today-reading"
                    >
                        <span>Lectura de hoy</span>
                        <small>${this.escapeHtml(todayLabel)}</small>
                    </button>
                </div>
            </div>

            <section class="bible-quick-actions" aria-label="Acciones rápidas de Biblia">
                <button class="bible-quick-action" type="button" data-action="open-bible-search">
                    <span class="bible-quick-action-icon" aria-hidden="true">⌕</span>
                    <span>Buscar en la Biblia</span>
                </button>
                <button class="bible-quick-action" type="button" data-action="focus-bible-explore">
                    <span class="bible-quick-action-icon" aria-hidden="true">☰</span>
                    <span>Explorar libros</span>
                </button>
                <button class="bible-quick-action" type="button" data-action="open-bible-memory" data-memory="notes">
                    <span class="bible-quick-action-icon" aria-hidden="true">✎</span>
                    <span>Notas</span>
                </button>
                <button class="bible-quick-action" type="button" data-action="open-bible-memory" data-memory="highlights">
                    <span class="bible-quick-action-icon" aria-hidden="true">▧</span>
                    <span>Resaltados</span>
                </button>
            </section>

            ${book ? `
                <section class="bible-chapter-panel" id="bible-explore">
                    <div class="bible-chapter-panel-header">
                        <div>
                            <span>Explorar la Biblia</span>
                            <h3>${this.escapeHtml(book.name)}</h3>
                        </div>

                        <button
                            class="bible-chapter-panel-close"
                            type="button"
                            data-action="clear-bible-book"
                            aria-label="Volver a todos los libros"
                        >
                            ×
                        </button>
                    </div>

                    <div class="bible-chapter-panel-meta">
                        Selecciona un capítulo
                    </div>

                    <div class="bible-chapter-picker">
                        ${chapters.map(chapter => `
                            <button
                                class="bible-chapter-pill"
                                type="button"
                                data-action="open-bible-chapter"
                                data-book-id="${book.id}"
                                data-chapter="${chapter}"
                            >
                                ${chapter}
                            </button>
                        `).join('')}
                    </div>
                </section>
            ` : `
                <section class="bible-explore-shell" id="bible-explore">
                    <div class="bible-explore-head">
                        <div>
                            <span>Explorar</span>
                            <h3>Explorar la Biblia</h3>
                        </div>
                        <div class="bible-testament-tabs" role="tablist" aria-label="Testamento">
                            <button
                                class="bible-testament-tab ${activeTestament === 'old' ? 'active' : ''}"
                                type="button"
                                data-action="set-bible-testament"
                                data-testament="old"
                                role="tab"
                                aria-selected="${activeTestament === 'old' ? 'true' : 'false'}"
                            >
                                Antiguo
                            </button>
                            <button
                                class="bible-testament-tab ${activeTestament === 'new' ? 'active' : ''}"
                                type="button"
                                data-action="set-bible-testament"
                                data-testament="new"
                                role="tab"
                                aria-selected="${activeTestament === 'new' ? 'true' : 'false'}"
                            >
                                Nuevo
                            </button>
                        </div>
                    </div>
                    ${renderBookSection(activeTestament === 'old' ? 'Antiguo Testamento' : 'Nuevo Testamento', visibleBooks)}
                </section>
            `}
        </div>
    `;
},

parseBibleMemoryDate: function(dateStr) {
    const readingKey = parseBibleReadingKey(dateStr);

    if (!readingKey) return null;

    const { versionId, bookId, chapter } = readingKey;
    const book = this.bibleBooks.find(item => item.id === bookId);

    if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
        return null;
    }

    return {
        date: dateStr,
        versionId,
        bookId,
        chapter,
        bookName: book.name,
        reference: `${book.name} ${chapter}`
    };
},

getBibleMemoryItems: function() {
    const memoryMap = new Map();
    let order = 0;

    const addItem = (dateStr, text, data = {}) => {
        const meta = this.parseBibleMemoryDate(dateStr);
        const cleanText = String(text || '').replace(/\s+/g, ' ').trim();

        if (!meta || cleanText.length < 3) return;

        const key = `${dateStr}::${cleanText.toLowerCase()}`;
        const existing = memoryMap.get(key) || {
            id: key,
            order: order++,
            date: dateStr,
            bookId: meta.bookId,
            chapter: meta.chapter,
            reference: meta.reference,
            text: cleanText,
            note: '',
            colors: [],
            hasNote: false,
            hasHighlight: false
        };

        if (data.note) {
            existing.note = String(data.note).trim();
            existing.hasNote = true;
        }

        if (data.color) {
            existing.hasHighlight = true;
            if (!existing.colors.includes(data.color)) {
                existing.colors.push(data.color);
            }
        }

        memoryMap.set(key, existing);
    };

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (!key) continue;

        if (key.startsWith('su-voz-selection-notes-bible-')) {
            const date = key.replace('su-voz-selection-notes-', '');
            this.getSelectionNotes(date).forEach(item => {
                addItem(date, item.text, { note: item.note });
            });
        }

        if (key.startsWith('su-voz-highlights-bible-')) {
            const date = key.replace('su-voz-highlights-', '');
            this.getHighlights(date).forEach(item => {
                addItem(date, item.text, { color: item.color || 'yellow' });
            });
        }
    }

    return Array.from(memoryMap.values())
        .filter(item => item.hasNote || item.hasHighlight)
        .sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return b.order - a.order;
        });
},

renderBibleMemoryCard: function(item) {
    const colorLabels = item.colors
        .map(color => this.getHighlightColorLabel(color))
        .join(', ');
    const colorDots = item.colors.map(color => `
        <span class="bible-memory-color-dot bible-memory-color-${this.escapeHtml(color)}" title="${this.escapeHtml(this.getHighlightColorLabel(color))}"></span>
    `).join('');

    return `
        <article class="bible-memory-card">
            <div class="bible-memory-card-head">
                <div>
                    <span class="bible-memory-reference">${this.escapeHtml(item.reference)}</span>
                    <div class="bible-memory-badges">
                        ${item.hasNote ? '<span>Nota</span>' : ''}
                        ${item.hasHighlight ? `<span>Resaltado${item.colors.length > 1 ? 's' : ''}</span>` : ''}
                    </div>
                </div>
                ${item.hasHighlight ? `<div class="bible-memory-colors" aria-label="Colores de resaltado">${colorDots}</div>` : ''}
            </div>

            <p class="bible-memory-fragment">${this.escapeHtml(item.text)}</p>

            ${item.note ? `
                <div class="bible-memory-note">
                    <span>Nota</span>
                    <p>${this.escapeHtml(item.note)}</p>
                </div>
            ` : ''}

            ${colorLabels ? `<div class="bible-memory-color-label">Color: ${this.escapeHtml(colorLabels)}</div>` : ''}

            <button
                class="bible-memory-open"
                type="button"
                data-action="open-bible-memory-passage"
                data-book-id="${this.escapeHtml(item.bookId)}"
                data-chapter="${item.chapter}"
            >
                Abrir pasaje
            </button>
        </article>
    `;
},

renderBibleMemoryView: function() {
    const filter = ['all', 'notes', 'highlights'].includes(this.bibleMemoryFilter)
        ? this.bibleMemoryFilter
        : 'all';
    const allItems = this.getBibleMemoryItems();
    const items = allItems.filter(item => {
        if (filter === 'notes') return item.hasNote;
        if (filter === 'highlights') return item.hasHighlight;
        return true;
    });

    return `
        <div class="bible-memory-view">
            <section class="bible-memory-hero">
                <div class="bible-search-topline">
                    <button class="bible-search-back" type="button" data-action="back-to-bible-books">
                        ← Biblia
                    </button>
                    <span>Memoria bíblica</span>
                </div>
                <h2>Notas y resaltados</h2>
                <p>Vuelve a los pasajes que marcaste mientras leías la Biblia.</p>
            </section>

            <nav class="bible-memory-filters" aria-label="Filtrar memoria bíblica">
                <button
                    class="bible-memory-filter ${filter === 'all' ? 'active' : ''}"
                    type="button"
                    data-action="set-bible-memory-filter"
                    data-filter="all"
                >
                    Todos
                </button>
                <button
                    class="bible-memory-filter ${filter === 'notes' ? 'active' : ''}"
                    type="button"
                    data-action="set-bible-memory-filter"
                    data-filter="notes"
                >
                    Notas
                </button>
                <button
                    class="bible-memory-filter ${filter === 'highlights' ? 'active' : ''}"
                    type="button"
                    data-action="set-bible-memory-filter"
                    data-filter="highlights"
                >
                    Resaltados
                </button>
            </nav>

            ${items.length ? `
                <div class="bible-memory-summary">
                    ${items.length} elemento${items.length === 1 ? '' : 's'} bíblico${items.length === 1 ? '' : 's'}
                </div>
                <div class="bible-memory-list">
                    ${items.map(item => this.renderBibleMemoryCard(item)).join('')}
                </div>
            ` : `
                <div class="bible-memory-empty">
                    <div class="bible-search-icon">✎</div>
                    <h3>Aún no tienes notas o resaltados bíblicos</h3>
                    <p>Aún no tienes notas o resaltados bíblicos. Marca un versículo mientras lees para encontrarlo aquí.</p>
                </div>
            `}
        </div>
    `;
},

renderBibleReaderPicker: function() {
    if (!this.bibleReaderPickerOpen) return '';

    const bookAbbreviations = {
        gen: 'Gn', exo: 'Ex', lev: 'Lv', num: 'Nm', deu: 'Dt',
        jos: 'Jos', jdg: 'Jue', rut: 'Rut', '1sa': '1 S', '2sa': '2 S',
        '1ki': '1 R', '2ki': '2 R', '1ch': '1 Cr', '2ch': '2 Cr',
        ezr: 'Esd', neh: 'Neh', est: 'Est', job: 'Job', psa: 'Sal',
        pro: 'Pr', ecc: 'Ec', sng: 'Cnt', isa: 'Is', jer: 'Jer',
        lam: 'Lm', ezk: 'Ez', dan: 'Dn', hos: 'Os', jol: 'Jl',
        amo: 'Am', oba: 'Abd', jon: 'Jon', mic: 'Mi', nam: 'Nah',
        hab: 'Hab', zep: 'Sof', hag: 'Hag', zec: 'Zac', mal: 'Mal',
        mat: 'Mt', mrk: 'Mc', luk: 'Lc', jhn: 'Jn', act: 'Hch',
        rom: 'Ro', '1co': '1 Co', '2co': '2 Co', gal: 'Gá', eph: 'Ef',
        php: 'Fil', col: 'Col', '1th': '1 Ts', '2th': '2 Ts',
        '1ti': '1 Ti', '2ti': '2 Ti', tit: 'Tit', phm: 'Flm',
        heb: 'Heb', jas: 'Stg', '1pe': '1 P', '2pe': '2 P',
        '1jn': '1 Jn', '2jn': '2 Jn', '3jn': '3 Jn', jud: 'Jud',
        rev: 'Ap'
    };
    const selectedBook = this.bibleBooks.find(item => item.id === this.bibleReaderPickerBook);
    const currentBook = this.bibleBooks.find(item => item.id === this.selectedBibleBook);
    const selectedChapter = Number(this.selectedBibleChapter) || 1;
    const activeTestament = this.bibleReaderPickerTestament === 'new'
        ? 'new'
        : 'old';
    const books = this.getBibleBooksByTestament(activeTestament);
    const chapters = selectedBook
        ? Array.from({ length: selectedBook.chapters }, (_, i) => i + 1)
        : [];

    return `
        <div class="bible-picker-sheet" role="dialog" aria-modal="true" aria-label="Seleccionar libro y capítulo">
            <button class="bible-picker-backdrop" type="button" data-action="close-bible-reader-picker" aria-label="Cerrar selector"></button>
            <section class="bible-picker-panel">
                <div class="bible-picker-handle" aria-hidden="true"></div>
                <div class="bible-picker-head">
                    <div>
                        <h2>Elegir pasaje</h2>
                        <p>${selectedBook
                            ? `${this.escapeHtml(selectedBook.name)} · Selecciona un capítulo`
                            : this.escapeHtml(currentBook
                                ? `Actual: ${currentBook.name} ${selectedChapter}`
                                : 'Selecciona un libro')}</p>
                    </div>
                    <button
                        class="bible-picker-close"
                        type="button"
                        data-action="close-bible-reader-picker"
                        aria-label="Cerrar selector"
                    >
                        ×
                    </button>
                </div>

                <div class="bible-picker-tabs" role="tablist" aria-label="Testamento">
                    <button
                        class="bible-picker-tab ${activeTestament === 'old' ? 'active' : ''}"
                        type="button"
                        data-action="set-reader-picker-testament"
                        data-testament="old"
                        role="tab"
                        aria-selected="${activeTestament === 'old' ? 'true' : 'false'}"
                    >
                        Antiguo
                    </button>
                    <button
                        class="bible-picker-tab ${activeTestament === 'new' ? 'active' : ''}"
                        type="button"
                        data-action="set-reader-picker-testament"
                        data-testament="new"
                        role="tab"
                        aria-selected="${activeTestament === 'new' ? 'true' : 'false'}"
                    >
                        Nuevo
                    </button>
                </div>

                <div class="bible-picker-layout ${selectedBook ? 'is-chapter-view' : 'is-book-view'}">
                    ${selectedBook ? `
                        <div class="bible-picker-section-head">
                            <button
                                class="bible-picker-back"
                                type="button"
                                data-action="back-reader-picker-books"
                                aria-label="Volver a libros"
                            >
                                <span aria-hidden="true">←</span>
                                Libros
                            </button>
                            <strong>${this.escapeHtml(selectedBook.name)}</strong>
                            <span>${selectedBook.chapters} capítulos</span>
                        </div>

                        <div class="bible-picker-chapters" aria-label="Capítulos de ${this.escapeHtml(selectedBook.name)}">
                            ${chapters.map(chapter => {
                                const isActive = selectedBook.id === this.selectedBibleBook && chapter === selectedChapter;

                                return `
                                    <button
                                        class="bible-picker-chapter ${isActive ? 'is-active' : ''}"
                                        type="button"
                                        data-action="open-reader-picker-chapter"
                                        data-book-id="${selectedBook.id}"
                                        data-chapter="${chapter}"
                                        aria-label="${this.escapeHtml(selectedBook.name)} ${chapter}"
                                    >
                                        ${chapter}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                    <div class="bible-picker-books" aria-label="Libros del ${activeTestament === 'old' ? 'Antiguo' : 'Nuevo'} Testamento">
                        ${books.map(book => `
                            <button
                                class="bible-picker-book ${book.id === currentBook?.id ? 'is-active' : ''}"
                                type="button"
                                data-action="select-reader-picker-book"
                                data-book-id="${book.id}"
                                aria-label="${this.escapeHtml(book.name)}, ${book.chapters} capítulos"
                            >
                                <span class="bible-picker-book-abbr">${this.escapeHtml(bookAbbreviations[book.id] || book.name.slice(0, 3))}</span>
                                <span class="bible-picker-book-name">${this.escapeHtml(book.name)}</span>
                            </button>
                        `).join('')}
                    </div>
                    `}
                </div>
            </section>
        </div>
    `;
},

mountBibleReaderPicker: function() {
    if (!this.$content) return;

    document.body.classList.toggle('bible-picker-open', this.bibleReaderPickerOpen);

    const existing = this.$content.querySelector('.bible-picker-sheet');

    if (existing) {
        existing.remove();
    }

    if (!this.bibleReaderPickerOpen) return;

    const readerView = this.$content.querySelector('.bible-reader-view');

    if (readerView) {
        readerView.insertAdjacentHTML('beforeend', this.renderBibleReaderPicker());
        requestAnimationFrame(() => {
            const activeBook = this.$content?.querySelector('.bible-picker-book.is-active');
            activeBook?.scrollIntoView({ block: 'center', inline: 'nearest' });
        });
    }
},

openBibleReaderPicker: function() {
    const currentBook = this.bibleBooks.find(item => item.id === this.selectedBibleBook);

    this.bibleReaderPickerOpen = true;
    this.bibleReaderPickerBook = null;
    this.bibleReaderPickerTestament = this.getTestamentFromBookId(currentBook?.id) === 'new' ? 'new' : 'old';
    this.mountBibleReaderPicker();
},

closeBibleReaderPicker: function() {
    this.bibleReaderPickerOpen = false;
    this.mountBibleReaderPicker();
},

renderBibleVersionPicker: function() {
    if (!this.bibleVersionPickerOpen) return '';

    const versions = [
        { id: 'rv1909', label: 'Reina-Valera 1909' },
        { id: 'nbla', label: 'NBLA' },
        { id: 'nvi', label: 'NVI' },
        { id: 'biblia-libre', label: 'Biblia Libre' }
    ];

    return `
        <div id="bible-version-picker-sheet" class="bible-picker-sheet version-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="version-picker-title">
            <div class="bible-picker-backdrop" data-action="close-version-picker"></div>
            <section class="bible-picker-panel">
                <div class="bible-picker-handle" data-action="close-version-picker"></div>
                <div class="bible-picker-head">
                    <div>
                        <h2 id="version-picker-title">Versión Bíblica</h2>
                        <p>Seleccionar versión bíblica</p>
                    </div>
                    <button class="bible-picker-close" type="button" data-action="close-version-picker" aria-label="Cerrar selector">×</button>
                </div>
                <div class="bible-picker-body">
                    <div class="version-picker-list">
                        ${versions.map(v => `
                            <button
                                class="version-picker-option-btn ${this.currentBibleVersion === v.id ? 'is-active' : ''}"
                                type="button"
                                data-action="select-version-option"
                                data-version-id="${v.id}"
                            >
                                <span>${this.escapeHtml(v.label)}</span>
                                ${this.currentBibleVersion === v.id ? '<span class="version-option-check">✓</span>' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </section>
        </div>
    `;
},

mountBibleVersionPicker: function() {
    if (!this.$content) return;

    document.body.classList.toggle('bible-version-picker-open', this.bibleVersionPickerOpen);

    const existing = this.$content.querySelector('#bible-version-picker-sheet');
    if (existing) {
        existing.remove();
    }

    if (!this.bibleVersionPickerOpen) return;

    const readerView = this.$content.querySelector('.bible-reader-view');
    if (readerView) {
        readerView.insertAdjacentHTML('beforeend', this.renderBibleVersionPicker());
    }
},

openBibleVersionPicker: function() {
    this.bibleVersionPickerOpen = true;
    this.mountBibleVersionPicker();
},

closeBibleVersionPicker: function() {
    this.bibleVersionPickerOpen = false;
    this.mountBibleVersionPicker();
},

renderBibleReaderContextBar: function(bookName, chapterNumber) {
    const key = `${bookName}-${chapterNumber}`;
    const status = this.getBibleChapterVoiceStatus(key);
    const isPlaying = status === 'playing';
    const isPaused = status === 'paused';
    const audioLabel = isPlaying ? 'Pausa' : (isPaused ? 'Reanudar' : 'Audio');
    const audioIcon = isPlaying ? 'Ⅱ' : '▶';
    const audioAriaLabel = isPlaying
        ? 'Pausar audio del capítulo'
        : (isPaused ? 'Reanudar audio del capítulo' : 'Escuchar capítulo');

    return `
        <div class="bible-reader-context-bar ${isPlaying || isPaused ? 'has-audio-stop' : ''}" role="toolbar" aria-label="Accesos rápidos del lector bíblico">
            <button
                class="bible-reader-tool ${isPlaying || isPaused ? 'is-active' : ''}"
                type="button"
                data-action="reader-context-audio"
                aria-label="${audioAriaLabel}"
            >
                <span class="bible-reader-tool-icon" aria-hidden="true">${audioIcon}</span>
                <span>${audioLabel}</span>
            </button>
            ${isPlaying || isPaused ? `
                <button
                    class="bible-reader-tool"
                    type="button"
                    data-action="reader-context-audio-stop"
                    aria-label="Detener audio del capítulo"
                >
                    <span class="bible-reader-tool-icon" aria-hidden="true">■</span>
                    <span>Detener</span>
                </button>
            ` : ''}
            <button
                class="bible-reader-tool"
                type="button"
                data-action="open-bible-search"
                aria-label="Buscar en la Biblia"
            >
                <span class="bible-reader-tool-icon" aria-hidden="true">⌕</span>
                <span>Buscar</span>
            </button>
            <button
                class="bible-reader-tool"
                type="button"
                data-action="open-bible-reader-picker"
                aria-label="Abrir selector de capítulos"
            >
                <span class="bible-reader-tool-icon" aria-hidden="true">☰</span>
                <span>Capítulos</span>
            </button>
            <button
                class="bible-reader-tool ${this.bibleReadingSettingsOpen ? 'is-active' : ''}"
                type="button"
                data-action="toggle-bible-reading-settings"
                aria-label="Abrir ajustes de lectura"
                aria-expanded="${this.bibleReadingSettingsOpen ? 'true' : 'false'}"
            >
                <span class="bible-reader-tool-icon" aria-hidden="true">Aa</span>
                <span>Ajustes</span>
            </button>
        </div>
    `;
},

renderBibleReadingSettingsPanel: function() {
    if (!this.bibleReadingSettingsOpen) return '';

    const settings = this.bibleReadingSettings || {};
    const textSize = settings.textSize || 'normal';
    const spacing = settings.spacing || 'comfortable';
    const focusMode = !!settings.focusMode;

    const renderOption = (group, value, label, activeValue) => `
        <button
            class="bible-reading-setting-option ${activeValue === value ? 'is-active' : ''}"
            type="button"
            data-action="set-bible-reading-setting"
            data-setting="${group}"
            data-value="${value}"
            aria-pressed="${activeValue === value ? 'true' : 'false'}"
        >
            ${label}
        </button>
    `;

    return `
        <div class="bible-reading-settings-panel" role="dialog" aria-label="Ajustes de lectura bíblica">
            <div class="bible-reading-settings-head">
                <div>
                    <span>Lectura</span>
                    <h3>Ajustes</h3>
                </div>
                <button
                    class="bible-reading-settings-close"
                    type="button"
                    data-action="close-bible-reading-settings"
                    aria-label="Cerrar ajustes de lectura"
                >
                    ×
                </button>
            </div>

            <div class="bible-reading-setting-group">
                <span>Tamaño de texto</span>
                <div class="bible-reading-setting-options">
                    ${renderOption('textSize', 'small', 'Pequeño', textSize)}
                    ${renderOption('textSize', 'normal', 'Normal', textSize)}
                    ${renderOption('textSize', 'large', 'Grande', textSize)}
                </div>
            </div>

            <div class="bible-reading-setting-group">
                <span>Espaciado</span>
                <div class="bible-reading-setting-options two">
                    ${renderOption('spacing', 'compact', 'Compacto', spacing)}
                    ${renderOption('spacing', 'comfortable', 'Cómodo', spacing)}
                </div>
            </div>

            <button
                class="bible-reading-focus-toggle ${focusMode ? 'is-active' : ''}"
                type="button"
                data-action="toggle-bible-focus-mode"
                aria-pressed="${focusMode ? 'true' : 'false'}"
            >
                <span>Modo enfoque</span>
                <strong>${focusMode ? 'Activo' : 'Inactivo'}</strong>
            </button>
        </div>
    `;
},

mountBibleReadingSettingsPanel: function() {
    if (!this.$content) return;

    const existing = this.$content.querySelector('.bible-reading-settings-panel');
    existing?.remove();

    if (!this.bibleReadingSettingsOpen) return;

    const readerView = this.$content.querySelector('.bible-reader-view');
    readerView?.insertAdjacentHTML('beforeend', this.renderBibleReadingSettingsPanel());
},

updateBibleReaderContextBarUI: function() {
    const book = this.bibleBooks.find(item => item.id === this.selectedBibleBook);
    const chapter = Number(this.selectedBibleChapter);
    const bar = this.$content?.querySelector('.bible-reader-context-bar');

    if (!bar || !book || !chapter) return;

    const nextBar = document.createRange().createContextualFragment(
        this.renderBibleReaderContextBar(book.name, chapter)
    ).firstElementChild;

    if (nextBar) {
        bar.replaceWith(nextBar);
    }
},

setBibleReadingSetting: function(setting, value) {
    if (setting === 'textSize' && ['small', 'normal', 'large'].includes(value)) {
        this.bibleReadingSettings.textSize = value;
    } else if (setting === 'spacing' && ['compact', 'comfortable'].includes(value)) {
        this.bibleReadingSettings.spacing = value;
    } else {
        return;
    }

    this.saveBibleReadingSettings();
    this.applyBibleReadingSettingsToDOM();
    this.mountBibleReadingSettingsPanel();
    this.updateBibleReaderContextBarUI();
},

toggleBibleReadingFocusMode: function() {
    this.bibleReadingSettings.focusMode = !this.bibleReadingSettings.focusMode;
    this.saveBibleReadingSettings();
    this.applyBibleReadingSettingsToDOM();
    this.mountBibleReadingSettingsPanel();
    this.updateBibleReaderContextBarUI();
},

toggleBibleChapterVoiceFromContext: function() {
    const book = this.bibleBooks.find(item => item.id === this.selectedBibleBook);
    const chapter = Number(this.selectedBibleChapter);

    if (!book || !chapter || !this.currentBibleChapterData) {
        this.showToast('El capítulo aún se está cargando');
        return;
    }

    const key = `${book.name}-${chapter}`;
    const verses = this.getBibleChapterVoiceVerses(
        this.currentBibleChapterData,
        book.name,
        chapter
    );

    this.toggleBibleChapterVoice(key, verses, `${book.name} ${chapter}`);
},

renderBibleReading: async function() {
    this.stopBibleChapterVoice(true);

    const requestedBookId = this.selectedBibleBook;
    const requestedChapter = Number(this.selectedBibleChapter);
    const requestedBook = this.bibleBooks.find(b => b.id === requestedBookId);

    if (!requestedBook || !requestedChapter) {
        this.navigate('bible');
        return;
    }

    this.saveBibleLastLocation(requestedBookId, requestedChapter);

    const previousDisabled = requestedChapter <= 1;
    const nextDisabled = requestedChapter >= requestedBook.chapters;

    const versionSelectorHtml = `
        <div class="bible-version-select-wrapper">
            <button
                id="bible-version-button"
                class="bible-version-button"
                type="button"
                data-action="open-bible-version-picker"
                aria-label="Seleccionar versión bíblica. Versión actual: ${this.escapeHtml(this.getBibleVersionLabel(this.currentBibleVersion))}"
            >
                ${this.escapeHtml(this.getBibleVersionLabel(this.currentBibleVersion))} ▼
            </button>
        </div>
    `;

    const renderReaderShell = (bodyHtml) => `
        <div class="${this.getBibleReaderClassNames()}">
            <div class="bible-reader-topbar">
                <button
                    class="bible-reader-icon-btn"
                    type="button"
                    data-action="back-to-bible-books"
                    aria-label="Abrir libros"
                    title="Libros"
                >
                    ☰
                </button>

                <div class="bible-reader-title-split" aria-label="Navegación del capítulo">
                    <button
                        class="bible-reader-title-btn bible-reader-book-btn"
                        type="button"
                        data-action="open-bible-reader-picker"
                        aria-label="Cambiar libro o capítulo"
                    >
                        <span class="bible-reader-book">${this.escapeHtml(requestedBook.name)}</span>
                    </button>

                    <button
                        class="bible-reader-title-btn bible-reader-chapter-btn"
                        type="button"
                        data-action="open-bible-reader-picker"
                        aria-label="Abrir selector de ${this.escapeHtml(requestedBook.name)} ${requestedChapter}"
                    >
                        <span class="bible-reader-chapter">Cap. ${requestedChapter} ▼</span>
                    </button>
                </div>

                <button
                    class="bible-reader-icon-btn"
                    type="button"
                    data-action="open-bible-search"
                    aria-label="Buscar en la Biblia"
                    title="Buscar"
                >
                    🔍
                </button>
            </div>

            <div class="bible-reader-subbar">
                <button
                    class="bible-reader-nav-btn"
                    type="button"
                    data-action="bible-prev-chapter"
                    aria-label="Capítulo anterior"
                    title="Capítulo anterior"
                    ${previousDisabled ? 'disabled' : ''}
                >
                    ‹
                </button>

                ${versionSelectorHtml}

                <button
                    class="bible-reader-nav-btn"
                    type="button"
                    data-action="bible-next-chapter"
                    aria-label="Capítulo siguiente"
                    title="Capítulo siguiente"
                    ${nextDisabled ? 'disabled' : ''}
                >
                    ›
                </button>
            </div>

            ${bodyHtml}
            ${this.renderBibleReaderContextBar(requestedBook.name, requestedChapter)}
            ${this.renderBibleReadingSettingsPanel()}
            ${this.renderBibleReaderPicker()}
            ${this.renderBibleVersionPicker()}
        </div>
    `;

    this.$content.innerHTML = renderReaderShell(`
        <div class="loading">
            <div class="spinner"></div>
            Cargando capítulo...
        </div>
    `);

    try {
        const chapterData = await getBibleChapter(requestedBookId, requestedChapter);

        if (
            this.currentView !== 'bible-reading' ||
            this.selectedBibleBook !== requestedBookId ||
            Number(this.selectedBibleChapter) !== requestedChapter
        ) {
            return;
        }

        this.currentBibleChapterData = chapterData;
        const readingDateKey = createBibleReadingKey(
            chapterData.versionId,
            requestedBookId,
            requestedChapter
        );

        this.$content.innerHTML = renderReaderShell(`
            <div class="bible-reader-content">
                <div class="reading-text-shell" data-reading-date="${this.escapeHtml(readingDateKey)}">
                    <div class="reading-text bible-api-content selection-surface">
                        ${this.renderBibleChapterVoiceControl(requestedBook.name, requestedChapter)}
                        ${chapterData.content || '<p style="text-align: center; color: var(--text-muted);">No se pudo cargar el contenido.</p>'}
                    </div>
                </div>
                <nav class="bible-reader-bottom-nav" aria-label="Navegación de capítulos">
                    <button
                        class="bible-reader-bottom-btn"
                        type="button"
                        data-action="bible-prev-chapter"
                        ${previousDisabled ? 'disabled' : ''}
                    >
                        ${previousDisabled ? 'Anterior' : `← ${this.escapeHtml(requestedBook.name)} ${requestedChapter - 1}`}
                    </button>

                    <button
                        class="bible-reader-bottom-btn primary"
                        type="button"
                        data-action="open-bible-chapters"
                    >
                        Capítulos
                    </button>

                    <button
                        class="bible-reader-bottom-btn"
                        type="button"
                        data-action="bible-next-chapter"
                        ${nextDisabled ? 'disabled' : ''}
                    >
                        ${nextDisabled ? 'Siguiente' : `${this.escapeHtml(requestedBook.name)} ${requestedChapter + 1} →`}
                    </button>
                </nav>
            </div>
        `);

        this.restoreHighlightsInDOMForVerses(readingDateKey);

        if (this.targetVerse) {
            this.scrollToTargetVerse();
        }
    } catch (error) {
        const isOffline = error?.code === 'BIBLE_OFFLINE' || navigator.onLine === false;

        console.error('[renderBibleReading] Excepción capturada al cargar capítulo:', {
            error,
            message: error?.message,
            code: error?.code,
            stack: error?.stack,
            details: error?.details,
            firebaseCode: error?.details?.firebaseCode || error?.code,
            proxyCode: error?.details?.proxyCode,
            currentBibleVersion: this.currentBibleVersion,
            requestedBookId,
            requestedChapter,
            isOffline
        });

        if (
            this.currentView !== 'bible-reading' ||
            this.selectedBibleBook !== requestedBookId ||
            Number(this.selectedBibleChapter) !== requestedChapter
        ) {
            return;
        }

        const isRemote = this.currentBibleVersion !== 'rv1909';

        let errorMessage = error?.message || 'Intenta nuevamente más tarde.';
        let actionButtonHtml = `
            <button class="btn-primary" type="button" data-action="back-to-bible-books" style="margin-top: 20px;">
                Elegir otro libro
            </button>
        `;

        if (isRemote) {
            if (isOffline) {
                errorMessage = 'Esta versión requiere conexión a internet.';
            } else {
                errorMessage = 'Esta versión no está disponible temporalmente.';
            }
            actionButtonHtml = `
                <button class="btn-primary" type="button" data-action="revert-to-rv1909" style="margin-top: 20px;">
                    Volver a Reina-Valera 1909
                </button>
            `;
        }

        this.$content.innerHTML = renderReaderShell(`
            <div class="empty-state">
                <h3>⚠️ No se pudo cargar el capítulo</h3>
                <p>${this.escapeHtml(errorMessage)}</p>
                ${actionButtonHtml}
            </div>
        `);
    }
},
    
normalizeCalendarBookText: function(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
},

getBookNameFromReference: function(reference) {
    const normalizedReference = this.normalizeCalendarBookText(reference);
    const booksBySpecificName = [...this.bibleBooks].sort((a, b) =>
        this.normalizeCalendarBookText(b.name).length - this.normalizeCalendarBookText(a.name).length
    );

    return booksBySpecificName.find(book => {
        const normalizedName = this.normalizeCalendarBookText(book.name);
        return normalizedReference === normalizedName
            || normalizedReference.startsWith(`${normalizedName} `)
            || normalizedReference.startsWith(`${normalizedName}:`);
    }) || null;
},

getCalendarReadings: function() {
    const source = this.readingIndexLoaded && this.readingIndex.length > 0
        ? this.readingIndex
        : this.data;

    return source
        .filter(item => item?.date && item?.reference)
        .map(item => ({
            date: item.date,
            reference: item.reference,
            bookId: item.bookId || null
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
},

getCalendarBookInfo: function(item) {
    if (item.bookId) {
        const book = this.bibleBooks.find(bookItem => bookItem.id === item.bookId);

        if (book) {
            return {
                id: book.id,
                name: book.name
            };
        }
    }

    const bookInfo = this.getBookNameFromReference(item.reference)
        || findBookByReference(item.reference, this.bibleBooks);

    return {
        id: bookInfo?.id || 'otros',
        name: bookInfo?.name || bookInfo?.nombre || 'Otras lecturas'
    };
},

getCalendarBookGroups: function(items = this.getCalendarReadings()) {
    const groups = [];
    const groupMap = new Map();

    items.forEach(item => {
        const bookInfo = this.getCalendarBookInfo(item);
        const bookId = bookInfo.id;
        const bookName = bookInfo.name;

        if (!groupMap.has(bookId)) {
            const group = {
                id: bookId,
                name: bookName,
                items: []
            };

            groupMap.set(bookId, group);
            groups.push(group);
        }

        groupMap.get(bookId).items.push(item);
    });

    return groups.sort((a, b) => {
        const firstDateA = a.items[0]?.date || '';
        const firstDateB = b.items[0]?.date || '';
        return firstDateA.localeCompare(firstDateB);
    });
},

getCalendarBookMeta: function(group, readDateSet, todayStr) {
    const total = group.items.length;
    const completed = group.items.filter(item => readDateSet.has(item.date)).length;
    const firstDate = group.items[0]?.date || '';
    const lastDate = group.items[group.items.length - 1]?.date || '';
    const isCompleted = total > 0 && completed === total;
    const isUpcoming = group.items.every(item => item.date > todayStr);
    const isCurrent = firstDate && lastDate && todayStr >= firstDate && todayStr <= lastDate;
    const hasPastUnread = group.items.some(item => item.date <= todayStr && !readDateSet.has(item.date));
    const stateKey = isCompleted
        ? 'completed'
        : isUpcoming
            ? 'upcoming'
            : isCurrent
                ? 'current'
                : hasPastUnread
                    ? 'pending'
                    : 'pending';
    const stateLabelMap = {
        upcoming: 'Próximo',
        current: 'En curso',
        completed: 'Completado',
        pending: 'Pendiente'
    };

    return {
        total,
        completed,
        firstDate,
        lastDate,
        stateKey,
        stateLabel: stateLabelMap[stateKey],
        hasPastUnread,
        isCompleted,
        isUpcoming,
        isCurrent
    };
},

getActiveCalendarBookId: function(groups, todayStr) {
    const groupForToday = groups.find(group => {
        const firstDate = group.items[0]?.date;
        const lastDate = group.items[group.items.length - 1]?.date;
        return firstDate && lastDate && todayStr >= firstDate && todayStr <= lastDate;
    });

    if (groupForToday) return groupForToday.id;

    const todayDate = new Date(`${todayStr}T12:00:00`);
    const closestGroup = groups.reduce((closest, group) => {
        const closestDate = new Date(`${closest.items[0]?.date || todayStr}T12:00:00`);
        const groupDate = new Date(`${group.items[0]?.date || todayStr}T12:00:00`);

        return Math.abs(groupDate - todayDate) < Math.abs(closestDate - todayDate)
            ? group
            : closest;
    }, groups[0]);

    return closestGroup?.id || '';
},

renderCalendarBookSelector: function(groups, readDateSet, todayStr) {
    const activeBookId = this.getActiveCalendarBookId(groups, todayStr);

    return `
        <nav class="calendar-book-selector" aria-label="Libros del plan">
            ${groups.map(group => {
                const meta = this.getCalendarBookMeta(group, readDateSet, todayStr);
                const isActive = group.id === activeBookId;

                return `
                    <button
                        class="calendar-book-selector-btn ${isActive ? 'is-active' : ''}"
                        type="button"
                        data-action="jump-calendar-book"
                        data-book-id="${this.escapeHtml(group.id)}"
                        aria-current="${isActive ? 'true' : 'false'}">
                        <span>${this.escapeHtml(group.name)}</span>
                        <small>${meta.stateLabel}</small>
                    </button>
                `;
            }).join('')}
        </nav>
    `;
},

getCalendarFilterOptions: function() {
    return [
        { id: 'all', label: 'Todo' },
        { id: 'today', label: 'Hoy' },
        { id: 'pending', label: 'Pend.' },
        { id: 'upcoming', label: 'Próx.' },
        { id: 'read', label: 'Leídas' },
        { id: 'notes', label: 'Reflexión' },
        { id: 'highlights', label: 'Resaltados' }
    ];
},

renderCalendarFilters: function() {
    const activeFilter = this.calendarActiveFilter || 'all';

    return `
        <nav class="calendar-filter-bar" aria-label="Filtrar lecturas del calendario">
            ${this.getCalendarFilterOptions().map(filter => {
                const isActive = filter.id === activeFilter;

                return `
                    <button
                        class="calendar-filter-chip ${isActive ? 'is-active' : ''}"
                        type="button"
                        data-action="set-calendar-filter"
                        data-filter="${this.escapeHtml(filter.id)}"
                        aria-pressed="${isActive ? 'true' : 'false'}">
                        ${this.escapeHtml(filter.label)}
                    </button>
                `;
            }).join('')}
        </nav>
    `;
},

filterCalendarItems: function(items, readDateSet, todayStr) {
    const activeFilter = this.calendarActiveFilter || 'all';

    return items.filter(item => {
        if (activeFilter === 'today') return item.date === todayStr;
        if (activeFilter === 'pending') return item.date <= todayStr && !readDateSet.has(item.date);
        if (activeFilter === 'upcoming') return item.date > todayStr;
        if (activeFilter === 'read') return readDateSet.has(item.date);
        if (activeFilter === 'notes') return this.hasNote(item.date);
        if (activeFilter === 'highlights') return this.hasHighlights(item.date);
        return true;
    });
},

renderCalendarBookSection: function(group, readDateSet, todayStr) {
    const meta = this.getCalendarBookMeta(group, readDateSet, todayStr);
    const total = meta.total;
    const completed = meta.completed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const firstDate = meta.firstDate;
    const lastDate = meta.lastDate;
    const isCompleted = meta.isCompleted;
    const isUpcoming = meta.isUpcoming;
    const stateKey = meta.stateKey;
    const firstReading = group.items[0] || null;
    const todayReading = group.items.find(item => item.date === todayStr) || null;
    const nextPendingReading = group.items.find(item => !readDateSet.has(item.date)) || null;
    const latestCompletedReading = [...group.items].reverse().find(item => readDateSet.has(item.date)) || null;
    let actionReading = nextPendingReading || firstReading;
    let actionLabel = 'Continuar pendiente';

    if (isCompleted) {
        actionReading = firstReading;
        actionLabel = 'Repasar libro';
    } else if (todayReading) {
        actionReading = todayReading;
        actionLabel = 'Ir a la lectura de hoy';
    } else if (isUpcoming) {
        actionReading = firstReading;
        actionLabel = 'Ver primera lectura';
    }
    const pendingLabel = nextPendingReading
        ? `${this.formatDateEs(nextPendingReading.date)} · ${nextPendingReading.reference}`
        : 'Todas las lecturas completadas';
    const latestCompletedLabel = latestCompletedReading
        ? `${this.formatDateEs(latestCompletedReading.date)} · ${latestCompletedReading.reference}`
        : 'Aún no hay lecturas completadas';
    const noteCount = group.items.filter(item => this.hasNote(item.date)).length;
    const highlightDayCount = group.items.filter(item => this.hasHighlights(item.date)).length;
    const defaultOpen = stateKey === 'current' || (stateKey === 'pending' && meta.hasPastUnread);
    const isOpen = Object.prototype.hasOwnProperty.call(this.calendarBookOpenState, group.id)
        ? this.calendarBookOpenState[group.id]
        : defaultOpen;
    const rangeLabel = firstDate && lastDate
        ? `${this.formatDateEs(firstDate)} - ${this.formatDateEs(lastDate)}`
        : '';
    const visibleItems = this.filterCalendarItems(group.items, readDateSet, todayStr);

    return `
        <section class="calendar-book-road ${isOpen ? 'is-open' : 'is-collapsed'}" data-calendar-book="${this.escapeHtml(group.id)}" id="calendar-book-${this.escapeHtml(group.id)}">
            <button class="calendar-book-header" type="button" data-action="toggle-calendar-book" data-book-id="${this.escapeHtml(group.id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
                <div>
                    <span class="calendar-book-kicker">Libro</span>
                    <h3>${this.escapeHtml(group.name)}</h3>
                    <p>${this.escapeHtml(rangeLabel)}</p>
                </div>
                <div class="calendar-book-side">
                    <span class="calendar-book-state calendar-book-state-${stateKey}">
                        ${meta.stateLabel}
                    </span>
                    <div class="calendar-book-progress-summary">
                        <strong>${completed}/${total}</strong>
                        <span>${percentage}%</span>
                    </div>
                    <span class="calendar-book-toggle">
                        ${isOpen ? 'Ocultar lecturas' : 'Ver lecturas'}
                    </span>
                </div>
            </button>

            <div class="calendar-book-progress" aria-hidden="true">
                <span style="width: ${percentage}%"></span>
            </div>

            <div class="calendar-book-micro-summary">
                <div class="calendar-book-micro-grid">
                    <div>
                        <span>Próxima pendiente</span>
                        <strong>${this.escapeHtml(pendingLabel)}</strong>
                    </div>
                    <div>
                        <span>Reflexiones</span>
                        <strong>${noteCount}</strong>
                    </div>
                    <div>
                        <span>Días con resaltados</span>
                        <strong>${highlightDayCount}</strong>
                    </div>
                    <div>
                        <span>Última completada</span>
                        <strong>${this.escapeHtml(latestCompletedLabel)}</strong>
                    </div>
                </div>
                ${actionReading ? `
                    <button class="calendar-book-action" type="button" data-nav="reading" data-param="${this.escapeHtml(actionReading.date)}">
                        ${actionLabel}
                    </button>
                ` : ''}
            </div>

            ${isCompleted ? `
                <div class="calendar-book-completion">
                    <div class="calendar-book-completion-header">
                        <span>Libro completado</span>
                        <strong>${this.escapeHtml(group.name)}</strong>
                        <small>${this.escapeHtml(rangeLabel)}</small>
                    </div>
                    <div class="calendar-book-completion-stats">
                        <div>
                            <span>Lecturas completadas</span>
                            <strong>${completed}/${total}</strong>
                        </div>
                        <div>
                            <span>Reflexiones escritas</span>
                            <strong>${noteCount}</strong>
                        </div>
                        <div>
                            <span>Días con resaltados</span>
                            <strong>${highlightDayCount}</strong>
                        </div>
                    </div>
                    <p>Has terminado este recorrido. Vuelve a tus notas y resaltados para repasar lo que meditaste.</p>
                    ${firstReading ? `
                        <button class="calendar-book-completion-action" type="button" data-nav="reading" data-param="${this.escapeHtml(firstReading.date)}">
                            Repasar desde el inicio
                        </button>
                    ` : ''}
                </div>
            ` : ''}

            <div class="calendar-path ${isOpen ? 'is-expanded' : 'is-collapsed'}" ${isOpen ? 'aria-hidden="false"' : 'hidden aria-hidden="true"'}>
                ${visibleItems.length === 0 ? `
                    <div class="calendar-filter-empty">No hay lecturas en este filtro.</div>
                ` : visibleItems.map((item) => {
                    const isRead = readDateSet.has(item.date);
                    const isToday = item.date === todayStr;
                    const readClass = isRead ? 'read' : '';
                    const todayClass = isToday ? 'today' : '';
                    const stepNumber = group.items.indexOf(item) + 1;

                    return `
                        <button class="calendar-day ${readClass} ${todayClass}" type="button" data-nav="reading" data-param="${this.escapeHtml(item.date)}" data-calendar-date="${this.escapeHtml(item.date)}" ${isToday ? 'data-calendar-today="true"' : ''}>
                            ${isToday ? '<span class="today-badge">HOY</span>' : ''}
                            <span class="calendar-step">${stepNumber}</span>
                            <span class="cal-date">${this.escapeHtml(this.formatDateEs(item.date))}</span>
                            <span class="cal-ref">
                                ${this.escapeHtml(item.reference)}
                                <span class="calendar-status-badges">
                                    ${isRead ? '<span class="read-badge" title="Leído">✓</span>' : ''}
                                    ${this.hasNote(item.date) ? '<span class="note-badge" title="Tiene reflexión">📝</span>' : ''}
                                    ${this.hasHighlights(item.date) ? '<span class="highlight-badge" title="Tiene resaltados">✨</span>' : ''}
                                </span>
                            </span>
                            <span class="cal-arrow">Abrir lectura</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </section>
    `;
},

   renderCalendar: function() {
    const calendarReadings = this.getCalendarReadings();

    if (calendarReadings.length === 0) {
        this.$content.innerHTML = `<div class="empty-state">📅 No hay lecturas disponibles.</div>`;
        return;
    }

    const todayStr = this.getTodayDateStr();
    const readDates = this.getReadDates();
    const readDateSet = new Set(readDates);
    const groups = this.getCalendarBookGroups(calendarReadings);
    const totalRead = calendarReadings.filter(item => readDateSet.has(item.date)).length;
    const totalAvailable = calendarReadings.length;
    const totalPercentage = totalAvailable > 0 ? Math.round((totalRead / totalAvailable) * 100) : 0;

    let html = `
    ${this.renderViewHeader(
        'Camino de lectura',
        'Avanza por libros bíblicos y vuelve a cada lectura guardada.'
    )}
    ${this.renderCalendarBookSelector(groups, readDateSet, todayStr)}
    ${this.renderCalendarFilters()}
    <section class="calendar-overview">
        <div>
            <span>Plan completo</span>
            <strong>${totalPercentage}%</strong>
        </div>
        <div class="calendar-overview-stats">
            <span>${totalAvailable} lecturas</span>
            <span>${totalRead} completadas</span>
            <span>${groups.length} ${groups.length === 1 ? 'libro' : 'libros'}</span>
        </div>
    </section>
    <div class="calendar-book-list">
        ${groups.map(group => this.renderCalendarBookSection(group, readDateSet, todayStr)).join('')}
    </div>
`;
    this.$content.innerHTML = html;

    requestAnimationFrame(() => {
    this.restoreCalendarPosition();
});
},

renderCommunityLoadError: function(error) {
    if (this.currentView !== 'community') return;

    const errorDetails = {
        code: error?.code || this._lastAuthError?.code || 'community/load-failed',
        message: error?.message || this._lastAuthError?.message || 'Error desconocido',
        name: error?.name || this._lastAuthError?.name || 'Error'
    };

    console.error(`[Community] No se pudo completar la carga: ${JSON.stringify(errorDetails)}`);
    this.$content.innerHTML = `
        <div class="community-container">
            <div class="community-empty-state">
                <div class="community-empty-title">No se pudo cargar Comunidad</div>
                <div class="community-empty-text">
                    Revisa tu conexión e inténtalo nuevamente.
                </div>
                <button class="btn-primary" type="button" data-action="retry-community">
                    Reintentar
                </button>
            </div>
        </div>
    `;
},

   renderCommunity: async function(options = {}) {
    const todayStr = this.getTodayDateStr();
    const todayReading = this.getReadingMetadataByDate(todayStr);
    const todayReference = todayReading ? todayReading.reference : 'Lectura del día';
    const showSkeleton = options.showSkeleton !== false;
    
    // Mostrar skeleton loading mientras carga
    if (showSkeleton) {
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
    }

    let posts;
    let reactionSummary;
    let repliesSummary;
    let loadingCompleted = false;

    try {
        const user = await this.initAuth();

        if (!user?.uid) {
            const authMessage = this._lastAuthError
                ? `${this._lastAuthError.code}: ${this._lastAuthError.message}`
                : 'No se pudo identificar al usuario de Comunidad';
            throw new Error(authMessage);
        }

        const communityTimeout = 25000;

        posts = await this.withTimeout(
            this.getCommunityPostsCached({
                forceRefresh: options.forceRefresh === true
            }),
            communityTimeout,
            'La consulta de Comunidad tardó demasiado'
        );

        [reactionSummary, repliesSummary] = await this.withTimeout(
            Promise.all([
                this.getCommunityReactionSummary(posts),
                this.getRepliesSummary(posts)
            ]),
            communityTimeout,
            'La información de Comunidad tardó demasiado'
        );

        loadingCompleted = true;
    } catch (error) {
        if (options.preserveOnError) {
            console.warn('[Community] La actualización posterior se retrasó; se conserva la vista actual.', error);
            if (this.currentView === 'community') {
                this.showToast('Se guardó correctamente. La actualización puede tardar un momento.');
            }
            return;
        }

        this.renderCommunityLoadError(error);
        return;
    } finally {
        if (!loadingCompleted && !options.preserveOnError) {
            this.communityPostsLoaded = false;
        }
    }

if (this.currentView !== 'community') return;

const communityDraft = this.communityFormOpen ? this.getCommunityDraft() : '';
const hasCommunityDraft = Boolean(communityDraft.trim());
const highlightedPost = posts.length ? posts
    .map(post => {
        const reactionData = reactionSummary[post.id] || this.getEmptyCommunityReactionState();
        const replies = repliesSummary[post.id] || [];
        const counts = reactionData.counts || {};
        const usefulCount = Number(counts.useful) || 0;
        const thanksCount = Number(counts.thanks) || 0;

        return {
            post,
            replies,
            usefulCount,
            thanksCount,
            score: (usefulCount * 2) + thanksCount + (replies.length * 1.5)
        };
    })
    .sort((a, b) => b.score - a.score || Number(b.post.createdAt?.seconds || 0) - Number(a.post.createdAt?.seconds || 0))[0]
    : null;
    
    // Renderizar el contenido
    this.$content.innerHTML = `
        <div class="community-container">
            <section class="community-hero">
                <div>
                    <div class="community-hero-kicker">Su Voz a Diario</div>
                    <h2>Comunidad</h2>
                    <p>Un espacio para compartir lo que escuchaste de Dios en esta lectura.</p>
                </div>
            </section>

            <details class="community-guidelines">
                <summary>
                    <span>Antes de compartir</span>
                    <span class="community-guidelines-hint">Ver normas</span>
                </summary>
                <div class="community-intro-text">
                    Este espacio existe para compartir lo que Dios habló a través de esta lectura.
                    Comparte con respeto, claridad y sencillez. Evita discusiones, ataques personales,
                    lenguaje ofensivo o contenido ajeno al propósito de esta comunidad.
                    <br><br>
                    Lo que publiques aquí podrá ser visible para otros usuarios y moderado por la aplicación.
                </div>
            </details>

            <div class="community-composer-card">
                <div class="community-composer-copy">
                    <div class="community-composer-question">¿Qué escuchaste de su voz hoy?</div>
                    <div class="community-composer-reference">${this.escapeHtml(todayReference)}</div>
                </div>
                <button class="community-composer-btn" type="button" data-action="share-community-reflection">
                    ${this.communityFormOpen ? 'Cerrar formulario' : 'Compartir lo que Dios me habló'}
                </button>
            </div>

            ${this.communityFormOpen ? `
                <div class="community-form-card">
                    <div class="community-form-title">Compartir lo que Dios me habló</div>

                    <div class="community-passage-context">
                        <span>Lectura de hoy</span>
                        <strong>${this.escapeHtml(todayReference)}</strong>
                    </div>

                    <div class="community-form-group community-check-group">
                        <label class="community-check-label">
                            <input type="checkbox" id="community-anonymous" checked>
                            <span>Publicar como Anónimo</span>
                        </label>
                    </div>

                    <div class="community-form-group community-name-group is-hidden">
                        <label class="community-label" for="community-name">Nombre</label>
                        <input
                            type="text"
                            class="community-input"
                            id="community-name"
                            placeholder="Escribe tu nombre"
                            disabled
                        >
                    </div>

                    <div class="community-form-group">
                        <label class="community-label" for="community-reflection">¿Qué escuchaste de su voz hoy?</label>
                        <textarea 
                            class="community-textarea" 
                            id="community-reflection" 
                            placeholder="Escribe con sencillez lo que Dios te mostró en esta lectura..."
                            maxlength="1200"
                        >${this.escapeHtml(communityDraft)}</textarea>

                        <div class="community-char-counter" id="community-char-counter">${communityDraft.length} / 1200</div>
                        ${hasCommunityDraft ? '<div class="community-draft-restored">Borrador recuperado</div>' : ''}
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

            ${highlightedPost ? (() => {
                const post = highlightedPost.post;
                const authorName = post.name || 'Anónimo';
                const isAnonymous = !post.name || authorName.trim().toLowerCase() === 'anónimo';
                const displayName = isAnonymous ? 'Alguien de la comunidad' : authorName;
                const excerpt = (post.text || '').length > 150 ? `${(post.text || '').slice(0, 150).trim()}...` : (post.text || '');
                const gratitudeTotal = highlightedPost.usefulCount + highlightedPost.thanksCount;

                return `
                    <section class="community-featured-echo" aria-label="Eco destacado de la comunidad">
                        <div class="community-featured-label">Eco destacado de la comunidad</div>
                        <div class="community-featured-text">${this.escapeHtml(excerpt)}</div>
                        <div class="community-featured-meta">
                            <span>${this.escapeHtml(displayName)}</span>
                            <span>${gratitudeTotal} ${gratitudeTotal === 1 ? 'señal de gratitud' : 'señales de gratitud'}</span>
                            ${highlightedPost.replies.length ? `<span>${highlightedPost.replies.length === 1 ? '1 hermano participó' : `${highlightedPost.replies.length} hermanos participaron`}</span>` : ''}
                        </div>
                    </section>
                `;
            })() : ''}

            <div class="community-feed-heading">
                <div>
                    <h3>Ecos de su voz</h3>
                </div>
            </div>

            <div class="community-feed">
                ${posts.length ? posts.map(post => {
                    const reactionData = reactionSummary[post.id] || this.getEmptyCommunityReactionState();
                    const replies = repliesSummary[post.id] || [];
                    const authorName = post.name || 'Anónimo';
                    const isAnonymous = !post.name || authorName.trim().toLowerCase() === 'anónimo';
                    const displayAuthorName = isAnonymous ? 'Alguien de la comunidad' : authorName;
                    const authorInitial = (displayAuthorName.trim().charAt(0) || 'S').toUpperCase();

                    return `
                        <div class="community-card community-voice-card">
                            <div class="community-post-header">
                                <div class="community-avatar ${isAnonymous ? 'is-anonymous' : 'has-name'}" aria-hidden="true">
                                    ${this.escapeHtml(authorInitial)}
                                </div>

                                <div class="community-post-heading">
                                    <div class="community-author-row">
                                        <span class="community-author ${isAnonymous ? 'is-anonymous' : 'has-name'}">${this.escapeHtml(displayAuthorName)}</span>
                                        <span class="community-meta-dot" aria-hidden="true"></span>
                                        <span class="community-date">${this.escapeHtml(this.formatCommunityDateLabel(post.date))}</span>
                                    </div>

                                    <div class="community-ref">Escuchó en ${this.escapeHtml(post.reference)}</div>
                                </div>
                            </div>

                           <div class="community-text">${this.escapeHtml(post.text)}</div>

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
                    <div class="community-empty-state">
                        <div class="community-empty-icon" aria-hidden="true">+</div>
                        <div class="community-empty-title">Sé la primera persona en compartir lo que Dios te habló en esta lectura.</div>
                        <div class="community-empty-text">
                            Comparte cómo escuchaste su voz en esta lectura.
                        </div>
                    </div>
                `}
            </div>

            ${posts.length ? `
                <div class="community-load-more">
                    ${this.communityHasMorePosts ? `
                        <button
                            class="community-load-more-btn"
                            type="button"
                            data-action="load-more-community-posts"
                            ${this.communityLoadingMore ? 'disabled' : ''}
                        >
                            ${this.communityLoadingMore ? 'Cargando...' : 'Cargar más ecos'}
                        </button>
                    ` : `
                        <div class="community-load-more-end">Has llegado al inicio de los ecos compartidos.</div>
                    `}
                </div>
            ` : ''}
        </div>
    `;
    
    // Restaurar o posicionar scroll según corresponda
    if (this.shouldScrollToLastPost) {
        this.scrollToLastPost();
    } else {
        this.restoreCommunityScrollPosition();
    }
},

getStatsMonthDays: function(stats) {
    const todayStr = this.getTodayDateStr();
    const currentMonth = todayStr.slice(0, 7);
    const [year, month] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const planReadings = this.getCalendarReadings()
        .filter(reading => reading.date.startsWith(`${currentMonth}-`));
    const planByDate = new Map(planReadings.map(reading => [reading.date, reading]));
    const readDates = new Set(stats.activityDays.read);
    const reflectionDates = new Set(stats.activityDays.reflection);
    const prayerDates = new Set(stats.activityDays.prayer);
    const highlightDates = new Set(stats.activityDays.highlight);
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
        cells.push({ empty: true });
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${currentMonth}-${String(day).padStart(2, '0')}`;
        const reading = planByDate.get(date) || null;
        const hasReading = Boolean(reading);
        const isRead = readDates.has(date);
        const hasReflection = reflectionDates.has(date);
        const hasPrayer = prayerDates.has(date);
        const hasHighlight = highlightDates.has(date);
        const isToday = date === todayStr;
        const isPending = hasReading && !isRead && date <= todayStr;

        cells.push({
            date,
            day,
            hasReading,
            reference: reading?.reference || '',
            isRead,
            hasReflection,
            hasPrayer,
            hasHighlight,
            isToday,
            isPending
        });
    }

    return {
        monthLabel: new Date(year, month - 1, 1).toLocaleDateString('es-MX', {
            month: 'long',
            year: 'numeric'
        }),
        cells
    };
},

getStatsSelectedDate: function() {
    const todayStr = this.getTodayDateStr();
    const currentMonth = todayStr.slice(0, 7);

    if (this.selectedStatsDate && this.selectedStatsDate.startsWith(`${currentMonth}-`)) {
        return this.selectedStatsDate;
    }

    this.selectedStatsDate = todayStr;
    return this.selectedStatsDate;
},

getStatsDayDetails: function(dateStr, stats) {
    const reading = this.getReadingMetadataByDate(dateStr);
    const readDates = new Set(stats.activityDays.read);
    const note = this.getNote(dateStr);
    const hasReflection = Boolean(
        note.dios?.trim() ||
        note.aprendizaje?.trim() ||
        note.respuesta?.trim() ||
        note.oracion?.trim()
    );
    const hasPrayer = Boolean(note.oracion?.trim());
    const highlights = this.getHighlights(dateStr);
    const selectionNotes = this.getSelectionNotes(dateStr);
    const hasReading = Boolean(reading);
    const isRead = readDates.has(dateStr);
    const status = hasReading
        ? (isRead ? 'Lectura completada' : 'Pendiente')
        : 'Sin lectura asignada';

    return {
        date: dateStr,
        label: this.formatDateEs(dateStr),
        reading,
        hasReading,
        isRead,
        status,
        hasReflection,
        hasPrayer,
        highlightCount: highlights.length,
        selectionNoteCount: selectionNotes.length
    };
},

renderStatsDayPanel: function(stats) {
    const selectedDate = this.getStatsSelectedDate();
    const detail = this.getStatsDayDetails(selectedDate, stats);
    const hasMemory = detail.highlightCount > 0 || detail.selectionNoteCount > 0;
    const hasResponse = detail.hasReflection || detail.hasPrayer;

    return `
        <aside class="stats-day-panel" aria-live="polite">
            <div class="stats-day-panel-head">
                <div>
                    <span>Día seleccionado</span>
                    <h4>${this.escapeHtml(detail.label)}</h4>
                </div>
                <strong class="${detail.isRead ? 'is-complete' : detail.hasReading ? 'is-pending' : 'is-empty'}">
                    ${this.escapeHtml(detail.status)}
                </strong>
            </div>

            ${detail.hasReading ? `
                <div class="stats-day-reference">
                    <span>Lectura asignada</span>
                    <strong>${this.escapeHtml(detail.reading.reference)}</strong>
                </div>
            ` : `
                <div class="stats-day-reference is-muted">
                    <span>Lectura asignada</span>
                    <strong>No hay lectura para este día</strong>
                </div>
            `}

            <div class="stats-day-signals">
                <span class="${detail.hasReflection ? 'is-active' : ''}">${detail.hasReflection ? 'Reflexión escrita' : 'Sin reflexión'}</span>
                <span class="${detail.hasPrayer ? 'is-active' : ''}">${detail.hasPrayer ? 'Oración escrita' : 'Sin oración'}</span>
                <span class="${detail.highlightCount > 0 ? 'is-active' : ''}">${detail.highlightCount} resaltados</span>
                <span class="${detail.selectionNoteCount > 0 ? 'is-active' : ''}">${detail.selectionNoteCount} notas</span>
            </div>

            <div class="stats-day-actions">
                ${detail.hasReading ? `
                    <button class="stats-day-action primary" type="button" data-action="stats-open-reading" data-date="${this.escapeHtml(detail.date)}">
                        ${detail.isRead ? 'Abrir lectura' : 'Leer ahora'}
                    </button>
                ` : ''}
                ${hasResponse ? `
                    <button class="stats-day-action" type="button" data-action="stats-open-response" data-date="${this.escapeHtml(detail.date)}">
                        Ver respuesta
                    </button>
                ` : ''}
                ${hasMemory ? `
                    <button class="stats-day-action" type="button" data-action="stats-open-memory" data-date="${this.escapeHtml(detail.date)}">
                        Repasar memoria
                    </button>
                ` : ''}
            </div>
        </aside>
    `;
},

renderStatsCalendar: function(stats) {
    const month = this.getStatsMonthDays(stats);
    const weekdayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const selectedDate = this.getStatsSelectedDate();

    return `
        <section class="stats-section stats-calendar-section">
            <div class="stats-section-head">
                <div>
                    <span>Constancia</span>
                    <h3>Calendario de este mes</h3>
                </div>
                <strong>${this.escapeHtml(month.monthLabel)}</strong>
            </div>

            <div class="stats-calendar-layout">
                <div class="stats-calendar-board">
                    <div class="stats-calendar" aria-label="Calendario de constancia">
                        ${weekdayLabels.map(label => `<div class="stats-calendar-weekday">${label}</div>`).join('')}
                        ${month.cells.map(cell => {
                            if (cell.empty) return '<div class="stats-calendar-day is-empty" aria-hidden="true"></div>';

                            const isSelected = cell.date === selectedDate;
                            const classes = [
                                'stats-calendar-day',
                                cell.hasReading ? 'has-reading' : 'no-reading',
                                cell.isRead ? 'is-read' : '',
                                cell.hasReflection ? 'has-reflection' : '',
                                cell.hasPrayer ? 'has-prayer' : '',
                                cell.hasHighlight ? 'has-highlight' : '',
                                cell.isPending ? 'is-pending' : '',
                                cell.isToday ? 'is-today' : '',
                                isSelected ? 'is-selected' : ''
                            ].filter(Boolean).join(' ');
                            const label = [
                                cell.date,
                                cell.reference,
                                cell.isRead ? 'leído' : '',
                                cell.hasReflection ? 'reflexión' : '',
                                cell.hasPrayer ? 'oración' : '',
                                cell.isPending ? 'pendiente' : ''
                            ].filter(Boolean).join(', ');

                            return `
                                <button class="${classes}" type="button" data-action="select-stats-day" data-date="${this.escapeHtml(cell.date)}" aria-label="${this.escapeHtml(label)}" aria-pressed="${isSelected ? 'true' : 'false'}">
                                    <span class="stats-calendar-number">${cell.day}</span>
                                    <span class="stats-calendar-markers" aria-hidden="true">
                                        ${cell.isRead ? '<i class="marker-read"></i>' : ''}
                                        ${cell.hasReflection ? '<i class="marker-reflection"></i>' : ''}
                                        ${cell.hasPrayer ? '<i class="marker-prayer"></i>' : ''}
                                        ${cell.isPending ? '<i class="marker-pending"></i>' : ''}
                                    </span>
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <div class="stats-calendar-legend" aria-label="Leyenda del calendario">
                        <span><i class="legend-read"></i> Leído</span>
                        <span><i class="legend-reflection"></i> Reflexión</span>
                        <span><i class="legend-prayer"></i> Oración</span>
                        <span><i class="legend-pending"></i> Pendiente</span>
                    </div>
                </div>

                ${this.renderStatsDayPanel(stats)}
            </div>
        </section>
    `;
},

renderStatsBookProgress: function(stats) {
    const currentIndex = stats.books.findIndex(book => book.state === 'current' || book.state === 'pending');
    const completedBooks = stats.books
        .map((book, index) => ({ ...book, index }))
        .filter(book => book.state === 'completed');
    const currentBook = currentIndex >= 0 ? { ...stats.books[currentIndex], index: currentIndex } : null;
    const previousCompleted = completedBooks
        .filter(book => !currentBook || book.index < currentBook.index)
        .pop() || completedBooks[completedBooks.length - 1] || null;
    const nextBook = stats.books
        .map((book, index) => ({ ...book, index }))
        .find(book => book.state === 'upcoming' || (currentBook && book.index > currentBook.index && book.state !== 'completed'));
    const visibleBooks = [previousCompleted, currentBook, nextBook]
        .filter(Boolean)
        .filter((book, index, list) => list.findIndex(item => item.id === book.id) === index)
        .slice(0, 3);

    if (!visibleBooks.length) {
        return '';
    }

    return `
        <div class="stats-book-journey">
            ${visibleBooks.map(book => {
                const isCompleted = book.state === 'completed';
                const isUpcoming = book.state === 'upcoming';
                const actionDate = isCompleted ? book.reviewDate : book.continueDate;
                const actionLabel = isCompleted ? 'Repasar' : 'Continuar';
                const displayLabel = isCompleted
                    ? 'Completado'
                    : isUpcoming
                        ? 'Próximo'
                        : book.completed === 0
                            ? 'Sin iniciar'
                            : 'En curso';
                const progressClass = book.percent === 0
                    ? 'is-empty-progress'
                    : book.percent === 100
                        ? 'is-full-progress'
                        : 'is-partial-progress';

                return `
                    <article class="stats-book-card is-${this.escapeHtml(book.state)} ${progressClass}">
                        <div class="stats-book-card-head">
                            <span>${this.escapeHtml(displayLabel)}</span>
                            <b>${book.percent}%</b>
                        </div>
                        <h4>${this.escapeHtml(book.name)}</h4>
                        <p>${book.completed} de ${book.total} lecturas</p>
                        <div class="stats-book-meter" aria-hidden="true">
                            <span style="width: ${book.percent}%"></span>
                        </div>
                        <div class="stats-book-card-foot">
                            <small>${this.escapeHtml(this.formatDateEs(book.firstDate))} - ${this.escapeHtml(this.formatDateEs(book.lastDate))}</small>
                            ${!isUpcoming && actionDate ? `
                                <button type="button" data-action="stats-open-book" data-date="${this.escapeHtml(actionDate)}">
                                    ${actionLabel}
                                </button>
                            ` : `
                                <span>Próximo</span>
                            `}
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
},

renderStatsPlan: function(stats) {
    const currentBook = stats.books.find(book => book.state === 'current' || book.state === 'pending')
        || stats.books.find(book => book.state === 'upcoming')
        || stats.books[stats.books.length - 1];

    return `
        <section class="stats-section stats-plan-section">
            <div class="stats-section-head stats-plan-head">
                <div>
                    <span>Recorrido bíblico</span>
                    <h3>Lo que has recorrido</h3>
                    ${currentBook ? `<p>Ahora en ${this.escapeHtml(currentBook.name)}: ${currentBook.completed} de ${currentBook.total} lecturas.</p>` : ''}
                </div>
                <strong>${stats.plan.percent}%</strong>
            </div>
            <div class="stats-plan-summary">
                ${this.renderStatsMetric('Lecturas del plan', `${stats.plan.completed}/${stats.plan.total}`, 'completadas')}
                ${this.renderStatsMetric('Mejor racha', stats.streak.longest, stats.streak.longest === 1 ? 'día' : 'días')}
            </div>
            <div class="stats-plan-meter" aria-hidden="true">
                <span style="width: ${stats.plan.percent}%"></span>
            </div>
            ${this.renderStatsBookProgress(stats)}
        </section>
    `;
},

renderStatsMetric: function(label, value, detail = '') {
    return `
        <div class="stats-metric">
            <span>${this.escapeHtml(label)}</span>
            <strong>${this.escapeHtml(String(value))}</strong>
            ${detail ? `<small>${this.escapeHtml(detail)}</small>` : ''}
        </div>
    `;
},

getStatsMomentFragment: function(text, maxLength = 132) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();

    if (cleanText.length <= maxLength) return cleanText;

    return `${cleanText.slice(0, maxLength - 1).trim()}...`;
},

renderStatsMomentCard: function(moment) {
    const isReflection = moment.type === 'Reflexión';
    const title = moment.reference || this.formatDateEs(moment.date);

    return `
        <article class="stats-memory-card">
            <div class="stats-memory-type">${this.escapeHtml(moment.type)}</div>
            <h4>${this.escapeHtml(title)}</h4>
            <p>"${this.escapeHtml(this.getStatsMomentFragment(moment.fragment))}"</p>
            <div class="stats-memory-footer">
                <span>${this.escapeHtml(this.formatDateEs(moment.date))}</span>
                <button
                    type="button"
                    data-action="stats-open-moment"
                    data-date="${this.escapeHtml(moment.date)}"
                    data-kind="${this.escapeHtml(moment.type)}">
                    ${isReflection ? 'Ver lectura' : 'Abrir pasaje'}
                </button>
            </div>
        </article>
    `;
},

renderStatsMomentGroup: function(title, moments) {
    if (!moments.length) return '';

    return `
        <div class="stats-memory-group">
            <div class="stats-memory-group-head">
                <span>${this.escapeHtml(title)}</span>
                <small>${moments.length}</small>
            </div>
            <div class="stats-memory-stack">
                ${moments.map(moment => this.renderStatsMomentCard(moment)).join('')}
            </div>
        </div>
    `;
},

renderStatsMoments: function(stats) {
    const groups = [
        {
            title: 'Notas recientes',
            moments: stats.moments?.selectionNotes || []
        },
        {
            title: 'Resaltados recientes',
            moments: stats.moments?.highlights || []
        },
        {
            title: 'Reflexiones recientes',
            moments: stats.moments?.reflections || []
        }
    ];
    const hasMoments = groups.some(group => group.moments.length > 0);

    return `
        <section class="stats-section stats-memory-section">
            <div class="stats-section-head stats-memory-head">
                <div>
                    <span>Memoria</span>
                    <h3>Momentos para recordar</h3>
                    <p>Pasajes y pensamientos que has guardado durante tu recorrido.</p>
                </div>
            </div>

            ${hasMoments ? `
                <div class="stats-memory-grid">
                    ${groups.map(group => this.renderStatsMomentGroup(group.title, group.moments)).join('')}
                </div>
            ` : `
                <div class="stats-memory-empty">
                    Cuando guardes una nota, un resaltado o una reflexión, aparecerán aquí para ayudarte a volver a ellos.
                </div>
            `}
        </section>
    `;
},

renderStats: function() {
    const stats = this.getStats();
    const streakStatusLabels = {
        read_today: 'Lectura de hoy completada',
        pending_today: 'Aún puedes leer hoy',
        restart: 'Retoma con calma'
    };
    const streakStatus = streakStatusLabels[stats.streak.status] || streakStatusLabels.restart;
    const monthRatio = `${stats.month.completed}/${stats.month.available}`;
    
    this.$content.innerHTML = `
        
        ${this.renderViewHeader(
            'Tu camino',
            'Una mirada sobria a tu constancia, tu recorrido bíblico y tu respuesta a la Palabra.'
        )}

        <div class="stats-container">
            <section class="stats-hero-card">
                <div class="stats-hero-main">
                    <span class="stats-eyebrow">Constancia actual</span>
                    <div class="stats-streak-value">
                        <strong>${stats.streak.current}</strong>
                        <span>${stats.streak.current === 1 ? 'día' : 'días'}</span>
                    </div>
                    <p>${this.escapeHtml(streakStatus)}</p>
                </div>
                <div class="stats-hero-progress">
                    <div class="stats-ring" style="--stats-percent: ${stats.month.percent}">
                        <span>${stats.month.percent}%</span>
                    </div>
                    <div>
                        <span>Este mes</span>
                        <strong>${monthRatio}</strong>
                        <small>lecturas completadas</small>
                    </div>
                </div>
            </section>

            <section class="stats-section stats-month-section">
                <div class="stats-section-head">
                    <div>
                        <span>Este mes</span>
                        <h3>Señales de constancia</h3>
                    </div>
                </div>
                <div class="stats-metric-grid">
                    ${this.renderStatsMetric('Días leídos', stats.month.completed, `${stats.month.available} disponibles`)}
                    ${this.renderStatsMetric('Reflexión', stats.response.reflectionDays, 'días escritos')}
                    ${this.renderStatsMetric('Oración', stats.response.prayerDays, 'días escritos')}
                    ${this.renderStatsMetric('Avance mensual', `${stats.month.percent}%`, 'del mes')}
                </div>
            </section>

            ${this.renderStatsCalendar(stats)}

            ${this.renderStatsPlan(stats)}

            <section class="stats-section stats-response-section">
                <div class="stats-section-head">
                    <div>
                        <span>Respuesta a la Palabra</span>
                        <h3>Memoria y oración</h3>
                    </div>
                </div>
                <div class="stats-response-grid">
                    ${this.renderStatsMetric('Reflexión diaria', stats.response.reflectionDays, 'días con respuesta')}
                    ${this.renderStatsMetric('Oración escrita', stats.response.prayerDays, 'días')}
                    ${this.renderStatsMetric('Resaltados', stats.memory.highlights, 'pasajes guardados')}
                    ${this.renderStatsMetric('Notas personales', stats.memory.selectionNotes, 'sobre selección')}
                </div>
            </section>

            ${this.renderStatsMoments(stats)}
        </div>
    `;
},
    
    renderSettings: function() {
        this.$content.innerHTML = `
            <div class="settings-container">
                <div class="setting-card">
                    <h3>🔔 Notificaciones</h3>
                    <div class="setting-item">
                        <label>⏰ Recordatorio diario<br><small id="reminder-time-hint">Las notificaciones se programan en intervalos de 5 minutos.</small></label>
                        <div class="setting-control">
                            <input type="time" id="reminder-time" value="${this.settings.reminderTime}" step="300" aria-describedby="reminder-time-hint" class="time-input">
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
        const nextReminderTime = String(e.target.value || '');

        if (!/^([01][0-9]|2[0-3]):[0-5][05]$/.test(nextReminderTime)) {
            e.target.value = this.settings.reminderTime;
            this.showToast('Selecciona una hora en intervalos de 5 minutos.');
            return;
        }

        this.settings.reminderTime = nextReminderTime;
        this.saveSettings();

        const savedToken = localStorage.getItem('su-voz-fcm-token');

        if (!savedToken) {
            this.showToast('Hora guardada. Activa las notificaciones para sincronizarla.');
            return;
        }

        const user = await this.initAuth();

        if (!user?.uid) {
            this.showToast('Hora guardada localmente. No se pudo sincronizar con Firebase.');
            return;
        }

        const updated = await this.savePushToken(savedToken);

        if (!updated) {
            console.warn('[App] No se pudo actualizar el token al cambiar la hora');
            this.showToast('Hora guardada localmente. No se pudo sincronizar con Firebase.');
            return;
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
        if (testNotification.disabled) return;

        testNotification.disabled = true;

        try {
            await this.sendTestPushNotification();
        } finally {
            testNotification.disabled = false;
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

        this.streak = { ...DEFAULT_STREAK };
        this.settings = { ...DEFAULT_SETTINGS };

        this.showToast('🗑️ Todos los datos han sido reiniciados');
        setTimeout(() => location.reload(), 1000);
    },

    withTimeout: function(promise, timeoutMs, message) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(message || 'La operación tardó demasiado'));
            }, timeoutMs);

            Promise.resolve(promise).then(
                value => {
                    clearTimeout(timeoutId);
                    resolve(value);
                },
                error => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            );
        });
    },

	 initAuth: async function() {
        if (this.currentUser?.uid) {
            return this.currentUser;
        }

        if (this._authInitPromise) {
            return this._authInitPromise;
        }

        const authTimeout = 20000;

        const authPromise = (async () => {
            const firebaseReady = window.suVozFirebaseReady
                ? await this.withTimeout(
                    window.suVozFirebaseReady,
                    authTimeout,
                    'Firebase tardó demasiado en inicializar'
                )
                : true;

            if (!firebaseReady ||
                !window.firebaseAuth ||
                !window.firebaseFns?.onAuthStateChanged ||
                !window.firebaseFns?.signInAnonymously) {
                console.warn('[Auth] Firebase Auth no disponible. La app continuará sin comunidad autenticada.');
                this.currentUser = null;
                return null;
            }

            if (!this._authListenerReady) {
                onAuthStateChanged(
                    auth,
                    user => {
                        this.currentUser = user || null;
                    },
                    error => {
                        console.warn(`[Auth] El observador de sesión reportó un error: ${JSON.stringify({
                            code: error?.code || 'auth/unknown',
                            message: error?.message || String(error || 'Error desconocido'),
                            name: error?.name || 'Error'
                        })}`);
                    }
                );
                this._authListenerReady = true;
            }

            if (window.firebaseAuth.currentUser?.uid) {
                this.currentUser = window.firebaseAuth.currentUser;
                this._lastAuthError = null;
                console.log('[Auth] Usuario activo restaurado:', this.currentUser.uid);
                return this.currentUser;
            }

            const cred = await this.withTimeout(
                signInAnonymously(auth),
                authTimeout,
                'La autenticación anónima tardó demasiado'
            );

            this.currentUser = cred?.user || window.firebaseAuth.currentUser || null;

            if (!this.currentUser?.uid) {
                throw new Error('Firebase Auth no devolvió un usuario válido');
            }

            this._lastAuthError = null;
            console.log('[Auth] Sesión anónima iniciada:', this.currentUser.uid);
            return this.currentUser;
        })().catch(error => {
            const errorDetails = {
                code: error?.code || 'auth/unknown',
                message: error?.message || String(error || 'Error desconocido'),
                name: error?.name || 'Error'
            };

            this._lastAuthError = errorDetails;
            console.error(`[Auth] No se pudo completar la autenticación: ${JSON.stringify(errorDetails)}`);
            this.currentUser = null;
            return null;
        });

        this._authInitPromise = authPromise;

        try {
            return await authPromise;
        } finally {
            if (this._authInitPromise === authPromise) {
                this._authInitPromise = null;
            }
        }
    },

sendTestPushNotification: async function() {
    this.showToast('Enviando notificación de prueba...');

    try {
        const firebaseReady = window.suVozFirebaseReady
            ? await window.suVozFirebaseReady
            : false;

        if (!firebaseReady) {
            throw new Error('Firebase no pudo inicializarse.');
        }

        const user = await this.initAuth();
        const currentUser = window.firebaseAuth?.currentUser;

        if (!user?.uid || !currentUser?.uid || user.uid !== currentUser.uid) {
            throw new Error('No se pudo autenticar al usuario.');
        }

        if (
            typeof window.firebaseFns?.getApp !== 'function' ||
            typeof window.firebaseFns?.getFunctions !== 'function' ||
            typeof window.firebaseFns?.getIdToken !== 'function' ||
            typeof window.firebaseFns?.httpsCallable !== 'function'
        ) {
            throw new Error('Firebase Functions no está disponible.');
        }

        await window.firebaseFns.getIdToken(currentUser, true);

        if (!window.firebaseAuth.currentUser?.uid) {
            throw new Error('La sesión de Firebase Auth no está disponible.');
        }

        const firebaseApp = window.firebaseFns.getApp();
        const functions = window.firebaseFns.getFunctions(
            firebaseApp,
            'us-central1'
        );
        const sendTestNotification = window.firebaseFns.httpsCallable(
            functions,
            'sendTestNotification'
        );
        const response = await sendTestNotification({});
        const result = response?.data || {};

        if (Number(result.successCount) < 1) {
            throw new Error(
                `No se pudo entregar la notificación. Envíos fallidos: ${Number(result.failureCount) || 0}.`
            );
        }

        this.showToast('Notificación enviada correctamente.');
        return result;
    } catch (error) {
        const message = error?.message || 'No se pudo enviar la notificación de prueba.';
        console.error('[App] Error enviando notificación de prueba:', {
            code: error?.code || 'unknown',
            message,
            details: error?.details || null,
            customData: error?.customData || null,
            stack: error?.stack || null,
            error
        });
        this.showToast(message, 5000);
        return null;
    }
},

enableNotificationsFlow: async function() {
    const isNativeAndroid = !!(
        window.Capacitor &&
        typeof window.Capacitor.getPlatform === 'function' &&
        window.Capacitor.getPlatform() === 'android'
    );

    if (!isNativeAndroid && !('Notification' in window)) {
        this.showToast('Este dispositivo no soporta notificaciones');
        return false;
    }

    if (!isNativeAndroid && !('serviceWorker' in navigator)) {
        this.showToast('Este dispositivo no soporta Service Worker');
        return false;
    }

    if (!isNativeAndroid && isIOSDevice() && !isRunningAsInstalledPWA()) {
        this.showToast('En iPhone, instala la app en pantalla de inicio');
        return false;
    }

    if (!isNativeAndroid) {
        let permission = Notification.permission;

        if (permission !== 'granted') {
            permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
            this.showToast('No se concedió permiso para notificaciones');
            return false;
        }
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

    if (!isNativeAndroid) {
        this.setupPushListeners();
    }

    this.showToast('Notificaciones activadas');
    return true;
},

    // ========================================
    // PUSH NOTIFICATIONS (NUEVO)
    // ========================================
setupNativePushActionListeners: function() {
    const isNativeAndroid = !!(
        window.Capacitor &&
        typeof window.Capacitor.getPlatform === 'function' &&
        window.Capacitor.getPlatform() === 'android'
    );

    if (!isNativeAndroid || this._nativePushActionListenersReady) return;

    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;

    if (!PushNotifications?.addListener) {
        console.warn('[Push][listeners] Plugin PushNotifications no disponible');
        return;
    }

    this._nativePushActionListenersReady = true;
    console.log('[Push][listeners] Registrando listeners nativos de apertura');

    Promise.all([
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[Push][received]', notification);
        }),
        PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
            this.handlePushNavigation(event);
        })
    ]).catch(error => {
        this._nativePushActionListenersReady = false;
        console.error('[Push][listeners] No se pudieron registrar:', error);
    });
},

getPushHashFromEvent: function(event) {
    const notification = event?.notification || {};
    const notificationData = notification?.data;
    const rawUrl = typeof notificationData === 'string'
        ? notificationData
        : notificationData?.url
            || (typeof notification === 'string' ? notification : '')
            || notification?.url
            || notification?.link
            || '';

    if (!rawUrl) return '#home';

    try {
        const normalizedUrl = String(rawUrl).trim();
        const hash = normalizedUrl.startsWith('#')
            ? normalizedUrl
            : normalizedUrl.startsWith('/#')
                ? normalizedUrl.slice(1)
                : new URL(normalizedUrl, window.location.origin).hash;

        if (!hash || hash === '#today') return '#home';
        return hash.startsWith('#') ? hash : '#home';
    } catch (error) {
        console.warn('[Push][route] URL inválida; se abrirá Inicio:', rawUrl);
        return '#home';
    }
},

handlePushNavigation: function(event) {
    console.log('[Push][tap]', event);

    const hash = this.getPushHashFromEvent(event);
    console.log('[Push][route]', {
        url: event?.notification?.data?.url || null,
        hash,
        ready: this._pushRouteReady
    });

    if (!this._pushRouteReady) {
        this._pendingPushHash = hash;
        return;
    }

    this.navigateToPushHash(hash).catch(error => {
        console.error('[Push][navigate] No se pudo completar la navegación:', error);
    });
},

navigateToPushHash: async function(hash) {
    const targetHash = hash || '#home';

    console.log('[Push][navigate]', {
        from: window.location.hash || '#home',
        to: targetHash
    });

    history.pushState(null, '', targetHash);
    await this.handleRoute();
},

initPushNotifications: async function() {
    console.log('[App] Iniciando Push Notifications...');

    const isNativeAndroid = !!(
        window.Capacitor &&
        typeof window.Capacitor.getPlatform === 'function' &&
        window.Capacitor.getPlatform() === 'android'
    );

    if (isNativeAndroid) {
        try {
            const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;

            if (!PushNotifications) {
                console.warn('[App] Plugin PushNotifications no disponible');
                return false;
            }

            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive !== 'granted') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.warn('[App] Permiso Android de notificaciones no concedido');
                return false;
            }

            this.setupNativePushActionListeners();

            if (!this._nativePushRegistrationListenersReady) {
                this._nativePushRegistrationListenersReady = true;

                try {
                    await PushNotifications.addListener('registration', async (token) => {
                        const tokenValue = String(token?.value || '').trim();

                        if (!tokenValue) {
                            console.warn('[App] Token FCM Android vacío');
                            return;
                        }

                        console.log('[App] Token FCM Android obtenido correctamente');
                        localStorage.setItem('su-voz-fcm-token', tokenValue);

                        if (this.currentUser) {
                            await this.savePushToken(tokenValue);
                        }
                    });

                    await PushNotifications.addListener('registrationError', (error) => {
                        console.error('[App] Error registrando Push Android:', error);
                    });
                } catch (error) {
                    this._nativePushRegistrationListenersReady = false;
                    throw error;
                }
            }

            await PushNotifications.register();
            return true;
        } catch (error) {
            console.error('[App] Error inicializando Push Android:', error);
            return false;
        }
    }

    if (!window.firebaseMessaging || typeof window.fcmGetToken !== 'function') {
        console.warn('[App] Notificaciones no soportadas');
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
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    const uid = typeof this.currentUser?.uid === 'string'
        ? this.currentUser.uid.trim()
        : '';

    if (!normalizedToken || normalizedToken.length > 4096 || !uid) {
        console.warn('[App] No se pudo guardar token: falta token o usuario');
        return false;
    }

    try {
        const deviceId = String(this.getDeviceId() || '').trim();

        if (!deviceId) {
            console.warn('[App] No se pudo guardar token: falta identificador del dispositivo');
            return false;
        }

        const allowedPlatforms = new Set(['web', 'android', 'ios']);
        const detectedPlatform = this.getPlatformLabel();
        const platform = allowedPlatforms.has(detectedPlatform)
            ? detectedPlatform
            : 'web';
        const userAgent = String(navigator.userAgent || '').slice(0, 1024);
        const savedReminderTime = String(this.settings.reminderTime || '');
        const reminderTime = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(savedReminderTime)
            ? savedReminderTime
            : DEFAULT_SETTINGS.reminderTime;
        const tokenRef = doc(db, 'pushTokens', deviceId);

        await setDoc(tokenRef, {
            token: normalizedToken,
            uid,
            deviceId,
            platform,
            userAgent,
            reminderTime,
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

    if (!window.firebaseMessaging || typeof window.fcmOnMessage !== 'function') {
        console.warn('[App] Notificaciones no soportadas');
        return;
    }
    
    const messaging = window.firebaseMessaging;
    
    window.fcmOnMessage(messaging, (payload) => {
        console.log('[App] 📨 Push recibido:', payload);

        if (payload?.data?.type === 'community-badge') {
            const badgeCount = Number(payload.data.badgeCount);

            if (Number.isFinite(badgeCount) && badgeCount >= 0) {
                this.communityUnreadCount = badgeCount;
                this.updateCommunityBadge();
            }

            if (this.currentView !== 'community') {
                this.showToast(payload.data.body || 'Hay nueva actividad en Comunidad.');
            }
            return;
        }

        if (payload.notification) {
            this.showToast(payload.notification.body || 'Nueva notificación');
        }
    });
    
    this.pushListenersReady = true;
    console.log('[App] ✅ Listeners Push configurados');
},

openVerseStudy: function({ strongNumber = '', bookId = '', chapter = '', verse = '' } = {}) {
    this.openStrongDictionaryFromBible({ strongNumber, bookId, chapter, verse });
},

openStrongDictionaryFromBible: function({
    strongNumber = '',
    query = '',
    source = '',
    reference = '',
    verseText = '',
    keywords = [],
    bookId = '',
    chapter = '',
    verse = ''
} = {}) {
    this.pendingStrongContext = { bookId, chapter, verse };
    this.strongDictionaryBibleContext = source === 'bible-verse'
        ? {
            reference,
            verseText,
            keywords: Array.isArray(keywords) ? keywords : [],
            bookId,
            chapter,
            verse
        }
        : null;
    this.strongDictionaryConsultedWord = source === 'bible-verse' && query ? query : '';

    if (strongNumber) {
        this.strongDictionaryQuery = strongNumber;
        this.strongDictionarySelectedId = this.normalizeStrongLookupId(strongNumber) || null;
    } else {
        this.strongDictionaryQuery = query || '';
        this.strongDictionarySelectedId = null;
    }

    this.navigate('strong-dictionary');
},

loadStrongHebrew: async function() {
    if (this.strongHebrewReady) return this.strongHebrew;

    const response = await fetch(STRONG_HEBREW_PATH);

    if (!response.ok) {
        throw new Error('No se pudo cargar el diccionario Strong hebreo.');
    }

    this.strongHebrew = await response.json();
    this.strongHebrewReady = true;

    return this.strongHebrew;
},

loadStrongGreek: async function() {
    if (this.strongGreekReady) return this.strongGreek;

    const response = await fetch(STRONG_GREEK_PATH);

    if (!response.ok) {
        throw new Error('No se pudo cargar el diccionario Strong griego.');
    }

    this.strongGreek = await response.json();
    this.strongGreekReady = true;

    return this.strongGreek;
},

ensureStrongDictionaryLoaded: async function() {
    if (this.strongDictionaryReady) return this.strongDictionaryEntries;
    if (this.strongDictionaryLoadPromise) return this.strongDictionaryLoadPromise;

    this.strongDictionaryLoading = true;

    this.strongDictionaryLoadPromise = Promise.all([
        this.loadStrongHebrew(),
        this.loadStrongGreek()
    ]).then(([hebrew, greek]) => {
        const hebrewEntries = Object.entries(hebrew || {}).map(([id, entry]) =>
            this.createStrongDictionaryEntry(id, 'hebrew', entry)
        );

        const greekEntries = Object.entries(greek || {}).map(([id, entry]) =>
            this.createStrongDictionaryEntry(id, 'greek', entry)
        );

        this.strongDictionaryEntries = [...hebrewEntries, ...greekEntries].sort((a, b) => {
            if (a.language !== b.language) return a.language === 'hebrew' ? -1 : 1;
            return a.numberValue - b.numberValue;
        });

        this.strongDictionaryReady = true;
        this.strongDictionaryLoading = false;
        this.updateStrongDictionaryResults();

        return this.strongDictionaryEntries;
    }).catch(error => {
        this.strongDictionaryLoading = false;
        this.strongDictionaryLoadPromise = null;
        throw error;
    });

    return this.strongDictionaryLoadPromise;
},

createStrongDictionaryEntry: function(id, language, entry = {}) {
    const definitionParts = Array.isArray(entry.definition)
        ? entry.definition
        : [entry.strongs_def || entry.definition || ''];

    const definition = definitionParts
        .filter(Boolean)
        .map(part => String(part).trim())
        .filter(Boolean)
        .join('\n');

    const translation = entry.translation || entry.kjv_def || '';
    const transliteration = entry.xlit || entry.translit || '';
    const pronunciation = entry.pronunciation || entry.pron || '';
    const derivation = entry.derivation || '';
    const spanishGloss = entry.spanishGloss || '';
    const spanishDefinition = entry.spanishDefinition || '';
    const spanishAliases = Array.isArray(entry.spanishAliases) ? entry.spanishAliases : [];
    const searchableText = [
        id,
        id.replace(/^[HG]/, ''),
        language === 'hebrew' ? 'hebreo' : 'griego',
        entry.lemma,
        transliteration,
        pronunciation,
        definition,
        translation,
        derivation,
        spanishGloss,
        spanishDefinition,
        spanishAliases.join(' ')
    ].filter(Boolean).join(' ');

    return {
        id,
        numberValue: Number(String(id).replace(/^[HG]/, '')) || 0,
        language,
        languageLabel: language === 'hebrew' ? 'Hebreo' : 'Griego',
        lemma: entry.lemma || '',
        transliteration,
        pronunciation,
        definition,
        translation,
        derivation,
        spanishGloss,
        spanishDefinition,
        spanishAliases,
        searchText: this.normalizeStrongSearchText(searchableText),
        internalRefs: this.extractStrongInternalRefs([definition, translation, derivation].join(' '))
    };
},

normalizeStrongSearchText: function(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ʼʾʿʻ‘’`´]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
},

getStrongQueryTerms: function(query) {
    const normalized = this.normalizeStrongSearchText(query);
    if (!normalized) return [];

    const terms = normalized.split(' ').filter(Boolean);
    const aliases = {
        amor: ['love', 'charity', 'affection', 'benevolence', 'G25', 'G26', 'H160', 'H7355'],
        bendicion: ['blessing', 'blessed', 'bless', 'H1288', 'H1293', 'G2129'],
        dios: ['god', 'deity', 'divine', 'H430', 'G2316'],
        espiritu: ['spirit', 'breath', 'wind', 'H7307', 'G4151'],
        fe: ['faith', 'belief', 'believe', 'G4102'],
        gracia: ['grace', 'favor', 'favour', 'kindness', 'G5485', 'H2580'],
        justicia: ['justice', 'righteousness', 'righteous', 'judgment', 'H6664', 'H6666', 'G1343'],
        ley: ['law', 'commandment', 'torah', 'H8451', 'G3551'],
        luz: ['light', 'shine', 'H216', 'G5457'],
        misericordia: ['mercy', 'kindness', 'compassion', 'lovingkindness', 'H2617', 'H7356', 'G1656'],
        muerte: ['death', 'die', 'dead', 'H4194', 'G2288'],
        pacto: ['covenant', 'alliance', 'pledge', 'H1285', 'G1242'],
        paz: ['peace', 'welfare', 'prosperity', 'quietness', 'H7965', 'G1515'],
        pecado: ['sin', 'offence', 'transgression', 'iniquity', 'H2403', 'H6588', 'G266'],
        palabra: ['word', 'speech', 'saying', 'matter', 'H1697', 'G3056'],
        principio: ['beginning', 'first', 'chief', 'H7225', 'G746'],
        salvacion: ['salvation', 'deliverance', 'saving', 'rescue', 'H3444', 'H8668', 'G4991'],
        santo: ['holy', 'saint', 'sacred', 'sanctify', 'H6918', 'G40'],
        senor: ['lord', 'master', 'sir', 'owner', 'H136', 'G2962'],
        verdad: ['truth', 'true', 'faithfulness', 'H571', 'G225'],
        vida: ['life', 'living', 'alive', 'H2416', 'G2222']
    };
    const variants = {
        amo: ['amor', 'amar', 'love'],
        amar: ['amor', 'love'],
        creo: ['crear', 'create', 'created', 'make', 'made'],
        crear: ['create', 'created', 'make', 'made'],
        cree: ['creer', 'fe', 'believe', 'faith'],
        creyo: ['creer', 'fe', 'believe', 'faith'],
        creer: ['fe', 'believe', 'faith'],
        vivira: ['vida', 'life', 'living'],
        vida: ['life', 'living', 'alive', 'H2416', 'G2222'],
        murio: ['muerte', 'death', 'die', 'dead'],
        muerte: ['death', 'die', 'dead', 'H4194', 'G2288'],
        santidad: ['santo', 'holy', 'saint', 'sacred'],
        santo: ['holy', 'saint', 'sacred', 'sanctify', 'H6918', 'G40']
    };

    return [
        ...new Set(
            terms
                .flatMap(term => {
                    const seeds = variants[term] || [term];
                    return seeds.flatMap(seed => [seed, ...(aliases[seed] || [])]);
                })
                .map(term => this.normalizeStrongSearchText(term))
                .filter(Boolean)
        )
    ];
},

normalizeStrongLookupId: function(value, preferredLanguage = this.strongDictionaryFilter) {
    const raw = String(value || '').trim().toUpperCase();
    const match = raw.match(/^([HG])?0*(\d{1,5})$/);

    if (!match) return null;

    const prefix = match[1] || (preferredLanguage === 'greek' ? 'G' : 'H');
    return `${prefix}${Number(match[2])}`;
},

extractStrongInternalRefs: function(text) {
    const refs = new Set();
    const source = String(text || '');

    source.replace(/\b([HG])0*(\d{1,5})\b/g, (_, prefix, number) => {
        refs.add(`${prefix}${Number(number)}`);
        return '';
    });

    return [...refs].sort((a, b) => {
        if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
        return Number(a.slice(1)) - Number(b.slice(1));
    });
},

getStrongEntryById: function(id) {
    return this.strongDictionaryEntries.find(entry => entry.id === id) || null;
},

entryMatchesStrongFilter: function(entry, filter = this.strongDictionaryFilter) {
    if (filter === 'all') return true;
    return entry.language === filter;
},

searchStrongDictionary: function(query = this.strongDictionaryQuery, filter = this.strongDictionaryFilter) {
    if (!this.strongDictionaryReady) return [];

    const trimmed = String(query || '').trim();
    const baseEntries = this.strongDictionaryEntries.filter(entry => this.entryMatchesStrongFilter(entry, filter));

    if (!trimmed) {
        return baseEntries.slice(0, 30);
    }

    const lookupMatch = trimmed.toUpperCase().match(/^([HG])?0*(\d{1,5})$/);

    if (lookupMatch) {
        const number = Number(lookupMatch[2]);
        const explicitPrefix = lookupMatch[1] || null;

        return baseEntries
            .filter(entry => {
                if (entry.numberValue !== number) return false;
                return !explicitPrefix || entry.id.startsWith(explicitPrefix);
            })
            .sort((a, b) => {
                if (a.id[0] !== b.id[0]) return a.id[0] === 'H' ? -1 : 1;
                return a.numberValue - b.numberValue;
            });
    }

    const terms = this.getStrongQueryTerms(trimmed);

    if (!terms.length) return [];

    return baseEntries
        .map(entry => {
            let score = 0;

            for (const term of terms) {
                if (!entry.searchText.includes(term)) continue;

                score += 1;

                if (this.normalizeStrongSearchText(entry.lemma).includes(term)) score += 5;
                if (this.normalizeStrongSearchText(entry.transliteration).includes(term)) score += 4;
                if (this.normalizeStrongSearchText(entry.translation).includes(term)) score += 3;
                if (this.normalizeStrongSearchText(entry.definition).includes(term)) score += 2;
                if (this.normalizeStrongSearchText(entry.spanishGloss).includes(term)) score += 4;
                if (this.normalizeStrongSearchText(entry.spanishDefinition).includes(term)) score += 4;
                if (entry.spanishAliases.some(alias => this.normalizeStrongSearchText(alias).includes(term))) score += 4;
            }

            return { entry, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.numberValue - b.entry.numberValue)
        .slice(0, 80)
        .map(item => item.entry);
},

updateStrongDictionaryResults: function() {
    this.strongDictionaryResults = this.searchStrongDictionary();

    if (this.strongDictionarySelectedId) {
        const selected = this.getStrongEntryById(this.strongDictionarySelectedId);

        if (!selected || !this.entryMatchesStrongFilter(selected)) {
            this.strongDictionarySelectedId = this.strongDictionaryResults[0]?.id || null;
        }
    } else if (this.strongDictionaryResults.length) {
        this.strongDictionarySelectedId = this.strongDictionaryResults[0].id;
    }
},

renderStrongDictionaryView: async function() {
    this.$content.innerHTML = this.renderStrongDictionaryShell({ loading: true });

    try {
        await this.ensureStrongDictionaryLoaded();
        this.updateStrongDictionaryResults();
        this.$content.innerHTML = this.renderStrongDictionaryShell();
        requestAnimationFrame(() => {
            document.getElementById('strong-dictionary-input')?.focus({ preventScroll: true });
        });
    } catch (error) {
        console.error('[Strong] Error cargando Diccionario Strong:', error);
        this.$content.innerHTML = this.renderStrongDictionaryShell({ error });
    }
},

renderStrongDictionaryShell: function({ loading = false, error = null } = {}) {
    const query = this.escapeHtml(this.strongDictionaryQuery);
    const count = this.strongDictionaryResults.length;
    const selected = this.getStrongEntryById(this.strongDictionarySelectedId) || this.strongDictionaryResults[0] || null;
    const bibleContextHtml = this.renderStrongBibleContextCard();

    let bodyHtml = '';

    if (loading) {
        bodyHtml = `
            <div class="strong-dictionary-state">
                <div class="spinner"></div>
                <p>Cargando Diccionario Strong...</p>
            </div>
        `;
    } else if (error) {
        bodyHtml = `
            <div class="strong-dictionary-state">
                <h3>No se pudo cargar el diccionario</h3>
                <p>${this.escapeHtml(error.message || 'Intenta nuevamente.')}</p>
            </div>
        `;
    } else {
        bodyHtml = `
            <div class="strong-dictionary-results-bar">
                <span>${count} resultado${count === 1 ? '' : 's'}</span>
                <small>Diccionario, no concordancia</small>
            </div>

            <div class="strong-dictionary-layout">
                <div class="strong-dictionary-results">
                    ${count ? this.strongDictionaryResults.map(entry => this.renderStrongDictionaryResult(entry)).join('') : `
                        <div class="strong-dictionary-empty">
                            <h3>Sin resultados</h3>
                            <p>${this.strongDictionaryBibleContext && this.strongDictionaryQuery
                                ? 'No encontramos una entrada clara. Prueba con otra palabra del versículo.'
                                : 'Prueba con un número Strong, lema, transliteración o una palabra de la definición.'
                            }</p>
                        </div>
                    `}
                </div>

                <aside class="strong-dictionary-detail" aria-live="polite">
                    ${selected ? this.renderStrongDictionaryDetail(selected) : `
                        <div class="strong-detail-placeholder">Selecciona una entrada para ver el detalle.</div>
                    `}
                </aside>
            </div>
        `;
    }

    return `
        <div class="strong-dictionary-view">
            <div class="strong-dictionary-hero">
                <div class="strong-dictionary-topline">
                    <button class="bible-search-back" type="button" data-action="back-to-bible-books">← Biblia</button>
                    <span>Fase 1</span>
                </div>

                <h2>Diccionario Strong</h2>
                <p>Busca entradas hebreas y griegas por número, lema, transliteración, definición o glosa.</p>
                <p class="strong-dictionary-note">
                    Las definiciones originales están basadas en fuentes Strong en inglés. Estamos preparando una capa de consulta en español.
                </p>
            </div>

            <section class="strong-dictionary-panel">
                <div class="strong-dictionary-input-wrap">
                    <span class="strong-dictionary-input-icon">⌕</span>
                    <input
                        id="strong-dictionary-input"
                        class="strong-dictionary-input"
                        type="search"
                        placeholder="H7225, G26, amor, principio..."
                        value="${query}"
                        autocomplete="off"
                        inputmode="search"
                    />

                    ${this.strongDictionaryQuery ? `
                        <button class="strong-dictionary-clear" type="button" data-action="clear-strong-dictionary" aria-label="Limpiar búsqueda">×</button>
                    ` : ''}
                </div>

                <div class="strong-dictionary-filters" role="group" aria-label="Filtrar idioma">
                    ${[
                        ['all', 'Todo'],
                        ['hebrew', 'Hebreo'],
                        ['greek', 'Griego']
                    ].map(([id, label]) => `
                        <button
                            class="strong-filter-btn ${this.strongDictionaryFilter === id ? 'active' : ''}"
                            type="button"
                            data-action="set-strong-filter"
                            data-filter="${id}"
                        >
                            ${label}
                        </button>
                    `).join('')}
                </div>
            </section>

            ${bibleContextHtml}
            ${bodyHtml}
        </div>
    `;
},

renderStrongBibleContextCard: function() {
    const context = this.strongDictionaryBibleContext;
    if (!context) return '';

    const reference = this.escapeHtml(context.reference || 'Biblia');
    const verseText = this.escapeHtml(this.cleanStrongVerseText(context.verseText || ''));
    const keywords = Array.isArray(context.keywords) ? context.keywords : [];
    const activeWord = this.normalizeStrongVerseWord(this.strongDictionaryConsultedWord || this.strongDictionaryQuery);
    const consultedWord = this.strongDictionaryConsultedWord || '';

    return `
        <section class="strong-verse-context-card" aria-label="Búsqueda Strong desde Biblia">
            <div class="strong-verse-context-head">
                <div>
                    <span>Desde Biblia</span>
                    <strong>${reference}</strong>
                </div>
                <button class="strong-verse-return" type="button" data-action="return-to-strong-verse">Volver al versículo</button>
            </div>
            ${verseText ? `<p class="strong-verse-text">${verseText}</p>` : ''}
            <p>Selecciona una palabra del versículo para buscarla en Strong.</p>
            ${consultedWord ? `
                <div class="strong-consulted-word">Palabra consultada: <strong>${this.escapeHtml(consultedWord)}</strong></div>
            ` : ''}
            ${keywords.length ? `
                <div class="strong-verse-chip-list">
                    ${keywords.map(keyword => `
                        <button
                            class="strong-verse-chip ${activeWord === this.normalizeStrongVerseWord(keyword) ? 'active' : ''}"
                            type="button"
                            data-action="search-strong-keyword"
                            data-keyword="${this.escapeHtml(keyword)}"
                        >
                            ${this.escapeHtml(keyword)}
                        </button>
                    `).join('')}
                </div>
            ` : `
                <p class="strong-verse-context-empty">No se detectaron palabras clave claras en este versículo.</p>
            `}
            <small>Búsqueda léxica desde el texto bíblico. Para una relación exacta palabra ↔ Strong se requiere una Biblia etiquetada.</small>
        </section>
    `;
},

renderStrongDictionaryResult: function(entry) {
    const definition = this.getStrongBriefDefinition(entry);

    return `
        <button
            class="strong-result-card ${this.strongDictionarySelectedId === entry.id ? 'is-active' : ''}"
            type="button"
            data-action="select-strong-entry"
            data-strong-id="${this.escapeHtml(entry.id)}"
            aria-pressed="${this.strongDictionarySelectedId === entry.id ? 'true' : 'false'}"
        >
            <span class="strong-result-head">
                <strong>${this.escapeHtml(entry.id)}</strong>
                <em>${this.escapeHtml(entry.languageLabel)}</em>
            </span>
            <span class="strong-result-lemma">${this.escapeHtml(entry.lemma || 'Sin lema')}</span>
            <span class="strong-result-meta">${this.escapeHtml([entry.transliteration, entry.pronunciation].filter(Boolean).join(' · '))}</span>
            <span class="strong-result-definition">${this.escapeHtml(definition)}</span>
            ${entry.translation ? `<span class="strong-result-translation">${this.escapeHtml(entry.translation)}</span>` : ''}
        </button>
    `;
},

renderStrongDictionaryDetail: function(entry) {
    const fullDefinition = entry.definition || 'Sin definición disponible.';
    const refs = entry.internalRefs.filter(ref => this.getStrongEntryById(ref));

    return `
        <div class="strong-detail-card">
            <div class="strong-detail-head">
                <div>
                    <span>${this.escapeHtml(entry.languageLabel)}</span>
                    <h3>${this.escapeHtml(entry.id)}</h3>
                </div>
                <button class="strong-detail-copy" type="button" data-action="copy-strong-entry" data-strong-id="${this.escapeHtml(entry.id)}">Copiar</button>
            </div>

            <dl class="strong-detail-list">
                <div>
                    <dt>Lema</dt>
                    <dd class="strong-detail-lemma">${this.escapeHtml(entry.lemma || 'No disponible')}</dd>
                </div>
                <div>
                    <dt>Transliteración</dt>
                    <dd>${this.escapeHtml(entry.transliteration || 'No disponible')}</dd>
                </div>
                <div>
                    <dt>Pronunciación</dt>
                    <dd>${this.escapeHtml(entry.pronunciation || 'No disponible')}</dd>
                </div>
                <div>
                    <dt>Definición original</dt>
                    <dd>${this.escapeHtml(fullDefinition).replace(/\n/g, '<br>')}</dd>
                </div>
                ${entry.translation ? `
                    <div>
                        <dt>Glosa</dt>
                        <dd>${this.escapeHtml(entry.translation)}</dd>
                    </div>
                ` : ''}
                ${entry.derivation ? `
                    <div>
                        <dt>Derivación</dt>
                        <dd>${this.escapeHtml(entry.derivation)}</dd>
                    </div>
                ` : ''}
            </dl>

            <div class="strong-detail-refs">
                <h4>Referencias internas</h4>
                ${refs.length ? `
                    <div class="strong-ref-list">
                        ${refs.map(ref => `
                            <button type="button" data-action="select-strong-entry" data-strong-id="${this.escapeHtml(ref)}">${this.escapeHtml(ref)}</button>
                        `).join('')}
                    </div>
                ` : '<p>No se detectaron referencias internas disponibles en esta entrada.</p>'}
            </div>
        </div>
    `;
},

getStrongBriefDefinition: function(entry) {
    const firstLine = String(entry.definition || '').split('\n').find(Boolean) || '';
    const clean = firstLine.replace(/^\d+[a-z]?\)\s*/, '').trim();

    if (clean.length <= 150) return clean;
    return `${clean.slice(0, 147).trim()}...`;
},

setStrongDictionaryFilter: function(filter) {
    if (!['all', 'hebrew', 'greek'].includes(filter)) return;

    this.strongDictionaryFilter = filter;
    this.updateStrongDictionaryResults();
    this.$content.innerHTML = this.renderStrongDictionaryShell();
},

setStrongDictionaryQuery: function(query, options = {}) {
    this.strongDictionaryQuery = query;
    if (options.fromVerseChip) {
        this.strongDictionaryConsultedWord = query;
    } else if (options.clearConsulted || !this.strongDictionaryBibleContext) {
        this.strongDictionaryConsultedWord = '';
    }
    this.strongDictionarySelectedId = null;
    this.updateStrongDictionaryResults();
    this.$content.innerHTML = this.renderStrongDictionaryShell();
    const input = document.getElementById('strong-dictionary-input');
    if (input) {
        input.focus({ preventScroll: true });
        const end = input.value.length;
        input.setSelectionRange(end, end);
    }
},

returnToStrongSourceVerse: function() {
    const context = this.strongDictionaryBibleContext;
    if (!context) {
        this.navigate('bible-reading');
        return;
    }

    if (context.bookId && context.chapter) {
        this.selectedBibleBook = context.bookId;
        this.selectedBibleChapter = Number(context.chapter);
        this.saveBibleLastLocation(this.selectedBibleBook, this.selectedBibleChapter);
    }

    if (context.verse) {
        this.targetVerse = Number(context.verse);
    }

    this.navigate('bible-reading');

    if (context.verse) {
        const verseToFocus = Number(context.verse);
        setTimeout(() => {
            const verseElement = document.querySelector(`.verse-item[data-verse-number="${verseToFocus}"]`);
            if (!verseElement) return;

            verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            verseElement.classList.add('verse-searched');
            setTimeout(() => {
                verseElement.classList.remove('verse-searched');
            }, 2000);
        }, 650);
    }
},

selectStrongDictionaryEntry: function(id) {
    if (!id || !this.getStrongEntryById(id)) return;

    this.strongDictionarySelectedId = id;
    this.$content.innerHTML = this.renderStrongDictionaryShell();
    document.querySelector('.strong-dictionary-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
},

copyStrongDictionaryEntry: function(id) {
    const entry = this.getStrongEntryById(id);
    if (!entry) return;

    const text = [
        `${entry.id} · ${entry.languageLabel}`,
        entry.lemma,
        entry.transliteration ? `Transliteración: ${entry.transliteration}` : '',
        entry.pronunciation ? `Pronunciación: ${entry.pronunciation}` : '',
        entry.definition,
        entry.translation ? `Glosa: ${entry.translation}` : ''
    ].filter(Boolean).join('\n');

    navigator.clipboard?.writeText(text);
    this.showToast('Entrada Strong copiada');
},

loadStrongVerseData: async function() {
    this.strongVerseData = {};
    this.strongVerseDataReady = false;
    return this.strongVerseData;
},

getVerseStrongTokens: function(bookId, chapter, verse) {
    const key = `${bookId}.${Number(chapter)}.${Number(verse)}`;
    return this.strongVerseData?.[key] || null;
},
    
    // ========================================
    // EVENTOS
    // ========================================
bindEvents: function() {
document.addEventListener('click', (e) => {


    const closeStrong = e.target.closest('[data-action="close-strong-sheet"]');

    if (closeStrong) {
        e.preventDefault();
        this.closeStrongSheet();
        return;
    }

    const copyStrong = e.target.closest('[data-action="copy-strong-info"]');

    if (copyStrong) {
        e.preventDefault();

        const word = document.getElementById('strongSheetWord')?.textContent || '';
        const strong = document.getElementById('strongSheetNumber')?.textContent || '';
        const definition = document.getElementById('strongSheetDefinition')?.textContent || '';

        navigator.clipboard?.writeText(`${word} ${strong}: ${definition}`);

        this.showToast('Strong copiado');
        return;
    }
});


document.addEventListener('click', (e) => {
    const strongWord = e.target.closest('.strong-word');

    if (!strongWord) return;

    e.stopPropagation();

    console.log('[Strong Word]', {
        word: strongWord.dataset.word,
        strong: strongWord.dataset.strong,
        original: strongWord.dataset.original,
        transliteration: strongWord.dataset.transliteration,
        definition: strongWord.dataset.definition
    });
});
        // Navegación
        if (this.$navHome) {
    this.$navHome.addEventListener('click', () => {
        this.homeViewingDate = null;
        this.navigate('home');
    });
}

if (this.$navBible) {
    this.$navBible.addEventListener('click', () => {
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
    const openHeaderSettings = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();

        if (this.currentView === 'settings') {
            const fallback = this.previousView || 'home';
            this.navigate(fallback);
            return;
        }

        this.previousView = this.currentView;
        this.navigate('settings');
    };

    this.$headerSettingsBtn.addEventListener('click', openHeaderSettings);
}
        window.addEventListener('popstate', () => {
            this.handleRoute().catch(error => {
            console.error('[Route] Error en popstate:', error);
        });
    });
        
// Controles de fuente y versión
document.addEventListener('click', (e) => {
    const openStatsFromStreakBtn = e.target.closest('[data-action="open-stats-from-streak"]');

    if (openStatsFromStreakBtn) {
        e.preventDefault();
        this.$headerControlsDropdown?.classList.remove('show');
        this.navigate('stats');
        return;
    }

    const verseStudyBtn = e.target.closest('[data-action="open-verse-study"]');

    if (verseStudyBtn) {
        e.preventDefault();
        e.stopPropagation();

        this.openVerseStudy({
            bookId: verseStudyBtn.dataset.bookId,
            chapter: verseStudyBtn.dataset.chapter,
            verse: verseStudyBtn.dataset.verse,
            verseText: verseStudyBtn.dataset.verseText
        });

        return;
    }

    if (e.target.closest('[data-action="font-increase"]')) {
        this.changeFontSize(0.05);
    }

    if (e.target.closest('[data-action="font-decrease"]')) {
        this.changeFontSize(-0.05);
    }

    const versionBtn = e.target.closest('[data-version]');
    if (versionBtn) {
        const selectedVersion = versionBtn.getAttribute('data-version');

        this.currentVersion = selectedVersion;
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

const bibleTestamentTab = e.target.closest('[data-action="set-bible-testament"]');
if (bibleTestamentTab) {
    const testament = bibleTestamentTab.getAttribute('data-testament');
    if (testament === 'old' || testament === 'new') {
        this.bibleLibraryTestament = testament;
        this.renderBible();
    }
    return;
}

const openBibleContinueBtn = e.target.closest('[data-action="open-bible-continue"]');
if (openBibleContinueBtn) {
    const location = this.getBibleLastLocation();

    if (location?.mode === 'chapter') {
        this.selectedBibleBook = location.bookId;
        this.selectedBibleChapter = location.chapter;
    } else {
        this.selectedBibleBook = 'gen';
        this.selectedBibleChapter = 1;
        this.saveBibleLastLocation(this.selectedBibleBook, this.selectedBibleChapter);
    }

    this.bibleChapterPickerMode = false;
    this.navigate('bible-reading');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    return;
}

const openTodayReadingBtn = e.target.closest('[data-action="open-today-reading"]');
if (openTodayReadingBtn) {
    const todayStr = this.getTodayDateStr();
    this.homeViewingDate = todayStr;
    this.navigate('reading', todayStr);
    return;
}

const focusBibleExploreBtn = e.target.closest('[data-action="focus-bible-explore"]');
if (focusBibleExploreBtn) {
    const exploreSection = this.$content.querySelector('#bible-explore');
    if (exploreSection) {
        exploreSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
}

const openBibleMemoryBtn = e.target.closest('[data-action="open-bible-memory"]');
if (openBibleMemoryBtn) {
    const memory = openBibleMemoryBtn.getAttribute('data-memory');
    this.bibleMemoryFilter = memory === 'highlights' ? 'highlights' : 'notes';
    this.navigate('bible-memory');
    return;
}

// Abrir búsqueda
const openStrongDictionaryBtn = e.target.closest('[data-action="open-strong-dictionary"]');
if (openStrongDictionaryBtn) {
    this.$headerControlsDropdown?.classList.remove('show');
    // Acceso secundario temporal: Strong se conserva en beta sin interferir con la lectura.
    this.strongDictionaryBibleContext = null;
    this.strongDictionaryConsultedWord = '';
    this.navigate('strong-dictionary');
    return;
}

const openSearchBtn = e.target.closest('[data-action="open-bible-search"]');
if (openSearchBtn) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = null;
    this.bibleSearchComposing = false;
    this.bibleSearchFilter = 'all';
    this.bibleSearchQuery = '';
    this.bibleSearchResults = [];
    this.bibleSearchLoading = false;
    this.bibleSearchError = '';
    this.bibleSearchRequestId += 1;
    this.bibleSearchTotal = 0;
    this.bibleSearchTotalPages = 0;
    this.bibleSearchPage = 1;
    this.navigate('bible-search');
    return;
}

// Sugerencia de búsqueda
const suggestionTag = e.target.closest('[data-action="search-suggestion"]');
if (suggestionTag) {
    const query = suggestionTag.getAttribute('data-query') || suggestionTag.textContent.trim();
    const searchInput = document.getElementById('bible-search-input');

    clearTimeout(this.searchTimeout);
    this.searchTimeout = null;
    this.bibleSearchRequestId += 1;
    this.bibleSearchQuery = query;

    if (searchInput) {
        searchInput.value = query;
    }

    this.updateBibleSearchClearButton();
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

const bibleMemoryFilterBtn = e.target.closest('[data-action="set-bible-memory-filter"]');
if (bibleMemoryFilterBtn) {
    const filter = bibleMemoryFilterBtn.getAttribute('data-filter');

    if (['all', 'notes', 'highlights'].includes(filter)) {
        this.bibleMemoryFilter = filter;
        this.$content.innerHTML = this.renderBibleMemoryView();
    }
    return;
}

const bibleMemoryPassageBtn = e.target.closest('[data-action="open-bible-memory-passage"]');
if (bibleMemoryPassageBtn) {
    const bookId = bibleMemoryPassageBtn.getAttribute('data-book-id');
    const chapter = Number(bibleMemoryPassageBtn.getAttribute('data-chapter'));
    const book = this.bibleBooks.find(item => item.id === bookId);

    if (book && Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters) {
        this.selectedBibleBook = book.id;
        this.selectedBibleChapter = chapter;
        this.bibleChapterPickerMode = false;
        this.saveBibleLastLocation(book.id, chapter);
        this.navigate('bible-reading');
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    }
    return;
}

const readerContextAudioBtn = e.target.closest('[data-action="reader-context-audio"]');
if (readerContextAudioBtn) {
    this.toggleBibleChapterVoiceFromContext();
    return;
}

const readerContextAudioStopBtn = e.target.closest('[data-action="reader-context-audio-stop"]');
if (readerContextAudioStopBtn) {
    this.stopBibleChapterVoice();
    return;
}

const toggleBibleReadingSettingsBtn = e.target.closest('[data-action="toggle-bible-reading-settings"]');
if (toggleBibleReadingSettingsBtn) {
    this.bibleReadingSettingsOpen = !this.bibleReadingSettingsOpen;
    this.mountBibleReadingSettingsPanel();
    this.updateBibleReaderContextBarUI();
    return;
}

const closeBibleReadingSettingsBtn = e.target.closest('[data-action="close-bible-reading-settings"]');
if (closeBibleReadingSettingsBtn) {
    this.bibleReadingSettingsOpen = false;
    this.mountBibleReadingSettingsPanel();
    this.updateBibleReaderContextBarUI();
    return;
}

const bibleReadingSettingBtn = e.target.closest('[data-action="set-bible-reading-setting"]');
if (bibleReadingSettingBtn) {
    this.setBibleReadingSetting(
        bibleReadingSettingBtn.getAttribute('data-setting'),
        bibleReadingSettingBtn.getAttribute('data-value')
    );
    return;
}

const bibleFocusModeBtn = e.target.closest('[data-action="toggle-bible-focus-mode"]');
if (bibleFocusModeBtn) {
    this.toggleBibleReadingFocusMode();
    return;
}

const selectStrongEntryBtn = e.target.closest('[data-action="select-strong-entry"]');
if (selectStrongEntryBtn) {
    this.selectStrongDictionaryEntry(selectStrongEntryBtn.getAttribute('data-strong-id'));
    return;
}

const searchStrongKeywordBtn = e.target.closest('[data-action="search-strong-keyword"]');
if (searchStrongKeywordBtn) {
    this.setStrongDictionaryQuery(searchStrongKeywordBtn.getAttribute('data-keyword') || '', { fromVerseChip: true });
    return;
}

const returnToStrongVerseBtn = e.target.closest('[data-action="return-to-strong-verse"]');
if (returnToStrongVerseBtn) {
    this.returnToStrongSourceVerse();
    return;
}

const copyStrongEntryBtn = e.target.closest('[data-action="copy-strong-entry"]');
if (copyStrongEntryBtn) {
    this.copyStrongDictionaryEntry(copyStrongEntryBtn.getAttribute('data-strong-id'));
    return;
}

const clearStrongDictionaryBtn = e.target.closest('[data-action="clear-strong-dictionary"]');
if (clearStrongDictionaryBtn) {
    this.setStrongDictionaryQuery('', { clearConsulted: true });
    return;
}

const strongFilterBtn = e.target.closest('[data-action="set-strong-filter"]');
if (strongFilterBtn) {
    this.setStrongDictionaryFilter(strongFilterBtn.getAttribute('data-filter'));
    return;
}

const revertToRv1909Btn = e.target.closest('[data-action="revert-to-rv1909"]');
if (revertToRv1909Btn) {
    this.currentBibleVersion = 'rv1909';
    localStorage.setItem('current-bible-version', 'rv1909');
    this.showToast('Versión restablecida a RV1909');
    this.handleRoute().catch(err => console.error('[Route] Error al restablecer versión:', err));
    return;
}

const backToBibleBooksBtn = e.target.closest('[data-action="back-to-bible-books"]');
if (backToBibleBooksBtn) {
    this.stopBibleChapterVoice(true);
    this.bibleReaderPickerOpen = false;
    document.body.classList.remove('bible-picker-open');
    this.selectedBibleBook = null;
    this.selectedBibleChapter = null;
    this.bibleChapterPickerMode = false;
    this.saveBibleBooksMode();
    this.navigate('bible');
    return;
}

const openBibleReaderPickerBtn = e.target.closest('[data-action="open-bible-reader-picker"]');
if (openBibleReaderPickerBtn) {
    this.openBibleReaderPicker();
    return;
}

const closeBibleReaderPickerBtn = e.target.closest('[data-action="close-bible-reader-picker"]');
if (closeBibleReaderPickerBtn || e.target.classList?.contains('bible-picker-sheet')) {
    this.closeBibleReaderPicker();
    return;
}

const openBibleVersionPickerBtn = e.target.closest('[data-action="open-bible-version-picker"]');
if (openBibleVersionPickerBtn) {
    this.openBibleVersionPicker();
    return;
}

const closeBibleVersionPickerBtn = e.target.closest('[data-action="close-version-picker"]');
if (closeBibleVersionPickerBtn || e.target.classList?.contains('version-picker-sheet')) {
    this.closeBibleVersionPicker();
    return;
}

const selectVersionOptionBtn = e.target.closest('[data-action="select-version-option"]');
if (selectVersionOptionBtn) {
    const versionId = selectVersionOptionBtn.getAttribute('data-version-id');

    this.currentBibleVersion = versionId;
    localStorage.setItem('current-bible-version', this.currentBibleVersion);

    this.closeBibleVersionPicker();

    this.handleRoute().catch(error => {
        console.error('[Route] Error cambiando versión:', error);
    });

    this.showToast(`Versión cambiada a ${this.getBibleVersionLabel(this.currentBibleVersion)}`);
    return;
}

const readerPickerTestamentBtn = e.target.closest('[data-action="set-reader-picker-testament"]');
if (readerPickerTestamentBtn) {
    const testament = readerPickerTestamentBtn.getAttribute('data-testament');

    if (testament === 'old' || testament === 'new') {
        this.bibleReaderPickerTestament = testament;
        this.bibleReaderPickerBook = null;
        this.mountBibleReaderPicker();
    }
    return;
}

const readerPickerBackBtn = e.target.closest('[data-action="back-reader-picker-books"]');
if (readerPickerBackBtn) {
    this.bibleReaderPickerBook = null;
    this.mountBibleReaderPicker();
    return;
}

const readerPickerBookBtn = e.target.closest('[data-action="select-reader-picker-book"]');
if (readerPickerBookBtn) {
    const bookId = readerPickerBookBtn.getAttribute('data-book-id');
    const book = this.bibleBooks.find(item => item.id === bookId);

    if (book) {
        this.bibleReaderPickerBook = book.id;
        this.bibleReaderPickerTestament = this.getTestamentFromBookId(book.id) === 'new' ? 'new' : 'old';
        this.mountBibleReaderPicker();
    }
    return;
}

const readerPickerChapterBtn = e.target.closest('[data-action="open-reader-picker-chapter"]');
if (readerPickerChapterBtn) {
    const bookId = readerPickerChapterBtn.getAttribute('data-book-id');
    const chapter = Number(readerPickerChapterBtn.getAttribute('data-chapter'));
    const book = this.bibleBooks.find(item => item.id === bookId);

    if (book && Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters) {
        this.stopBibleChapterVoice(true);
        this.selectedBibleBook = book.id;
        this.selectedBibleChapter = chapter;
        this.bibleChapterPickerMode = false;
        this.bibleReaderPickerOpen = false;
        document.body.classList.remove('bible-picker-open');
        this.saveBibleLastLocation(book.id, chapter);
        this.navigate('bible-reading');
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    }
    return;
}

const openBibleChaptersBtn = e.target.closest('[data-action="open-bible-chapters"]');
if (openBibleChaptersBtn) {
    if (this.currentView === 'bible-reading') {
        this.openBibleReaderPicker();
        return;
    }

    this.stopBibleChapterVoice(true);
    this.selectedBibleChapter = null;
    this.bibleChapterPickerMode = true;
    this.navigate('bible');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    return;
}

const clearBibleBookBtn = e.target.closest('[data-action="clear-bible-book"]');
if (clearBibleBookBtn) {
    this.selectedBibleBook = null;
    this.selectedBibleChapter = null;
    this.bibleChapterPickerMode = false;
    this.saveBibleBooksMode();
    this.navigate('bible');
    return;
}
         
const openBibleChapterBtn = e.target.closest('[data-action="open-bible-chapter"]');
if (openBibleChapterBtn) {
    const bookId = openBibleChapterBtn.getAttribute('data-book-id');
    const chapter = Number(openBibleChapterBtn.getAttribute('data-chapter'));

    this.selectedBibleBook = bookId;
    this.selectedBibleChapter = chapter;
    this.bibleChapterPickerMode = false;
    this.saveBibleLastLocation(bookId, chapter);

    this.navigate('bible-reading');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    return;
}

const prevChapterBtn = e.target.closest('[data-action="bible-prev-chapter"]');
if (prevChapterBtn) {
    if (this.selectedBibleChapter > 1) {
        this.stopBibleChapterVoice(true);
        this.selectedBibleChapter -= 1;
        this.saveBibleLastLocation(this.selectedBibleBook, this.selectedBibleChapter);
        this.navigate('bible-reading');
    }
    return;
}

const nextChapterBtn = e.target.closest('[data-action="bible-next-chapter"]');
if (nextChapterBtn) {
    const currentBook = this.bibleBooks.find(b => b.id === this.selectedBibleBook);

    if (currentBook && this.selectedBibleChapter < currentBook.chapters) {
        this.stopBibleChapterVoice(true);
        this.selectedBibleChapter += 1;
        this.saveBibleLastLocation(this.selectedBibleBook, this.selectedBibleChapter);
        this.navigate('bible-reading');
    }
    return;
}

const devotionalStepBtn = e.target.closest('[data-action="devotional-step"]');
if (devotionalStepBtn) {
    const date = devotionalStepBtn.getAttribute('data-date');
    const stepId = devotionalStepBtn.getAttribute('data-step');

    this.setActiveDevotionalStep(stepId);
    this.rerenderCurrentReadingView(date, true);
    return;
}

const devotionalPrevBtn = e.target.closest('[data-action="devotional-prev"]');
if (devotionalPrevBtn) {
    const date = devotionalPrevBtn.getAttribute('data-date');
    const steps = this.getDevotionalSteps();
    const currentIndex = steps.findIndex(step => step.id === this.getActiveDevotionalStep());

    if (currentIndex > 0) {
        this.setActiveDevotionalStep(steps[currentIndex - 1].id);
        this.rerenderCurrentReadingView(date, true);
    }
    return;
}

const devotionalNextBtn = e.target.closest('[data-action="devotional-next"]');
if (devotionalNextBtn) {
    const date = devotionalNextBtn.getAttribute('data-date');
    const steps = this.getDevotionalSteps();
    const currentIndex = steps.findIndex(step => step.id === this.getActiveDevotionalStep());

    if (currentIndex >= 0 && currentIndex < steps.length - 1) {
        this.setActiveDevotionalStep(steps[currentIndex + 1].id);
        this.rerenderCurrentReadingView(date, true);
    }
    return;
}

const noteGuideBtn = e.target.closest('[data-action="toggle-note-guide"]');
if (noteGuideBtn) {
    e.stopPropagation();

    const section = noteGuideBtn.closest('.note-section');
    const panel = section?.querySelector('.note-guide-panel');

    if (!panel) return;

    const isHidden = panel.hasAttribute('hidden');

    this.$content.querySelectorAll('.note-guide-panel').forEach(item => {
        if (item !== panel) item.setAttribute('hidden', '');
    });

    this.$content.querySelectorAll('[data-action="toggle-note-guide"]').forEach(btn => {
        if (btn !== noteGuideBtn) btn.setAttribute('aria-expanded', 'false');
    });

    if (isHidden) {
        panel.removeAttribute('hidden');
        noteGuideBtn.setAttribute('aria-expanded', 'true');
    } else {
        panel.setAttribute('hidden', '');
        noteGuideBtn.setAttribute('aria-expanded', 'false');
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
            const reading = await this.getReadingByDate(date);

        if (reading) {
        const rawHtml = reading.versions?.[this.currentVersion] || reading.text || '';

        const cleanText = rawHtml
            .replace(/<\/p>\s*<p>/g, '\n\n')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();

       const appLink = 'https://suvoz.app';

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
                .catch(error => {
                    if (error?.name !== 'AbortError') {
                        console.warn('[Share] No se pudo compartir la lectura:', error);
                    }
                });
       } else if (navigator.clipboard) {
            navigator.clipboard.writeText(shareText)
                .then(() => this.showToast('Lectura copiada al portapapeles'))
                .catch(error => {
                    console.warn('[Share] No se pudo copiar la lectura:', error);
                });
        }
    }
    return;
}

const dailyReadingVoiceToggleBtn = e.target.closest('[data-action="daily-reading-voice-toggle"]');
if (dailyReadingVoiceToggleBtn) {
    const date = dailyReadingVoiceToggleBtn.getAttribute('data-date');
    const reading = await this.getReadingByDate(date);
    const text = this.getCleanDailyReadingText(reading);

    this.pauseOrResumeDailyReadingVoice(date, text);
    return;
}

const dailyReadingVoiceStopBtn = e.target.closest('[data-action="daily-reading-voice-stop"]');
if (dailyReadingVoiceStopBtn) {
    this.stopDailyReadingVoice();
    return;
}

const bibleChapterVoiceToggleBtn = e.target.closest('[data-action="bible-chapter-voice-toggle"]');
if (bibleChapterVoiceToggleBtn) {
    const key = bibleChapterVoiceToggleBtn.getAttribute('data-key');
    const reference = bibleChapterVoiceToggleBtn.getAttribute('data-reference') || '';
    const book = this.bibleBooks.find(item => item.id === this.selectedBibleBook);
    const verses = this.getBibleChapterVoiceVerses(
        this.currentBibleChapterData,
        book?.name || 'Biblia',
        Number(this.selectedBibleChapter)
    );
    this.toggleBibleChapterVoice(key, verses, reference);
    return;
}

const bibleChapterVoiceStopBtn = e.target.closest('[data-action="bible-chapter-voice-stop"]');
if (bibleChapterVoiceStopBtn) {
    this.stopBibleChapterVoice();
    return;
}

const prevDayBtn = e.target.closest('[data-action="home-prev-day"]');
if (prevDayBtn) {
    this.changeHomeDay(-1).catch(error => {
        console.warn('[Readings] No se pudo cambiar al día anterior:', error);
    });
    return;
}

const nextDayBtn = e.target.closest('[data-action="home-next-day"]');
if (nextDayBtn) {
    this.changeHomeDay(1).catch(error => {
        console.warn('[Readings] No se pudo cambiar al día siguiente:', error);
    });
    return;
}
           
const donateBtn = e.target.closest('[data-action="donate"]');
if (donateBtn) {
    window.open('https://paypal.me/suvozadiario', '_blank');
    this.showToast('Serás redirigido a PayPal');
    return;
}

const selectStatsDayBtn = e.target.closest('[data-action="select-stats-day"]');
if (selectStatsDayBtn) {
    const date = selectStatsDayBtn.getAttribute('data-date');

    if (date) {
        this.selectedStatsDate = date;
        this.renderStats();
    }
    return;
}

const statsOpenReadingBtn = e.target.closest('[data-action="stats-open-reading"]');
if (statsOpenReadingBtn) {
    const date = statsOpenReadingBtn.getAttribute('data-date');

    if (date) {
        this.navigate('reading', date);
    }
    return;
}

const statsOpenResponseBtn = e.target.closest('[data-action="stats-open-response"]');
if (statsOpenResponseBtn) {
    const date = statsOpenResponseBtn.getAttribute('data-date');

    if (date) {
        const note = this.getNote(date);
        this.openNoteDate = date;
        this.activeNoteField = note.oracion?.trim() ? 'oracion' : null;
        this.navigate('reading', date);
    }
    return;
}

const statsOpenMemoryBtn = e.target.closest('[data-action="stats-open-memory"]');
if (statsOpenMemoryBtn) {
    const date = statsOpenMemoryBtn.getAttribute('data-date');

    if (date) {
        this.navigate('reading', date);
    }
    return;
}

const statsOpenBookBtn = e.target.closest('[data-action="stats-open-book"]');
if (statsOpenBookBtn) {
    const date = statsOpenBookBtn.getAttribute('data-date');

    if (date) {
        this.navigate('reading', date);
    }
    return;
}

const statsOpenMomentBtn = e.target.closest('[data-action="stats-open-moment"]');
if (statsOpenMomentBtn) {
    const date = statsOpenMomentBtn.getAttribute('data-date');
    const kind = statsOpenMomentBtn.getAttribute('data-kind');

    if (date) {
        if (kind === 'Reflexión') {
            this.openNoteDate = date;
        }
        this.navigate('reading', date);
    }
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

const retryCommunityBtn = e.target.closest('[data-action="retry-community"]');
if (retryCommunityBtn) {
    this.invalidateCommunityCache();
    this.renderCommunity().catch(error => {
        this.renderCommunityLoadError(error);
    });
    return;
}

const loadMoreCommunityBtn = e.target.closest('[data-action="load-more-community-posts"]');
if (loadMoreCommunityBtn) {
    this.saveCommunityScrollPosition();
    loadMoreCommunityBtn.disabled = true;
    loadMoreCommunityBtn.textContent = 'Cargando...';

    await this.loadMoreCommunityPosts();

    this.renderCommunity({ showSkeleton: false }).catch(error => {
        console.error('[Community] Error cargando más ecos:', error);
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
    this.showToast('Lo compartido no puede exceder 1200 caracteres');
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
    const todayReading = this.getReadingMetadataByDate(todayStr);

    const newPost = {
        reference: todayReading ? todayReading.reference : 'Lectura del día',
        name: displayName,
        text: reflectionText,
        date: todayStr,
        ownerUid: this.currentUser.uid
    };

    const success = await this.addCommunityPost(newPost);

    if (!success) {
        this.showToast('No se pudo compartir lo que Dios te habló');
        return;
    }

    this.shouldScrollToLastPost = true;  // Esto hará que al recargar vaya al nuevo post

    if ('vibrate' in navigator) {
        navigator.vibrate(30);
    }

    this.communityFormOpen = false;
    this.clearCommunityDraft();

    if (reflectionInput) reflectionInput.value = '';
    if (nameInput) nameInput.value = '';
    if (anonymousInput) anonymousInput.checked = true;
    if (nameInput) {
        nameInput.disabled = true;
        nameInput.placeholder = 'Se publicará como Anónimo';
    }

    this.showToast('Gracias por compartir lo que Dios te habló');

    this.$content.querySelector('.community-form-card')?.remove();

    const composerButton = this.$content.querySelector('[data-action="share-community-reflection"]');
    if (composerButton) {
        composerButton.textContent = 'Compartir lo que Dios me habló';
    }

    this.renderCommunity({
        showSkeleton: false,
        preserveOnError: true,
        forceRefresh: true
    }).catch(error => {
        console.warn('[Community] No se pudo sincronizar la publicación en segundo plano:', error);
    });
    return;
}
           
const deleteCommunityBtn = e.target.closest('[data-action="delete-community-post"]');
if (deleteCommunityBtn) {
    const postId = deleteCommunityBtn.getAttribute('data-id');

    if (confirm('¿Deseas eliminar este eco de la lectura?')) {
        const success = await this.deleteCommunityPost(postId);

        if (!success) {
            this.showToast('No se pudo eliminar este eco');
            return;
        }

         this.invalidateCommunityCache(); 

        if ('vibrate' in navigator) {
            navigator.vibrate(20);
        }

        this.showToast('Eco eliminado');
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

    this.clearReplyDraft(postId);
    this.openReplyPostId = null;
    this.showToast('Respuesta publicada');

    publishReplyBtn.closest('.community-reply-form')?.remove();

    this.renderCommunity({
        showSkeleton: false,
        preserveOnError: true,
        forceRefresh: true
    }).catch(error => {
        console.warn('[Community] No se pudo sincronizar la respuesta en segundo plano:', error);
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
    await this.exportReflectionPDF(date);
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

const calendarFilterBtn = e.target.closest('[data-action="set-calendar-filter"]');
if (calendarFilterBtn) {
    const filterId = calendarFilterBtn.getAttribute('data-filter') || 'all';
    const validFilters = this.getCalendarFilterOptions().map(filter => filter.id);

    if (validFilters.includes(filterId)) {
        this.calendarActiveFilter = filterId;
        this.saveCalendarScroll();
        this.renderCalendar();
    }
    return;
}

const toggleCalendarBookBtn = e.target.closest('[data-action="toggle-calendar-book"]');
if (toggleCalendarBookBtn) {
    const bookId = toggleCalendarBookBtn.getAttribute('data-book-id');
    if (bookId) {
        const isOpen = toggleCalendarBookBtn.getAttribute('aria-expanded') === 'true';
        this.calendarBookOpenState[bookId] = !isOpen;
        this.saveCalendarScroll();
        this.renderCalendar();
    }
    return;
}

const jumpCalendarBookBtn = e.target.closest('[data-action="jump-calendar-book"]');
if (jumpCalendarBookBtn) {
    const bookId = jumpCalendarBookBtn.getAttribute('data-book-id');
    const target = bookId
        ? Array.from(this.$content.querySelectorAll('[data-calendar-book]'))
            .find(section => section.dataset.calendarBook === bookId)
        : null;

    if (target) {
        const top = target.getBoundingClientRect().top + window.scrollY - 92;
        this.scrollWindowInstantly(top);
        this.calendarScrollTop = Math.max(0, top);
    }
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
    const strongDictionaryInput = e.target.closest('#strong-dictionary-input');
    if (strongDictionaryInput) {
        this.setStrongDictionaryQuery(strongDictionaryInput.value, { clearConsulted: true });
        return;
    }
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
        this.saveCommunityDraft(e.target.value);

        const counter = document.getElementById('community-char-counter');
        if (!counter) return;
        const draftRestoredNotice = document.querySelector('.community-draft-restored');

        if (draftRestoredNotice && !e.target.value.trim()) {
            draftRestoredNotice.remove();
        }

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
    const query = e.target.value;
    this.bibleSearchRequestId += 1;
    this.bibleSearchQuery = query;
    this.bibleSearchError = '';
    clearTimeout(this.searchTimeout);

    if (e.isComposing || this.bibleSearchComposing) {
        this.searchTimeout = null;
        return;
    }

    this.updateBibleSearchClearButton();
    this.scheduleBibleSearch(query);
}          
});

        this.$content.addEventListener('compositionstart', (e) => {
    if (e.target.id !== 'bible-search-input') return;

    this.bibleSearchComposing = true;
    this.bibleSearchRequestId += 1;
    this.bibleSearchQuery = e.target.value;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = null;
});

        this.$content.addEventListener('compositionend', (e) => {
    if (e.target.id !== 'bible-search-input') return;

    this.bibleSearchComposing = false;
    this.bibleSearchRequestId += 1;
    this.bibleSearchQuery = e.target.value;
    this.bibleSearchError = '';
    this.updateBibleSearchClearButton();
    this.scheduleBibleSearch(e.target.value);
});

        this.$content.addEventListener('change', (e) => {
    if (e.target.id === 'community-anonymous') {
        const nameInput = document.getElementById('community-name');
        const nameGroup = nameInput?.closest('.community-name-group');
        if (!nameInput) return;

        if (e.target.checked) {
            nameInput.value = '';
            nameInput.disabled = true;
            nameInput.placeholder = 'Se publicará como Anónimo';
            nameGroup?.classList.add('is-hidden');
        } else {
            nameInput.disabled = false;
            nameInput.placeholder = 'Escribe tu nombre';
            nameGroup?.classList.remove('is-hidden');
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

        // Normalizar espacios horizontales sin eliminar saltos de línea.
        cleaned = cleaned.replace(/\r\n?/g, '\n');
        cleaned = cleaned.replace(/[^\S\n]+/g, ' ');

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

function hideSplashScreen(delay = 0) {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;

    setTimeout(() => {
        if (!splash.isConnected) return;
        splash.style.opacity = '0';

        setTimeout(() => {
            if (splash.isConnected) splash.remove();
        }, 800);
    }, delay);
}

// Inicializar la app
document.addEventListener('DOMContentLoaded', () => {
    const splashFallback = setTimeout(() => {
        hideSplashScreen();
    }, 3500);

    App.init()
        .catch(error => {
            console.error('[App] Error al inicializar:', error);
        })
        .finally(() => {
            clearTimeout(splashFallback);
            hideSplashScreen(250);
        });
});

window.App = App;

window.addEventListener('load', () => {
    hideSplashScreen(1200);
});
