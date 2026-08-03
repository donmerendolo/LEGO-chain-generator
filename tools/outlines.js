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
// …and what colour it is, so the palette picture looks like the part. These are
// the LDraw colours: light bluish grey, dark bluish grey, black.
const GREY = '#A0A5A9', DARK = '#6C6E68', BLACK = '#1B2A34';
const PARTS = {
  '3647.dat': [FLAT, DARK], '94925.dat': [FLAT, GREY], '3648b.dat': [FLAT, DARK],
  '3649.dat': [FLAT, GREY], '57519.dat': [FLAT, GREY], '57520.dat': [FLAT, GREY],
  '4185a.dat': [FLAT, GREY], '4624.dat': [FLAT, GREY], '2994.dat': [FLAT, GREY],
  '56145.dat': [FLAT, GREY], '44772.dat': [FLAT, GREY],
  '3711.dat': [EDGE, BLACK], '57518.dat': [EDGE, BLACK],
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

// ─── the palette picture ────────────────────────────────────────────────────
//
// The same triangles, but shaded and painted instead of traced, and seen from a
// corner rather than straight on, so the part has some thickness to it. Lit from
// over your shoulder, nearest triangle wins. It is the real part in its real
// colour, and coming out of the LDraw model there is nobody's photo involved.

const SHOT = 160;           // pixels across the finished picture
const OVER = 3;             // drawn this many times bigger, then averaged down
const TURN = Math.PI / 4;             // swing the camera round…
const TIP = -Math.atan(Math.SQRT1_2); // …and tip it down: plain isometric

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((c) => c / n); };

// Swing the camera round the part's up-axis, then tip it down towards the top.
function fromACorner(view) {
  const blend = (a, b, ca, cb) => unit(a.map((v, i) => v * ca + b[i] * cb));
  const out = unit(cross(view.x, view.y));
  const x = blend(view.x, out, Math.cos(TURN), Math.sin(TURN));
  const swung = blend(out, view.x, Math.cos(TURN), -Math.sin(TURN));
  const y = blend(view.y, swung, Math.cos(TIP), Math.sin(TIP));
  return { x, y, out: unit(cross(x, y)) };
}

function shade(solid, straightOn, colour) {
  const size = SHOT * OVER;
  const view = fromACorner(straightOn);
  const dot = (axis, p) => axis[0] * p.x + axis[1] * p.y + axis[2] * p.z;
  const lamp = unit([0, 1, 2].map((i) =>
    view.out[i] * 0.8 - view.x[i] * 0.4 + view.y[i] * 0.45));
  const rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));

  const tris = solid.map((t) => ({
    at: t.map((v) => ({ x: dot(view.x, v), y: dot(view.y, v) })),
    z: t.map((v) => dot(view.out, v)),
    n: unit(cross([t[1].x - t[0].x, t[1].y - t[0].y, t[1].z - t[0].z],
                  [t[2].x - t[0].x, t[2].y - t[0].y, t[2].z - t[0].z])),
  }));

  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const v of t.at) {
    box[0] = Math.min(box[0], v.x); box[1] = Math.min(box[1], v.y);
    box[2] = Math.max(box[2], v.x); box[3] = Math.max(box[3], v.y);
  }
  const span = Math.max(box[2] - box[0], box[3] - box[1]) * 1.06;
  const scale = size / span;
  const midX = (box[0] + box[2]) / 2, midY = (box[1] + box[3]) / 2;
  const at = (p) => [size / 2 + (p.x - midX) * scale, size / 2 - (p.y - midY) * scale];

  const pixels = new Uint8Array(size * size * 4);
  const depth = new Float64Array(size * size).fill(-Infinity);

  for (const tri of tris) {
    const lit = Math.abs(tri.n[0] * lamp[0] + tri.n[1] * lamp[1] + tri.n[2] * lamp[2]);
    const tone = 0.42 + 0.58 * lit;
    const p = tri.at.map(at);
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1])
               - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    const lo = [Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0]))),
                Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])))];
    const hi = [Math.min(size - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0]))),
                Math.min(size - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])))];
    for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((p[1][0] - px) * (p[2][1] - py) - (p[2][0] - px) * (p[1][1] - py)) / area;
      const w1 = ((p[2][0] - px) * (p[0][1] - py) - (p[0][0] - px) * (p[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * tri.z[0] + w1 * tri.z[1] + w2 * tri.z[2];
      const k = y * size + x;
      if (z <= depth[k]) continue;
      depth[k] = z;
      pixels[k * 4] = rgb[0] * tone; pixels[k * 4 + 1] = rgb[1] * tone;
      pixels[k * 4 + 2] = rgb[2] * tone; pixels[k * 4 + 3] = 255;
    }
  }

  // Average the oversampled buffer down, which is where the smooth edges come from.
  const out = new Uint8Array(SHOT * SHOT * 4);
  for (let y = 0; y < SHOT; y++) for (let x = 0; x < SHOT; x++) {
    const sum = [0, 0, 0, 0];
    for (let j = 0; j < OVER; j++) for (let i = 0; i < OVER; i++) {
      const k = ((y * OVER + j) * size + x * OVER + i) * 4;
      for (let c = 0; c < 4; c++) sum[c] += pixels[k + c];
    }
    const k = (y * SHOT + x) * 4;
    // Undo the premultiplication that averaging transparent pixels causes.
    const cover = sum[3] / (OVER * OVER * 255);
    for (let c = 0; c < 3; c++) out[k + c] = cover ? sum[c] / (OVER * OVER) / cover : 0;
    out[k + 3] = sum[3] / (OVER * OVER);
  }
  return out;
}

// A PNG, by hand: header, one deflated block of rows, end.
const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

async function png(size, rgba) {
  const rows = new Uint8Array((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    rows.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  const body = new Uint8Array(await new Response(new Blob([rows]).stream()
    .pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const head = new Uint8Array(13);
  new DataView(head.buffer).setUint32(0, size);
  new DataView(head.buffer).setUint32(4, size);
  head.set([8, 6, 0, 0, 0], 8);                    // 8 bits, RGBA, no interlace
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
                 chunk('IHDR', head), chunk('IDAT', body), chunk('IEND', new Uint8Array())];
  const file = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { file.set(p, at); at += p.length; }
  return file;
}

const result = {};
await Deno.mkdir(new URL('../img/', import.meta.url), { recursive: true });

for (const [name, [view, colour]] of Object.entries(PARTS)) {
  const dot = (axis, p) => axis[0] * p.x + axis[1] * p.y + axis[2] * p.z;
  const solid = await facesOf(name, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const tris = solid.map((t) => t.map((v) => [dot(view.x, v), dot(view.y, v)]));

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

  const shot = await png(SHOT, shade(solid, view, colour));
  await Deno.writeFile(new URL('../img/' + name.replace('.dat', '.png'), import.meta.url), shot);

  result[name] = { box: box.map((v) => +v.toFixed(1)), d: path };
  console.log(`${name}: ${loops.length} loops, ${(path.length / 1024).toFixed(1)} kB outline, ` +
              `${(shot.length / 1024).toFixed(1)} kB picture, ` +
              `${(box[2] - box[0]).toFixed(1)} x ${(box[3] - box[1]).toFixed(1)} LDU`);
}

await Deno.writeTextFile(new URL('../outlines.js', import.meta.url),
  '// Generated by tools/outlines.js from the LDraw parts library (CC BY 4.0).\n' +
  '// Outline of each part, in LDU, already turned the way it sits on the board.\n' +
  'const OUTLINES = ' + JSON.stringify(result, null, 0).replace(/","/g, '",\n"') + ';\n');
