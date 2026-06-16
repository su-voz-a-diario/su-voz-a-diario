export const REMOTE_BIBLE_FIXTURES = Object.freeze({
    versions: Object.freeze([
        Object.freeze({
            id: 'api-nbla-001',
            canonicalId: 'nbla',
            name: 'Nueva Biblia de las Américas',
            abbreviation: 'NBLA',
            language: 'es',
            searchSupported: true
        }),
        Object.freeze({
            id: 'api-nvi-001',
            canonicalId: 'nvi',
            name: 'Nueva Versión Internacional',
            abbreviation: 'NVI',
            language: 'es',
            searchSupported: true
        }),
        Object.freeze({
            id: 'api-libre-001',
            canonicalId: 'biblia-libre',
            name: 'Biblia Libre',
            abbreviation: 'Biblia Libre',
            language: 'es',
            searchSupported: false
        })
    ]),
    books: Object.freeze({
        'api-nbla-001': Object.freeze([
            Object.freeze({ id: 'BOOK-GEN', canonicalId: 'gen', name: 'Génesis', abbreviation: 'Gn', testament: 'old', chapterCount: 50, order: 1 }),
            Object.freeze({ id: 'BOOK-JOHN', canonicalId: 'jhn', name: 'Juan', abbreviation: 'Jn', testament: 'new', chapterCount: 21, order: 43 }),
            Object.freeze({ id: 'BOOK-REV', canonicalId: 'rev', name: 'Apocalipsis', abbreviation: 'Ap', testament: 'new', chapterCount: 22, order: 66 })
        ]),
        'api-nvi-001': Object.freeze([
            Object.freeze({ id: 'GENESIS', canonicalId: 'gen', name: 'Génesis', abbreviation: 'Gn', testament: 'old', chapterCount: 50, order: 1 }),
            Object.freeze({ id: 'JOHN', canonicalId: 'jhn', name: 'Juan', abbreviation: 'Jn', testament: 'new', chapterCount: 21, order: 43 }),
            Object.freeze({ id: 'REVELATION', canonicalId: 'rev', name: 'Apocalipsis', abbreviation: 'Ap', testament: 'new', chapterCount: 22, order: 66 })
        ]),
        'api-libre-001': Object.freeze([
            Object.freeze({ id: 'genesis', canonicalId: 'gen', name: 'Génesis', abbreviation: 'Gn', testament: 'old', chapterCount: 50, order: 1 }),
            Object.freeze({ id: 'juan', canonicalId: 'jhn', name: 'Juan', abbreviation: 'Jn', testament: 'new', chapterCount: 21, order: 43 }),
            Object.freeze({ id: 'apocalipsis', canonicalId: 'rev', name: 'Apocalipsis', abbreviation: 'Ap', testament: 'new', chapterCount: 22, order: 66 })
        ])
    }),
    chapters: Object.freeze({
        'api-nbla-001:BOOK-GEN:1': Object.freeze({
            bookId: 'BOOK-GEN',
            bookName: 'Génesis',
            chapter: 1,
            verses: Object.freeze([
                Object.freeze({ number: 1, text: '[NBLA prueba] Inicio de la creación.' }),
                Object.freeze({ number: 2, text: '[NBLA prueba] La tierra esperaba orden.' })
            ])
        }),
        'api-nbla-001:BOOK-JOHN:3': Object.freeze({
            bookId: 'BOOK-JOHN',
            bookName: 'Juan',
            chapter: 3,
            verses: Object.freeze([
                Object.freeze({ number: 1, text: '[NBLA prueba] Una conversación nocturna.' }),
                Object.freeze({ number: 16, text: '[NBLA prueba] Amor y esperanza para el mundo.' })
            ])
        }),
        'api-nbla-001:BOOK-REV:22': Object.freeze({
            bookId: 'BOOK-REV',
            bookName: 'Apocalipsis',
            chapter: 22,
            verses: Object.freeze([
                Object.freeze({ number: 1, text: '[NBLA prueba] Un río de vida.' }),
                Object.freeze({ number: 21, text: '[NBLA prueba] Una despedida de gracia.' })
            ])
        }),
        'api-nvi-001:GENESIS:1': Object.freeze({
            bookId: 'GENESIS',
            bookName: 'Génesis',
            chapter: 1,
            verses: Object.freeze([
                Object.freeze({ number: 1, text: '[NVI prueba] Comienza la historia.' })
            ])
        }),
        'api-nvi-001:JOHN:3': Object.freeze({
            bookId: 'JOHN',
            bookName: 'Juan',
            chapter: 3,
            verses: Object.freeze([
                Object.freeze({ number: 16, text: '[NVI prueba] El amor ofrece vida y esperanza.' })
            ])
        }),
        'api-nvi-001:REVELATION:22': Object.freeze({
            bookId: 'REVELATION',
            bookName: 'Apocalipsis',
            chapter: 22,
            verses: Object.freeze([
                Object.freeze({ number: 21, text: '[NVI prueba] Gracia para todos.' })
            ])
        }),
        'api-libre-001:genesis:1': Object.freeze({
            bookId: 'genesis',
            bookName: 'Génesis',
            chapter: 1,
            verses: Object.freeze([
                Object.freeze({ number: 1, text: '[Libre prueba] Todo tiene un comienzo.' })
            ])
        }),
        'api-libre-001:juan:3': Object.freeze({
            bookId: 'juan',
            bookName: 'Juan',
            chapter: 3,
            verses: Object.freeze([
                Object.freeze({ number: 16, text: '[Libre prueba] Una señal breve de amor.' })
            ])
        }),
        'api-libre-001:apocalipsis:22': Object.freeze({
            bookId: 'apocalipsis',
            bookName: 'Apocalipsis',
            chapter: 22,
            verses: Object.freeze([
                Object.freeze({ number: 21, text: '[Libre prueba] Final de prueba.' })
            ])
        })
    })
});
