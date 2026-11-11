# Changelog

Notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-11

### Added

- Browser UI to rotate, recenter, ground and rescale GLB models against a
  ground grid and a forward arrow.
- Export through glTF Transform, as a root-node transform or baked into geometry.
- Size reduction: mesh simplification, texture resizing and WebP conversion,
  Draco and Meshopt compression, with a before/after preview.
- `POST /api/realign` HTTP endpoint.
- Docker image and Compose files.

[Unreleased]: https://github.com/StevenPG/GLBManipulator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/StevenPG/GLBManipulator/releases/tag/v1.0.0
