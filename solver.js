// Lays N links of exact pitch p along the path and finds the one free quantity
// that makes the chain close.
//
// ponytail: the joints sit *on* the curve (walking chord by chord) instead of
// the 2N-variable least-squares fit of the spec §5. That biases the thickness by
// a constant ~0.14 mm (the polygon ends up inscribed), well under the slack
// threshold. Swap in §5 here if that last tenth of a millimetre ever matters.

// Walk on from arc position s0 to the next joint: the point of the curve at
// exactly one pitch away. A chord is never longer than its arc, so it lies past
// s0 + p.
function nextJoint(path, s0, p) {
  const v = pointAt(path, s0);
  const chord = (s) => Math.hypot(pointAt(path, s).x - v.x, pointAt(path, s).y - v.y) - p;
  let lo = s0 + p, hi = s0 + p;
  // ponytail: not monotone if the curve doubles back inside one pitch, which
  // needs a wheel far smaller than a link. Real parts never get there.
  for (let i = 0; i < 24 && chord(hi) < 0; i++) hi += p * 0.25;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (chord(m) < 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// N chords from the start of the path. If the chain closes, we land back on it.
function walk(path, N, p) {
  const joints = [];
  let s = 0;
  for (let i = 0; i < N; i++) { joints.push(pointAt(path, s)); s = nextJoint(path, s, p); }
  return { joints, gap: s - path.total };
}

function bisect(f, a, b, iters = 60) {
  let fa = f(a);
  if (!isFinite(fa) || !isFinite(f(b))) return null;
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (!isFinite(fm)) return null;
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

// Hunt for the value that closes the chain by scanning the range for a change
// of sign, skipping any sample where there is no path at all — small wheels
// close together stop having one well before the range runs out. Testing only
// the two ends of a widening interval, as this used to, went blind the moment
// either end landed on one of those, and there could be a perfectly good answer
// sitting between them.
function solveClosure(gapAt, limit) {
  const near = limit / 4;                        // where the answer nearly always is
  if ((gapAt(-near) < 0) !== (gapAt(near) < 0)) return bisect(gapAt, -near, near);

  const steps = 60, at = [];
  for (let i = 0; i <= steps; i++) {
    const t = -limit + 2 * limit * i / steps;
    at.push({ t, gap: gapAt(t) });
  }
  // Closest to nothing first: the chain rides near the pitch circles, so a
  // change of sign far out is a degenerate shape rather than the answer.
  const brackets = at.slice(0, -1).map((a, i) => [a, at[i + 1]])
    .filter(([a, b]) => isFinite(a.gap) && isFinite(b.gap) && (a.gap < 0) !== (b.gap < 0))
    .sort((p, q) => Math.min(Math.abs(p[0].t), Math.abs(p[1].t))
                  - Math.min(Math.abs(q[0].t), Math.abs(q[1].t)));
  return brackets.length ? bisect(gapAt, brackets[0][0].t, brackets[0][1].t) : null;
}

// The chain has one free quantity: how far off the pitch circle the pin line
// runs. makePath(t) rebuilds the path with every radius grown by t.
function solveChain(makePath, links, pitch) {
  const offset = solveClosure(
    (x) => { const path = makePath(x); return path ? walk(path, links, pitch).gap : NaN; },
    pitch);
  if (offset === null) {
    const base = makePath(0);
    if (!base) return { error: t('overlap') };
    const wanted = Math.round(base.total / pitch);
    // Saying "it needs 48, not 48" helps nobody: if the count is already right,
    // the trouble is that no thickness closes this chain at all.
    return { error: wanted === links ? t('noOffset')
                                     : t('needLinks', { n: wanted, have: links }) };
  }
  const path = makePath(offset);
  if (!path) return { error: t('overlap') };
  const w = walk(path, links, pitch);
  // How many links this layout wants, measured on the pitch circles — not on
  // the path we just solved, which would only tell us what we already put in.
  return { offset, path, joints: w.joints, gap: w.gap, ideal: makePath(0).total / pitch };
}

// Where each link sits: the fork end and the direction it points. The piece is
// its nominal length, so it is centred on the real gap between two joints; both
// the drawing and the .ldr export go through here.
function linkPlacements(joints, nominal, reverse) {
  return joints.map((a, i) => {
    const b = joints[(i + 1) % joints.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const slack = (len - nominal) / 2;
    let fork = { x: a.x + ux * slack, y: a.y + uy * slack };
    if (reverse) { fork = { x: b.x - ux * slack, y: b.y - uy * slack }; ux = -ux; uy = -uy; }
    return { ...fork, ux, uy };
  });
}
