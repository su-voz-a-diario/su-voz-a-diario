export const INTRO_VIDEO_CONFIG = {
    startDate: '2026-04-07',
    endDate: '2026-04-11',
    url: 'https://www.youtube.com/embed/LfGZnrbmWaM',
    label: '🎬 Video introductorio',
    title: 'Introducción a Deuteronomio',
    note: 'Antes de comenzar la lectura, puedes ver esta introducción.'
};

export const INTRO_VIDEO_CONFIG_MICAH = {
    startDate: '2026-06-21',
    endDate: '2026-06-25',
    url: 'https://www.youtube.com/embed/114lAJ5fPL0',
    label: '🎬 Video introductorio',
    title: 'Introducción al libro de Miqueas',
    note: 'Antes de comenzar la lectura de Miqueas, te recomendamos ver esta breve introducción para comprender mejor su contexto, mensaje y propósito.'
};

export const INTRO_VIDEO_CONFIG_2TIMOTHY = {
    startDate: '2026-06-13',
    endDate: '2026-06-20',
    url: 'https://www.youtube.com/embed/fNIwuJKVu88',
    label: '🎬 Video introductorio',
    title: 'Introducción a 2 Timoteo',
    note: 'Antes de continuar la lectura de este libro, mira esta breve introducción para comprender mejor su contexto, propósito y mensaje principal.'
};

export const INTRO_VIDEO_CONFIG_PSALMS = {
    startDate: '2026-07-01',
    endDate: '2026-07-10',
    url: 'https://www.youtube.com/embed/iW__xJmVyJ0',
    label: '🎬 Video introductorio',
    title: 'Introducción al libro de Salmos',
    note: 'Antes de comenzar la lectura de Salmos, te recomendamos ver esta breve introducción para comprender mejor su contexto, mensaje y propósito.'
};

export const INTRO_VIDEO_CONFIGS = [
    INTRO_VIDEO_CONFIG,
    INTRO_VIDEO_CONFIG_2TIMOTHY,
    INTRO_VIDEO_CONFIG_MICAH,
    INTRO_VIDEO_CONFIG_PSALMS
];

export function getIntroVideoConfig(dateStr) {
    return INTRO_VIDEO_CONFIGS.find(config => dateStr >= config.startDate && dateStr <= config.endDate) || null;
}

export function shouldShowIntroVideo(dateStr) {
    return INTRO_VIDEO_CONFIGS.some(config => dateStr >= config.startDate && dateStr <= config.endDate);
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
