# Examples

| File | What it is |
| --- | --- |
| [`models/misaligned-car.glb`](models) | A blocky test "car" that is Z-up, points along +X and sits away from the origin. Drop it into the UI to try the controls. |
| [`make-sample.js`](make-sample.js) | Generates that model (`npm run sample`). |
| [`docker-compose.ghcr.yml`](docker-compose.ghcr.yml) | Runs the published image with Compose. |

## Calling the API directly

Start the server (`npm start` or Docker), then `POST` a GLB to `/api/realign`.
The response body is the new GLB.

| Request header | Required | Value |
| --- | --- | --- |
| `x-matrix` | yes | JSON array of 16 numbers: a 4×4 transform in column-major (glTF) order. Use the identity to change nothing. |
| `x-bake` | no | `1` to write the transform into the vertices. |
| `x-optimize` | no | JSON object, see below. |

`x-optimize` fields, all optional:

```jsonc
{
  "simplify":    { "ratio": 0.5, "error": 0.01 },      // keep 50% of triangles, max 1% deviation
  "textures":    { "maxSize": 1024, "webp": true },    // cap resolution, convert to WebP
  "compression": "draco"                               // "keep" | "none" | "draco" | "meshopt"
}
```

| Response header | Value |
| --- | --- |
| `x-stats` | `{"bytesBefore", "bytesAfter", "trianglesBefore", "trianglesAfter"}` |
| `x-baked` | `1` if the transform was baked |
| `x-bake-skipped` | Why baking was skipped, when it was |

Errors come back as plain text with a 4xx or 5xx status.

### Fix the sample car

It is Z-up with its nose along +X. This matrix maps X to +Z, Y to +X and Z to
+Y, then moves it onto the origin and the ground:

```sh
curl -X POST http://127.0.0.1:5199/api/realign \
  -H 'x-matrix: [0,0,1,0, 1,0,0,0, 0,1,0,0, -3.9,-2,-9.025,1]' \
  --data-binary @examples/models/misaligned-car.glb \
  -o car_aligned.glb
```

### Shrink a model without moving it

```sh
curl -X POST http://127.0.0.1:5199/api/realign \
  -H 'x-matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]' \
  -H 'x-optimize: {"simplify":{"ratio":0.3,"error":0.02},"textures":{"maxSize":1024,"webp":true},"compression":"meshopt"}' \
  --data-binary @model.glb -o model_small.glb -D - | grep -i x-stats
```

### Apply one fix to a folder of models

Useful when every model from one seller is off in the same way:

```sh
mkdir -p fixed
for f in models/*.glb; do
  curl -sf -X POST http://127.0.0.1:5199/api/realign \
    -H 'x-matrix: [0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1]' \
    --data-binary @"$f" -o "fixed/$(basename "$f")" || echo "failed: $f"
done
```

A fixed matrix like this rotates but cannot recenter each model, because the
centre differs per file. Centering needs the UI.

### Use the pipeline from Node

```js
import { readFile, writeFile } from 'node:fs/promises';
import { realignBinary } from './server/realign.js';

const input = new Uint8Array(await readFile('model.glb'));
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const { glb, stats } = await realignBinary(input, identity, {
  optimize: { simplify: { ratio: 0.5, error: 0.01 } },
});
await writeFile('model_small.glb', glb);
console.log(stats);
```
