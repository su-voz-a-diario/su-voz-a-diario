import {
    BIBLE_ERROR_CODES,
    BibleProviderError
} from './bibleErrors.js';

export class BibleApiClient {
    async getVersions() {
        return this.unsupported('getVersions');
    }

    async getBooks() {
        return this.unsupported('getBooks');
    }

    async getChapter() {
        return this.unsupported('getChapter');
    }

    async search() {
        return this.unsupported('search');
    }

    unsupported(operation) {
        throw new BibleProviderError(
            BIBLE_ERROR_CODES.OPERATION_NOT_SUPPORTED,
            `El cliente bíblico no implementa ${operation}.`,
            { operation }
        );
    }
}
