# Contributing

Thanks for taking the time. Bug reports, model files that break the tool, and
pull requests are all welcome.

## Reporting a bug

Open an issue using the bug report form. The most useful thing you can attach
is a model that reproduces the problem. If you cannot share it (purchased
models usually cannot be redistributed), describe it instead: which tool
exported it, whether it is animated or skinned, and which extensions it uses.
`npx @gltf-transform/cli inspect model.glb` prints all of that.

Please do not attach models you do not have the right to share.

## Development setup

Requires Node 20 or newer.

```sh
git clone https://github.com/StevenPG/GLBManipulator.git
cd GLBManipulator
npm install
npm run dev
```

`npm run dev` starts Vite with hot reload and mounts the API on the same port.

## Before opening a pull request

1. Run `npm test` and `npm run build`. CI runs both.
2. Add or extend a test in `test/` when you change `server/realign.js`. The
   pipeline tests build small models in code, so no binary fixtures are needed.
3. Check UI changes in a browser with `examples/models/misaligned-car.glb`.
4. Keep the pull request to one change, and say what you tested.
5. Add a line to `CHANGELOG.md` under "Unreleased".

## Where things live

- `server/realign.js` is the only place that touches glTF data. Keep it free
  of HTTP concerns so it stays usable as a library.
- `server/app.js` is shared by the dev and production servers. A new route
  added there works in both.
- `src/main.js` only previews. It sends the original file and a matrix to the
  server, and never writes GLB data itself.

## Style

Plain ES modules, no build step for the server, two-space indentation
(`.editorconfig` covers the basics). Prefer a small dependency-free solution
over a new package.

## Licensing

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
