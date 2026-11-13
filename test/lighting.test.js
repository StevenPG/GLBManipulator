// A model with every lighting problem at once: inspect finds them, fix clears them.
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { getIO, inspectBinary, inspectLighting, realignBinary } from '../server/realign.js';

const doc = new Document();
const buffer = doc.createBuffer();
const tri = () => doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
const up = () => doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])).setBuffer(buffer);

const unlitExt = doc.createExtension(KHRMaterialsUnlit);
const unlit = doc.createMaterial('paint').setExtension('KHR_materials_unlit', unlitExt.createUnlit());
const metal = doc.createMaterial('body'); // metallicFactor defaults to 1
const fine = doc.createMaterial('rubber').setMetallicFactor(0);

const black = doc.createAccessor().setType('VEC4').setNormalized(true).setArray(new Uint8Array(12).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 0))).setBuffer(buffer);
const white = doc.createAccessor().setType('VEC4').setNormalized(true).setArray(new Uint8Array(12).fill(128)).setBuffer(buffer);

doc.createScene().addChild(
  doc.createNode().setMesh(doc.createMesh('shell').addPrimitive(doc.createPrimitive().setAttribute('POSITION', tri()).setMaterial(unlit))),
).addChild(
  doc.createNode().setMesh(doc.createMesh('chassis').addPrimitive(doc.createPrimitive().setAttribute('POSITION', tri()).setAttribute('NORMAL', up()).setAttribute('COLOR_0', black).setMaterial(metal))),
).addChild(
  doc.createNode().setMesh(doc.createMesh('tyre').addPrimitive(doc.createPrimitive().setAttribute('POSITION', tri()).setAttribute('NORMAL', up()).setAttribute('COLOR_0', white).setMaterial(fine))),
);

const io = await getIO();
const bytes = await io.writeBinary(doc);
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const { lighting } = await inspectBinary(bytes);
assert.deepEqual(lighting, { unlit: ['paint'], fullMetal: ['body'], missingNormals: ['shell'], blackVertexColors: ['chassis'] });
console.log('ok  inspect finds all four problems');

// each fix clears exactly its own problem
const after = async (lightingOpts) => {
  const { glb } = await realignBinary(bytes, I, { optimize: { lighting: lightingOpts } });
  return io.readBinary(glb);
};
let out = inspectLighting(await after({ normals: true }));
assert.deepEqual([out.missingNormals, out.unlit, out.fullMetal], [[], ['paint'], ['body']]);
out = inspectLighting(await after({ metal: true }));
assert.deepEqual([out.fullMetal, out.unlit], [[], ['paint']]);
out = inspectLighting(await after({ vertexColors: true }));
assert.deepEqual(out.blackVertexColors, []);
console.log('ok  fixes are independent');

const fixed = await after({ normals: true, unlit: true, metal: true, vertexColors: true });
assert.deepEqual(inspectLighting(fixed), { unlit: [], fullMetal: [], missingNormals: [], blackVertexColors: [] });
const root = fixed.getRoot();
assert.ok(!root.listExtensionsUsed().some((e) => e.extensionName === 'KHR_materials_unlit'));
const tyre = root.listMeshes().find((m) => m.getName() === 'tyre').listPrimitives()[0];
assert.ok(tyre.getAttribute('COLOR_0'), 'non-black vertex colours must be kept');
const paint = root.listMaterials().find((m) => m.getName() === 'paint');
assert.equal(paint.getMetallicFactor(), 0);
console.log('ok  all fixes together leave a clean report');

// untouched when nothing is requested
assert.deepEqual(inspectLighting(await after({})), lighting);
console.log('lighting passed');
