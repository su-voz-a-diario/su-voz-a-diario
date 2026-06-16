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

export function normalizeDateList(dates) {
    return Array.from(new Set(
        (Array.isArray(dates) ? dates : [])
            .map(date => String(date || '').trim())
            .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )).sort();
}

export function getDateString(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function getPreviousDateString(dateStr) {
    const value = new Date(`${dateStr}T12:00:00`);
    value.setDate(value.getDate() - 1);

    return getDateString(value);
}

export function isNextCalendarDate(previousDateStr, nextDateStr) {
    return getPreviousDateString(nextDateStr) === previousDateStr;
}

export function calculateLongestStreak(validReadDates) {
    const sortedDates = normalizeDateList(validReadDates);
    let longest = 0;
    let current = 0;
    let previousDate = null;

    sortedDates.forEach(dateStr => {
        current = previousDate && isNextCalendarDate(previousDate, dateStr)
            ? current + 1
            : 1;

        longest = Math.max(longest, current);
        previousDate = dateStr;
    });

    return longest;
}

export function calculateCurrentPlanStreak(validReadDates, planDates, startDate = new Date()) {
    const readDateSet = new Set(normalizeDateList(validReadDates));
    const planDateSet = new Set(normalizeDateList(planDates));
    const today = getDateString(startDate);
    const yesterday = getPreviousDateString(today);
    let status = 'restart';
    let anchorDate = today;

    if (readDateSet.has(today)) {
        status = 'read_today';
    } else if (readDateSet.has(yesterday)) {
        status = 'pending_today';
        anchorDate = yesterday;
    }

    let current = 0;
    let cursor = anchorDate;

    while (planDateSet.has(cursor) && readDateSet.has(cursor)) {
        current++;
        cursor = getPreviousDateString(cursor);
    }

    return {
        current,
        status
    };
}

export function extractFirstChapterNumber(reference) {
    const normalizedReference = String(reference || '');
    const match = normalizedReference.match(/(\d+):\d+/)
        || normalizedReference.match(/(\d+)/);

    return match ? parseInt(match[1]) : 0;
}

export function findReadingByDate(readings, dateStr) {
    return readings.find(reading => reading.date === dateStr) || null;
}

export function findBookById(bookId, bibleBooks) {
    const normalizedBookId = String(bookId || '').trim();
    const book = bibleBooks.find(item => item.id === normalizedBookId);

    if (!book) return null;

    return {
        id: book.id,
        nombre: book.name,
        capitulosTotales: book.chapters
    };
}

function referenceMatchesBook(reference, bookName) {
    const normalizedReference = String(reference || '').toLowerCase();
    const normalizedBookName = String(bookName || '').toLowerCase();
    const numberedBookMatch = normalizedBookName.match(/^([123])\s+(.+)$/);

    if (normalizedReference.includes(normalizedBookName)) return true;
    if (!numberedBookMatch) return false;

    const romanNumerals = { 1: 'i', 2: 'ii', 3: 'iii' };
    const romanBookName = `${romanNumerals[numberedBookMatch[1]]} ${numberedBookMatch[2]}`;

    return normalizedReference.includes(romanBookName);
}

export function findBookByReference(reference, bibleBooks) {
    const book = bibleBooks.find(item => referenceMatchesBook(reference, item.name));

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
    const hasBookIdMatches = readings.some(reading => reading.bookId === book.id);
    const startChapter = book.startChapter || 1;
    const endChapter = book.endChapter || book.chapters;
    const totalChapters = endChapter - startChapter + 1;

    readings.forEach(reading => {
        const matchesBookId = reading.bookId === book.id;
        const shouldUseReferenceFallback = !hasBookIdMatches || !reading.bookId;
        const matchesBook = matchesBookId
            || (shouldUseReferenceFallback && referenceMatchesBook(reading.reference, book.name));

        if (readDateSet.has(reading.date) && matchesBook) {
            const chapterNumber = extractFirstChapterNumber(reading.reference);
            if (chapterNumber && chapterNumber >= startChapter && chapterNumber <= endChapter) {
                readChapters.add(chapterNumber);
            }
        }
    });

    const leidos = Array.from(readChapters).sort((a, b) => a - b);

    return {
        leidos,
        total: totalChapters,
        porcentaje: calculateProgress(leidos.length, totalChapters),
        libroNombre: book.name,
        startChapter,
        endChapter
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
    planReadings,
    reflectionDays = 0,
    prayerDays = 0,
    totalHighlights = 0,
    totalSelectionNotes = 0,
    startDate = new Date()
}) {
    const planDates = normalizeDateList(
        (Array.isArray(planReadings) ? planReadings : [])
            .map(reading => reading?.date)
    );
    const planDateSet = new Set(planDates);
    const validReadDates = normalizeDateList(readDates)
        .filter(date => planDateSet.has(date));
    const today = getDateString(startDate);
    const currentMonth = today.slice(0, 7);
    const monthAvailableDates = planDates.filter(date => date.startsWith(`${currentMonth}-`));
    const monthCompletedDates = validReadDates.filter(date => date.startsWith(`${currentMonth}-`));
    const currentStreak = calculateCurrentPlanStreak(validReadDates, planDates, startDate);

    return {
        plan: {
            total: planDates.length,
            completed: validReadDates.length,
            percent: calculateProgress(validReadDates.length, planDates.length)
        },
        month: {
            available: monthAvailableDates.length,
            completed: monthCompletedDates.length,
            percent: calculateProgress(monthCompletedDates.length, monthAvailableDates.length)
        },
        streak: {
            current: currentStreak.current,
            longest: calculateLongestStreak(validReadDates),
            status: currentStreak.status
        },
        response: {
            reflectionDays,
            prayerDays
        },
        memory: {
            highlights: totalHighlights,
            selectionNotes: totalSelectionNotes
        }
    };
}
