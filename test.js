// deno run --allow-read test.js  — reference case from spec §9, in studs (1 stud = 8 mm).
// The browser files are plain scripts sharing one scope, no imports and no build
// step. Run them as one and hand back the few names the test needs.
(0, eval)(['i18n.js', 'geometry.js', 'routing.js', 'solver.js']
  .map((f) => Deno.readTextFileSync(new URL(f, import.meta.url))).join('\n')
  + '\nObject.assign(globalThis, { TAU, tangent, buildPath, routeFromStroke, solveChain, pathOf });');

const ok = (name, got, want, tol) => {
  if (!(Math.abs(got - want) <= tol)) throw new Error(`${name}: ${got} != ${want}`);
  console.log(`ok  ${name} = ${got.toFixed(5)}`);
};
const same = (name, got, want) => {
  if (got !== want) throw new Error(`${name}: ${got} != ${want}`);
  console.log(`ok  ${name} = ${got}`);
};

// A tangent is parallel to u and exactly L long, for all four sign cases.
for (const [si, sj] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  const tg = tangent({ x: 0, y: 0 }, 1.5, si, { x: 5, y: 2 }, 1.0, sj);
  const dx = tg.Pj.x - tg.Pi.x, dy = tg.Pj.y - tg.Pi.y;
  ok(`tangent ${si}/${sj} length`, Math.hypot(dx, dy), tg.L, 1e-9);
  ok(`tangent ${si}/${sj} parallel`, dx * tg.u.y - dy * tg.u.x, 0, 1e-9);
}

// 24t at (0, ±3), 16t at (±2, 0): the small ones sit outside the loop.
const centres = [[0, 3, 1.5, 1], [-2, 0, 1, -1], [0, -3, 1.5, 1], [2, 0, 1, -1]];
const nodes = (extra) => centres.map(([x, y, R, s]) => ({ c: { x, y }, R: R + extra, s }));
const path = buildPath(nodes(0));
ok('straight run (mm)', path.parts[1].len * 8, 20.7846, 1e-3);
// Spec §9 prints 200.431 / -20.431, but those do not match its own L_tot (they
// would give 172.8005 mm). 200.4156 does, so that is the right value.
ok('sweep on 24t (deg)', path.parts[0].sweep * 180 / Math.PI, 200.4156, 1e-3);
ok('sweep on 16t (deg)', path.parts[2].sweep * 180 / Math.PI, -20.4156, 1e-3);
ok('one full turn', path.turn / TAU, 1, 1e-12);
ok('total length (mm)', path.total * 8, 172.7895, 1e-3);

// A lazy oval nowhere near the wheels must still give the exact route: it only
// has to enclose the 24t centres and pass inside the 16t ones.
const discs = centres.map(([x, y, R]) => ({ c: { x, y }, R }));
let seed = 12345;                                   // fixed, so a failure repeats
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
const oval = (jitter) => Array.from({ length: 60 }, (_, i) => {
  const a = TAU * i / 60;
  return { x: 0.9 * Math.cos(a) + rnd() * jitter, y: 4.6 * Math.sin(a) + rnd() * jitter };
});
// The route is cyclic, so line it up on wheel 0 before comparing.
const asText = (route) => {
  const k = route.findIndex((r) => r.wheel === 0);
  return [...route.slice(k), ...route.slice(0, k)].map((r) => `${r.wheel}${r.s > 0 ? '+' : '-'}`).join(' ');
};
for (const jitter of [0, 0.3, 0.6])
  same(`route from a sloppy oval (jitter ${jitter})`, asText(routeFromStroke(oval(jitter), discs)), '0+ 1- 2+ 3-');
// Drawn the other way round: same chain, mirrored senses.
same('drawn clockwise', asText(routeFromStroke(oval(0).reverse(), discs)), '0- 3+ 2- 1+');

// Whatever the drawing says topologically has to survive: a plain loop, a
// crossed one, or several laps. Two wheels, so the shapes are easy to write.
const pair = [{ c: { x: -3, y: 0 }, R: 1 }, { c: { x: 3, y: 0 }, R: 1 }];
const shape = (n, f) => Array.from({ length: n }, (_, i) => f(TAU * i / n));
const topology = (name, pts) => {
  const route = routeFromStroke(pts, pair);
  const p = buildPath(route.map((r) => ({ c: pair[r.wheel].c, R: pair[r.wheel].R, s: r.s })));
  return `${asText(route)} | ${(p.turn / TAU).toFixed(2)} turns | ${p.total.toFixed(2)} studs`;
};
same('plain loop  ', topology('plain', shape(80, (a) => ({ x: 5 * Math.cos(a), y: 2.2 * Math.sin(a) }))),
  '0+ 1+ | 1.00 turns | 18.28 studs');
// A crossed belt is not a thing a flat chain can do, but it is a thing people
// draw, so it is built as drawn rather than turned down. Nobody crosses a loop
// by accident.
same('figure eight', topology('eight', shape(120, (a) =>
  ({ x: 5 * Math.sin(a), y: 4.4 * Math.sin(a) * Math.cos(a) }))),
  '0+ 1- | 0.00 turns | 18.96 studs');

// One wheel is a chain too: a circle closed on itself.
same('round a single wheel', asText(routeFromStroke(
  shape(60, (a) => ({ x: -3 + 2.5 * Math.cos(a), y: 2.5 * Math.sin(a) })), pair)), '0+');
ok('circle length', pathOf([{ wheel: 0, s: 1 }], pair).total, TAU, 1e-9);
// A real drawing that used to come out wrong: a big careless loop round four
// wheels, one of them well off to the side, and a fifth sitting in the middle
// that the chain should sail straight past. The loop is nowhere near any of them.
const spread = [{ x: -11, y: 6, R: 1 }, { x: 0, y: 3, R: 1.5 }, { x: 0, y: -3, R: 1.5 },
                { x: 2, y: 0, R: 1 }, { x: -4, y: 1, R: 1 }]
  .map((w) => ({ c: { x: w.x, y: w.y }, R: w.R }));
const big = shape(90, (a) => ({ x: -4.5 + 10 * Math.cos(a), y: 1.5 + 8 * Math.sin(a) }));
const wide = routeFromStroke(big, spread);
same('big loop, wheel far out', asText(wide), '0+ 2+ 3+ 1+');
ok('big loop length', pathOf(wide, spread).total, 40.39, 0.01);

// The other drawing that used to come out empty: the loop dips in to pass on
// the near side of a wheel that sits well inside it, so that wheel pushes the
// chain in instead of being wrapped by it. Nothing here runs into anything, so
// the only clue is that the chain would otherwise swallow it whole.
const notch = [[-6, 2], [0, 0], [7, 1], [0, -4]].map(([x, y]) => ({ c: { x, y }, R: 1 }));
const dip = [[-5.5, 4.2], [-8, 3], [-9, 0], [-8, -4], [-4, -6.5], [2, -7], [7, -6], [10, -3],
             [10.5, 1], [9, 3.5], [6, 4], [3, 2.5], [1.5, 0.4], [0, -1.7], [-1.5, 0.4], [-2, 3],
             [-2.2, 4.3]].map(([x, y]) => ({ x, y }));
// Where that wheel goes in the route is the drawing's word, read off by pulling
// the stroke taut. Only corners where the string really leans on a wheel count:
// one merely fenced in by a shortcut is not a contact, and counting those put
// wheels in the route twice, in places the pencil never went.
const pushed = routeFromStroke(dip, notch);
same('wheel pushing the chain in', asText(pushed), '0+ 3+ 2+ 1-');
ok('pushed chain length', pathOf(pushed, notch).total, 38.30, 0.01);

// A wheel sitting deep inside the loop, that the chain has to dip in and lean
// on. Which way it dips is the drawing's call, not the shortest one's: the
// chain must touch the wheel on the side the stroke went past it.
const deep = [{ x: -8, y: 0, R: 2 }, { x: 8, y: 0, R: 2 }, { x: 0, y: 0, R: 1 }]
  .map((w) => ({ c: { x: w.x, y: w.y }, R: w.R }));
const dipping = (fromTop) => shape(120, (a) => {         // an oval with one dent
  const p = { x: 11 * Math.cos(a), y: 5 * Math.sin(a) };
  const near = Math.max(0, 1 - Math.abs(p.x) / 4);       // only near the middle
  if (fromTop && p.y > 0) p.y -= near * 6.5;             // top edge dips under the wheel
  if (!fromTop && p.y < 0) p.y += near * 6.5;            // bottom edge dips over it
  return p;
});
// Same wheels, same lengths, two different chains: the dent decides which leg
// gets pushed in, so the middle wheel lands on the other side of the route.
for (const [fromTop, want] of [[true, '0+ 1+ 2-, touched underneath'],
                               [false, '0+ 2- 1+, touched on top']]) {
  const route = routeFromStroke(dipping(fromTop), deep);
  const arc = pathOf(route, deep).parts[2 * route.findIndex((r) => r.wheel === 2)];
  const mid = arc.th0 + arc.sweep / 2;                   // middle of the wrap
  same(`dent in the ${fromTop ? 'top' : 'bottom'} edge`,
    `${asText(route)}, touched ${Math.sin(mid) < 0 ? 'underneath' : 'on top'}`, want);
}

const res = solveChain((extra) => buildPath(nodes(extra)), 27, 0.8);
// The spec gets t* = 0.0014 mm from the least-squares fit of §5, which straddles
// the curve. Here the joints sit on it, so the polygon is inscribed and the
// offset soaks up the sagitta: ~0.14 mm, constant, far below the 0.31 mm slack mark.
ok('thickness (mm)', res.offset * 8, 0.14, 0.02);
ok('closes (studs)', res.gap, 0, 1e-9);
res.joints.forEach((v, i) => {
  const w = res.joints[(i + 1) % res.joints.length];
  if (Math.abs(Math.hypot(w.x - v.x, w.y - v.y) - 0.8) > 1e-9) throw new Error('link ' + i);
});
console.log(`ok  ${res.joints.length} links of exactly 0.8 studs`);

// Every link's far pin must land on another link's origin — whichever way the
// piece runs from its origin, and whichever way round you turn it.
for (const runsBack of [false, true]) for (const reverse of [false, true]) {
  const place = linkPlacements(res.joints, 0.8, runsBack, reverse);
  const away = runsBack ? -0.8 : 0.8;
  const worst = Math.max(...place.map((p) => Math.min(...place.map((q) =>
    Math.hypot(p.x + p.ux * away - q.x, p.y + p.uy * away - q.y)))));
  ok(`pins land on pins (runsBack=${runsBack}, reverse=${reverse})`, worst, 0, 1e-9);
}

// Six wheels, and a stroke that necks in past one of them. The wheel it necks
// past has to be wedged into the leg it actually leans on: the alternatives make
// the chain dive in, half-wrap it and run eleven studs longer.
const many = [[-9, 8, 1], [-4, 5, 1], [4, 5.4, 2.5], [-15, -2.9, 2.5], [-4, -0.85, 1.5], [1, -2.85, 0.5]]
  .map(([x, y, R]) => ({ c: { x, y }, R }));
const necking = [[-10.1, 11.1], [-7, 10.7], [-5.6, 8.4], [-5.2, 5.6], [-5, 3.5], [-3.6, 3], [-1.8, 4.8],
  [0.3, 7.1], [2.4, 9.4], [4.7, 10.3], [7.3, 9.4], [9.1, 7.1], [9.8, 4.8], [9.4, 2.5], [8.3, 0.2],
  [6, -1.9], [3.9, -3.9], [2.1, -5.2], [0.3, -5.5], [-1.3, -5.2], [-2.5, -4.2], [-3.5, -2.6],
  [-4.1, -0.9], [-4.4, 1.1], [-4.6, 2.2], [-5.4, 2.6], [-6.2, 2.2], [-6.3, -2.6], [-6, -4.9],
  [-4.6, -5.7], [-3.7, -6], [-6.8, -6.6], [-10.9, -7.1], [-14.3, -6.2], [-16.6, -6.2], [-18.5, -4.8],
  [-19.9, -3.2], [-20.1, -1.1], [-19.2, 0.9], [-17.4, 3], [-15.1, 5.3], [-13, 7.6], [-11.4, 9.7]]
  .map(([x, y]) => ({ x, y }));
const necked = routeFromStroke(necking, many);
same('necked in past a wheel', asText(necked), '0- 1+ 2- 5- 3-');
ok('necked chain length', pathOf(necked, many).total, 65.55, 0.01);

// A wheel really can be touched twice. A big one flanked by two small ones on
// the same line gets wrapped on both flanks, in two separate arcs, and nothing
// crosses. Cutting the route at the first repeated wheel wrecked this.
const flanked = [[0, 4, 0.5], [0, 0, 2.5], [0, -4, 0.5]]
  .map(([x, y, R]) => ({ c: { x, y }, R }));
const round3 = shape(80, (a) => ({ x: 3.6 * Math.cos(a), y: 5.5 * Math.sin(a) }));
const twice = routeFromStroke(round3, flanked);
same('big wheel touched twice', asText(twice), '0+ 1+ 2+ 1+');
ok('flanked chain length', pathOf(twice, flanked).total, 21.19, 0.01);

// Small wheels close together take the closing search through configurations
// that have no path at all. Scanning the range finds the answer between them;
// testing only the ends of a widening interval went blind and gave up.
const tight = [[0, 2.2, 0.5], [0, -2.2, 0.5], [4, 0, 0.5]]
  .map(([x, y, R]) => ({ c: { x, y }, R }));
const nodes3 = (t) => tight.map((d) => ({ c: d.c, R: d.R + t, s: 1 }));
const round4 = solveChain((t) => buildPath(nodes3(t)),
  Math.round(buildPath(nodes3(0)).total / 0.8), 0.8);
same('closes with wheels one stud apart', round4.error ?? 'closed', 'closed');
ok('their offset', round4.offset, 0, 0.2);

// A tail of the stroke that reaches up past a wheel and comes back: the string
// catches on that wheel near the end of a lap and only lets go early in the
// next one. With nothing after it, the wheel stayed in the chain and made it
// cross itself, out of a stroke that never crossed.
const tail = [[0, 0, 2.5], [-1.1, 4.9, 1], [4.9, 10.8, 2.5]]
  .map(([x, y, R]) => ({ c: { x, y }, R }));
const teardrop = [[3.2, 15.5], [0.5, 14.5], [-2, 12], [-4, 9.5], [-5.2, 6], [-5.4, 2], [-4.5, -1.5],
  [-2.5, -3.5], [0.5, -4.2], [3, -3.3], [4.3, -0.6], [4.5, 1.7], [4.4, 4], [4.3, 6.9], [3.6, 9.4],
  [3.1, 10.8], [2.7, 12.1], [2.9, 14]].map(([x, y]) => ({ x, y }));
const dropped = routeFromStroke(teardrop, tail);
same('a tail that touches nothing', asText(dropped), '0+ 1+');
ok('tail chain length', pathOf(dropped, tail).total, 21.49, 0.01);
