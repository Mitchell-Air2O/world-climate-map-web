/**
 * Drop-in wrapper around ClimateGlobe.
 *
 * globe.js deliberately draws nothing but the globe itself -- every number it finds is
 * handed to the host page through the `locationselected` event, so the host owns its own
 * UI. That's the right split for a custom integration, but it means the simplest possible
 * "put this on my site" case still requires writing a panel, a chart, and two dropdowns
 * first.
 *
 * This module is that panel, prebuilt, in two independently mountable halves:
 *
 *   mountClimateGlobe()  the globe plus the controls that drive it (country/region
 *                        picker, ZIP box, status line)
 *   mountClimateStats()  the readout for whatever is currently selected (summary,
 *                        monthly chart, monthly table)
 *
 * They can live in the same <div> (the stats half is included by default, so the simple
 * case stays one element) or in two completely unrelated places in the page -- a globe in
 * a hero section and its numbers in a sidebar. Binding is by element/selector, not by DOM
 * proximity, so the host page's layout is entirely its own business.
 *
 * Volumes are converted from the dataset's native mL/hr into L or US gallons per day,
 * week, or month; `convert()`/`toUnits()` are exported so a host page building its own
 * chart gets the same numbers without redoing the arithmetic.
 *
 * Asset paths resolve from import.meta.url -- i.e. relative to this file, not to the page
 * embedding it -- so the folder can be dropped anywhere on a site (or a CDN) and the page
 * never has to declare where it went.
 */
import { ClimateGlobe } from "./globe.js";

export { ClimateGlobe };

const ASSET_BASE = new URL(".", import.meta.url).href.replace(/\/$/, "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LITRES_PER_GALLON = 3.785411784;
// Mean Gregorian month, so "per month" is the annual rate divided by 12 rather than a
// figure that silently depends on which month you're looking at.
const DAYS_PER_MONTH = 365.2425 / 12;

/**
 * Every selectable unit, as a multiplier on the dataset's native mL/hr.
 * `counterpart` is the same period in the other volume system -- what the summary shows
 * as its secondary line, so a US visitor reading gallons still sees the litre figure.
 */
export const UNITS = {
  "mL/hr":     { label: "mL/hr",     factor: 1,                                    counterpart: "L/day" },
  "L/day":     { label: "L/day",     factor: 0.024,                                counterpart: "gal/day" },
  "L/week":    { label: "L/week",    factor: 0.024 * 7,                            counterpart: "gal/week" },
  "L/month":   { label: "L/month",   factor: 0.024 * DAYS_PER_MONTH,               counterpart: "gal/month" },
  "gal/day":   { label: "gal/day",   factor: 0.024 / LITRES_PER_GALLON,            counterpart: "L/day" },
  "gal/week":  { label: "gal/week",  factor: 0.024 * 7 / LITRES_PER_GALLON,        counterpart: "L/week" },
  "gal/month": { label: "gal/month", factor: 0.024 * DAYS_PER_MONTH / LITRES_PER_GALLON, counterpart: "L/month" },
};

const DEFAULT_UNIT = "L/day";

function resolveUnit(unit) {
  if (!unit) return DEFAULT_UNIT;
  if (UNITS[unit]) return unit;
  const match = Object.keys(UNITS).find((u) => u.toLowerCase() === String(unit).toLowerCase());
  if (match) return match;
  console.warn(`ClimateGlobe: unknown unit "${unit}". Using ${DEFAULT_UNIT}. ` +
    `Valid units: ${Object.keys(UNITS).join(", ")}`);
  return DEFAULT_UNIT;
}

/** Convert the dataset's native mL/hr figure into `unit`. */
export function convert(mLPerHr, unit = DEFAULT_UNIT) {
  if (mLPerHr == null) return null;
  return mLPerHr * UNITS[resolveUnit(unit)].factor;
}

/**
 * Re-express a `locationselected` detail in one unit:
 * `{ unit, label, annual, monthly: [12] }` (annual/monthly null for ocean points).
 * This is the entry point for a host page drawing its own chart in its own units.
 */
export function toUnits(detail, unit = DEFAULT_UNIT) {
  const key = resolveUnit(unit);
  const { factor, label } = UNITS[key];
  return {
    unit: key,
    label,
    annual: detail.annual_mL_hr == null ? null : detail.annual_mL_hr * factor,
    monthly: detail.monthly_mL_hr ? detail.monthly_mL_hr.map((v) => v * factor) : null,
  };
}

/** Significant-ish figures: keeps 0.42 gal/day and 316 L/month both readable. */
export function formatValue(value) {
  const abs = Math.abs(value);
  return value.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return !/^(false|0|no|off)$/i.test(String(value));
}

function readDataset(el, keys) {
  const out = {};
  for (const key of keys) {
    if (el.dataset[key] !== undefined && el.dataset[key] !== "") out[key] = el.dataset[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stats panel
// ---------------------------------------------------------------------------

const STATS_DEFAULTS = {
  units: DEFAULT_UNIT,
  summary: true,     // coordinates / country / regime / annual figure
  chart: true,       // monthly line chart
  table: true,       // monthly value table
  empty: "Pick a location on the globe to see its numbers.",
};

function renderChart(svg, values) {
  const W = 520, H = 180;
  const padL = 8, padR = 8, padT = 10, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vMax = Math.max(...values, Number.MIN_VALUE) * 1.15;
  const x = (i) => padL + (i / (values.length - 1)) * plotW;
  const y = (v) => padT + plotH - (v / vMax) * plotH;

  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPts = `${x(0).toFixed(1)},${y(0).toFixed(1)} ${pts} ${x(values.length - 1).toFixed(1)},${y(0).toFixed(1)}`;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const yy = (padT + plotH * (1 - f)).toFixed(1);
    return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="cg-chart-grid" />`;
  }).join("");
  const dots = values.map((v, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" class="cg-chart-dot" />`
  ).join("");
  const labels = MONTHS.map((m, i) =>
    `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="cg-chart-label" text-anchor="middle">${m[0]}</text>`
  ).join("");

  svg.innerHTML = `${grid}<polygon points="${areaPts}" class="cg-chart-area"/>` +
    `<polyline points="${pts}" class="cg-chart-line"/>${dots}${labels}`;
}

/** The readout half, with no knowledge of any globe -- it just renders whatever detail
 * it's handed. mountClimateStats wires it to a globe; a host page can drive it directly. */
function createStatsPanel(options = {}) {
  const opts = { ...STATS_DEFAULTS, ...options };
  const unit = resolveUnit(opts.units);
  const { label: unitLabel } = UNITS[unit];

  const root = document.createElement("div");
  root.className = "cg-stats";
  root.innerHTML = `
    ${opts.empty ? `<div class="cg-empty" data-cg="empty">${escapeHtml(opts.empty)}</div>` : ""}
    <div class="cg-results">
      ${opts.summary ? `<div class="cg-summary" data-cg="summary" hidden></div>` : ""}
      ${opts.chart ? `
      <div class="cg-chart-wrap" data-cg="chart-wrap" hidden>
        <div class="cg-chart-title">Monthly production estimate (${escapeHtml(unitLabel)})</div>
        <svg class="cg-chart" data-cg="chart" viewBox="0 0 520 180" preserveAspectRatio="none"
             role="img" aria-label="Monthly production estimate"></svg>
      </div>` : ""}
    </div>
    ${opts.table ? `
    <table class="cg-table" data-cg="table" hidden>
      <thead><tr><th>Month</th><th>Production estimate (${escapeHtml(unitLabel)})</th></tr></thead>
      <tbody data-cg="table-body"></tbody>
    </table>` : ""}`;

  const $ = (name) => root.querySelector(`[data-cg="${name}"]`);
  const emptyEl = $("empty");
  const summaryEl = $("summary");
  const chartWrap = $("chart-wrap");
  const chartEl = $("chart");
  const tableEl = $("table");
  const tableBody = $("table-body");

  const row = (label, value, sub = false) =>
    `<div class="cg-row${sub ? " cg-row-sub" : ""}"><span>${label}</span><span>${value}</span></div>`;
  const geoLine = (name, code) => (name ? (code ? `${name} (${code})` : name) : "—");

  function update(detail) {
    if (!detail) return clear();
    if (emptyEl) emptyEl.hidden = true;

    const geoRows =
      row("Coordinates", `${detail.lat.toFixed(3)}, ${detail.lon.toFixed(3)}`) +
      row("Country", escapeHtml(geoLine(detail.country, detail.countryCode))) +
      row("Region", escapeHtml(geoLine(detail.region, detail.regionCode)));

    if (!detail.isLand) {
      if (summaryEl) {
        summaryEl.innerHTML = geoRows + row("Climate data", "ocean — n/a");
        summaryEl.hidden = false;
      }
      if (chartWrap) chartWrap.hidden = true;
      if (tableEl) tableEl.hidden = true;
      return;
    }

    const primary = toUnits(detail, unit);
    const other = toUnits(detail, UNITS[unit].counterpart);

    if (summaryEl) {
      summaryEl.innerHTML = geoRows +
        row("Regime", escapeHtml(detail.regime)) +
        row("Annual avg.", `${formatValue(primary.annual)} ${primary.label}`) +
        row("", `${formatValue(other.annual)} ${other.label}`, true);
      summaryEl.hidden = false;
    }
    if (chartWrap) {
      renderChart(chartEl, primary.monthly);
      chartWrap.hidden = false;
    }
    if (tableEl) {
      tableBody.innerHTML = primary.monthly
        .map((v, i) => `<tr><td>${MONTHS[i]}</td><td>${formatValue(v)}</td></tr>`)
        .join("");
      tableEl.hidden = false;
    }
  }

  function clear() {
    if (emptyEl) emptyEl.hidden = false;
    if (summaryEl) summaryEl.hidden = true;
    if (chartWrap) chartWrap.hidden = true;
    if (tableEl) tableEl.hidden = true;
  }

  return { element: root, unit, update, clear };
}

/**
 * Resolve whatever the caller passed as "the globe": a handle from mountClimateGlobe, a
 * ClimateGlobe, a mounted element, or a selector/id for one.
 */
function resolveGlobe(ref, scope = document) {
  if (!ref) {
    const el = scope.querySelector("[data-climate-globe]");
    return el && el.__climateGlobe ? el.__climateGlobe : null;
  }
  if (ref.globe instanceof ClimateGlobe) return ref;              // a mount handle
  if (ref instanceof ClimateGlobe) return { globe: ref };         // a bare globe
  const el = typeof ref === "string"
    ? (scope.querySelector(ref) || document.getElementById(ref.replace(/^#/, "")))
    : ref;
  return el && el.__climateGlobe ? el.__climateGlobe : null;
}

/**
 * Mount a stats panel into `target`, following the globe identified by `options.globe`
 * (a handle, a ClimateGlobe, an element, or a selector/id -- defaults to the first
 * globe on the page). Returns `{ element, update(detail), clear(), destroy() }`; call
 * `update()` yourself if you'd rather feed it from your own logic.
 */
export function mountClimateStats(target, options = {}) {
  const mount = typeof target === "string" ? document.querySelector(target) : target;
  if (!mount) throw new Error(`mountClimateStats: container not found: ${target}`);
  if (mount.__climateStats) return mount.__climateStats;

  const attrs = readDataset(mount, ["units", "summary", "chart", "table", "empty"]);
  // An explicit `globe: null` means "don't bind to anything -- I'll call update() myself";
  // omitting it entirely falls back to the data-attribute, then to the page's first globe.
  const globeRef = options.globe !== undefined ? options.globe : mount.dataset.climateStats;
  const handle = globeRef === null ? null : resolveGlobe(globeRef);

  const panel = createStatsPanel({
    // A stats panel with no unit of its own inherits the globe's, so `data-units` on the
    // globe still governs a page that never mentions units again.
    units: attrs.units ?? options.units ?? handle?.units ?? DEFAULT_UNIT,
    // parseBool on both sources: the option may itself be a data-attribute string
    // forwarded from the globe element ("false", not false).
    summary: parseBool(attrs.summary ?? options.summary, true),
    chart: parseBool(attrs.chart ?? options.chart, true),
    table: parseBool(attrs.table ?? options.table, true),
    empty: attrs.empty ?? options.empty ?? STATS_DEFAULTS.empty,
  });
  mount.appendChild(panel.element);

  let detach = null;

  const statsHandle = {
    element: panel.element,
    unit: panel.unit,
    update: panel.update,
    clear: panel.clear,
    destroy() {
      detach?.();
      if (handle?.unregisterStats) handle.unregisterStats(statsHandle);
      panel.element.remove();
      delete mount.__climateStats;
    },
  };
  mount.__climateStats = statsHandle;

  if (handle) {
    const onSelect = (e) => panel.update(e.detail);
    handle.globe.addEventListener("locationselected", onSelect);
    detach = () => handle.globe.removeEventListener("locationselected", onSelect);
    handle.registerStats?.(statsHandle);
    // Catch up if the globe was already showing something when this panel mounted.
    const last = handle.globe.getLastSelection();
    if (last) panel.update(last);
  } else if (options.globe !== null) {
    console.warn("ClimateGlobe: stats panel found no globe to follow. " +
      "Mount the globe first, or pass { globe } / data-climate-stats=\"#globe-id\".");
  }

  return statsHandle;
}

// ---------------------------------------------------------------------------
// Globe panel
// ---------------------------------------------------------------------------

const GLOBE_DEFAULTS = {
  dataUrl: ASSET_BASE,
  height: "460px",
  layout: "stacked",      // "stacked" | "side"
  units: DEFAULT_UNIT,
  picker: true,           // country + region dropdowns
  zip: true,              // US ZIP lookup box
  status: true,           // one-line status/error text
  stats: true,            // include a stats panel below the globe
  start: null,            // "lat,lon" or [lat, lon] -- pin dropped on load
  startZip: null,         // ZIP dropped on load (takes precedence over `start`)
};

const GLOBE_BOOL_KEYS = ["picker", "zip", "status", "stats"];

function resolveGlobeOptions(el, options) {
  const d = el.dataset;
  const merged = { ...GLOBE_DEFAULTS, ...options };

  if (d.src) merged.dataUrl = d.src.replace(/\/$/, "");
  if (d.height) merged.height = d.height;
  if (d.layout) merged.layout = d.layout;
  if (d.units) merged.units = d.units;
  if (d.start) merged.start = d.start;
  if (d.startZip) merged.startZip = d.startZip;
  for (const key of GLOBE_BOOL_KEYS) merged[key] = parseBool(d[key], merged[key]);
  merged.units = resolveUnit(merged.units);

  return merged;
}

function buildGlobeShell(opts) {
  const root = document.createElement("div");
  root.className = `cg-widget cg-layout-${opts.layout === "side" ? "side" : "stacked"}`;

  const controls = [];
  if (opts.picker) {
    controls.push(`
      <div class="cg-field">
        <label class="cg-label" for="cg-country">Country</label>
        <select class="cg-select" id="cg-country" data-cg="country"><option value="">Country…</option></select>
      </div>
      <div class="cg-field">
        <label class="cg-label" for="cg-region">State / region</label>
        <select class="cg-select" id="cg-region" data-cg="region" disabled><option value="">Region…</option></select>
      </div>`);
  }
  if (opts.zip) {
    controls.push(`
      <div class="cg-field">
        <label class="cg-label" for="cg-zip">US ZIP code</label>
        <form class="cg-zip-form" data-cg="zip-form">
          <input class="cg-input" id="cg-zip" type="text" inputmode="numeric"
                 autocomplete="postal-code" placeholder="e.g. 97041" data-cg="zip-input" />
          <button class="cg-button" type="submit">Go</button>
        </form>
      </div>`);
  }

  root.innerHTML = `
    <div class="cg-globe" data-cg="globe" style="height:${escapeHtml(opts.height)}"></div>
    <div class="cg-panel" data-cg="panel">
      ${controls.length ? `<div class="cg-controls">${controls.join("")}</div>` : ""}
      ${opts.status ? `<div class="cg-status" data-cg="status" role="status" aria-live="polite">Tap the globe${opts.picker ? ", pick a country" : ""}${opts.zip ? ", or enter a ZIP code" : ""}.</div>` : ""}
    </div>`;

  return root;
}

/**
 * Build the globe (and the controls that drive it) inside `target`, returning
 * `{ element, globe, units, getData(), attachStats(), destroy() }`. `globe` is the
 * underlying ClimateGlobe, so the full programmatic API stays available to the host page.
 */
export function mountClimateGlobe(target, options = {}) {
  const mount = typeof target === "string" ? document.querySelector(target) : target;
  if (!mount) throw new Error(`mountClimateGlobe: container not found: ${target}`);
  if (mount.__climateGlobe) return mount.__climateGlobe;

  const opts = resolveGlobeOptions(mount, options);
  const root = buildGlobeShell(opts);
  mount.appendChild(root);

  const $ = (name) => root.querySelector(`[data-cg="${name}"]`);
  const statusEl = $("status");
  const globe = new ClimateGlobe($("globe"), { dataUrl: opts.dataUrl });
  const statsPanels = new Set();

  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  const handle = {
    element: root,
    globe,
    units: opts.units,
    /** The latest raw `locationselected` detail (null before the first pick) -- the
     * starting point for a host page's own chart. Pair with toUnits() for gallons etc. */
    getData: () => globe.getLastSelection(),
    /** Add a stats panel in some other part of the page after the fact. */
    attachStats(statsTarget, statsOptions = {}) {
      return mountClimateStats(statsTarget, { units: opts.units, ...statsOptions, globe: handle });
    },
    registerStats(panel) { statsPanels.add(panel); },
    unregisterStats(panel) { statsPanels.delete(panel); },
    destroy() {
      for (const panel of [...statsPanels]) panel.destroy();
      globe.destroy();
      root.remove();
      delete mount.__climateGlobe;
    },
  };
  mount.__climateGlobe = handle;

  globe.addEventListener("locationselected", (e) => {
    const d = e.detail;
    setStatus(d.zip ? `ZIP ${escapeHtml(d.zip)}` : `${d.lat.toFixed(2)}°, ${d.lon.toFixed(2)}°`);
    // Bubbling DOM event as well as the globe's own: lets a page that can't hold the
    // module handle (an inline snippet in a CMS, say) listen on document instead.
    mount.dispatchEvent(new CustomEvent("climate-globe:select", { detail: d, bubbles: true }));
  });

  globe.addEventListener("locationerror", (e) => {
    const { reason, zip } = e.detail;
    setStatus(reason === "zip-not-found"
      ? `ZIP ${zip} not found — try a nearby one, or tap the globe.`
      : "No data for that selection.");
  });

  if (opts.zip) {
    $("zip-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const value = $("zip-input").value.trim();
      if (value) {
        // Dismisses the on-screen keyboard, which otherwise covers the globe it just
        // flew to on a phone.
        $("zip-input").blur();
        globe.goToZip(value);
      }
    });
  }

  if (opts.picker) {
    const countrySelect = $("country");
    const regionSelect = $("region");

    const addOptions = (select, items) => {
      const frag = document.createDocumentFragment();
      for (const item of items.slice().sort((a, b) => a.name.localeCompare(b.name))) {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.name;
        frag.appendChild(opt);
      }
      select.appendChild(frag);
    };

    globe.getCountries().then((countries) => addOptions(countrySelect, countries));

    countrySelect.addEventListener("change", async () => {
      regionSelect.innerHTML = '<option value="">Region…</option>';
      regionSelect.disabled = true;
      const countryId = parseInt(countrySelect.value, 10);
      if (!countryId) return;

      // Not every country in the bundle has admin-1 detail; the dropdown stays disabled
      // rather than showing an empty list when it doesn't.
      const regions = await globe.getRegions(countryId);
      if (regions.length) {
        addOptions(regionSelect, regions);
        regionSelect.disabled = false;
      }
      globe.goToCountry(countryId);
    });

    regionSelect.addEventListener("change", () => {
      const regionId = parseInt(regionSelect.value, 10);
      if (regionId) globe.goToRegion(regionId);
    });
  }

  if (opts.stats) {
    const statsHost = document.createElement("div");
    statsHost.className = "cg-stats-host";
    $("panel").appendChild(statsHost);
    handle.attachStats(statsHost, {
      units: opts.units,
      summary: options.summary,
      chart: options.chart,
      table: options.table,
      ...readDataset(mount, ["summary", "chart", "table"]),
    });
  }

  if (opts.startZip) {
    globe.goToZip(opts.startZip);
  } else if (opts.start) {
    const [lat, lon] = Array.isArray(opts.start)
      ? opts.start
      : String(opts.start).split(",").map((v) => parseFloat(v.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lon)) globe.goToCoord(lat, lon);
  }

  return handle;
}

// ---------------------------------------------------------------------------
// Auto-mount
// ---------------------------------------------------------------------------

/**
 * Mounts every `[data-climate-globe]` and `[data-climate-stats]` element that isn't
 * mounted yet. Safe to call again after injecting more markup.
 *
 * A globe includes its own stats panel by default, but drops it when some
 * `[data-climate-stats]` element on the page already points at that globe -- so putting
 * the numbers elsewhere is just a matter of adding the second element, with nothing to
 * switch off on the first.
 */
export function autoMount(scope = document) {
  const statsEls = [...scope.querySelectorAll("[data-climate-stats]")].filter((el) => !el.__climateStats);
  const globeEls = [...scope.querySelectorAll("[data-climate-globe]")].filter((el) => !el.__climateGlobe);

  const claimed = new Set();
  for (const el of statsEls) {
    const ref = el.dataset.climateStats;
    const target = ref
      ? (scope.querySelector(ref) || document.getElementById(ref.replace(/^#/, "")))
      : globeEls[0];
    if (target) claimed.add(target);
  }

  const globes = globeEls.map((el) => mountClimateGlobe(el, claimed.has(el) ? { stats: false } : {}));
  const stats = statsEls.map((el) => mountClimateStats(el));
  return { globes, stats };
}

// Non-module pages (and inline snippets in a CMS) can reach the API without an import.
if (typeof window !== "undefined") {
  window.ClimateGlobeWidget = {
    mount: mountClimateGlobe,
    mountStats: mountClimateStats,
    autoMount,
    convert,
    toUnits,
    formatValue,
    UNITS,
    ClimateGlobe,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => autoMount());
} else {
  autoMount();
}
