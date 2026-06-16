import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
    BibleRepository
} from '../js/bible/BibleRepository.js';
import {
    FakeBibleApiClient
} from '../js/bible/FakeBibleApiClient.js';
import {
    LocalRv1909Provider
} from '../js/bible/LocalRv1909Provider.js';
import {
    REMOTE_BIBLE_VERSIONS,
    RemoteBibleProvider
} from '../js/bible/RemoteBibleProvider.js';

const SOURCE_VERSION_IDS = Object.freeze({
    nbla: 'api-nbla-001',
    nvi: 'api-nvi-001',
    'biblia-libre': 'api-libre-001'
});

const enabledRemoteVersions = REMOTE_BIBLE_VERSIONS.map(version => ({
    ...version,
    sourceId: SOURCE_VERSION_IDS[version.id],
    enabled: true,
    status: 'fixture'
}));

let realNetworkCalls = 0;
globalThis.fetch = async () => {
    realNetworkCalls += 1;
    throw new Error('La validación no permite llamadas reales a internet.');
};

async function expectBibleError(expectedCode, action) {
    await assert.rejects(action, error => {
        assert.equal(error?.code, expectedCode);
        return true;
    });
}

const rawBible = (await fs.readFile(
    new URL('../data/rv1909.json', import.meta.url),
    'utf8'
)).replace(/^\uFEFF/, '');
let localLoads = 0;
const localProvider = new LocalRv1909Provider({
    fetchImpl: async () => ({
        ok: true,
        json: async () => {
            localLoads += 1;
            return JSON.parse(rawBible);
        }
    })
});

const fakeClient = new FakeBibleApiClient();
const remoteProvider = new RemoteBibleProvider({
    versions: enabledRemoteVersions,
    client: fakeClient,
    timeoutMs: 100
});
const repository = new BibleRepository([
    localProvider,
    remoteProvider
]);

const versions = await repository.getVersions();
assert.deepEqual(
    versions.map(version => version.id),
    ['rv1909', 'nbla', 'nvi', 'biblia-libre']
);

const nblaBooks = await repository.getBooks('nbla');
assert.deepEqual(
    nblaBooks.map(book => book.id),
    ['gen', 'jhn', 'rev']
);
assert.deepEqual(
    nblaBooks.map(book => book.sourceBookId),
    ['BOOK-GEN', 'BOOK-JOHN', 'BOOK-REV']
);

const nblaJohn3 = await repository.getChapter('nbla', 'jhn', 3);
assert.equal(nblaJohn3.versionId, 'nbla');
assert.equal(nblaJohn3.versionLabel, 'NBLA');
assert.equal(nblaJohn3.versionName, 'Nueva Biblia de las Américas');
assert.equal(nblaJohn3.bookId, 'jhn');
assert.equal(nblaJohn3.sourceBookId, 'BOOK-JOHN');
assert.equal(nblaJohn3.chapter, 3);
assert.equal(nblaJohn3.chapterNumber, 3);
assert.equal(nblaJohn3.verses[1].reference, 'Juan 3:16');

const requestsBeforeCachedChapter = fakeClient.requestCount;
const cachedNblaJohn3 = await repository.getChapter('nbla', 'jhn', 3);
assert.equal(cachedNblaJohn3, nblaJohn3);
assert.equal(fakeClient.requestCount, requestsBeforeCachedChapter);

const nviSearch = await repository.search('nvi', 'amor', {
    page: 1,
    pageSize: 10
});
assert.equal(nviSearch.length, 1);
assert.equal(nviSearch[0].versionId, 'nvi');
assert.equal(nviSearch[0].bookId, 'jhn');
assert.equal(nviSearch[0].reference, 'Juan 3:16');

await expectBibleError(
    'BIBLE_VERSION_NOT_AVAILABLE',
    () => repository.getChapter('desconocida', 'jhn', 3)
);
await expectBibleError(
    'BIBLE_BOOK_NOT_FOUND',
    () => repository.getChapter('nbla', 'libro-desconocido', 1)
);
await expectBibleError(
    'BIBLE_CHAPTER_NOT_FOUND',
    () => repository.getChapter('nbla', 'jhn', 99)
);
await expectBibleError(
    'BIBLE_OPERATION_NOT_SUPPORTED',
    () => repository.search('biblia-libre', 'amor')
);

const invalidProvider = new RemoteBibleProvider({
    versions: enabledRemoteVersions,
    client: new FakeBibleApiClient({
        invalidOperations: ['getChapter']
    })
});
await expectBibleError(
    'BIBLE_INVALID_RESPONSE',
    () => invalidProvider.getChapter('nbla', 'jhn', 3)
);

const timeoutProvider = new RemoteBibleProvider({
    versions: enabledRemoteVersions,
    client: new FakeBibleApiClient({
        timeoutOperations: ['getChapter']
    }),
    timeoutMs: 20
});
await expectBibleError(
    'BIBLE_TIMEOUT',
    () => timeoutProvider.getChapter('nbla', 'jhn', 3)
);

const localGenesis1 = await repository.getChapter('rv1909', 'gen', 1);
const localJohn3 = await repository.getChapter('rv1909', 'jhn', 3);
const localRevelation22 = await repository.getChapter('rv1909', 'rev', 22);

assert.equal(localLoads, 1);
assert.equal(localGenesis1.verses.length, 31);
assert.equal(localJohn3.verses.length, 36);
assert.equal(localRevelation22.verses.length, 21);
assert.equal(localJohn3.versionLabel, 'RV1909');
assert.equal(realNetworkCalls, 0);

console.log(JSON.stringify({
    versions: versions.map(version => ({
        versionId: version.id,
        versionLabel: version.abbreviation,
        versionName: version.name,
        status: version.status
    })),
    books: nblaBooks,
    chapter: nblaJohn3,
    search: nviSearch,
    rv1909: {
        loads: localLoads,
        genesis1Verses: localGenesis1.verses.length,
        john3Verses: localJohn3.verses.length,
        revelation22Verses: localRevelation22.verses.length
    },
    realNetworkCalls
}, null, 2));
