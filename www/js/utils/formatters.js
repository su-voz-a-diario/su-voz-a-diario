import {
    INTRO_VIDEO_CONFIG
} from '../core/constants.js';

export function getHighlightColorLabel(color) {
    const labels = {
        yellow: 'amarillo',
        blue: 'azul',
        green: 'verde',
        rose: 'rosa'
    };

    return labels[color] || color || 'color';
}

export function calculateProgress(completed, total) {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
}

const VERSE_IMAGE_FALLBACKS = {
    template: 'midnight',
    format: 'post',
    textSize: 'normal'
};

const VERSE_IMAGE_FORMATS = {
    post: {
        key: 'post',
        label: 'Post',
        width: 1080,
        height: 1350
    },

    story: {
        key: 'story',
        label: 'Historia',
        width: 1080,
        height: 1920
    },

    square: {
        key: 'square',
        label: 'Cuadrado',
        width: 1080,
        height: 1080
    }
};

const VERSE_IMAGE_TEMPLATES = {
    midnight: {
        key: 'midnight',
        background: ['#07111f', '#182235', '#2b2118'],
        card: 'rgba(255,255,255,0.075)',
        border: 'rgba(255,255,255,0.16)',
        quote: '#f8f3ea',
        reference: '#d6b56d',
        muted: 'rgba(255,255,255,0.64)',
        accent: 'rgba(214,181,109,0.22)'
    },

    warm: {
        key: 'warm',
        background: ['#2b1810', '#6b3f24', '#c29a62'],
        card: 'rgba(255,248,238,0.13)',
        border: 'rgba(255,239,210,0.22)',
        quote: '#fff8ec',
        reference: '#ffe0a1',
        muted: 'rgba(255,248,236,0.72)',
        accent: 'rgba(255,224,161,0.22)'
    },

    paper: {
        key: 'paper',
        background: ['#eee3d2', '#f8f1e7', '#d2b48c'],
        card: 'rgba(255,255,255,0.46)',
        border: 'rgba(89,64,42,0.16)',
        quote: '#2f241c',
        reference: '#8a5a24',
        muted: 'rgba(47,36,28,0.62)',
        accent: 'rgba(138,90,36,0.12)'
    },

    sinai: {
        key: 'sinai',
        backgroundImage: './assets/export/backgrounds/sinai-01.webp',
        background: ['#050915', '#111f33', '#2a1d14'],
        card: 'rgba(255,250,240,0.082)',
        border: 'rgba(226,191,122,0.20)',
        quote: '#fff7e8',
        reference: '#dfbd78',
        muted: 'rgba(255,247,232,0.70)',
        accent: 'rgba(226,191,122,0.18)'
    }
};

const VERSE_IMAGE_TEXT_SIZES = new Set(['compact', 'normal', 'large']);

function isDevelopmentEnvironment() {
    if (typeof window === 'undefined') return false;

    const { hostname, protocol } = window.location;

    return protocol === 'file:'
        || hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '';
}

function warnMissingVerseImageConfig(type, key, fallback) {
    if (!isDevelopmentEnvironment() || !key || key === fallback) return;

    console.warn(`[Verse image] Configuración ${type} "${key}" no existe. Usando "${fallback}".`);
}

export function getSafeVerseImageFormat(formatKey = VERSE_IMAGE_FALLBACKS.format) {
    const format = VERSE_IMAGE_FORMATS[formatKey];

    if (!format) {
        warnMissingVerseImageConfig('format', formatKey, VERSE_IMAGE_FALLBACKS.format);
    }

    return format || VERSE_IMAGE_FORMATS[VERSE_IMAGE_FALLBACKS.format];
}

export function getSafeVerseImageTemplate(templateKey = VERSE_IMAGE_FALLBACKS.template) {
    const template = VERSE_IMAGE_TEMPLATES[templateKey];

    if (!template) {
        warnMissingVerseImageConfig('template', templateKey, VERSE_IMAGE_FALLBACKS.template);
    }

    return template || VERSE_IMAGE_TEMPLATES[VERSE_IMAGE_FALLBACKS.template];
}

export function getSafeVerseImageTextSize(textSize = VERSE_IMAGE_FALLBACKS.textSize) {
    if (!VERSE_IMAGE_TEXT_SIZES.has(textSize)) {
        warnMissingVerseImageConfig('textSize', textSize, VERSE_IMAGE_FALLBACKS.textSize);
        return VERSE_IMAGE_FALLBACKS.textSize;
    }

    return textSize;
}

export function validateVerseImageState(state = {}) {
    return {
        template: getSafeVerseImageTemplate(state.template).key,
        format: getSafeVerseImageFormat(state.format).key,
        textSize: getSafeVerseImageTextSize(state.textSize)
    };
}

export function getVerseImageFormat(formatKey = 'post') {
    return getSafeVerseImageFormat(formatKey);
}

export function getVerseImageTemplate(templateKey = 'midnight') {
    return getSafeVerseImageTemplate(templateKey);
}

export function renderIntroVideoHtml(config = INTRO_VIDEO_CONFIG) {
    return `
            <div class="intro-video-card">
                <div class="intro-video-head">
                    <div class="intro-video-label">${config.label}</div>
                    <div class="intro-video-title">${config.title}</div>
                </div>
                <div class="intro-video-frame">
                    <iframe src="${config.url}" title="${config.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                </div>
                <div class="intro-video-note">${config.note}</div>
            </div>
        `;
}
