// Round-trip check: build a model with a shared (instanced) mesh, realign it
// both ways, and confirm the world-space bounds land where the matrix says.
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { getIO, realignBinary } from '../server/realign.js';

function buildDoc({ draco = false } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  // A 4 x 1 x 2 box-ish tetra, off-centre.
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([10, 5, 3, 14, 5, 3, 10, 6, 5, 14, 6, 5]))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 1, 3, 2]))
    .setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
  const mesh = doc.createMesh('body').addPrimitive(prim);
  const a = doc.createNode('a').setMesh(mesh);
  const b = doc.createNode('b').setMesh(mesh).setTranslation([0, 0, 20]).setScale([1, 2, 1]);
  const parent = doc.createNode('parent').setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]).addChild(a).addChild(b);
  doc.createScene('scene').addChild(parent);
  if (draco) {
    doc.createExtension(KHRDracoMeshCompression).setRequired(true);
  }
  return doc;
}

// 90 degrees about Y, scale 2, translate (1, 2, 3). Column-major.
const M = [0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 1, 2, 3, 1];

function expected(bounds) {
  const xs = [bounds.min, bounds.max];
  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const x of xs) for (const y of xs) for (const z of xs) {
    const p = [x[0], y[1], z[2]];
    const q = [0, 1, 2].map((r) => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
    q.forEach((v, i) => {
      out.min[i] = Math.min(out.min[i], v);
      out.max[i] = Math.max(out.max[i], v);
    });
  }
  return out;
}

const close = (a, b, eps) => a.every((v, i) => Math.abs(v - b[i]) < eps);

const io = await getIO();
for (const draco of [false, true]) {
  const src = buildDoc({ draco });
  const before = getBounds(src.getRoot().listScenes()[0]);
  const want = expected(before);
  const bytes = await io.writeBinary(src);

  for (const bake of [false, true]) {
    const { glb, baked } = await realignBinary(bytes, M, { bake });
    const out = await io.readBinary(glb);
    const got = getBounds(out.getRoot().listScenes()[0]);
    const eps = draco ? 0.05 : 1e-4; // Draco quantises positions
    assert.ok(close(got.min, want.min, eps) && close(got.max, want.max, eps),
      `bounds mismatch draco=${draco} bake=${bake}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    assert.equal(baked, bake);
    if (bake) {
      for (const node of out.getRoot().listNodes()) {
        assert.ok(close(node.getMatrix(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 1e-6),
          'baked nodes should be identity');
      }
    }
    console.log(`ok  draco=${draco} bake=${bake}  ${glb.byteLength} bytes`);
  }
}
console.log('all passed');

// ---------- optimisation ----------
{
  const { default: sharp } = await import('sharp');
  const { KHRDracoMeshCompression: Draco, EXTMeshoptCompression, EXTTextureWebP } = await import('@gltf-transform/extensions');
  const doc = new Document();
  const buffer = doc.createBuffer();
  // dense, gently curved 80x80 grid = 12,800 triangles
  const N = 80, pos = [], uv = [], idx = [];
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    pos.push(x / N * 4, Math.sin(x / N * Math.PI) * 0.3, y / N * 2);
    uv.push(x / N, y / N);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const png = await sharp({ create: { width: 2048, height: 1024, channels: 3, background: '#3366cc' } }).png().toBuffer();
  const noise = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 37) % 251));
  const small = await sharp(noise, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  const mat = doc.createMaterial().setEmissiveFactor([1, 1, 1])
    .setBaseColorTexture(doc.createTexture('big').setImage(new Uint8Array(png)).setMimeType('image/png'))
    .setEmissiveTexture(doc.createTexture('small').setImage(new Uint8Array(small)).setMimeType('image/png'));
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setArray(new Uint32Array(idx)).setBuffer(buffer))
    .setMaterial(mat);
  doc.createScene().addChild(doc.createNode('panel').setMesh(doc.createMesh().addPrimitive(prim)));
  const bytes = await io.writeBinary(doc);
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const before = getBounds(doc.getRoot().listScenes()[0]);

  for (const compression of ['keep', 'draco', 'meshopt']) {
    const { glb, stats } = await realignBinary(bytes, I, {
      optimize: { simplify: { ratio: 0.25, error: 0.01 }, textures: { maxSize: 512, webp: true }, compression },
    });
    const out = await io.readBinary(glb);
    const root = out.getRoot();
    assert.equal(stats.trianglesBefore, 12800);
    assert.ok(stats.trianglesAfter <= 12800 * 0.3, `simplify too weak: ${stats.trianglesAfter}`);
    assert.ok(stats.trianglesAfter > 0);
    const after = getBounds(root.listScenes()[0]);
    assert.ok(close(after.min, before.min, 0.05) && close(after.max, before.max, 0.05), 'shape drifted');
    const sizes = Object.fromEntries(root.listTextures().map((t) => [t.getName(), t.getSize()]));
    assert.deepEqual(sizes.big, [512, 256]);
    assert.deepEqual(sizes.small, [64, 64], 'small textures must not be enlarged');
    assert.ok(root.listTextures().every((t) => t.getMimeType() === 'image/webp'));
    const exts = root.listExtensionsUsed().map((e) => e.extensionName);
    assert.equal(exts.includes(Draco.EXTENSION_NAME), compression === 'draco');
    assert.equal(exts.includes(EXTMeshoptCompression.EXTENSION_NAME), compression === 'meshopt');
    assert.ok(exts.includes(EXTTextureWebP.EXTENSION_NAME));
    assert.ok(stats.bytesAfter < stats.bytesBefore);
    console.log(`ok  optimize compression=${compression}  ${stats.trianglesBefore} -> ${stats.trianglesAfter} tris, ${stats.bytesBefore} -> ${stats.bytesAfter} bytes`);
  }
  // draco in -> none out
  const dracoIn = (await realignBinary(bytes, I, { optimize: { compression: 'draco' } })).glb;
  const plain = await io.readBinary((await realignBinary(dracoIn, I, { optimize: { compression: 'none' } })).glb);
  assert.equal(plain.getRoot().listExtensionsUsed().length, 0);
  console.log('ok  draco -> uncompressed');
  console.log('optimize passed');
}
