# Security Policy

## Supported versions

Only the latest release and the `main` branch receive fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting instead:
go to the repository's **Security** tab and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and the version or commit.

## Scope and threat model

GLBManipulator is designed to run on your own machine and listen on loopback.
It has **no authentication**, by design. With that in mind:

- In scope: anything that lets a web page or a crafted GLB file read or write
  files outside the request, execute code, or reach the server from another
  origin when it is bound to loopback.
- Out of scope: denial of service by someone who can already reach the port,
  and exposure caused by deliberately binding to a public interface without a
  proxy. See the "Network exposure" section of [docs/docker.md](docs/docker.md).
