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

export function getVerseImageFormat(formatKey = 'post') {
    const formats = {
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

    return formats[formatKey] || formats.post;
}

export function getVerseImageTemplate(templateKey = 'midnight') {
    const templates = {
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
        }
    };

    return templates[templateKey] || templates.midnight;
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
