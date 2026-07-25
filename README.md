# World Climate Map — Web

Static site for the [World Climate Map](https://worldclim.org/) interactive globe
(the Three.js viewer + baked texture + packed lookup data). This repo holds only the
built site — the Python model that generates it lives in the separate
`World Climate Map` repo and exports straight into [`site/`](site/) via:

```bash
python main.py --resolution 5m --data-res 10m --no-download --export-web ../world-climate-map-web/site
```

Re-run that command any time the model/settings change, then commit and push here.

## Running with Docker

Pull and run the published image (built by CI on every push to `main`):

```bash
docker compose pull
docker compose up -d
```

> **First-time setup:** GHCR packages default to *private* even in a public repo. After the
> first push triggers the publish workflow, go to the package's page on GitHub
> (github.com/Mitchell-Air2O → Packages → world-climate-map-web → Package settings) and
> set visibility to **Public**, otherwise `docker compose pull` will fail with an
> authentication error for anyone who isn't logged in via `docker login ghcr.io`.

Set your own image address / port via a `.env` file or environment variables:

```
IMAGE=ghcr.io/mitchell-air2o/world-climate-map-web:latest
PORT=8080
```

Then open http://localhost:8080.

## Building locally

```bash
docker build -t world-climate-map-web .
docker run --rm -p 8080:80 world-climate-map-web
```
