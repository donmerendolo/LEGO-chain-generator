// UI strings. English is the default. To add a language, copy the `en` block,
// translate the values, and add a flag button in index.html.

const STRINGS = {
  en: {
    chainType: 'Chain', gears: 'Gears', wheels: 'Wheels',
    dragHint: 'Drag them onto the board.',
    links: 'Links',
    drawHint: 'Draw a loop across the board to lay the chain. It only has to pass on the ' +
              'correct side of each wheel.',
    flip: 'Other way round', face: 'Other face',
    wheel: 'Selected wheel', relTo: 'From', remove: 'Remove',
    result: 'Result', save: '💾 Save .ldr',
    grid: 'Grid', gridStud: 'Studs', gridBrick: 'Bricks', gridFree: 'Free',
    reset: '🗑 Start over',

    idealLinks: 'Links needed: {n}',
    notClosed: "Doesn't close: {n} studs of chain {sign}.",
    tooMany: 'too many', tooFew: 'missing',
    tooLoose: 'Loose',
    tooTight: 'Tight',
    hits: 'The chain runs into the {n}-tooth wheel.',
    hitsSmooth: 'The chain runs into the smooth wheel.',
    needLinks: 'These wheels need {n} links, not {have}.',
    noOffset: 'The link count fits, but no chain sits on these wheels: some are too ' +
              'close together, or too small for this chain.',
    overlap: 'The wheels overlap.',
    notOneTurn: 'That loop does not add up ({n} turns). Draw it again.',
    strayLoop: 'That loop goes round nothing. Try again.',
    saveFirst: 'Make the chain close first.',
  },

  es: {
    chainType: 'Cadena', gears: 'Engranajes', wheels: 'Ruedas',
    dragHint: 'Arrástralas al tablero.',
    links: 'Eslabones',
    drawHint: 'Dibuja un lazo sobre el tablero para poner la cadena. Solo tiene que pasar ' +
              'por el lado correcto de cada rueda.',
    flip: 'Del revés', face: 'Otra cara',
    wheel: 'Rueda seleccionada', relTo: 'Desde', remove: 'Quitar',
    result: 'Resultado', save: '💾 Guardar .ldr',
    grid: 'Rejilla', gridStud: 'Studs', gridBrick: 'Bricks', gridFree: 'Libre',
    reset: '🗑 Empezar de cero',

    idealLinks: 'Eslabones necesarios: {n}',
    notClosed: 'No cierra: {sign} {n} studs de cadena.',
    tooMany: 'sobran', tooFew: 'faltan',
    tooLoose: 'Floja',
    tooTight: 'Tirante',
    hits: 'La cadena choca con la rueda de {n} dientes.',
    hitsSmooth: 'La cadena choca con la rueda lisa.',
    needLinks: 'Estas ruedas necesitan {n} eslabones, no {have}.',
    noOffset: 'El número de eslabones cuadra, pero no hay cadena que se apoye en estas ' +
              'ruedas: alguna está demasiado cerca de otra, o es muy pequeña para esta cadena.',
    overlap: 'Las ruedas se solapan.',
    notOneTurn: 'Ese lazo no cuadra ({n} vueltas). Dibújalo otra vez.',
    strayLoop: 'Ese lazo no rodea nada. Prueba otra vez.',
    saveFirst: 'Primero haz que la cadena cierre.',
  },
};

let lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'en';

function t(key, vars) {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k]) : s;
}

// Fills every element carrying data-i18n="key".
function applyLanguage() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}
