export const BIBLE_ERROR_CODES = Object.freeze({
    OFFLINE: 'BIBLE_OFFLINE',
    VERSION_NOT_AVAILABLE: 'BIBLE_VERSION_NOT_AVAILABLE',
    INVALID_RESPONSE: 'BIBLE_INVALID_RESPONSE',
    TIMEOUT: 'BIBLE_TIMEOUT',
    PROVIDER_NOT_CONFIGURED: 'BIBLE_PROVIDER_NOT_CONFIGURED',
    OPERATION_NOT_SUPPORTED: 'BIBLE_OPERATION_NOT_SUPPORTED',
    BOOK_NOT_FOUND: 'BIBLE_BOOK_NOT_FOUND',
    CHAPTER_NOT_FOUND: 'BIBLE_CHAPTER_NOT_FOUND'
});

export class BibleProviderError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'BibleProviderError';
        this.code = code;
        this.details = details;
    }
}

export function isBibleProviderError(error) {
    return error instanceof BibleProviderError;
}
