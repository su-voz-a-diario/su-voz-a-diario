import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

const dedupeByDateAndReference = readings => {
    const deduped = [];
    const byKey = new Map();

    for (const reading of readings) {
        const date = String(reading?.date || '').trim();
        const reference = String(reading?.reference || '').trim();
        const tlaText = String(reading?.versions?.tla || '').trim();
        const key = `${date}|${reference}`;

        assert.ok(date, 'Cada lectura fuente debe tener date.');
        assert.ok(reference, 'Cada lectura fuente debe tener reference.');
        assert.ok(tlaText, `${key} debe tener texto TLA.`);

        if (byKey.has(key)) {
            assert.equal(
                String(byKey.get(key)?.versions?.tla || '').trim(),
                tlaText,
                `${key} aparece duplicada con textos TLA distintos.`
            );
            continue;
        }

        byKey.set(key, reading);
        deduped.push(reading);
    }

    return deduped;
};

const sourceReadings = dedupeByDateAndReference(parseSourceReadings(
    readFileSync(`${process.env.HOME}/Downloads/readings_tla_jul_aug_2026.json`, 'utf8')
));
const indexHtml = readFileSync('index.html', 'utf8');
const appSource = readFileSync('js/app.js', 'utf8');

assert.equal(sourceReadings.length, 62, 'El archivo de entrada debe contener 62 lecturas únicas.');
assert.equal(
    (indexHtml.match(/data-version="tla"/g) || []).length,
    0,
    'El menú hamburguesa no debe contener botones de versión.'
);
assert.match(appSource, /renderDailyVersionSelector: function\(\)/);
assert.match(appSource, /data-version="\$\{version\.id\}"/);
assert.match(
    appSource,
    /DAILY_READING_VERSIONS = Object\.freeze\(\['rvr60', 'ntv', 'tla'\]\)/,
    'La preferencia diaria debe aceptar TLA.'
);
assert.match(
    appSource,
    /return versions\.rvr60 \|\| versions\.ntv \|\| reading\.text \|\| '';/,
    'Las lecturas sin TLA deben conservar un fallback seguro.'
);

const assertNoDuplicateDates = (readings, label) => {
    const dates = readings.map(reading => reading.date);
    assert.equal(new Set(dates).size, dates.length, `${label} contiene fechas duplicadas.`);
};

const assertValidTlaHtml = (value, label) => {
    assert.match(value, /^<p><sup>\d+<\/sup> /, `${label} debe iniciar con HTML de versículo.`);
    assert.doesNotMatch(value, /<(?!\/?(p|sup)>)/, `${label} contiene etiquetas HTML inesperadas.`);
};

const assertReadingsMatchSource = (readings, sourceReadingsForFile, label) => {
    for (const sourceReading of sourceReadingsForFile) {
        const reading = readings.find(item => (
            item.date === sourceReading.date &&
            item.reference === sourceReading.reference
        ));

        assert.ok(reading, `Falta ${sourceReading.date} ${sourceReading.reference} en ${label}.`);
        assert.ok(reading.versions.rvr60, `${sourceReading.reference} perdió RVR60 en ${label}.`);
        assert.ok(reading.versions.ntv, `${sourceReading.reference} perdió NTV en ${label}.`);
        assert.equal(reading.versions.tla, sourceReading.versions.tla);
        assertValidTlaHtml(reading.versions.tla, `${sourceReading.date} ${sourceReading.reference}`);
    }
};

for (const root of ['data', 'www/data']) {
    const indexReadings = JSON.parse(readFileSync(`${root}/readings/index.json`, 'utf8'));
    const aggregateReadings = JSON.parse(readFileSync(`${root}/readings.json`, 'utf8'));
    const julyReadings = JSON.parse(readFileSync(`${root}/readings/2026-07.json`, 'utf8'));
    const indexedJulyReadings = JSON.parse(readFileSync(`${root}/readings/julio-2026.json`, 'utf8'));
    const augustReadings = JSON.parse(readFileSync(`${root}/readings/2026-08.json`, 'utf8'));
    const indexedFiles = new Set(indexReadings.map(reading => reading.file));

    assert.ok(indexedFiles.has('data/readings/julio-2026.json'), `${root}/readings/index.json debe apuntar a julio-2026.json para julio.`);
    assert.ok(indexedFiles.has('data/readings/2026-08.json'), `${root}/readings/index.json debe apuntar a 2026-08.json para agosto.`);
    assertNoDuplicateDates(julyReadings, `${root}/readings/2026-07.json`);
    assertNoDuplicateDates(indexedJulyReadings, `${root}/readings/julio-2026.json`);
    assertNoDuplicateDates(augustReadings, `${root}/readings/2026-08.json`);
    assertNoDuplicateDates(aggregateReadings, `${root}/readings.json`);

    assert.equal(julyReadings.length, 31, `${root}/readings/2026-07.json debe tener 31 lecturas.`);
    assert.equal(indexedJulyReadings.length, 31, `${root}/readings/julio-2026.json debe tener 31 lecturas.`);
    assert.equal(augustReadings.length, 31, `${root}/readings/2026-08.json debe tener 31 lecturas.`);

    for (const sourceReading of sourceReadings) {
        const month = sourceReading.date.slice(0, 7);
        const monthlyReadings = month === '2026-07' ? julyReadings : augustReadings;
        const monthlyReading = monthlyReadings.find(reading => (
            reading.date === sourceReading.date &&
            reading.reference === sourceReading.reference
        ));
        const aggregateReading = aggregateReadings.find(reading => (
            reading.date === sourceReading.date &&
            reading.reference === sourceReading.reference
        ));

        assert.ok(monthlyReading, `Falta ${sourceReading.date} ${sourceReading.reference} en ${root}.`);
        assert.ok(aggregateReading, `Falta ${sourceReading.date} ${sourceReading.reference} en ${root}/readings.json.`);
        assert.ok(monthlyReading.versions.rvr60, `${sourceReading.reference} perdió RVR60.`);
        assert.ok(monthlyReading.versions.ntv, `${sourceReading.reference} perdió NTV.`);
        assert.equal(monthlyReading.versions.tla, sourceReading.versions.tla);
        assert.equal(aggregateReading.versions.tla, sourceReading.versions.tla);
        assertValidTlaHtml(monthlyReading.versions.tla, `${sourceReading.date} ${sourceReading.reference}`);
    }

    assertReadingsMatchSource(
        indexedJulyReadings,
        sourceReadings.filter(reading => reading.date.startsWith('2026-07')),
        `${root}/readings/julio-2026.json`
    );
}

console.log('TLA validada: selector, preferencia, fallback y 62 lecturas de julio/agosto importadas.');
