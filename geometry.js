// The taut chain path Γ: arcs on the wheels joined by common tangents.
// Everything in studs, Y pointing up (ordinary maths axes).

const TAU = Math.PI * 2;
const mod = (a, m) => ((a % m) + m) % m;
const wrapPi = (a) => mod(a + Math.PI, TAU) - Math.PI;

// Common tangent from circle i to circle j. s = +1 means the chain wraps that
// wheel anticlockwise. This single form covers all four tangent cases.
function tangent(ci, Ri, si, cj, Rj, sj) {
  const Dx = cj.x - ci.x, Dy = cj.y - ci.y;
  const d = Math.hypot(Dx, Dy);
  const k = si * Ri - sj * Rj;
  if (!(d > Math.abs(k))) return null;            // impossible: they swallow each other
  const L = Math.sqrt(d * d - k * k);
  const psi = Math.atan2(Dy, Dx) + Math.atan2(k, L);
  const u = { x: Math.cos(psi), y: Math.sin(psi) };
  return {                                        // rot90(u) = (-uy, ux)
    u, L,
    Pi: { x: ci.x + si * Ri * u.y, y: ci.y - si * Ri * u.x },
    Pj: { x: cj.x + sj * Rj * u.y, y: cj.y - sj * Rj * u.x },
  };
}

// nodes: [{c:{x,y}, R, s}] in cyclic order of travel. Null if it cannot be built.
function buildPath(nodes) {
  const n = nodes.length;
  if (n < 1 || nodes.some((nd) => !(nd.R > 0))) return null;
  if (n === 1) {                                  // a chain closed on one wheel: a circle
    const nd = nodes[0];
    const arc = { kind: 'arc', c: nd.c, R: nd.R, th0: 0, sweep: nd.s * TAU, len: nd.R * TAU };
    return { parts: [arc], total: arc.len, turn: arc.sweep };
  }
  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = nodes[i], b = nodes[(i + 1) % n];
    const tg = tangent(a.c, a.R, a.s, b.c, b.R, b.s);
    if (!tg) return null;
    tangents.push(tg);
  }
  const parts = [];
  let turn = 0;
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    const from = tangents[(i - 1 + n) % n].Pj;    // where the chain arrives
    const to = tangents[i].Pi;                    // where it leaves
    const th0 = Math.atan2(from.y - nd.c.y, from.x - nd.c.x);
    const th1 = Math.atan2(to.y - nd.c.y, to.x - nd.c.x);
    // The modulo picks the sweep that runs in direction s, even past 180°.
    const sweep = nd.s * mod(nd.s * (th1 - th0), TAU);
    turn += sweep;
    parts.push({ kind: 'arc', c: nd.c, R: nd.R, th0, sweep, len: nd.R * Math.abs(sweep) });
    parts.push({ kind: 'line', p0: tangents[i].Pi, p1: tangents[i].Pj, u: tangents[i].u, len: tangents[i].L });
  }
  return { parts, total: parts.reduce((a, p) => a + p.len, 0), turn };
}

// Point of Γ at arc distance s from the start (cyclic).
function pointAt(path, s) {
  s = mod(s, path.total);
  let p = path.parts[0];
  for (const q of path.parts) { p = q; if (s <= q.len) break; s -= q.len; }
  if (p.kind === 'line') return { x: p.p0.x + p.u.x * s, y: p.p0.y + p.u.y * s };
  const th = p.th0 + Math.sign(p.sweep) * s / p.R;
  return { x: p.c.x + p.R * Math.cos(th), y: p.c.y + p.R * Math.sin(th) };
}

// Nearest point of a segment, clamped to its ends, and the distance to it.
function nearestOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  let u = d2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / d2 : 0;
  u = Math.max(0, Math.min(1, u));
  return { x: a.x + dx * u, y: a.y + dy * u };
}

function distToSegment(p, a, b) {
  const q = nearestOnSegment(p, a, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}
