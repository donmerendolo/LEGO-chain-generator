# LEGO chain generator

Draw a loop around some gears and get the chain that fits as an `.ldr`.

<div align="center">
  <p float="left">
    <img src="chain-generator.png" width="90%">
  </p>
</div>

## Usage

You can use it in https://donmerendolo.github.io/LEGO-chain-generator/ or locally, cloning the repo and opening `index.html`.

```bash
# check the math
deno run --allow-read test.js
# rebuild the part pictures
deno run --allow-net --allow-read --allow-write tools/outlines.js
```

---

## Licence

The code is [GPL-3.0](LICENSE.md).

`outlines.js` and everything in `img/` are generated from the
[LDraw parts library](https://www.ldraw.org), which is **CC BY 4.0**.

