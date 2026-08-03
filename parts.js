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
    wheels: [
      { part: '3647.dat', teeth: 8, colour: 72 },
      { part: '94925.dat', teeth: 16, colour: 71 },
      { part: '3648b.dat', teeth: 24, colour: 72 },
      { part: '3649.dat', teeth: 40, colour: 71 },
    ],
  },

  '57518': {
    // ponytail: the tread pitch is unverified against the real part. The two
    // sprockets take their size from the LDraw model, so only this number is a
    // guess; drop the true one in when you have it.
    part: '57518.dat', pitch: 2,
    wheels: [
      { part: '57519.dat', colour: 71 },
      { part: '57520.dat', colour: 71 },
    ],
  },
};

// Wheels with nothing to mesh with: the chain just rides on the rim, so all
// that matters is how big they are, and the LDraw model already says. To add
// one, put its part number here and in tools/outlines.js, then rerun that.
const PLAIN_WHEELS = [
  { part: '4624.dat', colour: 71 },
  { part: '4185a.dat', colour: 71 },
  { part: '2994.dat', colour: 71 },
  { part: '56145.dat', colour: 71 },
  { part: '44772.dat', colour: 71 },
];

// How big the piece is drawn, straight from its outline.
const drawnRadius = (wheel) => Math.max(...OUTLINES[wheel.part].box.map(Math.abs)) / LDU;

// A geared wheel rides the chain on its pitch circle: z/2 mm = z/16 studs.
// Anything else carries the chain on its rim.
const pitchRadius = (wheel) => (wheel.teeth ? wheel.teeth / 16 : drawnRadius(wheel));

// The real obstacle is the root circle, not the pitch circle: z/2 - 1.2 mm. A
// plain wheel gets the same 1.2 mm allowance, because the links are straight
// and always cut a little inside the circle they ride on.
const rootRadius = (wheel) =>
  Math.max(0.1, (wheel.teeth ? wheel.teeth / 2 - 1.2 : wheel.R * 8 - 1.2) / 8);
