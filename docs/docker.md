# Running GLBManipulator in Docker

The image contains the built UI and the Node server. It listens on port 5199,
runs as the unprivileged `node` user, and keeps no state: models are processed
in memory and returned, so there are no volumes to mount.

## Run the published image

```sh
docker run --rm -p 127.0.0.1:5199:5199 ghcr.io/stevenpg/glbmanipulator:latest
```

Open <http://localhost:5199>. Stop it with `Ctrl+C`.

Run it in the background and have it come back after a reboot:

```sh
docker run -d --name glbmanipulator --restart unless-stopped \
  -p 127.0.0.1:5199:5199 \
  ghcr.io/stevenpg/glbmanipulator:latest

docker logs -f glbmanipulator
docker rm -f glbmanipulator
```

Images are built for `linux/amd64` and `linux/arm64` (Apple silicon).

### Tags

| Tag | Meaning |
| --- | --- |
| `latest` | Most recent build of `main` |
| `1.2.3`, `1.2` | A tagged release |
| `sha-<commit>` | One specific commit |

## Build it yourself

```sh
git clone https://github.com/StevenPG/GLBManipulator.git
cd GLBManipulator
docker build -t glbmanipulator .
docker run --rm -p 127.0.0.1:5199:5199 glbmanipulator
```

## Docker Compose

The `docker-compose.yml` in the repository root builds from the checkout:

```sh
docker compose up --build -d
docker compose logs -f
docker compose down
```

To pull the published image instead, with no checkout needed, use
[`examples/docker-compose.ghcr.yml`](../examples/docker-compose.ghcr.yml):

```sh
docker compose -f examples/docker-compose.ghcr.yml up -d
```

## Configuration

| Variable | Default in the image | Purpose |
| --- | --- | --- |
| `PORT` | `5199` | Port the server listens on inside the container |
| `HOST` | `0.0.0.0` | Interface inside the container; leave as is |
| `MAX_UPLOAD_MB` | `1024` | Largest GLB accepted |

Use a different host port:

```sh
docker run --rm -p 127.0.0.1:8080:5199 ghcr.io/stevenpg/glbmanipulator:latest
```

Raise the upload limit and give large models more memory. A model is held in
memory several times over while it is processed, so allow roughly five times
the file size:

```sh
docker run --rm -p 127.0.0.1:5199:5199 \
  -e MAX_UPLOAD_MB=4096 \
  -e NODE_OPTIONS=--max-old-space-size=8192 \
  ghcr.io/stevenpg/glbmanipulator:latest
```

## Network exposure

The server has no authentication, and anyone who can reach it can make it do
CPU-heavy work. Every example here publishes the port as
`127.0.0.1:5199:5199`, which makes it reachable from your machine only.

To share it on a network you trust, publish it as `-p 5199:5199`. To expose it
any more widely, put it behind a reverse proxy that adds authentication and
TLS, and raise the proxy's request body limit to match `MAX_UPLOAD_MB`
(for nginx, `client_max_body_size`).

## Using the API from a container

The endpoint works the same way as it does locally:

```sh
curl -X POST http://localhost:5199/api/realign \
  -H 'x-matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]' \
  -H 'x-optimize: {"textures":{"maxSize":1024,"webp":true}}' \
  --data-binary @model.glb -o model_small.glb
```

See [examples/README.md](../examples/README.md) for the header reference.

## Health check

`GET /healthz` returns `ok`. The image declares a `HEALTHCHECK` that uses it,
so `docker ps` shows the container as `healthy` once it is up.

## Troubleshooting

- **Port already in use**: change the host side of `-p`, for example
  `127.0.0.1:5200:5199`.
- **Export fails on a very large model**: raise `MAX_UPLOAD_MB` and
  `NODE_OPTIONS=--max-old-space-size`, and check Docker Desktop's memory limit.
- **`pull access denied` for the ghcr.io image**: build locally with
  `docker compose up --build`.
