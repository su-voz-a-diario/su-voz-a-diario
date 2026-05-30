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
