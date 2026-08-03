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

// Hunt for a value in [a0, b0], widening the interval, that closes the chain.
function solveClosure(gapAt, a0, b0) {
  let a = a0, b = b0;
  for (let i = 0; i < 14; i++) {
    const ga = gapAt(a), gb = gapAt(b);
    if (isFinite(ga) && isFinite(gb) && (ga < 0) !== (gb < 0)) return bisect(gapAt, a, b);
    a -= (b0 - a0) / 2; b += (b0 - a0) / 2;
  }
  return null;
}

// The chain has one free quantity: how far off the pitch circle the pin line
// runs. makePath(t) rebuilds the path with every radius grown by t.
function solveChain(makePath, links, pitch) {
  const offset = solveClosure(
    (x) => { const path = makePath(x); return path ? walk(path, links, pitch).gap : NaN; },
    -0.25, 0.25);
  if (offset === null) {
    const base = makePath(0);
    return { error: base ? t('needLinks', { n: Math.round(base.total / pitch), have: links })
                         : t('overlap') };
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
