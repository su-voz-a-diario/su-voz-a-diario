export const INTRO_VIDEO_CONFIG = {
    startDate: '2026-04-07',
    endDate: '2026-04-11',
    url: 'https://www.youtube.com/embed/LfGZnrbmWaM',
    label: '🎬 Video introductorio',
    title: 'Introducción a Deuteronomio',
    note: 'Antes de comenzar la lectura, puedes ver esta introducción.'
};

export function shouldShowIntroVideo(dateStr, config = INTRO_VIDEO_CONFIG) {
    return dateStr >= config.startDate && dateStr <= config.endDate;
}

export const TEMPORARY_HOME_INTRO_CONFIG = {
    startDate: '2026-06-13',
    endDate: '2026-06-15',
    url: 'https://www.youtube.com/watch?v=fNIwuJKVu88',
    title: 'Introducción a 2 Timoteo',
    description: 'Antes de comenzar la lectura de 2 Timoteo, mira esta breve introducción para ubicar el contexto del libro.',
    buttonLabel: 'Ver introducción'
};

export function shouldShowTemporaryHomeIntro(dateStr, config = TEMPORARY_HOME_INTRO_CONFIG) {
    return dateStr >= config.startDate && dateStr <= config.endDate;
}

export const BADGE_LEVELS = [
    { min: 365, key: 'corona', label: 'Corona', icon: '👑' },
    { min: 180, key: 'diamante', label: 'Diamante', icon: '💎' },
    { min: 100, key: 'oro', label: 'Oro', icon: '🥇' },
    { min: 60, key: 'plata', label: 'Plata', icon: '🥈' },
    { min: 30, key: 'bronce', label: 'Bronce', icon: '🥉' },
    { min: 15, key: 'cobre', label: 'Cobre', icon: '🟤' }
];

export function getBadgeForStreak(streakValue, badgeLevels = BADGE_LEVELS) {
    for (const level of badgeLevels) {
        if (streakValue >= level.min) {
            return level;
        }
    }

    return {
        key: 'inicial',
        label: 'Inicio',
        icon: '⭐'
    };
}
