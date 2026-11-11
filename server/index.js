// Production server: serves the built UI from dist/ plus the API.
//   HOST            interface to bind (default 127.0.0.1; use 0.0.0.0 in a container)
//   PORT            default 5199
//   MAX_UPLOAD_MB   default 1024
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handle } from './app.js';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.statusCode = 400;
    return res.end();
  }
  let file = path.join(dist, path.normalize(pathname));
  if (!file.startsWith(dist)) {
    res.statusCode = 403;
    return res.end();
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  // Vite fingerprints everything under assets/
  if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(file).pipe(res);
}

export function createServer() {
  return http.createServer((req, res) => handle(req, res, () => serveStatic(req, res)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(path.join(dist, 'index.html'))) {
    console.error('dist/ not found. Run "npm run build" first (or use "npm start").');
    process.exit(1);
  }
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT) || 5199;
  const server = createServer().listen(port, host, () => {
    console.log(`GLBManipulator listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}
