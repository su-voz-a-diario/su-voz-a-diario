import assert from 'node:assert/strict';

import {
    FirebaseBibleApiClient
} from '../js/bible/FirebaseBibleApiClient.js';
import {
    REMOTE_BIBLE_VERSIONS,
    RemoteBibleProvider
} from '../js/bible/RemoteBibleProvider.js';

const versionNames = Object.freeze({
    nbla: ['NBLA', 'Nueva Biblia de las Américas'],
    nvi: ['NVI', 'Nueva Versión Internacional'],
    'biblia-libre': ['VBL', 'Biblia Libre']
});
const callableRequests = [];
const firebaseAuth = { currentUser: { uid: 'phase-6-user' } };
const firebaseFns = {
    getFunctions: (app, region) => ({ app, region }),
    httpsCallable: (_functions, name) => async (payload) => {
        callableRequests.push({ name, payload });

        if (name === 'getRemoteBibleBooks') {
            return {
                data: {
                    versionId: payload.versionId,
                    books: [{
                        versionId: payload.versionId,
                        bookId: 'jhn',
                        bookName: 'Juan',
                        abbreviation: 'Jn',
                        chapters: 21
                    }]
                }
            };
        }

        if (name === 'getRemoteBibleChapter') {
            const [versionLabel, versionName] = versionNames[payload.versionId];

            return {
                data: {
                    versionId: payload.versionId,
                    versionLabel,
                    versionName,
                    bookId: 'jhn',
                    bookName: 'Juan',
                    chapter: 3,
                    verses: Array.from({ length: 36 }, (_, index) => ({
                        number: index + 1,
                        text: `Texto remoto ${payload.versionId} ${index + 1}.`,
                        reference: `Juan 3:${index + 1}`
                    }))
                }
            };
        }

        if (name === 'searchRemoteBible') {
            const error = new Error('Búsqueda no soportada.');
            error.code = 'functions/unimplemented';
            error.details = { proxyCode: 'SEARCH_NOT_SUPPORTED' };
            throw error;
        }

        throw new Error(`Callable inesperada: ${name}`);
    }
};
const client = new FirebaseBibleApiClient({
    firebaseReady: async () => undefined,
    getFirebaseFns: () => firebaseFns,
    getFirebaseApp: () => ({ name: 'phase-6-app' }),
    getFirebaseAuth: () => firebaseAuth
});
const enabledTestVersions = REMOTE_BIBLE_VERSIONS.map(version => ({
    ...version,
    enabled: true,
    status: 'integration-test'
}));
const provider = new RemoteBibleProvider({
    versions: enabledTestVersions,
    client,
    isOnline: () => true
});

assert.ok(REMOTE_BIBLE_VERSIONS.every(version => version.enabled === false));
const configuredVersions = await new RemoteBibleProvider({
    client,
    isOnline: () => false
}).getVersions();
assert.equal(configuredVersions.length, 3);
assert.ok(configuredVersions.every(version => version.enabled === false));

for (const version of REMOTE_BIBLE_VERSIONS) {
    const books = await provider.getBooks(version.id);
    assert.equal(books[0].id, 'jhn');
    assert.equal(books[0].name, 'Juan');

    const chapter = await provider.getChapter(version.id, 'jhn', 3);
    assert.equal(chapter.versionId, version.id);
    assert.equal(chapter.bookId, 'jhn');
    assert.equal(chapter.chapter, 3);
    assert.equal(chapter.verses.length, 36);
    assert.equal(chapter.verses[15].reference, 'Juan 3:16');
}

await assert.rejects(
    () => provider.search('nvi', 'amor'),
    error => error?.code === 'BIBLE_OPERATION_NOT_SUPPORTED'
);

assert.equal(
    callableRequests.filter(({ name }) => (
        name === 'getRemoteBibleChapter'
    )).length,
    3
);

console.log(JSON.stringify({
    versionsTested: REMOTE_BIBLE_VERSIONS.map(version => version.id),
    chapter: 'JHN.3',
    verseCount: 36,
    remoteVersionsEnabledInApp: false,
    callableRequests: callableRequests.length
}, null, 2));
