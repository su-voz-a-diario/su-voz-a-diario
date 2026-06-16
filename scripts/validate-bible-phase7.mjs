import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
    BibleRepository
} from '../js/bible/BibleRepository.js';
import {
    LocalRv1909Provider
} from '../js/bible/LocalRv1909Provider.js';
import {
    REMOTE_BIBLE_VERSIONS,
    RemoteBibleProvider
} from '../js/bible/RemoteBibleProvider.js';
import {
    BIBLE_REMOTE_INTERNAL_TEST,
    createBibleReadingKey,
    getInternalBibleTestVersion,
    parseBibleReadingKey,
    resolveInternalBibleVersion
} from '../js/bible/bibleInternalTest.js';

const testWindow = {};
const remoteRequests = [];
const remoteClient = {
    supportsVersionCatalog: false,
    async getChapter({ versionId, bookId, chapter }) {
        remoteRequests.push({ versionId, bookId, chapter });

        return {
            versionId,
            bookId,
            bookName: 'Juan',
            chapter,
            verses: Array.from({ length: 36 }, (_, index) => ({
                number: index + 1,
                text: `Texto remoto de prueba ${versionId} ${index + 1}.`,
                reference: `Juan ${chapter}:${index + 1}`
            }))
        };
    }
};
const localProvider = new LocalRv1909Provider({
    fetchImpl: async () => ({
        ok: true,
        json: async () => JSON.parse((
            await fs.readFile(new URL('../data/rv1909.json', import.meta.url), 'utf8')
        ).replace(/^\uFEFF/, ''))
    })
});
const remoteProvider = new RemoteBibleProvider({
    client: remoteClient,
    canUseDisabledVersion: versionId => (
        getInternalBibleTestVersion(testWindow) === versionId
    ),
    isOnline: () => true
});
const repository = new BibleRepository([
    localProvider,
    remoteProvider
], {
    versionResolver: versionId => (
        resolveInternalBibleVersion(versionId, testWindow)
    )
});

assert.equal(BIBLE_REMOTE_INTERNAL_TEST, true);
assert.ok(REMOTE_BIBLE_VERSIONS.every(version => version.enabled === false));

for (const versionId of ['nbla', 'nvi', 'biblia-libre']) {
    testWindow.__bibleTestVersion = versionId;
    const chapter = await repository.getChapter('rv1909', 'jhn', 3);

    assert.equal(chapter.versionId, versionId);
    assert.equal(chapter.bookId, 'jhn');
    assert.equal(chapter.chapter, 3);
    assert.equal(chapter.verses.length, 36);

    const readingKey = createBibleReadingKey(
        chapter.versionId,
        chapter.bookId,
        chapter.chapter
    );

    assert.deepEqual(parseBibleReadingKey(readingKey), {
        versionId,
        bookId: 'jhn',
        chapter: 3
    });
}

delete testWindow.__bibleTestVersion;
const localChapter = await repository.getChapter('rv1909', 'jhn', 3);
assert.equal(localChapter.versionId, 'rv1909');
assert.equal(localChapter.bookId, 'jhn');
assert.equal(localChapter.chapter, 3);
assert.equal(localChapter.verses.length, 36);
assert.equal(createBibleReadingKey('rv1909', 'jhn', 3), 'bible-jhn-3');
assert.deepEqual(parseBibleReadingKey('bible-jhn-3'), {
    versionId: 'rv1909',
    bookId: 'jhn',
    chapter: 3
});

await assert.rejects(
    () => remoteProvider.getChapter('nbla', 'jhn', 3),
    error => error?.code === 'BIBLE_VERSION_NOT_AVAILABLE'
);

assert.equal(remoteRequests.length, 3);
assert.equal(remoteProvider.chapterCache.size, 3);

const remoteProviderSource = await fs.readFile(
    new URL('../js/bible/RemoteBibleProvider.js', import.meta.url),
    'utf8'
);
const appSource = await fs.readFile(
    new URL('../js/app.js', import.meta.url),
    'utf8'
);

assert.doesNotMatch(
    remoteProviderSource,
    /\b(localStorage|sessionStorage|indexedDB)\s*\.|\bcaches\.open\s*\(|\b(setDoc|addDoc)\s*\(/
);
for (const methodName of [
    'getSelectedVerseCopyData',
    'shareSelectedTextAsImage',
    'saveSelectionNoteFromPanel',
    'restoreHighlightsInDOMForVerses',
    'toggleBibleChapterVoiceFromContext'
]) {
    assert.match(appSource, new RegExp(`${methodName}\\s*:`));
}
assert.match(appSource, /data-reading-date="\$\{this\.escapeHtml\(readingDateKey\)\}"/);

console.log(JSON.stringify({
    internalTestFlag: BIBLE_REMOTE_INTERNAL_TEST,
    remoteVersionsTested: remoteRequests.map(request => request.versionId),
    remoteVersionsVisible: false,
    localFallback: `${localChapter.versionLabel} Juan 3`,
    persistentRemoteTextCache: false
}, null, 2));
