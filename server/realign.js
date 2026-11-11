import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  flatten, clearNodeTransform, prune, dedup, weld, simplify, textureCompress, draco, meshopt,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

let ioPromise;

/** NodeIO with every extension registered, so Draco / Meshopt files round-trip. */
export function getIO() {
  ioPromise ??= (async () => {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  })();
  return ioPromise;
}

/**
 * Applies a 4x4 matrix (column-major, glTF order) to every scene in a document.
 *
 * Default: the scene's contents are moved under a new root node that carries
 * the matrix. Nothing else in the file changes, so animations, skins and
 * instancing keep working.
 *
 * bake: the correction is additionally pushed down into the vertex data, so
 * the model is aligned even with every node transform at identity. Not
 * possible for animated, skinned or GPU-instanced models; those fall back to
 * the root node.
 *
 * @returns {Promise<{baked: boolean, reason?: string}>}
 */
export async function applyMatrix(doc, matrix, { bake = false } = {}) {
  const root = doc.getRoot();

  for (const scene of root.listScenes()) {
    const wrapper = doc.createNode('realign_root').setMatrix(matrix);
    for (const child of scene.listChildren()) wrapper.addChild(child);
    scene.addChild(wrapper);
  }

  if (!bake) return { baked: false };

  const reason = bakeBlocker(doc);
  if (reason) return { baked: false, reason };

  // Move every mesh node to the scene root, carrying its full world transform.
  await doc.transform(flatten());

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    // A mesh used by several nodes needs its own copy of the vertex data
    // before each copy is transformed differently.
    const users = mesh.listParents().filter((p) => p.propertyType === 'Node');
    if (users.length > 1) node.setMesh(detachMesh(mesh));
    else detachAccessors(node.getMesh());
    clearNodeTransform(node);
  }

  await doc.transform(prune());
  return { baked: true };
}

function bakeBlocker(doc) {
  const root = doc.getRoot();
  if (root.listAnimations().length) return 'model has animations';
  if (root.listSkins().length) return 'model has skins';
  const used = root.listExtensionsUsed().map((e) => e.extensionName);
  if (used.includes('EXT_mesh_gpu_instancing')) return 'model uses GPU instancing';
  return null;
}

const SPATIAL = ['POSITION', 'NORMAL', 'TANGENT'];

function detachMesh(mesh) {
  const copy = mesh.clone();
  for (const prim of mesh.listPrimitives()) copy.removePrimitive(prim);
  for (const prim of mesh.listPrimitives()) copy.addPrimitive(prim.clone());
  detachAccessors(copy, true);
  return copy;
}

/** Gives the mesh private copies of any position/normal/tangent data it shares. */
function detachAccessors(mesh, force = false) {
  for (const prim of mesh.listPrimitives()) {
    const owners = [prim, ...prim.listTargets()];
    owners.forEach((owner, i) => {
      if (i > 0 && force) {
        // morph target shared with the source mesh
        const target = owner.clone();
        prim.removeTarget(owner).addTarget(target);
        owner = target;
      }
      for (const semantic of SPATIAL) {
        const acc = owner.getAttribute(semantic);
        if (!acc) continue;
        const shared = acc.listParents().filter((p) => p.propertyType !== 'Root').length > 1;
        if (force || shared) owner.setAttribute(semantic, acc.clone());
      }
    });
  }
}

const COMPRESSION_EXTS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

/**
 * Size reduction. All fields optional:
 *   simplify:    { ratio: 0..1 share of triangles to keep, error: 0..1 max deviation
 *                  as a fraction of the mesh's size }
 *   textures:    { maxSize: px | null, webp: boolean }
 *   compression: 'keep' | 'none' | 'draco' | 'meshopt'
 */
export async function optimize(doc, opts = {}) {
  const steps = [dedup()];

  if (opts.simplify) {
    await MeshoptSimplifier.ready;
    const ratio = Math.min(1, Math.max(0.01, +opts.simplify.ratio || 0.5));
    const error = Math.min(1, Math.max(0.0001, +opts.simplify.error || 0.01));
    // weld first: the simplifier can only collapse edges between shared vertices
    steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
  }

  const tex = opts.textures;
  if (tex && (tex.maxSize || tex.webp)) {
    const { default: sharp } = await import('sharp');
    steps.push(
      textureCompress({
        encoder: sharp,
        ...(tex.webp ? { targetFormat: 'webp' } : {}),
        ...(tex.maxSize ? { resize: [tex.maxSize, tex.maxSize] } : {}),
      }),
    );
  }

  // Conservative prune: keep empty nodes (often pivots / attachment points)
  // and unused vertex attributes.
  steps.push(prune({ keepLeaves: true, keepAttributes: true }));
  await doc.transform(...steps);
}

/** Runs last, after the geometry has its final shape. */
async function setCompression(doc, mode = 'keep') {
  if (mode === 'keep') return;
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (COMPRESSION_EXTS.includes(ext.extensionName)) ext.dispose();
  }
  if (mode === 'draco') await doc.transform(draco());
  if (mode === 'meshopt') await doc.transform(meshopt({ encoder: MeshoptEncoder }));
}

export function countTriangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // TRIANGLES
      const src = prim.getIndices() || prim.getAttribute('POSITION');
      if (src) n += src.getCount() / 3;
    }
  }
  return Math.round(n);
}

/** Bytes in, bytes out. */
export async function realignBinary(bytes, matrix, options = {}) {
  const io = await getIO();
  const doc = await io.readBinary(bytes);
  const stats = { bytesBefore: bytes.byteLength, trianglesBefore: countTriangles(doc) };

  if (options.optimize) await optimize(doc, options.optimize);
  const result = await applyMatrix(doc, matrix, options);
  await setCompression(doc, options.optimize?.compression);

  const glb = await io.writeBinary(doc);
  stats.trianglesAfter = countTriangles(doc);
  stats.bytesAfter = glb.byteLength;
  return { glb, stats, ...result };
}
