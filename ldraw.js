// .ldr export. LDraw has Y pointing down and 20 LDU to the stud.
//
// The origin goes at the centre of the first wheel, on its near face, so the
// whole model sits at z >= 0 and drops straight onto a plate. (Nothing in the
// format demands an origin: a file is just parts with coordinates.)

const num = (v) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(4));

function toLDR(state, res) {
  const chain = CHAINS[state.chain];
  const ref = state.wheels[0] ?? { x: 0, y: 0 };
  const z = LDU * WHEEL_THICKNESS / 2;
  const X = (x) => num((x - ref.x) * LDU);
  const Y = (y) => num(-(y - ref.y) * LDU);

  const out = [
    '0 FILE chain.ldr',
    '0 Made with the LEGO chain builder',
    '0 Name: chain.ldr',
    '0 // origin: centre of the first wheel, on its near face',
    '0 // Stud.io will flag false collisions between links and teeth. Ignore them.',
  ];

  for (const w of state.wheels)
    out.push(`1 ${w.colour} ${X(w.x)} ${Y(w.y)} ${num(z)} 1 0 0 0 1 0 0 0 1 ${w.part}`);

  for (const p of linkPlacements(res.joints, chain.pitch, state.linkReverse)) {
    // Work out the direction after the Y flip: mirroring changes its sign.
    const dx = p.ux, dy = -p.uy, f = state.linkFlip ? -1 : 1;
    // Columns are the images of the piece's own axes: X = hinge, Z = length.
    out.push(`1 0 ${X(p.x)} ${Y(p.y)} ${num(z)} ` +
             `0 ${num(f * dy)} ${num(dx)} 0 ${num(-f * dx)} ${num(dy)} ${f} 0 0 ${chain.part}`);
  }
  out.push('0');
  return out.join('\n');
}
