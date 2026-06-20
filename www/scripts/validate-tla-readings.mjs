import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sourceReadings = JSON.parse(
    readFileSync(`${process.env.HOME}/Downloads/miqueas_tla.json`, 'utf8')
);
const monthlyReadings = JSON.parse(readFileSync('data/readings/2026-06.json', 'utf8'));
const aggregateReadings = JSON.parse(readFileSync('data/readings.json', 'utf8'));
const indexHtml = readFileSync('index.html', 'utf8');
const appSource = readFileSync('js/app.js', 'utf8');

assert.equal(sourceReadings.length, 10, 'El archivo de entrada debe contener 10 lecturas.');
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

for (const sourceReading of sourceReadings) {
    const monthlyReading = monthlyReadings.find(
        reading => reading.reference === sourceReading.reference
    );
    const aggregateReading = aggregateReadings.find(
        reading => reading.reference === sourceReading.reference
    );

    assert.ok(monthlyReading, `Falta ${sourceReading.reference} en el archivo mensual.`);
    assert.ok(aggregateReading, `Falta ${sourceReading.reference} en readings.json.`);
    assert.match(monthlyReading.date, /^2026-06-(2[1-9]|30)$/);
    assert.ok(monthlyReading.versions.rvr60, `${sourceReading.reference} perdió RVR60.`);
    assert.ok(monthlyReading.versions.ntv, `${sourceReading.reference} perdió NTV.`);
    assert.match(monthlyReading.versions.tla, /^<p><sup>\d+<\/sup> /);
    assert.equal(monthlyReading.versions.tla, aggregateReading.versions.tla);
}

console.log('TLA validada: selector, preferencia, fallback y 10 lecturas importadas.');
