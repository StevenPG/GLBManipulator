// Request handling shared by the Vite dev server (vite.config.js) and the
// standalone production server (server/index.js).
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { realignBinary } from './realign.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeLibs = path.join(root, 'node_modules/three/examples/jsm/libs');

/** three.js decoder binaries, served straight from node_modules. */
const DECODERS = {
  '/draco/': path.join(threeLibs, 'draco/gltf'),
  '/basis/': path.join(threeLibs, 'basis'),
};

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 1024) * 1024 * 1024;

function serveDecoder(pathname, res) {
  for (const [prefix, dir] of Object.entries(DECODERS)) {
    if (!pathname.startsWith(prefix)) continue;
    const name = path.basename(pathname); // basename: no path traversal
    const file = path.join(dir, name);
    if (!name || !existsSync(file)) return false;
    res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(file).pipe(res);
    return true;
  }
  return false;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      throw Object.assign(new Error(`Upload exceeds MAX_UPLOAD_MB (${MAX_UPLOAD_BYTES / 1048576})`), { status: 413 });
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function parseHeader(req, name, fallback) {
  try {
    return JSON.parse(req.headers[name] || fallback);
  } catch {
    throw Object.assign(new Error(`${name} header is not valid JSON`), { status: 400 });
  }
}

/**
 * POST /api/realign
 *   body        the GLB
 *   x-matrix    JSON array of 16 numbers, column-major (glTF order)
 *   x-bake      "1" to write the transform into the vertices
 *   x-optimize  JSON, see optimize() in realign.js
 * Responds with the new GLB; x-stats carries before/after triangle and byte counts.
 */
async function realign(req, res) {
  try {
    const matrix = parseHeader(req, 'x-matrix', 'null');
    if (!Array.isArray(matrix) || matrix.length !== 16 || !matrix.every(Number.isFinite)) {
      throw Object.assign(new Error('x-matrix header must be a JSON array of 16 numbers'), { status: 400 });
    }
    const optimize = parseHeader(req, 'x-optimize', 'null');
    const input = await readBody(req);
    if (!input.byteLength) throw Object.assign(new Error('Request body is empty'), { status: 400 });

    const { glb, baked, reason, stats } = await realignBinary(input, matrix, {
      bake: req.headers['x-bake'] === '1',
      optimize,
    });
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('x-baked', baked ? '1' : '0');
    res.setHeader('x-stats', JSON.stringify(stats));
    if (reason) res.setHeader('x-bake-skipped', reason);
    res.end(Buffer.from(glb));
  } catch (err) {
    if (!err.status) console.error('[realign]', err);
    res.statusCode = err.status || 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(String(err?.message || err));
  }
}

/** Connect-style middleware. Calls next() for anything it does not own. */
export function handle(req, res, next) {
  const pathname = (req.url || '/').split('?')[0];

  if (pathname === '/api/realign') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end('POST only');
    }
    return realign(req, res);
  }
  if (pathname === '/healthz') {
    res.setHeader('Content-Type', 'text/plain');
    return res.end('ok');
  }
  if (serveDecoder(pathname, res)) return;
  next();
}
