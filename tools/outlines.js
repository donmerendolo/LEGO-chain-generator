// Builds outlines.js from the real LDraw part files.
//
//   deno run --allow-net --allow-read --allow-write tools/outlines.js
//
// Every LDraw part is a tree of subfiles, each placed by a matrix, ending in
// flat surfaces. We walk that tree, flatten the surfaces into part coordinates,
// project them the way the piece sits on the board, and trace the outline of
// what is left: the silhouette plus whatever holes go clean through. Drawing
// every edge of the model instead turns a chain link into a black smudge.
//
// Run it again only if you add a part to the catalogue.
// LDraw parts are CC BY 4.0 — https://www.ldraw.org

const CACHE = new URL('cache/', import.meta.url);
const BASE = 'https://library.ldraw.org/library/official/';
const CELLS = 320;          // resolution across the part's longest side
const SMOOTH = 1.4;         // corner-cutting tolerance, in cells

// Which way we look at each piece on the board, as [board x, board y] taken
// from the part's own axes. Wheels lie flat (we see them down their axle);
// chain links stand on edge (we look along the hinge pin).
const FLAT = { x: [1, 0, 0], y: [0, -1, 0] };
const EDGE = { x: [0, 0, 1], y: [0, 1, 0] };
const PARTS = {
  '3647.dat': FLAT, '94925.dat': FLAT, '3648b.dat': FLAT, '3649.dat': FLAT,
  '57519.dat': FLAT, '57520.dat': FLAT,
  '4185a.dat': FLAT, '4624.dat': FLAT, '2994.dat': FLAT, '56145.dat': FLAT, '44772.dat': FLAT,
  '3711.dat': EDGE, '57518.dat': EDGE,
};

await Deno.mkdir(CACHE, { recursive: true });

async function load(name) {
  const file = name.replace(/\\/g, '/');
  const local = new URL(file.replace(/\//g, '_'), CACHE);
  try { return await Deno.readTextFile(local); } catch { /* not cached yet */ }
  for (const dir of ['parts/', 'p/', 'parts/s/', 'p/48/']) {
    for (let tries = 0; tries < 6; tries++) {
      const res = await fetch(BASE + dir + file);
      if (res.ok) {
        const text = await res.text();
        await Deno.writeTextFile(local, text);
        await new Promise((r) => setTimeout(r, 150));      // be a good guest
        return text;
      }
      await res.body?.cancel();
      if (res.status !== 429) break;                       // genuinely not there
      await new Promise((r) => setTimeout(r, 1000 * 2 ** tries));  // slow down
    }
  }
  throw new Error('not found: ' + name);
}

const apply = (m, p) => ({
  x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[9],
  y: m[3] * p.x + m[4] * p.y + m[5] * p.z + m[10],
  z: m[6] * p.x + m[7] * p.y + m[8] * p.z + m[11],
});

// child placed inside parent: compose the two matrices.
const compose = (m, c) => {
  const at = (r, k) => m[r * 3] * c[k] + m[r * 3 + 1] * c[3 + k] + m[r * 3 + 2] * c[6 + k];
  const t = apply(m, { x: c[9], y: c[10], z: c[11] });
  return [at(0, 0), at(0, 1), at(0, 2), at(1, 0), at(1, 1), at(1, 2),
          at(2, 0), at(2, 1), at(2, 2), t.x, t.y, t.z];
};

// Every triangle of the part, in part coordinates. Quads become two triangles.
async function facesOf(name, m, out = []) {
  for (const line of (await load(name)).split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f[0] === '1') {
      const c = f.slice(2, 14).map(Number);
      // LDraw writes the translation first and the matrix after it.
      await facesOf(f.slice(14).join(' '), compose(m, [...c.slice(3), ...c.slice(0, 3)]), out);
    } else if (f[0] === '3' || f[0] === '4') {
      const n = f[0] === '3' ? 3 : 4;
      const v = [];
      for (let i = 0; i < n; i++)
        v.push(apply(m, { x: +f[2 + i * 3], y: +f[3 + i * 3], z: +f[4 + i * 3] }));
      out.push([v[0], v[1], v[2]]);
      if (n === 4) out.push([v[0], v[2], v[3]]);
    }
  }
  return out;
}

// Paint the triangles into a grid, one bit per cell.
function raster(tris, box, cell, nx, ny) {
  const grid = new Uint8Array(nx * ny);
  const at = (p) => ({ x: (p[0] - box[0]) / cell, y: (p[1] - box[1]) / cell });
  for (const tri of tris) {
    const p = tri.map(at);
    const lo = Math.max(0, Math.floor(Math.min(p[0].y, p[1].y, p[2].y)));
    const hi = Math.min(ny - 1, Math.ceil(Math.max(p[0].y, p[1].y, p[2].y)));
    for (let y = lo; y <= hi; y++) {
      const mid = y + 0.5, xs = [];
      for (let i = 0; i < 3; i++) {
        const a = p[i], b = p[(i + 1) % 3];
        if ((a.y <= mid) === (b.y <= mid)) continue;
        xs.push(a.x + (b.x - a.x) * (mid - a.y) / (b.y - a.y));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5));
        const to = Math.min(nx - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = from; x <= to; x++) grid[y * nx + x] = 1;
      }
    }
  }
  return grid;
}

// Walk the grid edges that have paint on one side only. Each edge is emitted
// with the painted side on its left, so following them end to end closes a loop
// — the outline, and one more loop for every hole.
function trace(grid, nx, ny) {
  const on = (x, y) => x >= 0 && y >= 0 && x < nx && y < ny && grid[y * nx + x];
  const from = new Map();
  const add = (ax, ay, bx, by) => {
    const key = ax + ',' + ay;
    (from.get(key) ?? from.set(key, []).get(key)).push([bx, by]);
  };
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!on(x, y)) continue;
    if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!on(x - 1, y)) add(x, y + 1, x, y);
    if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!on(x, y - 1)) add(x, y, x + 1, y);
  }
  const loops = [];
  for (const [key, outs] of from) {
    while (outs.length) {
      const loop = [key.split(',').map(Number)];
      let next = outs.pop();
      while (next) {
        loop.push(next);
        const ahead = from.get(next[0] + ',' + next[1]);
        if (!ahead?.length) break;
        next = ahead.pop();
        if (next[0] === loop[0][0] && next[1] === loop[0][1]) break;
      }
      if (loop.length > 8) loops.push(loop);
    }
  }
  return loops;
}

// Douglas-Peucker: drop the points that were only there to make a staircase.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let far = 0, worst = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay);
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = len < 1e-9 ? Math.hypot(px - ax, py - ay)
      : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (d > worst) { worst = d; far = i; }
  }
  if (worst <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, far + 1), tol).slice(0, -1), ...simplify(pts.slice(far), tol)];
}

const result = {};

for (const [name, view] of Object.entries(PARTS)) {
  const dot = (axis, p) => axis[0] * p.x + axis[1] * p.y + axis[2] * p.z;
  const tris = (await facesOf(name, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
    .map((t) => t.map((v) => [dot(view.x, v), dot(view.y, v)]));

  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const v of t) {
    box[0] = Math.min(box[0], v[0]); box[1] = Math.min(box[1], v[1]);
    box[2] = Math.max(box[2], v[0]); box[3] = Math.max(box[3], v[1]);
  }
  const cell = Math.max(box[2] - box[0], box[3] - box[1]) / CELLS;
  const nx = Math.ceil((box[2] - box[0]) / cell) + 2, ny = Math.ceil((box[3] - box[1]) / cell) + 2;
  const origin = [box[0] - cell, box[1] - cell];

  const loops = trace(raster(tris, origin, cell, nx, ny), nx, ny);
  const path = loops.map((loop) => simplify(loop, SMOOTH)
    .map(([x, y], i) => `${i ? 'L' : 'M'}${+(origin[0] + x * cell).toFixed(1)} ` +
                        `${+(origin[1] + y * cell).toFixed(1)}`).join('') + 'Z').join('');

  result[name] = { box: box.map((v) => +v.toFixed(1)), d: path };
  console.log(`${name}: ${loops.length} loops, ${(path.length / 1024).toFixed(1)} kB, ` +
              `${(box[2] - box[0]).toFixed(1)} x ${(box[3] - box[1]).toFixed(1)} LDU`);
}

await Deno.writeTextFile(new URL('../outlines.js', import.meta.url),
  '// Generated by tools/outlines.js from the LDraw parts library (CC BY 4.0).\n' +
  '// Outline of each part, in LDU, already turned the way it sits on the board.\n' +
  'const OUTLINES = ' + JSON.stringify(result, null, 0).replace(/","/g, '",\n"') + ';\n');
