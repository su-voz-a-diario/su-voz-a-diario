export function calculateProgress(completed, total) {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function calculateCurrentStreak(readDates, startDate = new Date()) {
    let currentStreak = 0;
    const checkDate = new Date(startDate);

    while (true) {
        const year = checkDate.getFullYear();
        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (!readDates.includes(dateStr)) {
            break;
        }

        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
    }

    return currentStreak;
}

export function extractFirstChapterNumber(reference) {
    const match = String(reference || '').match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

export function findReadingByDate(readings, dateStr) {
    return readings.find(reading => reading.date === dateStr) || null;
}

export function findBookByReference(reference, bibleBooks) {
    const normalizedReference = String(reference || '').toLowerCase();

    const book = bibleBooks.find(item =>
        normalizedReference.includes(String(item.name || '').toLowerCase())
    );

    if (!book) return null;

    return {
        id: book.id,
        nombre: book.name,
        capitulosTotales: book.chapters
    };
}

export function getChapterFromReading(reading) {
    if (!reading) return 0;

    return extractFirstChapterNumber(reading.reference);
}

export function calculateBookProgress(book, readings, readDates) {
    const readDateSet = new Set(readDates);
    const readChapters = new Set();
    const bookName = String(book.name || '').toLowerCase();

    readings.forEach(reading => {
        const reference = String(reading.reference || '').toLowerCase();

        if (readDateSet.has(reading.date) && reference.includes(bookName)) {
            const chapterNumber = extractFirstChapterNumber(reading.reference);
            if (chapterNumber) readChapters.add(chapterNumber);
        }
    });

    const leidos = Array.from(readChapters).sort((a, b) => a - b);

    return {
        leidos,
        total: book.chapters,
        porcentaje: calculateProgress(leidos.length, book.chapters),
        libroNombre: book.name
    };
}

export function calculateProgressForBookId(bookId, bibleBooks, readings, readDates) {
    const book = bibleBooks.find(item => item.id === bookId);

    if (!book) {
        return { leidos: [], total: 0, porcentaje: 0 };
    }

    return calculateBookProgress(book, readings, readDates);
}

export function calculateUpdatedStreak(streak, dateStr, yesterdayStr) {
    const current = streak.lastReadDate === yesterdayStr
        ? streak.current + 1
        : 1;

    return {
        ...streak,
        current,
        lastReadDate: dateStr,
        longest: Math.max(streak.longest, current)
    };
}

export function isDateRead(readDates, dateStr) {
    return readDates.includes(dateStr);
}

export function calculateReadingStats({
    readDates,
    totalAvailable,
    longestStreak,
    totalNotes,
    totalHighlights,
    startDate = new Date()
}) {
    const totalRead = readDates.length;

    return {
        totalRead,
        totalAvailable,
        percentage: calculateProgress(totalRead, totalAvailable),
        currentStreak: calculateCurrentStreak(readDates, startDate),
        longestStreak,
        totalNotes,
        totalHighlights
    };
}
