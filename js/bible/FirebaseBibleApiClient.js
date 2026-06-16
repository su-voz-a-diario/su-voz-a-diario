import {
    BibleApiClient
} from './BibleApiClient.js';
import {
    BIBLE_ERROR_CODES,
    BibleProviderError
} from './bibleErrors.js';

const CALLABLE_NAMES = Object.freeze({
    books: 'getRemoteBibleBooks',
    chapter: 'getRemoteBibleChapter',
    search: 'searchRemoteBible'
});

const FIREBASE_ERROR_CODES = Object.freeze({
    'functions/deadline-exceeded': BIBLE_ERROR_CODES.TIMEOUT,
    'functions/not-found': BIBLE_ERROR_CODES.CHAPTER_NOT_FOUND,
    'functions/unavailable': BIBLE_ERROR_CODES.OFFLINE,
    'functions/unimplemented': BIBLE_ERROR_CODES.OPERATION_NOT_SUPPORTED
});

export class FirebaseBibleApiClient extends BibleApiClient {
    constructor({
        region = 'us-central1',
        firebaseReady = () => globalThis.window?.suVozFirebaseReady,
        getFirebaseFns = () => globalThis.window?.firebaseFns,
        getFirebaseApp = () => globalThis.window?.firebaseApp,
        getFirebaseAuth = () => globalThis.window?.firebaseAuth
    } = {}) {
        super();
        this.region = region;
        this.firebaseReady = firebaseReady;
        this.getFirebaseFns = getFirebaseFns;
        this.getFirebaseApp = getFirebaseApp;
        this.getFirebaseAuth = getFirebaseAuth;
        this.callables = new Map();
        this.supportsVersionCatalog = false;
    }

    async getVersions() {
        return { versions: [] };
    }

    async getBooks({ versionId } = {}) {
        return this.call('books', { versionId });
    }

    async getChapter({ versionId, bookId, chapter } = {}) {
        return this.call('chapter', { versionId, bookId, chapter });
    }

    async search({ versionId, query, options = {} } = {}) {
        return this.call('search', {
            versionId,
            query,
            limit: Number(options.limit ?? options.pageSize) || 20,
            page: Number(options.page) || 1
        });
    }

    async call(operation, payload) {
        try {
            const callable = await this.getCallable(operation);
            const response = await callable(payload);
            return response?.data ?? response;
        } catch (error) {
            if (error instanceof BibleProviderError) throw error;

            const code = FIREBASE_ERROR_CODES[error?.code] ||
                BIBLE_ERROR_CODES.INVALID_RESPONSE;
            throw new BibleProviderError(
                code,
                this.getSafeErrorMessage(error, operation),
                {
                    operation,
                    firebaseCode: String(error?.code || ''),
                    proxyCode: String(error?.details?.proxyCode || '')
                }
            );
        }
    }

    async getCallable(operation) {
        if (this.callables.has(operation)) {
            return this.callables.get(operation);
        }

        await Promise.resolve(this.firebaseReady?.());
        const firebaseFns = this.getFirebaseFns?.();
        const firebaseApp = this.getFirebaseApp?.();
        const firebaseAuth = this.getFirebaseAuth?.();

        if (
            !firebaseFns?.getFunctions ||
            !firebaseFns?.httpsCallable ||
            !firebaseApp ||
            !firebaseAuth
        ) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
                'Firebase todavía no está disponible para consultar Biblias remotas.',
                { operation }
            );
        }

        if (!firebaseAuth.currentUser) {
            if (typeof firebaseFns.signInAnonymously !== 'function') {
                throw new BibleProviderError(
                    BIBLE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
                    'Firebase Auth no está disponible para la consulta bíblica.',
                    { operation }
                );
            }

            await firebaseFns.signInAnonymously(firebaseAuth);
        }

        const functions = firebaseFns.getFunctions(firebaseApp, this.region);
        const callable = firebaseFns.httpsCallable(
            functions,
            CALLABLE_NAMES[operation]
        );
        this.callables.set(operation, callable);
        return callable;
    }

    getSafeErrorMessage(error, operation) {
        if (error?.details?.proxyCode === 'SEARCH_NOT_SUPPORTED') {
            return 'La búsqueda no está disponible para esta Biblia remota.';
        }

        if (error?.code === 'functions/unavailable') {
            return 'No se pudo conectar con el servicio bíblico.';
        }

        if (error?.code === 'functions/deadline-exceeded') {
            return 'La consulta bíblica remota excedió el tiempo de espera.';
        }

        return String(
            error?.message ||
            `No se pudo completar la operación bíblica ${operation}.`
        ).slice(0, 300);
    }
}
