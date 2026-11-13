// End-to-end check of the HTTP API using the sample model.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getBounds } from '@gltf-transform/functions';
import { createServer } from '../server/index.js';
import { getIO } from '../server/realign.js';

const server = createServer().listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  assert.equal(await (await fetch(`${base}/healthz`)).text(), 'ok');
  assert.equal((await fetch(`${base}/draco/draco_decoder.wasm`)).status, 200);
  assert.equal((await fetch(`${base}/api/realign`)).status, 405);

  const glb = await readFile(new URL('../examples/models/misaligned-car.glb', import.meta.url));

  const report = await (await fetch(`${base}/api/inspect`, { method: 'POST', body: glb })).json();
  assert.equal(report.triangles, 36);
  assert.deepEqual(report.lighting.unlit, []);
  assert.equal(report.lighting.missingNormals.length, 1); // the sample car ships without normals

  const bad = await fetch(`${base}/api/realign`, { method: 'POST', headers: { 'x-matrix': '[1,2,3]' }, body: glb });
  assert.equal(bad.status, 400);

  // Z-up, nose +X  ->  Y-up, nose +Z, centred on the origin, wheels on the ground.
  // Columns: X -> +Z, Y -> +X, Z -> +Y, then translate.
  const matrix = [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, -3.9, -2, -9.025, 1];
  const res = await fetch(`${base}/api/realign`, {
    method: 'POST',
    headers: { 'x-matrix': JSON.stringify(matrix), 'x-bake': '1', 'x-optimize': JSON.stringify({ compression: 'draco' }) },
    body: glb,
  });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('x-baked'), '1');
  const stats = JSON.parse(res.headers.get('x-stats'));
  assert.equal(stats.trianglesBefore, 36);

  const io = await getIO();
  const doc = await io.readBinary(new Uint8Array(await res.arrayBuffer()));
  const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
  const near = (a, b) => Math.abs(a - b) < 0.02;
  assert.ok(near(min[1], 0), `not grounded: ${min}`);
  assert.ok(near(min[0], -max[0]) && near(min[2], -max[2]), `not centred: ${min} ${max}`);
  assert.ok(near(max[2] - min[2], 4.05), 'length should run along Z');
  console.log('ok  http api');
} finally {
  server.close();
}
