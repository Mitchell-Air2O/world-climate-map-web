# World Climate Map — Web

Static site for the [World Climate Map](https://worldclim.org/) interactive globe
(the Three.js viewer + baked texture + packed lookup data). This branch holds only the
built site — the Python model that generates it lives in the separate
`World Climate Map` repo and exports straight into [`site/`](site/) via:

```bash
python main.py --resolution 5m --data-res 10m --no-download --export-web ../world-climate-map-web/site
```

Re-run that command any time the model/settings change, then commit and push here.

---

## Looking to put the globe on an existing website?

**You're on the wrong branch.** This one is our own self-hosted deployment — a static site
plus the Docker/nginx setup that serves it. If you want to embed the globe in a site you
already have, everything you need is on the [**`embed`**](../../tree/embed) branch: the
globe, its data, and an integration guide, with none of the deployment machinery here.

```bash
git clone --branch embed --single-branch https://github.com/Mitchell-Air2O/world-climate-map-web.git climate-globe-embed
```

Or download the zip from [Releases](../../releases), which has identical contents:

```bash
gh release download --repo Mitchell-Air2O/world-climate-map-web --pattern '*.zip'
```

Integration is three lines — one `<link>`, one `<div>`, one `<script>` — with no build
step and no npm. The `README.md` on that branch covers options, units, theming, the
JavaScript API, and recipes for WordPress, React/Next, Vue and closed platforms like
Squarespace.

> **The `embed` branch is generated output.** `make_portable.py` in the source repo
> rebuilds it wholesale from `web/` + `embed/README.md`, and it's force-refreshed in place
> each dataset update rather than merged. Edit it there, not on the branch — changes made
> directly on `embed` are reverted by the next rebuild. It shares no history with `main`,
> so nothing here ever merges into it either.

---

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
