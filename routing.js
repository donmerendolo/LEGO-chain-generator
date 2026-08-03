// From a rough freehand loop to an exact route.
//
// Two questions have to be answered: which way round each wheel the chain goes,
// and which wheels it touches at all.
//
// The first one is topology, so we take it straight from the drawing and never
// measure anything: count how many times the stroke winds around each centre.
// A wheel the loop goes round turns with it; a wheel it passes by is pushed
// against from outside and turns the other way. Nothing here cares how neatly
// you drew or whether you came near the part.
//
// The second one is geometry, so we let the exact chain path answer it: start
// with every wheel in the route and drop any whose removal still leaves a path
// that runs into nothing. What is left is the taut chain.
//
// One visit per wheel, which is all there is: everything sits in one plane, so
// a chain cannot lap the same wheel twice without running into itself.

const pathOf = (route, discs) => buildPath(route.map((r) =>
  ({ c: discs[r.wheel].c, R: discs[r.wheel].R, s: r.s })));

// One walk of the path, answering both questions we ever ask of it: how close
// it passes to each wheel, and how many times it goes round it.
function probe(path, discs) {
  const near = discs.map(() => Infinity), winding = discs.map(() => 0);
  const steps = 600;
  let was = pointAt(path, 0);
  for (let i = 1; i <= steps; i++) {
    const p = pointAt(path, path.total * i / steps);
    for (let k = 0; k < discs.length; k++) {
      const c = discs[k].c;
      near[k] = Math.min(near[k], Math.hypot(p.x - c.x, p.y - c.y));
      winding[k] += wrapPi(Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(was.y - c.y, was.x - c.x));
    }
    was = p;
  }
  return { near, winding };
}

// Does the chain run over itself anywhere? Everything is in one plane, so two
// strands cannot share a spot — no crossed belts, no figures of eight.
function selfCrossing(path) {
  const steps = 200;
  const p = Array.from({ length: steps }, (_, i) => pointAt(path, path.total * i / steps));
  // Zero means "on the line", and a straight run of chain is full of that, so
  // only strictly opposite sides count as a crossing.
  const side = (a, b, c) => {
    const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
  };
  for (let i = 0; i < steps; i++) {
    const a = p[i], b = p[(i + 1) % steps];
    for (let j = i + 2; j < steps; j++) {
      if (i === 0 && j === steps - 1) continue;              // they share an end
      const c = p[j], d = p[(j + 1) % steps];
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
    }
  }
  return false;
}

// A path is legal when it closes after a whole number of turns, runs into no
// wheel at all — including the ones it never touches — never crosses itself,
// and still goes round exactly the wheels you drew round. That last one is what
// stops a wheel being dropped just because the chain can shrink away from it.
function legal(path, discs, inside) {
  if (!path) return false;
  if (Math.abs(path.turn / TAU - Math.round(path.turn / TAU)) > 1e-6) return false;
  const { near, winding } = probe(path, discs);
  return discs.every((d, k) => near[k] >= d.R - 1e-6 &&
    (Math.abs(winding[k]) > Math.PI) === inside[k]) && !selfCrossing(path);
}

// Order of travel. The chain goes round every wheel it encircles the same way,
// so the taut path visits them in convex-hull order however the loop was drawn.
// Wheels tucked inside the hull drop out here; if one is fat enough to be in
// the way after all, the path asks for it back below.
function hullOrder(wheels) {
  if (wheels.length < 3) return wheels;
  const cross = (o, a, b) =>
    (a.c.x - o.c.x) * (b.c.y - o.c.y) - (a.c.y - o.c.y) * (b.c.x - o.c.x);
  const sorted = [...wheels].sort((a, b) => a.c.x - b.c.x || a.c.y - b.c.y);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];      // anticlockwise
}

// Where in the route a wheel that pushes the chain belongs. A chain pulls
// taut, so of all the slots it could go in, the short one wins — a slot that
// makes the chain dive in and half-wrap the wheel is never what anyone drew.
// Between slots that come out the same length, the drawing decides: the chain
// should touch the wheel on the side the stroke went past it.
const SAME_LENGTH = 1.05;

function wedgeIn(route, discs, add, sense, touch) {
  const tries = [];
  for (let pos = 0; pos < route.length; pos++) {
    const trial = [...route.slice(0, pos + 1), { wheel: add, s: sense }, ...route.slice(pos + 1)];
    const path = pathOf(trial, discs);
    if (!path) continue;
    const arc = path.parts[2 * (pos + 1)];              // parts go arc, line, arc, line…
    const mid = arc.th0 + arc.sweep / 2;
    tries.push({ trial, len: path.total,
                 agrees: Math.cos(mid) * touch.x + Math.sin(mid) * touch.y });
  }
  if (!tries.length) return null;
  const shortest = Math.min(...tries.map((t) => t.len));
  return tries.filter((t) => t.len <= shortest * SAME_LENGTH)
              .reduce((a, b) => (b.agrees > a.agrees ? b : a)).trial;
}

// A wheel missing from the route that the path cannot ignore: either it runs
// into it, or it swallows it whole — which happens when you drew the chain past
// the near side of a wheel that sits well inside the loop. Both mean the same
// thing: that wheel pushes the chain in, so it belongs in the route.
function missing(path, discs, inside, chosen) {
  const { near, winding } = probe(path, discs);
  let worst = -1, deepest = 0, swallowed = -1;
  discs.forEach((d, k) => {
    if (chosen.has(k)) return;
    if (d.R - near[k] > deepest) { deepest = d.R - near[k]; worst = k; }
    if (swallowed < 0 && !inside[k] && Math.abs(winding[k]) > Math.PI) swallowed = k;
  });
  return worst >= 0 ? worst : swallowed;
}

// Drop wheels while that leaves a legal path, shortest first. A wheel the chain
// really rests on cannot go: without it the path would cut straight through it.
function trim(route, discs, inside) {
  const cost = (r) => {
    const path = pathOf(r, discs);
    return path && legal(path, discs, inside) ? path.total : Infinity;
  };
  let best = cost(route);
  while (route.length > 1) {
    let drop = -1, shortest = best;
    for (let k = 0; k < route.length; k++) {
      const len = cost(route.filter((_, i) => i !== k));
      if (len < shortest) { shortest = len; drop = k; }
    }
    if (drop < 0) break;
    route = route.filter((_, i) => i !== drop);
    best = shortest;
  }
  return best === Infinity ? null : route;
}

// stroke: the raw points the user drew. discs: every wheel on the board, pitch
// radius. Returns [{wheel, s}] in order of travel, or null if there is no chain
// to be had.
function routeFromStroke(stroke, discs) {
  if (stroke.length < 4 || !discs.length) return null;

  let area = 0;
  for (let i = 0; i < stroke.length; i++) {
    const a = stroke[i], b = stroke[(i + 1) % stroke.length];
    area += a.x * b.y - b.x * a.y;
  }
  const loop = area > 0 ? 1 : -1;      // which way round the whole thing goes

  const wheels = discs.map((d, wheel) => {
    let winding = 0, nearest = Infinity, touch = { x: 1, y: 0 };
    for (let i = 0; i < stroke.length; i++) {
      const a = stroke[i], b = stroke[(i + 1) % stroke.length];
      winding += wrapPi(Math.atan2(b.y - d.c.y, b.x - d.c.x)
                      - Math.atan2(a.y - d.c.y, a.x - d.c.x));
      const q = nearestOnSegment(d.c, a, b), gap = Math.hypot(q.x - d.c.x, q.y - d.c.y);
      // Which way the stroke went past the centre: the side the chain touches.
      if (gap < nearest && gap > 1e-9) {
        nearest = gap;
        touch = { x: (q.x - d.c.x) / gap, y: (q.y - d.c.y) / gap };
      }
    }
    return { wheel, c: d.c, winding, touch, drawnOver: nearest < d.R };
  });

  // Start with the wheels the loop goes round, then let the path itself ask for
  // the rest: any wheel it cannot ignore joins the route at the straight run it
  // interferes with. Wheels sitting on the board doing nothing never come up.
  // One wheel is a chain too: a closed circle sitting on it.
  const attempt = (inside) => {
    // Inside the loop: turns with it, whichever way that lobe was drawn.
    // Outside: the chain is pushed against it, so it turns against the loop.
    const sense = wheels.map((w, k) => (inside[k] ? Math.sign(w.winding) || loop : -loop));
    const route = hullOrder(wheels.filter((w) => inside[w.wheel]))
      .map(({ wheel }) => ({ wheel, s: sense[wheel] }));
    if (loop < 0) route.reverse();
    if (!route.length) return null;

    let grown = route;
    for (let i = 0; i < discs.length; i++) {
      const path = pathOf(grown, discs);
      if (!path) break;
      const add = missing(path, discs, inside, new Set(grown.map((r) => r.wheel)));
      if (add < 0) break;
      const wider = wedgeIn(grown, discs, add, sense[add], wheels[add].touch);
      if (!wider) break;
      grown = wider;
    }
    return trim(grown, discs, inside);
  };

  const inside = wheels.map((w) => Math.abs(w.winding) > Math.PI);
  const found = attempt(inside);
  if (found || !wheels.some((w) => w.drawnOver && !inside[w.wheel])) return found;
  // The stroke went straight over a wheel, so which side it passed is anyone's
  // guess and the guess we made has no chain. Try it the other way: wrapped.
  return attempt(inside.map((v, k) => v || wheels[k].drawnOver));
}
