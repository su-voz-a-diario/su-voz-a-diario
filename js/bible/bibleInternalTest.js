export const BIBLE_REMOTE_INTERNAL_TEST = true;

const INTERNAL_REMOTE_VERSION_IDS = Object.freeze([
    'nbla',
    'nvi',
    'biblia-libre'
]);

let bibleAdminState = false;

export function setBibleAdminState(state) {
    bibleAdminState = !!state;
}

export function canAccessRemoteBibleVersions(target = globalThis.window || globalThis) {
    // Permitir acceso en entornos de testing de Node (como scripts de validación)
    if (
        typeof process !== 'undefined' &&
        process.versions &&
        process.versions.node
    ) {
        return true;
    }
    return bibleAdminState;
}

export function getInternalBibleTestVersion(
    target = globalThis.window || globalThis
) {
    if (!BIBLE_REMOTE_INTERNAL_TEST) return null;
    if (!canAccessRemoteBibleVersions(target)) return null;

    const versionId = String(
        target?.__bibleTestVersion || ''
    ).trim().toLowerCase();

    return INTERNAL_REMOTE_VERSION_IDS.includes(versionId)
        ? versionId
        : null;
}

export function resolveInternalBibleVersion(
    requestedVersionId,
    target = globalThis.window || globalThis
) {
    return getInternalBibleTestVersion(target) ||
        String(requestedVersionId || '').trim().toLowerCase();
}

export function createBibleReadingKey(versionId, bookId, chapter) {
    const normalizedVersionId = String(versionId || '').trim().toLowerCase();
    const normalizedBookId = String(bookId || '').trim().toLowerCase();
    const normalizedChapter = Number(chapter);

    if (
        !normalizedBookId ||
        !Number.isInteger(normalizedChapter) ||
        normalizedChapter < 1
    ) {
        return '';
    }

    return normalizedVersionId && normalizedVersionId !== 'rv1909'
        ? `bible-${normalizedVersionId}-${normalizedBookId}-${normalizedChapter}`
        : `bible-${normalizedBookId}-${normalizedChapter}`;
}

export function parseBibleReadingKey(value) {
    const match = String(value || '').match(/^bible-(.+)-(\d+)$/);

    if (!match) return null;

    const chapter = Number(match[2]);
    let bookId = match[1];
    let versionId = 'rv1909';

    for (const remoteVersionId of INTERNAL_REMOTE_VERSION_IDS) {
        const prefix = `${remoteVersionId}-`;

        if (bookId.startsWith(prefix)) {
            versionId = remoteVersionId;
            bookId = bookId.slice(prefix.length);
            break;
        }
    }

    if (
        !bookId ||
        !Number.isInteger(chapter) ||
        chapter < 1
    ) {
        return null;
    }

    return {
        versionId,
        bookId,
        chapter
    };
}
