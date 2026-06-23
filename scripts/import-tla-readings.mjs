import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const sourceCandidates = [
    process.argv[2],
    resolve(homedir(), 'Downloads/readings_tla_jul_aug_2026.json'),
    resolve(homedir(), 'Descargas/readings_tla_jul_aug_2026.json')
].filter(Boolean);

const sourcePath = sourceCandidates.find(existsSync);

if (!sourcePath) {
    throw new Error('No se encontró readings_tla_jul_aug_2026.json en Downloads ni Descargas.');
}

const targetPaths = [
    resolve('data/readings/2026-07.json'),
    resolve('data/readings/2026-08.json'),
    resolve('data/readings.json'),
    resolve('www/data/readings/2026-07.json'),
    resolve('www/data/readings/2026-08.json'),
    resolve('www/data/readings.json')
];

const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatPlainTlaText = text => String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
        const verseMatch = line.match(/^(\d+)\s*(.*)$/u);

        if (!verseMatch) {
            return `<p>${escapeHtml(line)}</p>`;
        }

        const [, verse, content] = verseMatch;
        return `<p><sup>${verse}</sup> ${escapeHtml(content)}</p>`;
    })
    .join('');

const normalizeTlaText = text => {
    const trimmed = String(text || '').trim();

    if (trimmed.startsWith('<p>')) {
        return trimmed;
    }

    return formatPlainTlaText(trimmed);
};

const parseSourceReadings = source => {
    const trimmed = String(source || '').trim();

    try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        const normalized = trimmed
            .replace(/^\s*\[/u, '')
            .replace(/\]\s*$/u, '')
            .replace(/,\s*$/u, '');

        return JSON.parse(`[${normalized}]`);
    }
};

const sourceReadings = parseSourceReadings(readFileSync(sourcePath, 'utf8'));
const dedupedSourceReadings = [];
const sourceReadingsByKey = new Map();

for (const sourceReading of sourceReadings) {
    const date = String(sourceReading?.date || '').trim();
    const reference = String(sourceReading?.reference || '').trim();
    const tlaText = String(sourceReading?.versions?.tla || '').trim();
    const key = `${date}|${reference}`;

    if (!date || !reference || !tlaText) {
        throw new Error(`Lectura TLA incompleta en archivo fuente: ${JSON.stringify(sourceReading)}`);
    }

    if (sourceReadingsByKey.has(key)) {
        const previousTlaText = String(sourceReadingsByKey.get(key)?.versions?.tla || '').trim();

        if (previousTlaText !== tlaText) {
            throw new Error(`La lectura duplicada ${key} tiene textos TLA distintos.`);
        }

        continue;
    }

    sourceReadingsByKey.set(key, sourceReading);
    dedupedSourceReadings.push(sourceReading);
}

if (dedupedSourceReadings.length !== 62) {
    throw new Error(`El archivo fuente debe contener 62 lecturas únicas; contiene ${dedupedSourceReadings.length}.`);
}

const importedReferences = new Set();

for (const targetPath of targetPaths) {
    const targetReadings = JSON.parse(readFileSync(targetPath, 'utf8'));
    const monthlyTargetMatch = targetPath.match(/\/(2026-(?:07|08))\.json$/u);
    const targetMonth = monthlyTargetMatch?.[1] || '';

    for (const sourceReading of dedupedSourceReadings) {
        const date = String(sourceReading?.date || '').trim();
        const reference = String(sourceReading?.reference || '').trim();

        if (targetMonth && !date.startsWith(targetMonth)) {
            continue;
        }

        const targetReading = targetReadings.find(reading => (
            reading.date === date &&
            reading.reference === reference
        ));

        if (!targetReading) {
            if (/\/2026-(07|08)\.json$/u.test(targetPath)) {
                throw new Error(`No existe una lectura para ${date} ${reference} en ${targetPath}.`);
            }

            continue;
        }

        const tlaText = normalizeTlaText(sourceReading?.versions?.tla);

        if (!tlaText) {
            throw new Error(`La lectura ${reference} no contiene texto TLA.`);
        }

        targetReading.versions = targetReading.versions || {};
        targetReading.versions.tla = tlaText;
        importedReferences.add(`${date}|${reference}`);
    }

    writeFileSync(targetPath, `${JSON.stringify(targetReadings, null, 2)}\n`);
}

console.log(`Importadas ${importedReferences.size} lecturas TLA desde ${sourcePath}.`);
