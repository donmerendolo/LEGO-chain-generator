// Part catalogue. The unit everywhere is the stud (8 mm = 20 LDU).
//
// Every piece is drawn from its real LDraw outline, on the board and in the
// palette alike, looked up in outlines.js by its `part` name — which is also
// where its size comes from, so nothing here has to state a diameter.
//
// `colour` is the LDraw colour code: 71 light bluish grey, 72 dark bluish grey,
// 0 black.

const LDU = 20;          // LDU per stud
const BRICK = 1.2;       // a brick is 24 LDU tall, a stud 20 wide

// Only used to put the exported origin on a wheel face instead of halfway
// through it. True for the 16t/24t/40t gears.
const WHEEL_THICKNESS = 1;

const CHAINS = {
  '3711': {
    part: '3711.dat', pitch: 0.8,   // 16 LDU, from 3711.dat
    // A module 1 gear: the chain rides its pitch circle, z/2 mm = z/16 studs.
    radius: (w) => w.teeth / 16,
    wheels: [
      { part: '3647.dat', teeth: 8, colour: 72 },
      { part: '94925.dat', teeth: 16, colour: 71 },
      { part: '3648b.dat', teeth: 24, colour: 72 },
      { part: '3649.dat', teeth: 40, colour: 71 },
    ],
  },

  '57518': {
    // 30 LDU. Not from the tread itself but from its two sprockets, which have
    // 10 and 6 teeth and only agree on one pitch: at 1.5 studs the pin circle
    // lands between valley and tip on both, Ø4.85 and Ø3.00. Two parts drawn
    // years apart agreeing on a round number is not a coincidence.
    part: '57518.dat', pitch: 1.5,
    // A sprocket seats one link per tooth, so the pins sit on the circle that
    // fits z chords of the pitch.
    radius: (w, pitch) => pitch / (2 * Math.sin(Math.PI / w.teeth)),
    wheels: [
      { part: '57519.dat', teeth: 10, colour: 71 },
      { part: '57520.dat', teeth: 6, colour: 71 },
    ],
  },
};

// Wheels with nothing to mesh with: the chain just rides on the rim, so all
// that matters is how big they are, and the LDraw model already says. To add
// one, put its part number here and in tools/outlines.js, then rerun that.
const PLAIN_WHEELS = [
  { part: '18654.dat', colour: 72 },
  { part: '4624.dat', colour: 71 },
  { part: '42610.dat', colour: 71 },
  { part: '13971.dat', colour: 71 },
  { part: '4185a.dat', colour: 71 },
  { part: '2994.dat', colour: 71 },
  { part: '56145.dat', colour: 71 },
  { part: '44772.dat', colour: 71 },
];

// Which way a link lies from the joint it hangs on. The 3711 runs forward from
// its origin, the tread plate backwards, and the outline's own box says so: the
// side its bulk sits on. Getting this wrong turns the drawing — and the export —
// round by one link, which only shows where the chain bends.
const linkRunsBack = (chain) => {
  const box = OUTLINES[chain.part].box;
  return box[0] + box[2] < 0;
};

// A tread plate hangs to one side of its pins and that side has to be the
// outside of the loop, or the plates pile into each other on every bend. Which
// side is out depends on which way round you drew, so the default follows the
// chain rather than the piece; the checkbox is left as an override.
const linkFacesIn = (chain, path) => !!path && path.turn < 0;

// How big the piece is drawn, straight from its outline.
const drawnRadius = (wheel) => Math.max(...OUTLINES[wheel.part].box.map(Math.abs)) / LDU;

// Toothed wheels ride the chain on a pitch circle their chain works out; a
// plain rim carries it on the rim itself. Grooved wheels included: a chain is
// always set up so it cannot wander sideways, so it sits on the rim.
const pitchRadius = (wheel, chain) =>
  (wheel.teeth ? chain.radius(wheel, chain.pitch) : drawnRadius(wheel));

// What the chain must not run into: the valley between the teeth, measured off
// the part rather than guessed. On a plain rim there is no valley, so it falls
// back to 1.2 mm of slack — the links are straight and always cut a little
// inside any circle they ride on.
const rootRadius = (wheel) =>
  Math.max(0.1, Math.min(OUTLINES[wheel.part].root / LDU, wheel.R - 0.15));
