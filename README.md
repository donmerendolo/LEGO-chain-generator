# LEGO chain builder

Double-click `index.html`. Nothing to install, works offline. English and Spanish, switchable
with the flags in the corner.

It is plain static files with relative paths and no build step, so putting the folder on
GitHub Pages (or any static host) works as it stands — mind the picture credits at the
bottom before you make it public.

1. Pick the chain type from its photo.
2. Drag wheels onto the board. **Gears** are the ones made to mesh with the chain you picked;
   **wheels** are plain rims the chain just rides on. They snap to the grid (studs, bricks,
   or free).
   Click one to select it; the panel sets its position, absolute or measured from another
   wheel. `Delete` removes it. The mouse wheel zooms. Moving, adding or removing a wheel
   clears the chain — where it runs is a decision about the wheels as they are now.
3. **Press anywhere on the empty board and draw a loop.** No button, no mode. The loop does
   not have to be neat or touch anything: all that matters is which side of each wheel centre
   you pass. Wheels the loop goes round turn with it, wheels it passes by get pushed against
   from outside and turn the other way — on the side you drew past, so dipping in from above
   and from below give different chains. Wheels the loop leaves alone are ignored. One wheel is
   a chain too — a circle closed on itself. A short click just deselects, so there is nothing
   to undo.

   Draw a crossing and you get a crossing. A real chain in one plane cannot do it — the two
   strands would want the same spot — but nobody crosses a loop by accident, so it is built
   as drawn rather than argued with.
4. Set the number of links. Everything else follows: the thickness *t*, which is how far the
   pin line ends up off the pitch circle, is reported as the sanity check — if it comes out
   large, the chain is slack.
5. Links can be turned round or flipped onto their other face; both show on the board.
6. **💾 Save .ldr** and open it in Stud.io or LDView.

Check the maths (the spec's reference case: four wheels, 27 links):

```bash
deno run --allow-read test.js
```

## What is where

| file | what it does |
|---|---|
| `i18n.js` | interface strings; copy a block to add a language |
| `parts.js` | part catalogue and nominal pitches |
| `outlines.js` | generated: each part's outline, from the LDraw library |
| `geometry.js` | common tangents, arcs, the taut chain path |
| `routing.js` | freehand loop → route: winding counts for the topology, exact paths for the rest |
| `solver.js` | spacing the links out and closing the chain |
| `ldraw.js` | `.ldr` export |
| `app.js` | interface |
| `tools/outlines.js` | rebuilds `outlines.js`; only needed if you add a part |

Everything is measured in **studs** (8 mm, 20 LDU) with Y pointing up. The conversion to
LDraw, which has Y pointing down, happens only on export.

The exported origin sits at the centre of the first wheel, on its near face, so the model
rests at z ≥ 0. The `.ldr` also carries a `0 FILE` header, which makes it valid `.mpd`.

## Where the pictures come from

On the board every piece is drawn from its **real LDraw part**: `tools/outlines.js` walks the
part's subfile tree, flattens the surfaces, projects them the way the piece sits and traces
the outline — the silhouette plus any hole that goes clean through. That also settles how big
each part is, so nothing in the catalogue has to state a diameter. Adding a wheel means
putting its part number in `parts.js` and `tools/outlines.js` and rerunning the generator.
The LDraw parts library is CC BY 4.0 — https://www.ldraw.org.

The palette photos in `img/` are BrickLink catalogue images, bundled so the tool needs no
network. They belong to their respective owners; swap them if you plan to share this.
