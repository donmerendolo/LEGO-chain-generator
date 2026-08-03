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

// ---------- pointer ----------

function atPointer(ev) {
  const p = board.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(flip.getScreenCTM().inverse());
}

function snapped(ev) {
  const p = atPointer(ev), step = gridStep();
  return step ? { x: Math.round(p.x / step.x) * step.x, y: Math.round(p.y / step.y) * step.y }
              : { x: p.x, y: p.y };
}

const overBoard = (ev) => board.contains(document.elementFromPoint(ev.clientX, ev.clientY));

function addWheel(spec, pos) {
  state.wheels.push({ ...spec, R: pitchRadius(spec, CHAINS[state.chain]), ...pos });
  state.selected = state.wheels.length - 1;
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
    if (overBoard(e)) { addWheel(spec, snapped(e)); boardChanged(); }
  };
  move(ev);
  globalThis.addEventListener('pointermove', move);
  globalThis.addEventListener('pointerup', drop);
});

// The right button shifts the board about, like sliding a sheet of paper.
let panning = null;
board.addEventListener('contextmenu', (ev) => ev.preventDefault());

// Press on a wheel to move it; press anywhere else and you are drawing a chain.
// preventDefault stops the browser deciding halfway through that you meant to
// drag the picture, which used to cut the stroke short.
let dragging = null;
board.addEventListener('dragstart', (ev) => ev.preventDefault());
board.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  try { board.setPointerCapture(ev.pointerId); } catch { /* synthetic events */ }
  if (ev.button === 2) {
    panning = { x: ev.clientX, y: ev.clientY };
    board.classList.add('panning');
    return;
  }
  const el = ev.target.closest('[data-wi]');
  if (el) { dragging = state.selected = +el.dataset.wi; render(); }
  else { dragging = null; state.stroke = [atPointer(ev)]; }
});
board.addEventListener('pointermove', (ev) => {
  if (panning) {
    const perPixel = view.w / board.clientWidth;
    view.x -= (ev.clientX - panning.x) * perPixel;
    view.y -= (ev.clientY - panning.y) * perPixel;
    panning = { x: ev.clientX, y: ev.clientY };
    render();
  } else if (state.stroke) { state.stroke.push(atPointer(ev)); render(); }     // never snapped
  else if (dragging !== null) { Object.assign(state.wheels[dragging], snapped(ev)); boardChanged(); }
});
board.addEventListener('pointerup', () => {
  if (panning) { panning = null; board.classList.remove('panning'); return; }
  if (state.stroke) {
    const span = extent(state.stroke);
    state.message = '';
    if (span < 1) state.selected = null;               // a click, not a chain
    else {
      const route = routeFromStroke(state.stroke, discs());
      if (!route) state.message = t('strayLoop');
      else {
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
board.addEventListener('pointercancel', () => {
  state.stroke = null; dragging = null; panning = null;
  board.classList.remove('panning');
  render();
});

const discs = () => state.wheels.map((w) => ({ c: { x: w.x, y: w.y }, R: w.R }));
const extent = (pts) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

board.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const k = Math.min(4, Math.max(0.25, Math.exp(ev.deltaY * 0.0015)));
  const p = board.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  const at = p.matrixTransform(board.getScreenCTM().inverse());     // fixed point of the zoom
  const w = Math.min(200, Math.max(6, view.w * k)), scale = w / view.w;
  view.x = at.x - (at.x - view.x) * scale;
  view.y = at.y - (at.y - view.y) * scale;
  view.w = w; view.h *= scale;
  render();
}, { passive: false });

globalThis.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Delete' || state.selected === null) return;
  if (/input|select|textarea/i.test(ev.target.tagName)) return;
  removeWheel();
});

// ---------- panel ----------

$('chainPick').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-chain]');
  if (!b) return;
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
$('i-ref').onchange = () => { state.refWheel = +$('i-ref').value; render(); };
$('i-del').onclick = removeWheel;
$('grid').onchange = () => { state.grid = $('grid').value; render(); };
$('l-rev').onchange = () => { state.linkReverse = $('l-rev').checked; render(); };
$('l-flip').onchange = () => { state.linkFlip = $('l-flip').checked; render(); };
$('reset').onclick = () => { state.wheels = []; state.route = []; state.selected = null; recompute(); };

$('save').onclick = () => {
  if (!state.res || state.res.error) return alert(t('saveFirst'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toLDR(state, state.res)], { type: 'text/plain' }));
  a.download = 'chain.ldr';
  a.click();
};

applyLanguage();
recompute();
