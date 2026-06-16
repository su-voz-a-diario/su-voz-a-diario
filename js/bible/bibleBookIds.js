const CANONICAL_BOOK_ALIASES = Object.freeze({
    gen: 'gen',
    genesis: 'gen',
    'book-gen': 'gen',
    jhn: 'jhn',
    john: 'jhn',
    juan: 'jhn',
    'book-john': 'jhn',
    rev: 'rev',
    revelation: 'rev',
    apocalipsis: 'rev',
    'book-rev': 'rev'
});

export function normalizeBibleBookId(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return CANONICAL_BOOK_ALIASES[normalized] || normalized;
}
