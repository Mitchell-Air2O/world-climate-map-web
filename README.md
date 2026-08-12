# Climate Globe — drop-in embed package

An interactive 3-D climate globe you can add to an existing website by uploading one
folder and pasting in three lines of HTML. No build step, no npm, no API keys, no
server-side code, and no calls to any third-party service — everything it needs is in
this folder.

Tap anywhere on the globe and it shows that location's water-production regime, the
annual average, and a month-by-month breakdown. Visitors can also pick a country and
state/region from dropdowns, or type a US ZIP code.

It comes in two halves you can place independently:

* the **globe window** — the globe plus the controls that drive it (country/region
  picker, ZIP box, status line);
* the **stats window** — the readout for whatever is selected (summary, monthly chart,
  monthly table).

Put both in one `<div>` and it behaves as a single widget; put them in two `<div>`s
anywhere on the page and they stay in sync. Every figure is also available raw, in
whichever unit you want, for building your own charts.

---

## Contents

```
climate-globe-portable/
├── README.md            ← you are here
├── demo.html            ← working example page; open it to see the finished result
└── climate-globe/       ← the only folder you upload to your site
    ├── widget.js            drop-in embed: globe window + stats window, auto-mounts itself
    ├── climate-globe.css    all styling (one <link> tag)
    ├── globe.js             the globe on its own, if you'd rather build your own UI
    ├── vendor/
    │   └── three.module.js  the 3-D library (bundled — nothing is fetched from a CDN)
    ├── meta.json            dataset description: regimes, colors, grid, country list
    ├── *.bin                packed climate / country / region / ZIP lookup data
    └── texture_*.webp/.png  the globe's surface imagery, in three quality tiers
```

**Keep `climate-globe/` intact.** The files inside reference each other by relative path,
so the folder can go anywhere on your site (or on a CDN) — but don't rename or reshuffle
files inside it. `README.md` and `demo.html` are documentation; you don't have to upload
them.

### Getting it

Two routes, same contents. Both need access to the repository, which is **private** — ask
for a GitHub invite, or have the zip sent to you directly.

**Download the zip** — from the repository's Releases page, or:

```bash
gh release download embed-latest --repo Mitchell-Air2O/world-climate-map-web
```

**Or pull it with git.** The package lives on its own `embed` branch, which contains
*only* these files — no Dockerfile, no nginx config, no site deployment machinery — so
cloning it drops the folder straight into a project:

```bash
git clone --branch embed --single-branch \
  https://github.com/Mitchell-Air2O/world-climate-map-web.git climate-globe-embed
```

To keep it as a tracked dependency inside an existing repo, add it as a submodule:

```bash
git submodule add -b embed \
  https://github.com/Mitchell-Air2O/world-climate-map-web.git vendor/climate-globe
```

Either way, later updates are `git pull` — see [Updating](#updating).

---

## Requirements

* **Any static web host.** Apache, nginx, IIS, S3/CloudFront, Netlify, Vercel, GitHub
  Pages, or the `wp-content/uploads` folder of a WordPress site all work.
* **Served over `http://` or `https://`.** Opening the page as a `file://` path will not
  work — browsers block ES modules and `fetch()` on `file://` URLs. See
  [Try it locally first](#try-it-locally-first).
* **A browser with WebGL** — every current version of Chrome, Edge, Firefox, and Safari,
  desktop and mobile.
* **Disk space:** ~78 MB, mostly the high-resolution globe imagery. See
  [Making it smaller](#making-it-smaller) if your host charges by the gigabyte — the
  globe works fine at a fraction of the size.
* **Gzip enabled on the server** — strongly recommended. It takes the first-load
  download from ~32 MB to ~9 MB. Most hosts (Netlify, Vercel, Cloudflare, S3+CloudFront,
  cPanel/Apache) do it by default; a bare nginx or IIS may not. See
  [Server configuration](#server-configuration).

Nothing needs to be installed on the server. If your host can serve a `.jpg`, it can
serve this.

---

## Quick start

### 1. Upload the folder

Copy `climate-globe/` into your site's static files — e.g. so that it's reachable at
`https://yoursite.com/climate-globe/`.

### 2. Add the stylesheet to your page's `<head>`

```html
<link rel="stylesheet" href="/climate-globe/climate-globe.css" />
```

### 3. Add the globe where you want it to appear

```html
<div data-climate-globe data-height="520px"></div>
<script type="module" src="/climate-globe/widget.js"></script>
```

That's the whole integration. The `<script>` tag finds every element marked
`data-climate-globe` on the page and builds the globe, its controls, and its stats
readout inside it.

> **Paths:** the examples use `/climate-globe/…` (absolute from your site root). If you
> put the folder somewhere else, adjust both paths to match — e.g.
> `/assets/climate-globe/climate-globe.css` and `/assets/climate-globe/widget.js`. The
> data files are found automatically relative to `widget.js`, so that's the only place
> the location is spelled out.

### Complete copy-paste page

If you want a full working file to compare against, here it is end to end:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Climate Globe</title>
  <link rel="stylesheet" href="/climate-globe/climate-globe.css" />
</head>
<body>
  <h1>Where does our technology work best?</h1>

  <div data-climate-globe data-height="520px"></div>

  <script type="module" src="/climate-globe/widget.js"></script>
</body>
</html>
```

`demo.html` in this package is exactly this, with a bit of page styling added.

### Try it locally first

Double-clicking `demo.html` will show an empty page — browsers won't load modules from
`file://`. Start a tiny local server in this folder instead, then open the address it
prints:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000/demo.html`. (Any static server works — `npx serve`,
PHP's `php -S localhost:8000`, VS Code's Live Server extension.)

---

## Putting the globe and the stats in different places

Give the globe an `id`, and point a second element at it with `data-climate-stats`. The
two elements don't need to be near each other — the globe can be a full-width hero and
the numbers can live in a sidebar, a tab, or a modal further down the page.

```html
<!-- The globe, wherever you want it. Its picker and ZIP box travel with it. -->
<div id="climate-globe" data-climate-globe data-height="520px"></div>

<!-- ...any amount of your own markup in between... -->

<!-- The numbers, wherever you want them. -->
<div data-climate-stats="#climate-globe"></div>

<script type="module" src="/climate-globe/widget.js"></script>
```

**The globe drops its own built-in stats panel as soon as something else claims it**, so
there's nothing to switch off — adding the second element is the whole change. (If you
want the numbers in *both* places, add `data-stats="true"` to the globe element.)

A worked two-column example:

```html
<div class="globe-layout">
  <div id="climate-globe" data-climate-globe data-height="560px"></div>
  <aside>
    <h3>Water production at this location</h3>
    <div data-climate-stats="#climate-globe" data-units="gal/day"></div>
  </aside>
</div>
```

```css
.globe-layout {
  display: grid;
  gap: 32px;
  align-items: start;
}
@media (min-width: 900px) {
  .globe-layout { grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr); }
}
```

You can bind **more than one** stats window to the same globe — handy for showing, say, a
compact summary near the globe and a full table lower down, or the same figures in two
different units:

```html
<div data-climate-stats="#climate-globe" data-chart="false" data-table="false"></div>
<div data-climate-stats="#climate-globe" data-units="gal/month"></div>
```

Ways to point at a globe:

| `data-climate-stats` value | Meaning |
|---|---|
| `#climate-globe` | the element with that id (recommended) |
| `.my-globe-class` | any CSS selector |
| *(empty)* | the first globe on the page |

---

## Units

Set `data-units` on the globe element (it becomes the default for everything bound to it)
or on an individual stats element (which then overrides it).

| Value | Shown as |
|---|---|
| `L/day` *(default)* | `1.33 L/day` |
| `L/week` | `9.34 L/week` |
| `L/month` | `40.6 L/month` |
| `gal/day` | `0.35 gal/day` |
| `gal/week` | `2.47 gal/week` |
| `gal/month` | `10.7 gal/month` |
| `mL/hr` | `55.6 mL/hr` |

Gallons are **US liquid gallons** (3.785411784 L). Weekly figures are the daily rate ×7;
monthly figures are the daily rate × 30.44 (the mean Gregorian month), so twelve of them
always add up to the year — a month's figure never depends on which month it is.

The summary shows the chosen unit, with the same period in the other system underneath
(pick `gal/week` and you get litres/week as the secondary line), so a page can lead with
gallons without hiding the metric figure.

```html
<div data-climate-globe data-units="gal/day" data-height="520px"></div>
```

---

## Options

All optional.

### On the globe element (`data-climate-globe`)

| Attribute | Default | What it does |
|---|---|---|
| `data-height` | `460px` | Height of the globe area. Any CSS length: `520px`, `60vh`, `100%`. |
| `data-layout` | `stacked` | `stacked` = controls below the globe. `side` = globe left, controls right on screens ≥ 900px wide (falls back to stacked on phones). |
| `data-units` | `L/day` | Default unit for this globe and everything bound to it — see [Units](#units). |
| `data-picker` | `true` | Country + state/region dropdowns. `false` to hide. |
| `data-zip` | `true` | US ZIP code lookup box. `false` to hide. |
| `data-status` | `true` | The one-line status and error message. |
| `data-stats` | `true`\* | Include a stats readout in this element. \*Automatically `false` when a separate `data-climate-stats` element points at this globe. |
| `data-summary`, `data-chart`, `data-table` | `true` | Passed through to the built-in stats readout (see below). |
| `data-start` | *(none)* | Drop a pin here on load: `"45.34,-122.77"` (latitude, longitude). |
| `data-start-zip` | *(none)* | Drop a pin at this US ZIP on load, e.g. `"97070"`. Takes precedence over `data-start`. |
| `data-src` | *(auto)* | Where the data files live, if you moved them away from `widget.js` — e.g. a CDN origin. |

### On a stats element (`data-climate-stats`)

| Attribute | Default | What it does |
|---|---|---|
| `data-climate-stats` | *(first globe)* | Which globe to follow — an id, a selector, or empty. |
| `data-units` | *(the globe's)* | Unit for this panel only — see [Units](#units). |
| `data-summary` | `true` | The coordinates / country / regime / annual-average block. |
| `data-chart` | `true` | The monthly line chart. |
| `data-table` | `true` | The month-by-month value table. |
| `data-empty` | *"Pick a location…"* | Placeholder text shown before anything is selected. Empty string for none. |

Any `false`-ish value (`false`, `0`, `no`, `off`) turns a boolean option off.

### Examples

**Just the globe** — a decorative hero element with no UI at all:

```html
<div data-climate-globe
     data-height="70vh"
     data-picker="false"
     data-zip="false"
     data-status="false"
     data-stats="false"></div>
```

**Side-by-side, opening on Portland, Oregon:**

```html
<div data-climate-globe
     data-layout="side"
     data-height="560px"
     data-start="45.52,-122.68"></div>
```

**Compact: globe + summary only, in gallons per day:**

```html
<div data-climate-globe
     data-height="380px"
     data-units="gal/day"
     data-chart="false"
     data-table="false"></div>
```

**Two globes on one page** — each `<div>` is mounted independently, and one `<script>`
tag covers both:

```html
<div data-climate-globe data-start-zip="97070" data-height="380px"></div>
<div data-climate-globe data-start-zip="33101" data-height="380px"></div>
<script type="module" src="/climate-globe/widget.js"></script>
```

---

## Sizing and layout

The widget is a plain block element: it fills the width of whatever contains it, and the
globe's height comes from `data-height`. To constrain it, wrap it in your own container.

```html
<div class="climate-globe-holder">
  <div data-climate-globe data-height="480px"></div>
</div>
```

```css
/* Center it in a readable column, with some breathing room. */
.climate-globe-holder {
  max-width: 1100px;
  margin: 48px auto;
  padding: 0 20px;
}

/* Shorter globe on phones — 480px of globe crowds out everything else on a small screen. */
@media (max-width: 600px) {
  .climate-globe-holder .cg-globe { height: 320px !important; }
}
```

To make the globe fill a section of fixed height (e.g. a full-viewport hero), give the
holder the height and pass `data-height="100%"`:

```html
<section class="globe-hero">
  <div data-climate-globe data-height="100%" data-picker="false" data-zip="false"
       data-summary="false" data-chart="false" data-table="false" data-status="false"></div>
</section>
```

```css
.globe-hero { height: 100vh; }
.globe-hero > [data-climate-globe],
.globe-hero .cg-widget { height: 100%; }
```

---

## On mobile

Phones are the primary target, and the defaults are set up for them — but a few things
are worth knowing.

**Gestures.** One finger rotates, two fingers pinch to zoom, a tap drops the marker. The
globe claims touches inside its own box only (`touch-action: none`), so the page still
scrolls normally everywhere else. A tap counts as a tap even if the finger slides a few
pixels; a deliberate swipe rotates instead of selecting.

**The marker** is a small red dot inside a white ring, sized to hold the same on-screen
size at every zoom level. It's deliberately hollow and small so it doesn't hide the place
you just tapped — which on a phone is usually right under your fingertip.

**Form controls** are 16px text in 44px-tall targets: 16px is the threshold below which
iOS Safari zooms the whole page in when an input is focused, and 44px is the minimum
comfortable tap target on both iOS and Android. Submitting the ZIP box also drops the
keyboard, which would otherwise cover the globe it just flew to.

**Height.** `data-height` applies at every width, so a value chosen for a desktop layout
is usually too tall on a phone — 300–360px is a good range. Either override it in CSS:

```css
@media (max-width: 600px) {
  .cg-globe { height: 340px !important; }
}
```

...or use a viewport-relative value like `data-height="45vh"`, which adapts on its own.

**Splitting the windows helps here most of all**: on a phone, a globe with a full readout
underneath is a lot of scrolling. Putting the stats in a separate element lets you place
them in a tab, an accordion, or a sheet that only opens once something is selected —
see [Putting the globe and the stats in different places](#putting-the-globe-and-the-stats-in-different-places).

**One globe per page** on mobile. Each one holds its own WebGL context and texture; two
at once is a real risk of the browser dropping a context on a low-memory device.

---

## Theming

Every color, radius, and font is a CSS custom property declared on `:root`, so the globe
window and the stats window stay in step even when they sit in different parts of the
page. Override them from **your own stylesheet** — don't edit `climate-globe.css`, so you
can drop in a newer version of this package later without redoing your work.

The defaults are tuned for a dark page. Paste this block and change the values:

```css
/* Put this in your site's stylesheet, after the climate-globe.css <link>. */
:root {
  --cg-bg: transparent;                 /* behind the widget */
  --cg-globe-bg: radial-gradient(circle at 50% 40%, #1b2036 0%, #0a0a10 75%);
  --cg-text: #eeeef2;                   /* primary text */
  --cg-text-muted: #9a9caa;             /* labels, status line, axis labels */
  --cg-text-value: #cfd2e0;             /* the numbers in the summary rows */
  --cg-border: #2a2c36;
  --cg-line: #23252f;                   /* table rules and chart gridlines */
  --cg-field-bg: #1a1c24;               /* dropdown / text input background */
  --cg-field-border: #3a3d4a;
  --cg-accent: #4a7fe8;                 /* the "Go" button */
  --cg-accent-hover: #5b8cf0;
  --cg-accent-text: #ffffff;            /* text on the button */
  --cg-chart-line: #6fb2ff;
  --cg-chart-fill: rgba(74, 127, 232, 0.18);
  --cg-radius: 8px;                     /* corner rounding */
  --cg-gap: 18px;                       /* vertical spacing between blocks */
  --cg-font: inherit;                   /* "inherit" adopts your site's font */
  --cg-font-size: 14px;
}
```

Because these inherit, you can also scope them to a section instead of the whole page —
useful when one globe should look different from another:

```css
.dark-section { --cg-text: #eeeef2; --cg-field-bg: #1a1c24; }
.light-section { --cg-text: #1a1c24; --cg-field-bg: #ffffff; }
```

### Light theme

```css
:root {
  --cg-globe-bg: radial-gradient(circle at 50% 40%, #e8edf7 0%, #cfd7e6 75%);
  --cg-text: #1a1c24;
  --cg-text-muted: #61657a;
  --cg-text-value: #2c3040;
  --cg-border: #dcdfe8;
  --cg-line: #e6e8ef;
  --cg-field-bg: #ffffff;
  --cg-field-border: #c8ccd8;
  --cg-accent: #2f6fe0;
  --cg-accent-hover: #1f5cc9;
  --cg-chart-line: #2f6fe0;
  --cg-chart-fill: rgba(47, 111, 224, 0.14);
  --cg-font: inherit;
}
```

### Follow the visitor's system theme

The dark values are already the default, so only the light case needs writing:

```css
@media (prefers-color-scheme: light) {
  :root {
    --cg-globe-bg: radial-gradient(circle at 50% 40%, #e8edf7 0%, #cfd7e6 75%);
    --cg-text: #1a1c24;
    --cg-text-muted: #61657a;
    --cg-text-value: #2c3040;
    --cg-line: #e6e8ef;
    --cg-field-bg: #ffffff;
    --cg-field-border: #c8ccd8;
    --cg-accent: #2f6fe0;
    --cg-accent-hover: #1f5cc9;
    --cg-chart-line: #2f6fe0;
    --cg-chart-fill: rgba(47, 111, 224, 0.14);
  }
}
```

### Matching your brand

The most common change is just the accent and the fonts:

```css
:root {
  --cg-accent: #00a3b4;
  --cg-accent-hover: #00b9cc;
  --cg-font: "Your Brand Sans", system-ui, sans-serif;
  --cg-radius: 4px;      /* squarer corners */
}
```

### Restyling individual pieces

If the custom properties don't reach far enough, target the classes directly. Prefix your
selectors with `.cg-widget` or `.cg-stats` so they win over the package's own rules.

| Class | Element |
|---|---|
| `.cg-widget` | the globe window's wrapper |
| `.cg-globe` | the 3-D globe's box |
| `.climate-globe-legend` | the color-scale legend floating over the globe |
| `.cg-panel` | the controls area below (or beside) the globe |
| `.cg-controls`, `.cg-field`, `.cg-label` | the dropdown / ZIP control row |
| `.cg-select`, `.cg-input`, `.cg-button` | the form controls |
| `.cg-status` | status and error line |
| `.cg-stats` | the stats window's wrapper |
| `.cg-empty` | the "pick a location" placeholder |
| `.cg-summary`, `.cg-row` | the location summary block and its rows |
| `.cg-chart-wrap`, `.cg-chart` | the monthly chart |
| `.cg-table` | the monthly table |

```css
/* Example: hide the legend, and make the globe a circle instead of a rounded rectangle. */
.cg-widget .climate-globe-legend { display: none; }
.cg-widget .cg-globe { border-radius: 50%; }

/* Example: give the stats window a card treatment. */
.cg-stats {
  padding: 20px;
  border: 1px solid var(--cg-border);
  border-radius: 12px;
}
```

### The location marker

The pin is drawn inside the WebGL canvas, so CSS can't reach it. It's a red dot inside a
white ring that holds a constant on-screen size however far you zoom — deliberately small
and hollow so that on a phone it doesn't hide the place you just tapped. To change its
size or colors, edit the `PIN_*` constants and `_buildPin()` near the top of `globe.js`.

---

## Controlling it from your own page

`widget.js` exports its API, and also exposes it as `window.ClimateGlobeWidget` for
non-module scripts. Mount manually when you want a handle on the widget:

```html
<div id="my-globe"></div>
<div id="my-stats"></div>

<script type="module">
  import { mountClimateGlobe, mountClimateStats } from "/climate-globe/widget.js";

  const climate = mountClimateGlobe("#my-globe", {
    height: "520px",
    layout: "side",
    units: "gal/day",
    stats: false,          // the readout lives in #my-stats instead
  });

  mountClimateStats("#my-stats", { globe: climate });
  // ...or the shorthand, which passes the units along for you:
  // climate.attachStats("#my-stats");

  // Drive it from your own buttons.
  document.querySelector("#btn-hq").addEventListener("click", () => {
    climate.globe.goToCoord(45.34, -122.77);
  });

  // React to every selection — including taps on the globe itself.
  climate.globe.addEventListener("locationselected", (e) => {
    console.log(e.detail.country, e.detail.annual_L_day);
  });
</script>
```

Note that an element with `data-climate-globe` is mounted automatically; use a plain `id`
(as above) when you're mounting it yourself, or you'll get it twice.

### What the mount functions return

`mountClimateGlobe()` → `{ element, globe, units, getData(), attachStats(), destroy() }`

| Member | What it is |
|---|---|
| `globe` | the underlying `ClimateGlobe` — see [Globe methods](#globe-methods) |
| `getData()` | the latest selection, raw (`null` before the first pick) |
| `attachStats(target, opts)` | add a stats window anywhere on the page, bound to this globe |
| `destroy()` | tear down the globe and every stats window attached to it |

`mountClimateStats()` → `{ element, unit, update(detail), clear(), destroy() }`

Pass `{ globe: null }` to leave it unbound and feed it yourself with `update()` — useful
if the location comes from somewhere other than the globe (a stored address, a form).

### Globe methods

| Method | Effect |
|---|---|
| `globe.goToCoord(lat, lon)` | Fly to a latitude/longitude and drop the pin. |
| `globe.goToZip("97070")` | Fly to a US ZIP code. |
| `globe.getCountries()` | Promise of `[{ id, name, code, lat, lon }, …]`. |
| `globe.getRegions(countryId)` | Promise of that country's states/regions (empty array where the dataset has no detail). |
| `globe.goToCountry(id)` / `globe.goToRegion(id)` | Fly to that entry's centroid. |
| `globe.getLastSelection()` | The latest selection detail, or `null`. |
| `globe.ready()` | Promise that resolves once data and the first texture have loaded. |
| `globe.destroy()` | Tear down the WebGL context and remove the canvas. |

Every `goTo…` method also takes `{ animate: false }` to jump without the fly-over.

### Events

```js
globe.addEventListener("ready", (e) => { /* e.detail.meta — dataset description */ });

globe.addEventListener("locationselected", (e) => {
  const d = e.detail;
  // d.lat, d.lon            numbers
  // d.zip                   the ZIP, if this came from a ZIP lookup
  // d.isLand                false for ocean points — the fields below are null
  // d.regime                "desert" | "arid" | "dry" | "low" | "temperate" | "high" | "tropic"
  // d.annual_mL_hr          annual average production estimate, millilitres/hour (the
  //                         dataset's native unit — every other unit derives from it)
  // d.annual_L_day          the same figure in litres/day
  // d.monthly_mL_hr         array of 12, January → December
  // d.monthly_L_day         array of 12, same order
  // d.country, d.countryCode, d.countryId
  // d.region,  d.regionCode,  d.regionId    (null where the dataset has no state detail)
});

globe.addEventListener("locationerror", (e) => {
  // e.detail.reason: "zip-not-found" | "country-not-found" | "region-not-found"
});

globe.addEventListener("texturequalityupgraded", (e) => { /* e.detail.tier */ });
```

There's also a bubbling DOM event on the globe's mount element, for pages that can't hold
a module handle (an inline snippet in a CMS, say):

```html
<script>
  document.addEventListener("climate-globe:select", (e) => {
    console.log(e.detail.country, e.detail.annual_L_day);
  });
</script>
```

### Raw numbers for your own chart

The event detail carries the dataset's native `mL/hr` figures. `toUnits()` re-expresses a
whole selection in any supported unit and `convert()` does a single value — both exported
from `widget.js`, so a custom chart never has to redo the arithmetic.

```js
import { toUnits, convert, formatValue, UNITS } from "/climate-globe/widget.js";

document.addEventListener("climate-globe:select", (e) => {
  const d = e.detail;
  if (!d.isLand) return;

  const { annual, monthly, label } = toUnits(d, "gal/week");
  // annual   → 2.4676…
  // monthly  → [12 numbers], January → December
  // label    → "gal/week"

  myChartLibrary.render({
    labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    values: monthly,
    axisTitle: `Production (${label})`,
    subtitle: `${formatValue(annual)} ${label} average`,
  });
});

convert(d.annual_mL_hr, "L/month");   // one value, one unit
Object.keys(UNITS);                   // every unit string this build accepts
```

`getData()` gives you the same detail on demand — for a chart that renders on a tab
switch, say, rather than on selection:

```js
const climate = mountClimateGlobe("#my-globe");
document.querySelector("#tab-chart").addEventListener("click", () => {
  const d = climate.getData();
  if (d?.isLand) renderMyChart(toUnits(d, "L/month").monthly);
});
```

### Sending the data somewhere else

Wiring the globe to your own form, quote calculator, or analytics is a few lines:

```html
<form id="quote">
  <input type="hidden" name="lat" /><input type="hidden" name="lon" />
  <input type="hidden" name="gal_day" /><input type="hidden" name="country" />
  <p id="quote-msg">Pick a location on the globe to size a system.</p>
  <button type="submit">Request a quote</button>
</form>

<script type="module">
  import { mountClimateGlobe, toUnits, formatValue } from "/climate-globe/widget.js";
  const climate = mountClimateGlobe("#my-globe");
  const form = document.querySelector("#quote");

  climate.globe.addEventListener("locationselected", (e) => {
    const d = e.detail;
    if (!d.isLand) return;
    const gal = toUnits(d, "gal/day");
    form.lat.value = d.lat.toFixed(4);
    form.lon.value = d.lon.toFixed(4);
    form.gal_day.value = gal.annual.toFixed(3);
    form.country.value = d.country ?? "";
    document.querySelector("#quote-msg").textContent =
      `${d.country ?? "Selected location"}: about ${formatValue(gal.annual)} gal/day per unit.`;
  });
</script>
```

### Building your own UI from scratch

Skip `widget.js` entirely and use `globe.js`, which draws nothing but the globe:

```html
<div id="globe-only" style="width: 100%; height: 600px;"></div>

<script type="module">
  import { ClimateGlobe } from "/climate-globe/globe.js";

  const globe = new ClimateGlobe("#globe-only", { dataUrl: "/climate-globe" });
  globe.addEventListener("locationselected", (e) => {
    // build whatever UI you want from e.detail
  });
</script>
```

`dataUrl` must point at the folder holding `meta.json`. You still want
`climate-globe.css` linked, for the legend styling.

---

## Platform notes

### WordPress

1. Upload `climate-globe/` via FTP/SFTP or your host's file manager, ideally to
   `/wp-content/uploads/climate-globe/`. (The Media Library won't accept `.bin` or `.js`
   files, so this has to be a file upload, not a media upload.)
2. Add a **Custom HTML** block to the page and paste:

```html
<link rel="stylesheet" href="/wp-content/uploads/climate-globe/climate-globe.css" />
<div data-climate-globe data-height="520px"></div>
<script type="module" src="/wp-content/uploads/climate-globe/widget.js"></script>
```

If your theme or a security plugin strips `<script>` tags out of Custom HTML blocks,
enqueue it from your child theme's `functions.php` instead:

```php
add_action('wp_enqueue_scripts', function () {
    $base = content_url('/uploads/climate-globe');
    wp_enqueue_style('climate-globe', $base . '/climate-globe.css', [], '1.0');
    wp_enqueue_script('climate-globe', $base . '/widget.js', [], '1.0', true);
});

// wp_enqueue_script can't emit type="module" on its own, so add it.
add_filter('script_loader_tag', function ($tag, $handle) {
    return $handle === 'climate-globe'
        ? str_replace('<script ', '<script type="module" ', $tag)
        : $tag;
}, 10, 2);
```

Then the page only needs `<div data-climate-globe data-height="520px"></div>`.

### Squarespace, Wix, Shopify, and other closed platforms

These generally won't let you upload a folder of `.bin` files. Two options:

1. **Host `climate-globe/` somewhere else** (an S3 bucket, a subdomain, Netlify — all
   free or near-free for static files) and point at it with absolute URLs. This needs
   CORS enabled on that host — see [Server configuration](#server-configuration).

   ```html
   <link rel="stylesheet" href="https://assets.yoursite.com/climate-globe/climate-globe.css" />
   <div data-climate-globe data-height="520px"></div>
   <script type="module" src="https://assets.yoursite.com/climate-globe/widget.js"></script>
   ```

2. **Use an iframe.** Upload this package (including `demo.html`) to any static host and
   embed the page. No CORS setup needed, and nothing on the host page can conflict with
   the widget's styling:

   ```html
   <iframe src="https://assets.yoursite.com/climate-globe-portable/demo.html"
           style="width: 100%; height: 780px; border: 0;"
           title="Climate Globe"
           loading="lazy"
           allowfullscreen></iframe>
   ```

   The trade-off is that the host page can't read `locationselected` — if you need the
   data on the parent page, use option 1.

### React / Next.js

Put `climate-globe/` in `public/`, then mount it in an effect. Note the cleanup: React
18's development Strict Mode mounts effects twice, and without `destroy()` you'd get two
globes and two WebGL contexts.

```jsx
"use client";
import { useEffect, useRef, useState } from "react";

export default function ClimateGlobe({ height = "520px", units = "gal/day" }) {
  const globeRef = useRef(null);
  const statsRef = useRef(null);
  const [selection, setSelection] = useState(null);   // raw data, for your own components

  useEffect(() => {
    let handle;
    let cancelled = false;

    // Dynamic import so this never runs during server-side rendering, where
    // there is no window/WebGL.
    import(/* webpackIgnore: true */ "/climate-globe/widget.js").then((mod) => {
      if (cancelled) return;
      handle = mod.mountClimateGlobe(globeRef.current, { height, units, stats: false });
      handle.attachStats(statsRef.current);
      handle.globe.addEventListener("locationselected", (e) => setSelection(e.detail));
    });

    return () => { cancelled = true; handle?.destroy(); };
  }, [height, units]);

  return (
    <>
      <div ref={globeRef} />
      <aside>
        <div ref={statsRef} />
        {selection?.isLand && <YourOwnChart data={selection} />}
      </aside>
    </>
  );
}
```

Add the stylesheet once, in your root layout:

```jsx
<link rel="stylesheet" href="/climate-globe/climate-globe.css" />
```

(Don't `import` `widget.js` through the bundler — it fetches sibling files at runtime by
relative URL, so it needs to stay served from `/climate-globe/`.)

### Vue

```vue
<template><div ref="host"></div></template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";

const host = ref(null);
let handle;

onMounted(async () => {
  const mod = await import(/* @vite-ignore */ "/climate-globe/widget.js");
  handle = mod.mountClimateGlobe(host.value, { height: "520px" });
});

onBeforeUnmount(() => handle?.destroy());
</script>
```

---

## Server configuration

The defaults on most hosts are fine. These are worth checking if something misbehaves.

**MIME types.** `.js` must be served as `text/javascript` and `.json` as
`application/json`, or the browser refuses the module. `.bin` and `.webp` are usually
fine already. On older IIS or a bare nginx you may need to add them — nginx:

```nginx
types {
    text/javascript          js mjs;
    application/json         json;
    application/octet-stream bin;
    image/webp               webp;
}
```

**Compression — the one setting that really matters.** The `.bin` lookup files are all
fetched on load and total ~30 MB uncompressed, but only ~8.4 MB gzipped (`country.bin`
and `region.bin` alone go from 4.7 MB each to under 50 KB). Textures and `.webp`/`.png`
are already compressed — gzipping them just burns CPU for nothing.

| First load | Without gzip | With gzip |
|---|---|---|
| lookup data (`*.bin`, `meta.json`) | 30.4 MB | 8.4 MB |
| viewer (`three.module.js`, `globe.js`, `widget.js`, CSS) | 0.7 MB | 0.2 MB |
| first texture (`texture_low.webp`) | 0.7 MB | 0.7 MB (already compressed) |
| **total** | **~32 MB** | **~9 MB** |

Higher texture tiers load afterwards, in the background, and never block interaction.

```nginx
gzip on;
gzip_types text/javascript text/css application/json application/octet-stream;
gzip_min_length 1024;
```

Apache (`.htaccess` inside `climate-globe/`):

```apache
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/javascript text/css application/json application/octet-stream
</IfModule>

# The dataset only changes when you replace this folder, so cache it hard.
<IfModule mod_expires.c>
  ExpiresActive On
  <FilesMatch "\.(bin|webp|png|js|css|json)$">
    ExpiresDefault "access plus 1 year"
    Header set Cache-Control "public, immutable"
  </FilesMatch>
</IfModule>
```

If you cache for a year, remember to change the folder name (e.g. `climate-globe-v2/`)
when you deploy an updated dataset, so returning visitors get the new one.

**CORS** — only needed if the files are served from a *different* origin than the page
(a separate assets domain or CDN). On that host:

```nginx
location /climate-globe/ {
    add_header Access-Control-Allow-Origin "https://yoursite.com";
}
```

For S3, that's a bucket CORS rule allowing `GET` from your site's origin. If you're
serving everything from one domain, no CORS configuration is needed at all.

**HTTPS.** Serve the assets over the same scheme as the page. An `https://` page can't
load `http://` assets — the browser blocks them as mixed content.

---

## Making it smaller

The full package is dominated by the globe's surface imagery, which ships in three
quality tiers plus PNG fallbacks for browsers without WebP support. **A visitor never
downloads the whole folder** — the page loads the small texture immediately, then
upgrades once in the background to whichever tier suits their connection, device, and
GPU. The size on disk matters for your hosting, not for your page-load time.

Roughly where the ~78 MB goes, and what trimming buys you on disk:

| Kept | Folder size |
|---|---|
| everything (default) | 78 MB |
| drop the `ultra` tier | 46 MB |
| drop `ultra` + the PNG fallbacks | 38 MB |
| `low` tier only, webp only | 32 MB |

The last row is the floor: ~30 MB of that is the climate/country/ZIP lookup data, which
is what makes every click instant and offline. (Gzipped over the wire it's ~8.4 MB — see
[Server configuration](#server-configuration).)

To trim, delete files and remove the matching entries from `meta.json`:

| To drop | Delete | Then edit `meta.json` |
|---|---|---|
| The highest-detail tier | `texture_ultra.webp`, `texture_ultra.png` | remove `"ultra"` from `textureTierOrder` and from `texture` |
| The mid tier as well | also `texture_high.*` | remove `"high"` the same way |
| WebP fallbacks (drops Safari 13 and older) | every `texture_*.png` | remove each `"fallbackFile"` line |

`meta.json` is plain text — open it in any editor. The `texture` block looks like this:

```json
"texture": {
  "low":  { "file": "texture_low.webp",  "fallbackFile": "texture_low.png",  "width": 2048,  "height": 1024 },
  "high": { "file": "texture_high.webp", "fallbackFile": "texture_high.png", "width": 8192,  "height": 4096 }
},
"textureTierOrder": ["low", "high"]
```

Keeping only `low` gives you a globe that's a fraction of the size and still perfectly
usable — noticeably softer when zoomed right in, indistinguishable at a normal viewing
distance.

If you generated this package yourself, `make_portable.py --max-tier high` and
`--no-png-fallback` do all of the above for you, `meta.json` edits included.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Blank space where the globe should be, "Failed to load module script" in the console | The page is open as a `file://` path, or `.js` is being served with the wrong MIME type. Serve over `http(s)://` — see [Try it locally first](#try-it-locally-first). |
| Console shows 404s for `meta.json` / `.bin` files | The `climate-globe/` folder wasn't uploaded completely, or `widget.js` isn't sitting alongside the data. Confirm `https://yoursite.com/climate-globe/meta.json` loads in a browser tab. |
| "Blocked by CORS policy" | The assets are on a different domain than the page. Add the CORS header on the asset host, or move the folder onto the same domain. |
| The globe appears but is very short, or 0px tall | The container has no height. Set `data-height`, or give your own wrapper an explicit height if you passed `data-height="100%"`. |
| Panel text is invisible or clashes with the page | Your site's styles are colliding. Set the `--cg-*` properties (see [Theming](#theming)) — most often `--cg-text` and `--cg-field-bg`. |
| Fonts or buttons look nothing like the rest of the site | That's the default dark styling. `--cg-font: inherit` plus the light-theme block usually gets you most of the way. |
| Globe stays blurry | It's still on the low-quality tier — either a slow or data-saver connection was detected, or the GPU can't hold a larger texture. Both are deliberate. |
| Two globes appear | The element has `data-climate-globe` *and* is being mounted by your own `mountClimateGlobe()` call. Drop the attribute. |
| The stats window stays empty, console warns "found no globe to follow" | `data-climate-stats` doesn't match the globe element. It takes an id or a selector — `data-climate-stats="#climate-globe"` for `<div id="climate-globe" …>`. |
| The numbers appear twice | Something is claiming the globe's built-in panel *and* a separate one. Either drop the `data-climate-stats` element or set `data-stats="false"` on the globe. |
| Stats panel is themed differently from the globe | The `--cg-*` overrides are scoped to an ancestor that only contains one of them. Put them on `:root` (see [Theming](#theming)). |
| Nothing happens on tap, but drag works | Taps are only registered on the sphere itself, not the space around it. |
| Works on desktop, blank on an older phone | No WebGL, or not enough memory for the texture. There's no fallback for a device without WebGL — consider hiding the section on such devices. |

To diagnose anything else, open your browser's developer console (F12) — the failing
request or error message is almost always the whole story.

---

## About the data

The globe shows an **atmospheric water-production estimate**: for each point on land,
how much water a unit is expected to produce there, derived from long-term climate
normals (temperature and humidity month by month). Colors on the globe run from the
driest regime to the wettest, as shown in the legend.

* `annual_mL_hr` — the annual average in millilitres/hour, the dataset's native unit;
  every other unit in [Units](#units) is derived from it.
* `annual_L_day` — the same figure in litres/day.
* `monthly_mL_hr` / `monthly_L_day` — the same, for each month, January to December.
* `regime` — a named band: `desert`, `arid`, `dry`, `low`, `temperate`, `high`, `tropic`.

Weekly and monthly figures are rates, not observations: a week is 7 days of that day's
rate and a month is 30.44 of them, so any per-month value times 12 is the annual figure.

Everything is precomputed and baked into this folder, including the country/state lookup
and the US ZIP code table. There is no live API behind it: the widget makes no network
requests other than fetching its own files, and no information about what a visitor
clicks leaves their browser.

These are climate-normal estimates for planning and comparison, not a performance
guarantee for any particular site or installation.

Ocean clicks return country/coordinates where available but no production figures —
`isLand` is `false` and the numeric fields are `null`.

---

## Updating

To publish a new dataset later, replace the whole `climate-globe/` folder. The HTML and
CSS in your pages don't change. If you set long cache lifetimes, either purge the CDN
cache or upload to a new folder name and update the two paths in your page.

If you pulled this with git, an update is:

```bash
git pull                      # a plain clone of the embed branch
git submodule update --remote  # if you added it as a submodule
```

The `embed` branch is rebuilt in place for each new dataset, so a pull always leaves you
with a complete, working folder — there's no partial state to reconcile. Re-upload
`climate-globe/` afterwards, and check `meta.json`'s `exportedAt` if you need to confirm
which dataset a deployed copy is running.
