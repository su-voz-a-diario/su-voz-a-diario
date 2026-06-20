import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const sourceCandidates = [
    process.argv[2],
    resolve(homedir(), 'Downloads/miqueas_tla.json'),
    resolve(homedir(), 'Descargas/miqueas_tla.json')
].filter(Boolean);

const sourcePath = sourceCandidates.find(existsSync);

if (!sourcePath) {
    throw new Error('No se encontró miqueas_tla.json en Downloads ni Descargas.');
}

const targetPaths = [
    resolve('data/readings/2026-06.json'),
    resolve('data/readings.json')
];

const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatTlaHtml = text => String(text || '')
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

const sourceReadings = JSON.parse(readFileSync(sourcePath, 'utf8'));

if (!Array.isArray(sourceReadings)) {
    throw new Error('miqueas_tla.json debe contener un arreglo de lecturas.');
}

const importedReferences = new Set();

for (const targetPath of targetPaths) {
    const targetReadings = JSON.parse(readFileSync(targetPath, 'utf8'));

    for (const sourceReading of sourceReadings) {
        const reference = String(sourceReading?.reference || '').trim();
        const targetReading = targetReadings.find(reading => reading.reference === reference);

        if (!targetReading) {
            throw new Error(`No existe una lectura para la referencia ${reference} en ${targetPath}.`);
        }

        const tlaText = formatTlaHtml(sourceReading?.versions?.tla);

        if (!tlaText) {
            throw new Error(`La lectura ${reference} no contiene texto TLA.`);
        }

        targetReading.versions = targetReading.versions || {};
        targetReading.versions.tla = tlaText;
        importedReferences.add(reference);
    }

    writeFileSync(targetPath, `${JSON.stringify(targetReadings, null, 2)}\n`);
}

console.log(`Importadas ${importedReferences.size} lecturas TLA desde ${sourcePath}.`);
