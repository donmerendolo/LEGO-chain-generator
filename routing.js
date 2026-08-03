// From a rough freehand loop to an exact route.
//
// One pass along the stroke, dragging a taut string behind it. The leading run
// of the string goes from the last wheel it caught on to wherever the stroke
// has got to; when that run bumps into a wheel, the string catches there too;
// when it peels back off one, that wheel is let go. What is left when the
// stroke closes is the chain.
//
// Because it walks the stroke in order, the order of the wheels *is* the
// answer, not something to be worked out afterwards — and so is which way round
// each one goes, from the side the run passed it. Nothing here is a heuristic.
//
// Two consequences worth knowing. A wheel the stroke never went near still gets
// caught if it stands in the way, so nothing has to be checked for afterwards.
// And the chain crosses itself only where you drew a crossing: the taut curve
// of a class cannot cross when the drawn one does not. A real chain in one
// plane could not do it, but drawing one is nobody's accident and it is a fair
// thing to want, so it is left alone.
//
// A wheel can come up twice. What a flat chain cannot do is lap one — wrap it
// by more than a full turn — but a big wheel between two small ones is touched
// on both flanks, in two separate arcs, without anything crossing.

const pathOf = (route, discs) => buildPath(route.map((r) =>
  ({ c: discs[r.wheel].c, R: discs[r.wheel].R, s: r.s })));

// A stroke drawn straight over a wheel says nothing about which side you meant,
// and the string cannot be tangent to a circle from inside it. So those points
// get nudged back out along the way they came in, which at least keeps the side
// they were nearest. A nudge can land inside the next wheel along, hence the
// retry; with wheels close enough to defeat that, the sweep just ignores them
// while it is standing on top of one.
const CLEARANCE = 1.02;

function pushOut(stroke, discs) {
  return stroke.map((p) => {
    let q = p;
    for (let tries = 0; tries < 4; tries++) {
      const d = discs.find((d) => Math.hypot(q.x - d.c.x, q.y - d.c.y) < d.R * CLEARANCE);
      if (!d) break;
      const dx = q.x - d.c.x, dy = q.y - d.c.y, r = Math.hypot(dx, dy);
      q = r < 1e-9 ? { x: d.c.x + d.R * CLEARANCE, y: d.c.y }
                   : { x: d.c.x + dx / r * d.R * CLEARANCE, y: d.c.y + dy / r * d.R * CLEARANCE };
    }
    return q;
  });
}

// Even out the points along the closed stroke, so the leading run creeps
// forward instead of jumping over wheels.
function resample(loop, step) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    segs.push({ a, b, len: Math.hypot(b.x - a.x, b.y - a.y), at: total });
    total += segs[i].len;
  }
  const count = Math.max(12, Math.round(total / step));
  const out = [];
  for (let i = 0, k = 0; i < count; i++) {
    const s = total * i / count;
    while (k < segs.length - 1 && segs[k].at + segs[k].len < s) k++;
    const q = segs[k], u = q.len ? (s - q.at) / q.len : 0;
    out.push({ x: q.a.x + (q.b.x - q.a.x) * u, y: q.a.y + (q.b.y - q.a.y) * u });
  }
  return out;
}

// Where the string leaves a wheel on its way to Q. A point is a circle of no
// radius, so the common-tangent formula does this too.
const leavingAt = (disc, s, Q) => tangent(disc.c, disc.R, s, Q, 0, 1)?.Pi;
const angleAt = (disc, p) => Math.atan2(p.y - disc.c.y, p.x - disc.c.x);

// The first wheel the run from S to Q bumps into, skipping the one it is
// already standing on and any it has just let go of.
function firstHit(S, Q, discs, skip, dropped) {
  const dx = Q.x - S.x, dy = Q.y - S.y, len = Math.hypot(dx, dy);
  if (len < 1e-9) return -1;
  let best = -1, soonest = Infinity;
  discs.forEach((d, k) => {
    if (k === skip || dropped.has(k)) return;
    const q = nearestOnSegment(d.c, S, Q);
    if (Math.hypot(q.x - d.c.x, q.y - d.c.y) >= d.R) return;
    const along = ((q.x - S.x) * dx + (q.y - S.y) * dy) / len;
    if (along < soonest) { soonest = along; best = k; }
  });
  return best;
}

// Walk the stroke round three times and keep the middle lap, which is the only
// one with a lap on either side of it.
//
// It needs the lap before because the first one starts anchored to a bare point
// of the stroke, which is no part of the chain, so the wheels it catches have a
// made-up run arriving at them. It needs the lap after because a wheel caught
// in the last stretch of a lap has had no chance to be let go of yet — and one
// caught at the end of a tail is exactly the sort that a moment later turns out
// not to be touched at all.
function sweep(stroke, discs) {
  const caught = [];                       // the string's stack of wheels
  const start = stroke[0];

  for (let lap = 0; lap < 3; lap++) {
    for (const Q of stroke) {
      // A wheel just let go of is tangent to the run that leaves it, so without
      // this the very next look would catch it again — and being tangent, which
      // side it caught on would be a coin toss. It stays let go until the stroke
      // moves on.
      const dropped = new Set();
      // Catching and letting go both change where the run starts, so keep
      // going until this point of the stroke settles.
      for (let step = 0; step < discs.length * 2 + 2; step++) {
        const top = caught[caught.length - 1];
        let S = start;

        if (top) {
          const disc = discs[top.wheel];
          const leave = leavingAt(disc, top.s, Q);
          if (!leave) break;                          // Q is inside that wheel
          const out = angleAt(disc, leave);
          top.wrapped += top.s * wrapPi(out - top.lastOut);
          top.lastOut = out;
          if (top.wrapped < 0) {                              // peeled back off
            dropped.add(top.wheel);
            caught.pop();
            continue;
          }
          S = leave;
        }

        const hit = firstHit(S, Q, discs, top ? top.wheel : -1, dropped);
        if (hit < 0) break;

        const disc = discs[hit];
        // Which way round: the centre to the left of the run means the string
        // passes on its right, going anticlockwise about it.
        const s = (Q.x - S.x) * (disc.c.y - S.y) - (Q.y - S.y) * (disc.c.x - S.x) > 0 ? 1 : -1;
        // The run arriving at it comes from the wheel before, or from the bare
        // starting point while there is nothing before.
        const before = caught[caught.length - 1];
        const arrive = before
          ? tangent(discs[before.wheel].c, discs[before.wheel].R, before.s, disc.c, disc.R, s)?.Pj
          : tangent(start, 0, 1, disc.c, disc.R, s)?.Pj;
        const leave = leavingAt(disc, s, Q);
        if (!arrive || !leave) break;

        const out = angleAt(disc, leave);
        caught.push({ wheel: hit, s, lap, lastOut: out,
                      wrapped: Math.max(0, s * wrapPi(out - angleAt(disc, arrive))) });
      }
    }
  }

  // What the middle lap caught and the last lap did not take back. Cutting the
  // cycle by looking for a repeated wheel would be wrong: a wheel is allowed to
  // come up twice. Nothing survives the middle lap only when there is a single
  // wheel and the string never lets go of it, and then the first lap has it.
  const middle = caught.filter((c) => c.lap === 1);
  return (middle.length ? middle : caught).map(({ wheel, s }) => ({ wheel, s }));
}

// stroke: the raw points the user drew. discs: every wheel on the board, pitch
// radius. Returns [{wheel, s}] in order of travel, or null if there is no chain
// to be had.
function routeFromStroke(stroke, discs) {
  if (stroke.length < 4 || !discs.length) return null;
  const route = sweep(resample(pushOut(stroke, discs), 0.25), discs);
  return route.length && pathOf(route, discs) ? route : null;
}
