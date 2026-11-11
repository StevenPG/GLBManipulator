import { defineConfig } from 'vite';
import { handle } from './server/app.js';

/** Mounts the API and decoder routes on the dev server, same as production. */
function api() {
  return {
    name: 'glbmanipulator-api',
    configureServer(server) {
      server.middlewares.use(handle);
    },
  };
}

export default defineConfig({
  plugins: [api()],
  server: { host: '127.0.0.1', port: 5199 },
  build: { chunkSizeWarningLimit: 1500 },
});
