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
        const projectId = globalThis.window?.firebaseApp?.options?.projectId || 'su-voz-a-diario-v2-f3a87';
        const callableName = CALLABLE_NAMES[operation] || operation;
        const targetedUrl = `https://${this.region}-${projectId}.cloudfunctions.net/${callableName}`;

        console.log(`[FirebaseBibleApiClient] Iniciando llamada remota:`, {
            operation,
            versionId: payload?.versionId,
            bookId: payload?.bookId,
            chapter: payload?.chapter,
            targetedUrl,
            payload
        });

        try {
            const callable = await this.getCallable(operation);
            const response = await callable(payload);

            console.log(`[FirebaseBibleApiClient] Respuesta recibida exitosamente para ${operation}:`, response);
            return response?.data ?? response;
        } catch (error) {
            console.error(`[FirebaseBibleApiClient] Error en llamada remota ${operation}:`, {
                message: error?.message,
                code: error?.code,
                status: error?.status,
                details: error?.details,
                stack: error?.stack,
                targetedUrl,
                errorObject: error
            });

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

        console.log(`[FirebaseBibleApiClient] Obteniendo callable para ${operation}. Verificando inicialización de Firebase...`);

        const readyPromise = this.firebaseReady?.();
        console.log(`[FirebaseBibleApiClient] Estado de window.suVozFirebaseReady:`, readyPromise);
        await Promise.resolve(readyPromise);

        const firebaseFns = this.getFirebaseFns?.();
        const firebaseApp = this.getFirebaseApp?.();
        const firebaseAuth = this.getFirebaseAuth?.();

        console.log(`[FirebaseBibleApiClient] Módulos de Firebase disponibles:`, {
            hasGetFunctions: typeof firebaseFns?.getFunctions === 'function',
            hasHttpsCallable: typeof firebaseFns?.httpsCallable === 'function',
            hasFirebaseApp: !!firebaseApp,
            hasFirebaseAuth: !!firebaseAuth
        });

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

        console.log(`[FirebaseBibleApiClient] Usuario actual de Auth:`, {
            uid: firebaseAuth.currentUser?.uid,
            isAnonymous: firebaseAuth.currentUser?.isAnonymous
        });

        if (!firebaseAuth.currentUser) {
            if (typeof firebaseFns.signInAnonymously !== 'function') {
                throw new BibleProviderError(
                    BIBLE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
                    'Firebase Auth no está disponible para la consulta bíblica.',
                    { operation }
                );
            }

            console.log(`[FirebaseBibleApiClient] No hay usuario autenticado. Iniciando signInAnonymously...`);
            try {
                await firebaseFns.signInAnonymously(firebaseAuth);
                console.log(`[FirebaseBibleApiClient] Autenticación anónima completada con éxito. UID:`, firebaseAuth.currentUser?.uid);
            } catch (authErr) {
                console.error(`[FirebaseBibleApiClient] Error durante signInAnonymously:`, authErr);
                throw authErr;
            }
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
