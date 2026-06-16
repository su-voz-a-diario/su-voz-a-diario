import {
    BibleApiClient
} from './BibleApiClient.js';
import {
    BIBLE_ERROR_CODES,
    BibleProviderError
} from './bibleErrors.js';
import {
    normalizeBibleBookId
} from './bibleBookIds.js';
import {
    REMOTE_BIBLE_FIXTURES
} from './fixtures/remoteBibleFixtures.js';

function cloneFixture(value) {
    return JSON.parse(JSON.stringify(value));
}

export class FakeBibleApiClient extends BibleApiClient {
    constructor({
        fixtures = REMOTE_BIBLE_FIXTURES,
        delayMs = 0,
        timeoutOperations = [],
        invalidOperations = []
    } = {}) {
        super();
        this.fixtures = fixtures;
        this.delayMs = Math.max(0, Number(delayMs) || 0);
        this.timeoutOperations = new Set(timeoutOperations);
        this.invalidOperations = new Set(invalidOperations);
        this.requestCount = 0;
    }

    async getVersions({ signal } = {}) {
        await this.beforeOperation('getVersions', signal);
        return this.invalidOperations.has('getVersions')
            ? { versions: 'invalid' }
            : { versions: cloneFixture(this.fixtures.versions) };
    }

    async getBooks({ versionId, signal } = {}) {
        await this.beforeOperation('getBooks', signal);
        const version = this.findVersion(versionId);
        const books = this.fixtures.books[version.id];

        if (!Array.isArray(books)) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.INVALID_RESPONSE,
                'Los fixtures no contienen una lista de libros válida.',
                { versionId }
            );
        }

        return this.invalidOperations.has('getBooks')
            ? { books: 'invalid' }
            : { books: cloneFixture(books) };
    }

    async getChapter({ versionId, bookId, chapter, signal } = {}) {
        await this.beforeOperation('getChapter', signal);
        const version = this.findVersion(versionId);
        const book = this.findBook(version.id, bookId);
        const chapterNumber = Number(chapter);
        const fixture = this.fixtures.chapters[
            `${version.id}:${book.id}:${chapterNumber}`
        ];

        if (!fixture) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.CHAPTER_NOT_FOUND,
                `No existe el capítulo ${chapter} en los fixtures.`,
                {
                    versionId: version.canonicalId,
                    bookId: normalizeBibleBookId(book.canonicalId || book.id),
                    chapter: chapterNumber
                }
            );
        }

        return this.invalidOperations.has('getChapter')
            ? { chapter: { verses: 'invalid' } }
            : { chapter: cloneFixture(fixture) };
    }

    async search({ versionId, query, options = {}, signal } = {}) {
        await this.beforeOperation('search', signal);
        const version = this.findVersion(versionId);

        if (version.searchSupported === false) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.OPERATION_NOT_SUPPORTED,
                `La búsqueda no está disponible para ${version.canonicalId}.`,
                { operation: 'search', versionId: version.canonicalId }
            );
        }

        if (this.invalidOperations.has('search')) {
            return { results: 'invalid' };
        }

        const normalizedQuery = String(query || '').trim().toLowerCase();
        const results = [];
        const books = this.fixtures.books[version.id] || [];

        Object.entries(this.fixtures.chapters).forEach(([key, chapter]) => {
            if (!key.startsWith(`${version.id}:`)) return;

            const book = books.find(item => item.id === chapter.bookId);
            if (!book) return;

            chapter.verses.forEach(verse => {
                if (!String(verse.text || '').toLowerCase().includes(normalizedQuery)) return;

                results.push({
                    id: `${chapter.bookId}.${chapter.chapter}.${verse.number}`,
                    bookId: chapter.bookId,
                    bookName: chapter.bookName,
                    chapter: chapter.chapter,
                    verse: verse.number,
                    text: verse.text,
                    reference: `${chapter.bookName} ${chapter.chapter}:${verse.number}`
                });
            });
        });

        const page = Math.max(1, Number(options.page) || 1);
        const pageSize = Math.max(1, Number(options.pageSize) || 20);
        const start = (page - 1) * pageSize;

        return {
            results: cloneFixture(results.slice(start, start + pageSize)),
            total: results.length,
            page,
            pageSize
        };
    }

    findVersion(versionId) {
        const normalized = String(versionId || '').trim().toLowerCase();
        const version = this.fixtures.versions.find(item => {
            return item.id.toLowerCase() === normalized
                || item.canonicalId.toLowerCase() === normalized;
        });

        if (!version) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.VERSION_NOT_AVAILABLE,
                `La versión ${versionId} no existe en los fixtures.`,
                { versionId: normalized }
            );
        }

        return version;
    }

    findBook(sourceVersionId, bookId) {
        const normalized = normalizeBibleBookId(bookId);
        const books = this.fixtures.books[sourceVersionId] || [];
        const book = books.find(item => {
            return item.id.toLowerCase() === String(bookId || '').trim().toLowerCase()
                || normalizeBibleBookId(item.canonicalId || item.id) === normalized;
        });

        if (!book) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.BOOK_NOT_FOUND,
                `El libro ${bookId} no existe en los fixtures.`,
                { versionId: sourceVersionId, bookId: normalized }
            );
        }

        return book;
    }

    async beforeOperation(operation, signal) {
        this.requestCount += 1;

        if (this.timeoutOperations.has(operation)) {
            await new Promise((resolve, reject) => {
                signal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            });
            return;
        }

        if (!this.delayMs) return;

        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, this.delayMs);

            signal?.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
        });
    }
}
