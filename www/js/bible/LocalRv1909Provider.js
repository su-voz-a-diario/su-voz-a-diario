import {
    BIBLE_SOURCE_LOCAL,
    createBibleChapter
} from './bibleModel.js';

export const RV1909_VERSION_ID = 'rv1909';
export const RV1909_VERSION_LABEL = 'RV1909';
export const RV1909_VERSION_NAME = 'Reina-Valera 1909';

const RV1909_BOOK_MAP = Object.freeze({
    gen: 'gn',
    exo: 'ex',
    lev: 'lv',
    num: 'nm',
    deu: 'dt',
    jos: 'js',
    jdg: 'jud',
    rut: 'rt',
    '1sa': '1sm',
    '2sa': '2sm',
    '1ki': '1kgs',
    '2ki': '2kgs',
    '1ch': '1ch',
    '2ch': '2ch',
    ezr: 'ezr',
    neh: 'ne',
    est: 'et',
    job: 'job',
    psa: 'ps',
    pro: 'prv',
    ecc: 'ec',
    sng: 'so',
    isa: 'is',
    jer: 'jr',
    lam: 'lm',
    ezk: 'ez',
    dan: 'dn',
    hos: 'ho',
    jol: 'jl',
    amo: 'am',
    oba: 'ob',
    jon: 'jn',
    mic: 'mi',
    nam: 'na',
    hab: 'hk',
    zep: 'zp',
    hag: 'hg',
    zec: 'zc',
    mal: 'ml',
    mat: 'mt',
    mrk: 'mk',
    luk: 'lk',
    jhn: 'jo',
    act: 'act',
    rom: 'rm',
    '1co': '1co',
    '2co': '2co',
    gal: 'gl',
    eph: 'eph',
    php: 'ph',
    col: 'cl',
    '1th': '1ts',
    '2th': '2ts',
    '1ti': '1tm',
    '2ti': '2tm',
    tit: 'tt',
    phm: 'phm',
    heb: 'hb',
    jas: 'jm',
    '1pe': '1pe',
    '2pe': '2pe',
    '1jn': '1jo',
    '2jn': '2jo',
    '3jn': '3jo',
    jud: 'jd',
    rev: 're'
});

export class LocalRv1909Provider {
    constructor({
        dataPath = './data/rv1909.json',
        fetchImpl = (...args) => fetch(...args)
    } = {}) {
        this.versionId = RV1909_VERSION_ID;
        this.versionLabel = RV1909_VERSION_LABEL;
        this.versionName = RV1909_VERSION_NAME;
        this.source = BIBLE_SOURCE_LOCAL;
        this.dataPath = dataPath;
        this.fetchImpl = fetchImpl;
        this.bibleCache = null;
        this.loadPromise = null;
    }

    async loadBible() {
        if (this.bibleCache) return this.bibleCache;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = this.fetchImpl(this.dataPath)
            .then(async response => {
                if (!response?.ok) {
                    throw new Error('No se pudo cargar la Biblia RV1909 local.');
                }

                const data = await response.json();

                if (!Array.isArray(data)) {
                    throw new Error('El archivo RV1909 no tiene el formato esperado.');
                }

                this.bibleCache = data;
                return this.bibleCache;
            })
            .finally(() => {
                this.loadPromise = null;
            });

        return this.loadPromise;
    }

    async getChapter(bookId, chapterNumber) {
        const normalizedBookId = String(bookId || '').trim().toLowerCase();
        const normalizedChapter = Number(chapterNumber);
        const localAbbrev = RV1909_BOOK_MAP[normalizedBookId];

        if (!localAbbrev) {
            throw new Error(`No hay equivalencia RV1909 para el libro: ${bookId}`);
        }

        const bible = await this.loadBible();
        const book = bible.find(item => item.abbrev === localAbbrev);

        if (!book) {
            throw new Error(`No se encontró el libro en RV1909: ${localAbbrev}`);
        }

        const chapter = book.chapters?.[normalizedChapter - 1];

        if (!Array.isArray(chapter)) {
            throw new Error(`No se encontró el capítulo ${chapterNumber}.`);
        }

        return createBibleChapter({
            versionId: this.versionId,
            versionLabel: RV1909_VERSION_LABEL,
            versionName: RV1909_VERSION_NAME,
            source: this.source,
            bookId: normalizedBookId,
            sourceBookId: localAbbrev,
            bookName: book.name,
            chapter: normalizedChapter,
            verses: chapter.map((text, index) => ({
                number: index + 1,
                text
            }))
        });
    }
}
