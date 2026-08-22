// The interface. Everything in studs, Y up: the <g id="flip"> does the flipping.

const $ = (id) => document.getElementById(id);
const board = $('board'), flip = $('flip');

const state = {
  chain: '3711',
  wheels: [],        // {part, img, teeth, R, x, y}
  route: [],         // [{wheel, s}] in order of travel
  links: 27,
  linkReverse: false, linkFlip: false,
  grid: 'stud',
  selected: null, refWheel: null,
  stroke: null, res: null, message: '',
};
const view = { x: -20, y: -14, w: 40, h: 28 };     // what the board shows, in studs

const pitch = () => CHAINS[state.chain].pitch;
const gridStep = () => (state.grid === 'free' ? null
  : { x: 1, y: state.grid === 'brick' ? BRICK : 1 });
const shapeId = (part) => 'o-' + part.replace(/\W/g, '-');

// The palette picture: the part rendered from its LDraw model by tools/outlines.js.
const icon = (part) => `<img src="img/${part.replace('.dat', '.png')}" alt="">`;
const palette = () => [...CHAINS[state.chain].wheels, ...PLAIN_WHEELS];

// Moving, adding or removing a wheel makes the old route meaningless: where the
// chain runs is a decision about *these* wheels in *these* places. So it goes,
// and you draw it again.
function boardChanged() {
  state.route = [];
  recompute();
}

// ---------- working out the chain ----------

const makePath = (extra) => buildPath(state.route.map((r) => {
  const w = state.wheels[r.wheel];
  return { c: { x: w.x, y: w.y }, R: w.R + extra, s: r.s };
}));

function recompute() {
  state.res = state.route.length ? solveChain(makePath, state.links, pitch()) : null;
  render();
}

// A wheel whose teeth were cut for this very chain takes one link per tooth, so
// the links sit in the valleys by design: the chords *are* the polygon the teeth
// were shaped around, and complaining that they touch it is nonsense.
const seatsTheChain = (w) => w.teeth &&
  Math.abs(2 * w.R * Math.sin(Math.PI / w.teeth) - pitch()) < 1e-6;

// Closest approach of the chain to every other wheel, even ones it never touches.
function clearances(joints) {
  return state.wheels.filter((w) => !seatsTheChain(w)).map((w) => {
    let best = Infinity;
    for (let i = 0; i < joints.length; i++)
      best = Math.min(best, distToSegment(w, joints[i], joints[(i + 1) % joints.length]));
    return { wheel: w, gap: best, root: rootRadius(w) };
  });
}

// ---------- drawing ----------

function render() {
  const res = state.res;
  const chain = CHAINS[state.chain];
  let svg = '';

  if (res?.path) {                                   // the taut path, dashed
    let d = '';
    for (const part of res.path.parts) {
      if (part.kind === 'line') { d += `M${part.p0.x},${part.p0.y}L${part.p1.x},${part.p1.y}`; continue; }
      const steps = Math.max(2, Math.ceil(Math.abs(part.sweep) / 0.1));
      for (let i = 0; i <= steps; i++) {
        const th = part.th0 + part.sweep * i / steps;
        d += (i ? 'L' : 'M') + (part.c.x + part.R * Math.cos(th)) + ',' + (part.c.y + part.R * Math.sin(th));
      }
    }
    svg += `<path d="${d}" fill="none" stroke="#2e7de9" stroke-width="0.04"
              stroke-dasharray="0.25 0.2" opacity="0.6"/>`;
  }

  state.wheels.forEach((w, i) => {
    const r = drawnRadius(w);
    svg += `<g data-wi="${i}" style="cursor:grab" transform="translate(${w.x},${w.y})">
              <circle r="${r}" fill="#fff" opacity="0.85"/>
              <g transform="scale(${1 / LDU})" fill="none" stroke="#5d6b7c"
                 stroke-width="1" vector-effect="non-scaling-stroke">
                <use href="#${shapeId(w.part)}"/></g>
              ${i === state.selected ? `<circle r="${r + 0.2}" fill="none" stroke="#2e7de9" stroke-width="0.09"/>` : ''}
            </g>`;
  });

  // Turned round, the links overlap the other way too, so draw them in reverse.
  const placed = res?.joints
    ? linkPlacements(res.joints, chain.pitch, linkRunsBack(chain), state.linkReverse) : [];
  if (state.linkReverse) placed.reverse();
  const facing = state.linkFlip !== linkFacesIn(chain, res?.path);
  const link = (p, clip) => {
    const deg = Math.atan2(p.uy, p.ux) * 180 / Math.PI;
    return `<g transform="translate(${p.x},${p.y}) rotate(${deg.toFixed(2)})
              scale(${1 / LDU},${(facing ? -1 : 1) / LDU})" fill="#fff" stroke="#2b3440"
              stroke-width="1.3" vector-effect="non-scaling-stroke"
              ><g ${clip}><use href="#${shapeId(chain.part)}"/></g></g>`;
  };
  for (const p of placed) svg += link(p, '');
  // Each link is drawn over the one before, but the loop closes, so the first
  // ends up buried under the last — the one joint where the overlap comes out
  // backwards. Painting the front half of that link again on top settles it.
  if (placed.length) svg += link(placed[0], 'clip-path="url(#seam)"');

  state.route.forEach((r, k) => {
    const w = state.wheels[r.wheel];
    // Outlined, or it vanishes into the drawing.
    svg += `<text x="${w.x}" y="${-w.y}" transform="scale(1,-1)" text-anchor="middle" dy="0.3"
              font-size="0.85" font-weight="bold" fill="#2e7de9" stroke="#0a1a2b"
              stroke-width="0.16" paint-order="stroke">${k + 1}</text>`;
  });

  if (state.stroke)
    svg += `<polyline points="${state.stroke.map((p) => p.x + ',' + p.y).join(' ')}" fill="none"
              stroke="#e8b800" stroke-width="0.15" stroke-linecap="round" stroke-linejoin="round"/>`;

  const used = new Set([chain.part, ...state.wheels.map((w) => w.part)]);
  // Half a link, the half nearest the joint it hangs on — which end that is
  // depends on which way the part runs from its origin.
  const box = OUTLINES[chain.part].box;
  const half = chain.pitch * LDU / 2;
  const from = linkRunsBack(chain) ? -half : box[0] - 1;
  const to = linkRunsBack(chain) ? box[2] + 1 : half;
  $('shapes').innerHTML = [...used].filter((p) => OUTLINES[p])
    .map((p) => `<path id="${shapeId(p)}" d="${OUTLINES[p].d}"/>`).join('')
    + `<clipPath id="seam"><rect x="${from}" y="${box[1] - 1}"
         width="${to - from}" height="${box[3] - box[1] + 2}"/></clipPath>`;
  flip.innerHTML = svg;

  board.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const step = gridStep() ?? { x: 1, y: 1 };
  $('holes').setAttribute('height', step.y);
  $('holes').setAttribute('y', step.y / 2);
  $('hole').setAttribute('cy', step.y / 2);
  renderPanels();
}

function renderPanels() {
  $('chainPick').innerHTML = Object.entries(CHAINS).map(([key, c]) =>
    `<button data-chain="${key}" class="${key === state.chain ? 'on' : ''}">
       ${icon(c.part)}</button>`).join('');

  const meshed = CHAINS[state.chain].wheels;
  const button = (w, i) => `<button data-wheel="${i}">${icon(w.part)}` +
    `${w.teeth ? w.teeth + 't' : 'Ø' + (2 * drawnRadius(w)).toFixed(1)}</button>`;
  $('wheelPick').innerHTML =
    `<h2>${t('gears')}</h2>
     <div class="pick">${meshed.map(button).join('')}</div>
     <h2>${t('wheels')}</h2>
     <div class="pick">${PLAIN_WHEELS.map((w, i) => button(w, meshed.length + i)).join('')}</div>`;
  for (const b of $('flags').children) b.classList.toggle('on', b.dataset.lang === lang);

  $('undo').disabled = !past.length;
  $('redo').disabled = !future.length;
  $('c-links').value = state.links;
  $('grid').value = state.grid;
  $('l-rev').checked = state.linkReverse;
  $('l-flip').checked = state.linkFlip;

  const w = state.wheels[state.selected];
  $('insp').disabled = !w;
  if (w) {
    if (state.refWheel === null || state.refWheel === state.selected || !state.wheels[state.refWheel])
      state.refWheel = state.wheels.findIndex((_, i) => i !== state.selected);
    $('i-x').value = +w.x.toFixed(3); $('i-y').value = +w.y.toFixed(3);
    $('i-ref').innerHTML = state.wheels.map((o, i) => i === state.selected ? ''
      : `<option value="${i}" ${i === state.refWheel ? 'selected' : ''}>#${i + 1} ${o.teeth || '○'}</option>`).join('');
    const ref = state.wheels[state.refWheel];
    $('i-dx').value = ref ? +(w.x - ref.x).toFixed(3) : '';
    $('i-dy').value = ref ? +(w.y - ref.y).toFixed(3) : '';
    $('i-dx').disabled = $('i-dy').disabled = !ref;
  }
  $('stats').innerHTML = statsHTML();
}

function statsHTML() {
  const said = state.message ? `<b class="warn">${state.message}</b>\n` : '';
  if (!state.route.length) return said + t('idealLinks', { n: '—' });
  const res = state.res;
  if (res.error) return `${said}<b class="warn">${res.error}</b>`;
  const lines = [];
  if (said) lines.push(said.trim());
  // A whole number of turns is fine: 1 for a plain loop, 0 for a figure of
  // eight, 2 for a double wrap. A fraction means the senses do not add up.
  const turns = res.path.turn / TAU;
  if (Math.abs(turns - Math.round(turns)) > 0.01)
    lines.push(`<b class="warn">${t('notOneTurn', { n: turns.toFixed(2) })}</b>`);
  if (Math.abs(res.gap) > 1e-6)
    lines.push(`<b class="warn">${t('notClosed',
      { n: Math.abs(res.gap).toFixed(3), sign: t(res.gap > 0 ? 'tooMany' : 'tooFew') })}</b>`);
  lines.push(t('idealLinks', { n: res.ideal.toFixed(2) }));
  // Tightness in links, which is the unit anyone can act on. The thickness the
  // solver works in is a real number but it means nothing to a builder.
  const best = Math.max(3, Math.round(res.ideal));
  if (state.links !== best)
    lines.push(`<b class="warn">${t(state.links > best ? 'tooLoose' : 'tooTight', { n: best })}</b>`);
  for (const c of clearances(res.joints))
    if (c.gap < c.root)
      lines.push(`<b class="warn">${c.wheel.teeth ? t('hits', { n: c.wheel.teeth }) : t('hitsSmooth')}</b>`);
  return lines.join('\n');
}

// ---------- what was ----------

// A board is a handful of small objects, so a step of history is a copy of the
// whole thing rather than a description of what changed — no action has to
// remember how to undo itself, and none can get it wrong. That is cheap enough
// to keep a great many of them.
//
// Only what a person sets. Not the view or the grid, because moving the board is
// not a change to the model and having undo scroll the screen about is maddening.
const HISTORY = 1000;
let past = [], future = [];

const snapshot = () => JSON.stringify({
  chain: state.chain, wheels: state.wheels, route: state.route, links: state.links,
  linkReverse: state.linkReverse, linkFlip: state.linkFlip,
  selected: state.selected, refWheel: state.refWheel,
});

function restore(shot) {
  Object.assign(state, JSON.parse(shot));
  state.stroke = null;
  state.message = '';
}

// Called before a change, never after. A step that would repeat the one before it
// is dropped, which is what stops a click into a number field that changes
// nothing from costing a press of undo.
function remember() {
  const now = snapshot();
  if (past[past.length - 1] === now) return;
  past.push(now);
  if (past.length > HISTORY) past.shift();
  future = [];
}

function step(from, to) {
  if (!from.length) return;
  to.push(snapshot());
  restore(from.pop());
  recompute();
}

// ---------- pointer ----------

function atPointer(ev) {
  const p = board.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(flip.getScreenCTM().inverse());
}

// The same point in the board's own coordinates, Y down: what the viewBox is
// written in. Zooming works here, because that is what it moves.
function atViewBox(clientX, clientY) {
  const p = board.createSVGPoint();
  p.x = clientX; p.y = clientY;
  return p.matrixTransform(board.getScreenCTM().inverse());
}

function snapPoint(p) {
  const step = gridStep();
  return step ? { x: Math.round(p.x / step.x) * step.x, y: Math.round(p.y / step.y) * step.y }
              : { x: p.x, y: p.y };
}
const snapped = (ev) => snapPoint(atPointer(ev));

const overBoard = (ev) => board.contains(document.elementFromPoint(ev.clientX, ev.clientY));

function addWheel(spec, pos) {
  state.wheels.push({ ...spec, R: pitchRadius(spec, CHAINS[state.chain]), ...pos });
  state.selected = state.wheels.length - 1;
}

// Tapped rather than dragged, a wheel lands in the middle of what you are
// looking at — the only way to add one on a phone, where the palette is below
// the board and dragging up to it is a nuisance. Spread out a little, because
// two wheels exactly on top of each other are both impossible to tell apart and
// impossible to grab.
function addAtMiddle(spec) {
  const r = board.getBoundingClientRect();
  const c = atPointer({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  addWheel(spec, snapPoint({ x: c.x + (state.wheels.length % 4) * 3 - 4.5, y: c.y }));
}

// Dragging a new wheel out of the palette: a ghost follows the mouse the whole way.
$('wheelPick').addEventListener('pointerdown', (ev) => {
  const btn = ev.target.closest('[data-wheel]');
  if (!btn) return;
  const spec = palette()[+btn.dataset.wheel];
  const ghost = $('ghost');
  ghost.src = `img/${spec.part.replace('.dat', '.png')}`;
  ghost.style.display = 'block';
  const move = (e) => { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; };
  const drop = (e) => {
    globalThis.removeEventListener('pointermove', move);
    globalThis.removeEventListener('pointerup', drop);
    ghost.style.display = 'none';
    const dragged = Math.hypot(e.clientX - ev.clientX, e.clientY - ev.clientY) > 6;
    if (dragged && !overBoard(e)) return;        // carried off somewhere else: dropped
    remember();
    if (dragged) addWheel(spec, snapped(e)); else addAtMiddle(spec);
    boardChanged();
  };
  move(ev);
  globalThis.addEventListener('pointermove', move);
  globalThis.addEventListener('pointerup', drop);
});

// The right button shifts the board about, like sliding a sheet of paper.
let panning = null;
board.addEventListener('contextmenu', (ev) => ev.preventDefault());

// A phone has no right button and no wheel, so two fingers do both jobs at once,
// the way every map does it. One finger is still drawing, so nothing starts until
// the second one lands — and when it does, whatever the first was in the middle
// of is abandoned rather than finished by accident.
const fingers = new Map();
let pinch = null;

// Board units per screen pixel. The board fits what it shows inside itself and
// letterboxes the rest, so the scale is set by whichever dimension runs out
// first — the width on a desktop, the height on a phone held sideways.
const perPixel = () =>
  Math.max(view.w / board.clientWidth, view.h / board.clientHeight);

const spread = () => {
  const [a, b] = [...fingers.values()];
  return { gap: Math.hypot(a.x - b.x, a.y - b.y) || 1,
           mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
};

function pinchMove() {
  const now = spread();
  // Scale about the point between the fingers, which is the one that must not move…
  zoomAbout(atViewBox(now.mid.x, now.mid.y), pinch.gap / now.gap);
  // …and then follow that point wherever it has gone since the last frame.
  const per = perPixel();
  view.x -= (now.mid.x - pinch.mid.x) * per;
  view.y -= (now.mid.y - pinch.mid.y) * per;
  pinch = now;
  render();
}

// Press on a wheel to move it; press anywhere else and you are drawing a chain.
// preventDefault stops the browser deciding halfway through that you meant to
// drag the picture, which used to cut the stroke short.
let dragging = null;
board.addEventListener('dragstart', (ev) => ev.preventDefault());
board.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  try { board.setPointerCapture(ev.pointerId); } catch { /* synthetic events */ }
  fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (fingers.size === 2) {
    state.stroke = null; dragging = null;            // that gesture was a pinch all along
    pinch = spread();
    render();
    return;
  }
  if (fingers.size > 2) return;
  if (ev.button === 2) {
    panning = { x: ev.clientX, y: ev.clientY };
    board.classList.add('panning');
    return;
  }
  const el = ev.target.closest('[data-wi]');
  // Taking hold of a wheel is only a change once it has gone somewhere, so the
  // step to undo waits for the first move — a click that only selects costs none.
  if (el) { dragging = { i: state.selected = +el.dataset.wi, moved: false }; render(); }
  else { dragging = null; state.stroke = [atPointer(ev)]; }
});
board.addEventListener('pointermove', (ev) => {
  if (fingers.has(ev.pointerId)) fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pinch) { if (fingers.size >= 2) pinchMove(); return; }
  if (panning) {
    const per = perPixel();
    view.x -= (ev.clientX - panning.x) * per;
    view.y -= (ev.clientY - panning.y) * per;
    panning = { x: ev.clientX, y: ev.clientY };
    render();
  } else if (state.stroke) { state.stroke.push(atPointer(ev)); render(); }     // never snapped
  else if (dragging) {
    if (!dragging.moved) { dragging.moved = true; remember(); }
    Object.assign(state.wheels[dragging.i], snapped(ev));
    boardChanged();
  }
});
board.addEventListener('pointerup', (ev) => {
  fingers.delete(ev.pointerId);
  // Lifting one finger ends the pinch; the one still down is not the start of a
  // new stroke, so it has nothing left to do either.
  if (pinch) { if (fingers.size < 2) pinch = null; return; }
  if (panning) { panning = null; board.classList.remove('panning'); return; }
  if (state.stroke) {
    const span = extent(state.stroke);
    state.message = '';
    if (span < 1) state.selected = null;               // a click, not a chain
    else {
      const route = routeFromStroke(state.stroke, discs());
      if (!route) state.message = t('strayLoop');
      else {
        remember();
        state.route = route;
        const path = makePath(0);
        if (path) state.links = Math.max(3, Math.round(path.total / pitch()));
      }
    }
    state.stroke = null;
  }
  dragging = null;
  recompute();
});
// If the browser takes the pointer off us, forget the stroke rather than laying
// a chain along half of it.
board.addEventListener('pointercancel', (ev) => {
  fingers.delete(ev.pointerId);
  if (fingers.size < 2) pinch = null;
  state.stroke = null; dragging = null; panning = null;
  board.classList.remove('panning');
  render();
});

const discs = () => state.wheels.map((w) => ({ c: { x: w.x, y: w.y }, R: w.R }));
const extent = (pts) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

// Scale the board by k about a point that has to stay where it is on screen.
// Both the wheel and a pinch end up here.
function zoomAbout(at, k) {
  const w = Math.min(200, Math.max(6, view.w * k)), scale = w / view.w;
  view.x = at.x - (at.x - view.x) * scale;
  view.y = at.y - (at.y - view.y) * scale;
  view.w = w; view.h *= scale;
}

board.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  zoomAbout(atViewBox(ev.clientX, ev.clientY),
            Math.min(4, Math.max(0.25, Math.exp(ev.deltaY * 0.0015))));
  render();
}, { passive: false });

globalThis.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    ev.preventDefault();
    return ev.shiftKey ? step(future, past) : step(past, future);
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
    ev.preventDefault();
    return step(future, past);
  }
  if (ev.key !== 'Delete' || state.selected === null) return;
  if (/input|select|textarea/i.test(ev.target.tagName)) return;
  removeWheel();
});

// ---------- panel ----------

$('chainPick').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-chain]');
  if (!b || b.dataset.chain === state.chain) return;
  remember();
  state.chain = b.dataset.chain;
  state.wheels = []; state.route = []; state.selected = null;
  recompute();
});

$('flags').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-lang]');
  if (!b) return;
  localStorage.setItem('lang', lang = b.dataset.lang);
  applyLanguage();
  render();
});

function removeWheel() {
  remember();
  state.wheels.splice(state.selected, 1);
  state.selected = state.refWheel = null;
  boardChanged();
}

const onInput = (id, fn, after = recompute) =>
  $(id).addEventListener('input', () => { fn(+$(id).value); after(); });
onInput('c-links', (v) => { if (v >= 3) state.links = v; });
onInput('i-x', (v) => { state.wheels[state.selected].x = v; }, boardChanged);
onInput('i-y', (v) => { state.wheels[state.selected].y = v; }, boardChanged);
onInput('i-dx', (v) => { state.wheels[state.selected].x = state.wheels[state.refWheel].x + v; }, boardChanged);
onInput('i-dy', (v) => { state.wheels[state.selected].y = state.wheels[state.refWheel].y + v; }, boardChanged);
// Remembered when the field is entered rather than on every keystroke, so typing
// "27" is one step back and not two.
for (const id of ['c-links', 'i-x', 'i-y', 'i-dx', 'i-dy']) $(id).addEventListener('focus', remember);
$('i-ref').onchange = () => { state.refWheel = +$('i-ref').value; render(); };
$('i-del').onclick = removeWheel;
$('grid').onchange = () => { state.grid = $('grid').value; render(); };
$('l-rev').onchange = () => { remember(); state.linkReverse = $('l-rev').checked; render(); };
$('l-flip').onchange = () => { remember(); state.linkFlip = $('l-flip').checked; render(); };
$('undo').onclick = () => step(past, future);
$('redo').onclick = () => step(future, past);
$('reset').onclick = () => {
  remember();
  state.wheels = []; state.route = []; state.selected = state.refWheel = null;
  recompute();
};

$('save').onclick = () => {
  if (!state.res || state.res.error) return alert(t('saveFirst'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toLDR(state, state.res)], { type: 'text/plain' }));
  a.download = 'chain.ldr';
  a.click();
};

applyLanguage();
recompute();
