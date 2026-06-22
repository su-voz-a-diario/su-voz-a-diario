import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveKeyboardViewportState } from '../js/utils/platform.js';

const keyboardState = options => resolveKeyboardViewportState({
    virtualKeyboardHeight: 0,
    ...options
}).keyboardOpen;

assert.equal(
    keyboardState({
        hasKeyboardFocus: false,
        baselineHeight: 844,
        currentHeight: 390
    }),
    false,
    'Una rotación sin campo enfocado no debe simular teclado'
);

assert.equal(
    keyboardState({
        hasKeyboardFocus: true,
        baselineHeight: 844,
        currentHeight: 520
    }),
    true,
    'Una reducción real del viewport con campo enfocado debe detectar teclado'
);

assert.equal(
    keyboardState({
        hasKeyboardFocus: true,
        baselineHeight: 844,
        currentHeight: 790
    }),
    false,
    'Cambios pequeños de la barra del navegador no deben detectar teclado'
);

assert.equal(
    keyboardState({
        hasKeyboardFocus: true,
        baselineHeight: 390,
        currentHeight: 390,
        virtualKeyboardHeight: 220
    }),
    true,
    'VirtualKeyboard debe tener prioridad cuando está disponible'
);

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

assert.doesNotMatch(
    source,
    /_baseViewportHeight/,
    'No debe volver el baseline único capturado al inicio'
);

assert.match(
    source,
    /this\.closeTransientBibleUI\(\);[\s\S]*if \(oldView === 'home'/,
    'Cada cambio de ruta debe limpiar overlays transitorios'
);

assert.match(
    source,
    /if \(!versionPickerMounted\)[\s\S]*bibleVersionPickerOpen = false/,
    'Debe existir reconciliación defensiva del selector de versión'
);

console.log('Bottom navigation regression checks: OK');
