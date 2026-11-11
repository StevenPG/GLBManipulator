// Generates examples/models/misaligned-car.glb: a blocky "car" that is
// deliberately wrong in the ways purchased models often are. It is Z-up, its
// nose points along +X, and it sits several metres away from the origin.
//
//   npm run sample
import { Document, NodeIO } from '@gltf-transform/core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'models/misaligned-car.glb');

const doc = new Document();
const buffer = doc.createBuffer();

function box([x0, y0, z0], [x1, y1, z1], color, name) {
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
  const material = doc.createMaterial(name).setBaseColorFactor([...color, 1]).setRoughnessFactor(0.6);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setArray(new Uint16Array(i)).setBuffer(buffer))
    .setMaterial(material);
}

const mesh = doc
  .createMesh('car')
  .addPrimitive(box([7, 3, 2], [11, 4.8, 2.8], [0.15, 0.35, 0.85], 'body'))
  .addPrimitive(box([8.6, 3.2, 2.8], [10.0, 4.6, 3.4], [0.85, 0.9, 0.95], 'cabin')) // toward the nose
  .addPrimitive(box([10.9, 3.3, 2.3], [11.05, 4.5, 2.5], [1, 0.85, 0.3], 'headlights'));
doc.createScene('scene').addChild(doc.createNode('car').setMesh(mesh));

await new NodeIO().write(out, doc);
console.log(`wrote ${out}`);
