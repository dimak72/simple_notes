# HOWTO: Deploy Simple Notes With Docker

This app is static HTML, CSS, and JavaScript served by nginx. The image listens on container port `8080`, which is suitable for running behind a Cloudflare Tunnel.

## Prerequisites

- Docker Desktop on the Mac used to build the image.
- Docker installed on the Linux server.
- SSH access from the Mac to the Linux server.
- A Cloudflare Tunnel route that points to the server service, for example `http://localhost:8080`.

## Build The Linux Image On The Mac

From the project root:

```sh
docker buildx build --platform linux/amd64 -t simple-notes:latest --load .
```

If the Linux server uses ARM64, build for ARM64 instead:

```sh
docker buildx build --platform linux/arm64 -t simple-notes:latest --load .
```

## Copy The Image To The Linux Server

Replace `user@server` with the SSH target for the Linux server:

```sh
docker save simple-notes:latest | gzip | ssh user@server 'gunzip | docker load'
```

## Start The Container On The Linux Server

SSH to the server:

```sh
ssh user@server
```

Then start or replace the container:

```sh
docker rm -f simple-notes 2>/dev/null || true
docker run -d \
  --name simple-notes \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  simple-notes:latest
```

Binding to `127.0.0.1` keeps the app private to the server. Cloudflare Tunnel can still reach it locally at `http://localhost:8080`.

## Verify The Deployment

On the Linux server:

```sh
docker ps --filter name=simple-notes
curl -I http://127.0.0.1:8080
```

The `curl` command should return an HTTP `200` response.

## Update The Deployment

After changing the app, rebuild and copy the image again from the Mac:

```sh
docker buildx build --platform linux/amd64 -t simple-notes:latest --load .
docker save simple-notes:latest | gzip | ssh user@server 'gunzip | docker load'
```

Then restart it on the server:

```sh
docker rm -f simple-notes
docker run -d \
  --name simple-notes \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  simple-notes:latest
```
