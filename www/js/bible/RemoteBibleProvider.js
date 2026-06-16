import {
    BIBLE_ERROR_CODES,
    BibleProviderError,
    isBibleProviderError
} from './bibleErrors.js';
import {
    createBibleChapter
} from './bibleModel.js';
import {
    normalizeBibleBookId
} from './bibleBookIds.js';

export const BIBLE_SOURCE_REMOTE = 'remote';

export const REMOTE_BIBLE_VERSIONS = Object.freeze([
    Object.freeze({
        id: 'nbla',
        sourceId: 'nbla',
        name: 'Nueva Biblia de las Américas',
        abbreviation: 'NBLA',
        language: 'es',
        source: BIBLE_SOURCE_REMOTE,
        enabled: false,
        status: 'placeholder'
    }),
    Object.freeze({
        id: 'nvi',
        sourceId: 'nvi',
        name: 'Nueva Versión Internacional',
        abbreviation: 'NVI',
        language: 'es',
        source: BIBLE_SOURCE_REMOTE,
        enabled: false,
        status: 'placeholder'
    }),
    Object.freeze({
        id: 'biblia-libre',
        sourceId: 'biblia-libre',
        name: 'Biblia Libre',
        abbreviation: 'Biblia Libre',
        language: 'es',
        source: BIBLE_SOURCE_REMOTE,
        enabled: false,
        status: 'placeholder'
    })
]);

function normalizeVersion(version) {
    const id = String(version?.id || '').trim().toLowerCase();

    if (!id) {
        throw new BibleProviderError(
            BIBLE_ERROR_CODES.INVALID_RESPONSE,
            'La versión bíblica remota no tiene un ID válido.'
        );
    }

    return Object.freeze({
        id,
        sourceId: String(version.sourceId || version.id || id).trim(),
        name: String(version.name || id).trim(),
        abbreviation: String(version.abbreviation || version.name || id).trim(),
        language: String(version.language || 'es').trim().toLowerCase(),
        source: BIBLE_SOURCE_REMOTE,
        enabled: version.enabled === true,
        status: String(version.status || (version.enabled ? 'available' : 'placeholder')).trim()
    });
}

function getResponseData(response, fieldName) {
    const data = response?.data ?? response;

    if (!fieldName) return data;

    const nested = data?.[fieldName];
    const isExpectedWrapper = fieldName === 'chapter'
        ? nested && typeof nested === 'object' && !Array.isArray(nested)
        : Array.isArray(nested);

    return isExpectedWrapper ? nested : data;
}

export class RemoteBibleProvider {
    constructor({
        versions = REMOTE_BIBLE_VERSIONS,
        client = null,
        request = null,
        timeoutMs = 10000,
        canUseDisabledVersion = () => false,
        isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false
    } = {}) {
        this.source = BIBLE_SOURCE_REMOTE;
        this.acceptsVersionArgument = true;
        this.versions = Object.freeze(versions.map(normalizeVersion));
        this.versionIds = Object.freeze(this.versions.map(version => version.id));
        this.client = client;
        this.request = request;
        this.timeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;
        this.canUseDisabledVersion = canUseDisabledVersion;
        this.isOnline = isOnline;

        // Caché de sesión únicamente. No usa localStorage, IndexedDB ni Cache API.
        this.chapterCache = new Map();
    }

    async getVersions() {
        if (!this.client || this.client.supportsVersionCatalog === false) {
            return this.versions;
        }

        const response = await this.requestOperation('versions', {});
        const versions = getResponseData(response, 'versions');

        if (!Array.isArray(versions)) {
            throw this.invalidResponse('La respuesta no contiene una lista de versiones válida.');
        }

        return this.versions.map(configuredVersion => {
            const sourceVersion = versions.find(version => {
                const sourceId = String(version?.id || '').trim().toLowerCase();
                const canonicalId = String(version?.canonicalId || '').trim().toLowerCase();

                return sourceId === configuredVersion.sourceId.toLowerCase()
                    || canonicalId === configuredVersion.id;
            });

            if (!sourceVersion) return configuredVersion;

            return Object.freeze({
                ...configuredVersion,
                sourceId: String(sourceVersion.id || configuredVersion.sourceId),
                name: String(sourceVersion.name || configuredVersion.name),
                abbreviation: String(sourceVersion.abbreviation || configuredVersion.abbreviation),
                language: String(sourceVersion.language || configuredVersion.language).toLowerCase()
            });
        });
    }

    async getBooks(versionId) {
        const version = this.getAvailableVersion(versionId);
        const response = await this.requestOperation('books', {
            versionId: version.sourceId
        });
        const books = getResponseData(response, 'books');

        if (!Array.isArray(books)) {
            throw this.invalidResponse('La respuesta de libros no contiene una lista válida.', {
                versionId: version.id
            });
        }

        return books.map((book, index) => {
            const sourceBookId = String(
                book?.sourceBookId || book?.id || book?.bookId || ''
            ).trim();
            const id = normalizeBibleBookId(book?.canonicalId || sourceBookId);
            const name = String(book?.name || book?.bookName || '').trim();
            const chapters = Number(book?.chapters ?? book?.chapterCount);

            if (!id || !name || !Number.isInteger(chapters) || chapters < 1) {
                throw this.invalidResponse('La respuesta contiene un libro inválido.', {
                    versionId: version.id,
                    bookIndex: index
                });
            }

            return Object.freeze({
                id,
                sourceBookId,
                name,
                abbreviation: String(book.abbreviation || '').trim(),
                testament: String(book.testament || '').trim().toLowerCase(),
                chapters,
                order: Number(book.order) || index + 1
            });
        });
    }

    async getChapter(versionId, bookId, chapterNumber) {
        const version = this.getAvailableVersion(versionId);
        const normalizedBookId = normalizeBibleBookId(bookId);
        const normalizedChapter = Number(chapterNumber);
        const cacheKey = this.getChapterCacheKey(
            version.id,
            normalizedBookId,
            normalizedChapter
        );

        if (this.chapterCache.has(cacheKey)) {
            return this.chapterCache.get(cacheKey);
        }

        const response = await this.requestOperation('chapter', {
            versionId: version.sourceId,
            bookId: normalizedBookId,
            chapter: normalizedChapter
        });
        const chapter = getResponseData(response, 'chapter');

        if (!chapter || !Array.isArray(chapter.verses)) {
            throw this.invalidResponse('La respuesta del capítulo no contiene versículos válidos.', {
                versionId: version.id,
                bookId: normalizedBookId,
                chapter: normalizedChapter
            });
        }

        let normalizedChapterData;

        try {
            normalizedChapterData = createBibleChapter({
                versionId: version.id,
                versionLabel: version.abbreviation,
                versionName: version.name,
                source: BIBLE_SOURCE_REMOTE,
                bookId: normalizeBibleBookId(chapter.canonicalBookId || chapter.bookId || normalizedBookId),
                sourceBookId: chapter.sourceBookId || chapter.bookId || normalizedBookId,
                bookName: chapter.bookName || '',
                chapter: chapter.chapterNumber || chapter.chapter || normalizedChapter,
                verses: chapter.verses
            });
        } catch (error) {
            throw this.invalidResponse('No se pudo normalizar el capítulo remoto.', {
                versionId: version.id,
                bookId: normalizedBookId,
                chapter: normalizedChapter,
                cause: error?.message || String(error)
            });
        }

        this.chapterCache.set(cacheKey, normalizedChapterData);
        return normalizedChapterData;
    }

    async search(versionId, query, options = {}) {
        const version = this.getAvailableVersion(versionId);
        const normalizedQuery = String(query || '').trim();

        if (!normalizedQuery) return [];

        const response = await this.requestOperation('search', {
            versionId: version.sourceId,
            query: normalizedQuery,
            options: { ...options }
        });
        const results = getResponseData(response, 'results');

        if (!Array.isArray(results)) {
            throw this.invalidResponse('La respuesta de búsqueda no contiene resultados válidos.', {
                versionId: version.id
            });
        }

        return results.map((result, index) => {
            const sourceBookId = String(result?.bookId || '').trim();
            const bookId = normalizeBibleBookId(result?.canonicalBookId || sourceBookId);
            const chapter = Number(result?.chapter);
            const verse = Number(result?.verse);
            const text = String(result?.text || '').trim();

            if (
                !bookId ||
                !Number.isInteger(chapter) ||
                chapter < 1 ||
                !Number.isInteger(verse) ||
                verse < 1 ||
                !text
            ) {
                throw this.invalidResponse('La respuesta contiene un resultado de búsqueda inválido.', {
                    versionId: version.id,
                    resultIndex: index
                });
            }

            return Object.freeze({
                id: String(result.id || `${bookId}.${chapter}.${verse}`),
                versionId: version.id,
                versionLabel: version.abbreviation,
                versionName: version.name,
                bookId,
                sourceBookId,
                bookName: String(result.bookName || '').trim(),
                chapter,
                verse,
                text,
                reference: String(result.reference || '').trim()
            });
        });
    }

    getChapterCacheKey(versionId, bookId, chapterNumber) {
        return [
            String(versionId || '').trim().toLowerCase(),
            String(bookId || '').trim().toLowerCase(),
            Number(chapterNumber)
        ].join(':');
    }

    clearChapterCache() {
        this.chapterCache.clear();
    }

    getAvailableVersion(versionId) {
        const normalizedVersionId = String(versionId || '').trim().toLowerCase();
        const version = this.versions.find(item => item.id === normalizedVersionId);

        const internalAccessAllowed = version &&
            this.canUseDisabledVersion(version.id) === true;

        if (!version || (!version.enabled && !internalAccessAllowed)) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.VERSION_NOT_AVAILABLE,
                `La versión bíblica ${versionId || ''} todavía no está disponible.`,
                {
                    versionId: normalizedVersionId,
                    status: version?.status || 'unknown'
                }
            );
        }

        return version;
    }

    async requestOperation(operation, payload) {
        if (!this.isOnline()) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.OFFLINE,
                'No hay conexión a internet para consultar esta Biblia.',
                { operation, versionId: payload.versionId }
            );
        }

        const clientMethodNames = {
            versions: 'getVersions',
            books: 'getBooks',
            chapter: 'getChapter',
            search: 'search'
        };
        const clientMethod = this.client?.[clientMethodNames[operation]];

        if (typeof clientMethod !== 'function' && typeof this.request !== 'function') {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
                'El proveedor remoto todavía no está configurado.',
                { operation, versionId: payload.versionId }
            );
        }

        const controller = typeof AbortController === 'undefined'
            ? null
            : new AbortController();
        let timeoutId;

        const timeoutPromise = new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => {
                controller?.abort();
                reject(new BibleProviderError(
                    BIBLE_ERROR_CODES.TIMEOUT,
                    'La consulta bíblica remota excedió el tiempo de espera.',
                    { operation, versionId: payload.versionId, timeoutMs: this.timeoutMs }
                ));
            }, this.timeoutMs);
        });

        try {
            return await Promise.race([
                Promise.resolve(
                    typeof clientMethod === 'function'
                        ? clientMethod.call(this.client, {
                            ...payload,
                            signal: controller?.signal
                        })
                        : this.request({
                            operation,
                            ...payload,
                            signal: controller?.signal
                        })
                ),
                timeoutPromise
            ]);
        } catch (error) {
            if (isBibleProviderError(error)) throw error;

            if (error instanceof TypeError || this.isOnline() === false) {
                throw new BibleProviderError(
                    BIBLE_ERROR_CODES.OFFLINE,
                    'No se pudo conectar con el proveedor bíblico.',
                    {
                        operation,
                        versionId: payload.versionId,
                        cause: error?.message || String(error)
                    }
                );
            }

            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    invalidResponse(message, details = {}) {
        return new BibleProviderError(
            BIBLE_ERROR_CODES.INVALID_RESPONSE,
            message,
            details
        );
    }
}
