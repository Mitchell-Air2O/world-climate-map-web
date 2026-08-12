/**
 * ClimateGlobe — embeddable water-regime globe.
 *
 * Rendering is a single equirectangular texture (colors + coastlines baked in
 * at export time) wrapped on a plain sphere, so cost is independent of the
 * source climate resolution. Three standalone texture tiers are exported
 * ("low"/"high"/"ultra", ascending quality); the globe paints with "low"
 * immediately (so the animation is up and interactive right away), then picks
 * a single target tier up front from connection + device signals and jumps
 * straight there in the background (pickTargetTierIndex/_upgradeToTier) —
 * low -> high or low -> ultra, never stepping through the tier in between —
 * crossfading it in over the mesh (_swapTextureSmooth) rather than an abrupt
 * pop. (A residual/delta encoding — each
 * tier shipped as just the difference from the previous one, to avoid
 * re-downloading what "low" already implied — was tried and measured 10-23%
 * *larger* than standalone tiers for this content, a continuous gradient
 * rather than flat regions, so it was reverted; see export_web.py's
 * _bake_texture docstring.)
 * All per-location numeric data (regime, annual + monthly production in both
 * L/day and mL/hr, plus country/region from a baked admin-boundary lookup) is
 * delivered via the `locationselected` event — this module draws no chart/
 * table/dropdown itself, so the host page owns its own UI (see getCountries/
 * getRegions/goToCountry/goToRegion for populating a country+region picker).
 *
 * Coordinate convention: Z is the polar axis (matches the desktop app), so
 * xyzFromLatLon/latLonFromXYZ and the turntable camera math are direct ports
 * of the Python renderer. Sphere vertex positions are generated from Three's
 * own default UV (not its default Y-up position formula) so the texture
 * mapping and our own lat/lon convention are guaranteed consistent.
 */
import * as THREE from "./vendor/three.module.js";

const EL_LIMIT = 85.0;
const DIST_MIN = 1.4;
const DIST_MAX = 10.0;
// A finger wobbles far more than a mouse does, and on a phone a tap that moves 5px is
// still unambiguously a tap -- holding touch to the mouse threshold made the globe feel
// like it was ignoring taps.
const CLICK_MAX_DRAG_PX = 4;
const CLICK_MAX_DRAG_PX_TOUCH = 14;
// Fly-to duration scales with angular travel so a short hop across the street
// doesn't take as long as a flight to the antipodes.
const FLY_DURATION_MIN_MS = 350;
const FLY_DURATION_MAX_MS = 1700;
const FLY_DURATION_MS_PER_DEGREE = 5.5;
// Diameter of the marker in CSS pixels. It's resolved against the camera frustum and the
// canvas height every frame (see _updatePin), so it holds this size however far you've
// zoomed *and* whatever the canvas measures -- a fixed world-space marker swamps the view
// zoomed in and vanishes zoomed out, and one sized as a fraction of the frustum silently
// shrinks on the short canvas a phone gets. This is the one number to change to resize it.
const PIN_SCREEN_PX = 10;

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

function normalizeLon(lon) {
  return (((lon + 180) % 360) + 360) % 360 - 180;
}

// mL/hr -> L/day: 24 hr/day, 1000 mL/L.
function mLHrToLDay(mLPerHr) { return (mLPerHr * 24) / 1000; }

function xyzFromLatLon(latDeg, lonDeg, r = 1.0) {
  const lat = degToRad(latDeg);
  const lon = degToRad(lonDeg);
  return [
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
  ];
}

function latLonFromXYZ(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z);
  const lat = radToDeg(Math.asin(clamp(z / r, -1, 1)));
  const lon = radToDeg(Math.atan2(y, x));
  return [lat, lon];
}

// ---------------------------------------------------------------------------
// Binary data parsing
// ---------------------------------------------------------------------------

function buildLandIndex(landBits, totalCells) {
  // Exclusive prefix-sum: prefix[k] = number of land cells before position k.
  // For a land cell this is exactly its rank in the packed annual/monthly arrays
  // (numpy boolean-mask selection order matches this scan order).
  const prefix = new Uint32Array(totalCells);
  let count = 0;
  for (let k = 0; k < totalCells; k++) {
    prefix[k] = count;
    const byte = landBits[k >> 3];
    const bit = (byte >> (7 - (k & 7))) & 1;
    if (bit) count++;
  }
  return prefix;
}

function parseZipTable(buffer) {
  const dv = new DataView(buffer);
  const n = buffer.byteLength / 8;
  const zips = new Uint32Array(n);
  const lats = new Int16Array(n);
  const lons = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * 8;
    zips[i] = dv.getUint32(off, true);
    lats[i] = dv.getInt16(off + 4, true);
    lons[i] = dv.getInt16(off + 6, true);
  }
  return { zips, lats, lons };
}

function findZip(table, zipCode) {
  let lo = 0, hi = table.zips.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = table.zips[mid];
    if (v === zipCode) return mid;
    if (v < zipCode) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

function classifyRegime(value, centres) {
  let best = null, bestDist = Infinity;
  for (const name in centres) {
    const d = Math.abs(value - centres[name]);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

// Synchronous WebP feature check, so the texture URL is picked before the
// (possibly large) fetch starts. Falls back to a PNG export for browsers
// without WebP decoding, so the bundle works everywhere.
let _webpSupportCache = null;
function supportsWebP() {
  if (_webpSupportCache !== null) return _webpSupportCache;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    _webpSupportCache = canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  } catch {
    _webpSupportCache = false;
  }
  return _webpSupportCache;
}

// Network Information API is Chromium-only, so most browsers report nothing here. Absence
// of a signal is treated as "not known to be slow" and climbs the full tier chain anyway --
// each step is a background fetch that never blocks interaction, so there's little downside
// beyond bytes, and it's the only way Safari/Firefox users (no API at all) ever reach "ultra".
// A *confirmed* slow/data-saver signal is the one thing that stops the climb early.
function isSlowConnection() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return false;
  if (c.saveData) return true;
  if (c.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType)) return true;
  if (typeof c.downlink === "number" && c.downlink > 0 && c.downlink < 1.5) return true;
  return false;
}

function tierFile(tier) {
  return supportsWebP() || !tier.fallbackFile ? tier.file : tier.fallbackFile;
}

// Decides how far up the tier chain to jump, from connection + device signals checked
// once up front -- so the globe goes straight from "low" to the appropriate target
// (e.g. low -> ultra directly) instead of stepping through every tier in between.
// Only the topmost tier that fits the GPU's own MAX_TEXTURE_SIZE additionally needs the
// stricter bandwidth/memory/CPU bar; any tier below that only needs to physically fit.
// Absence of a given signal (most non-Chromium browsers report none of these) is treated
// as "good enough" rather than a reason to hold everyone back at "low".
function pickTargetTierIndex(tierChain, textureMeta, renderer) {
  if (isSlowConnection()) return 0;

  const maxTextureSize = renderer.capabilities.maxTextureSize;
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const downlink = c && typeof c.downlink === "number" ? c.downlink : null;
  const deviceMemory = navigator.deviceMemory;   // GB, Chromium-only
  const cores = navigator.hardwareConcurrency;

  const bandwidthOk = downlink === null || downlink >= 8;
  const memoryOk = deviceMemory === undefined || deviceMemory >= 4;
  const coresOk = cores === undefined || cores >= 4;
  const capableEnough = bandwidthOk && memoryOk && coresOk;

  let target = 0;
  for (let i = tierChain.length - 1; i >= 0; i--) {
    if (textureMeta[tierChain[i]].width > maxTextureSize) continue;
    if (i === tierChain.length - 1 && !capableEnough) continue;
    target = i;
    break;
  }
  return target;
}

// ---------------------------------------------------------------------------
// Legend (HTML/CSS overlay, not canvas)
// ---------------------------------------------------------------------------

function buildLegend(meta) {
  const el = document.createElement("div");
  el.className = "climate-globe-legend";

  const title = document.createElement("div");
  title.className = "climate-globe-legend-title";
  title.textContent = "Water Regime";
  el.appendChild(title);

  const body = document.createElement("div");
  body.className = "climate-globe-legend-body";

  const names = meta.regimes.order;
  const centres = meta.regimes.centres;
  const colors = meta.regimes.colors;
  const vals = names.map((n) => centres[n]);
  const vMin = Math.min(...vals), vMax = Math.max(...vals);

  const stops = names.map((n) => {
    const t = vMax > vMin ? (centres[n] - vMin) / (vMax - vMin) : 0;
    return `${colors[n]} ${(t * 100).toFixed(1)}%`;
  });
  const bar = document.createElement("div");
  bar.className = "climate-globe-legend-bar";
  bar.style.background = `linear-gradient(to top, ${stops.join(", ")})`;
  body.appendChild(bar);

  const labels = document.createElement("div");
  labels.className = "climate-globe-legend-labels";
  // Reverse so the wettest regime label lines up with the top of the (bottom-to-top) bar.
  for (const n of [...names].reverse()) {
    const row = document.createElement("div");
    row.className = "climate-globe-legend-label";
    const sw = document.createElement("span");
    sw.className = "climate-globe-legend-swatch";
    sw.style.background = colors[n];
    row.appendChild(sw);
    row.appendChild(document.createTextNode(n.charAt(0).toUpperCase() + n.slice(1)));
    labels.appendChild(row);
  }
  body.appendChild(labels);
  el.appendChild(body);
  return el;
}

// ---------------------------------------------------------------------------
// ClimateGlobe
// ---------------------------------------------------------------------------

export class ClimateGlobe extends EventTarget {
  constructor(target, options = {}) {
    super();
    const container = typeof target === "string" ? document.querySelector(target) : target;
    if (!container) throw new Error(`ClimateGlobe: container not found: ${target}`);
    this._container = container;
    this._dataUrl = (options.dataUrl ?? ".").replace(/\/$/, "");
    this._state = null;
    this._pinActor = null;
    this._pinDir = null;
    this._lastSelection = null;
    this._cam = { az: 0, el: 15, dist: 3.5 };
    this._drag = { active: false, last: null, pressPos: null };
    this._pointers = new Map();   // pointerId -> {x, y}, for pinch-to-zoom on touch
    this._pinch = null;           // {startDist, startCamDist} while 2+ pointers are down
    this._flying = null;

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    this._canvas = document.createElement("canvas");
    this._canvas.style.width = "100%";
    this._canvas.style.height = "100%";
    this._canvas.style.display = "block";
    this._canvas.style.cursor = "grab";
    // Without this, mobile browsers intercept touch gestures for page pinch-zoom/scroll
    // instead of handing them to our pointer handlers below.
    this._canvas.style.touchAction = "none";
    container.appendChild(this._canvas);

    this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true });
    // Device pixel ratio doubles as supersampling antialiasing -- it smooths texture/shader
    // aliasing (e.g. the coastline detail, moire at oblique angles) that MSAA's geometry-edge
    // smoothing alone doesn't reach. maxTextureSize is already the proxy this module uses
    // elsewhere (texture-tier selection) for "is this a capable GPU", so reuse it here too
    // instead of a flat cap: more supersampling where the hardware can afford it, less where
    // it can't (rendering fewer pixels matters more for battery/thermals on weak hardware
    // than the extra smoothing would gain).
    const maxTexSize = this._renderer.capabilities.maxTextureSize;
    const pixelRatioCap = maxTexSize >= 16000 ? 3 : maxTexSize >= 8192 ? 2 : 1;
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this._camera.up.set(0, 0, 1);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);
    this._resize();

    this._raycaster = new THREE.Raycaster();

    this._canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    window.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerup", (e) => this._onPointerUp(e));
    window.addEventListener("pointercancel", (e) => this._onPointerCancel(e));
    this._canvas.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });

    this._updateCamera();
    this._renderer.setAnimationLoop(() => this._renderer.render(this._scene, this._camera));

    this._ready = this._init();
  }

  async _loadTexture(url) {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Equirectangular-on-sphere mapping compresses many texels into a small screen
    // area near the poles; without anisotropic filtering that minification reads as
    // blur. getMaxAnisotropy() safely returns 1 (a no-op) on hardware/browsers that
    // don't support the extension, so this is a safe no-op fallback everywhere.
    texture.anisotropy = this._renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  async _init() {
    const meta = await (await fetch(`${this._dataUrl}/meta.json`)).json();
    const files = meta.files;
    this._tierChain = meta.textureTierOrder;   // ascending quality, e.g. ["low", "high", "ultra"]
    this._tierStage = 0;   // index into _tierChain of the tier currently applied
    // Load the base ("low") texture tier first so the globe paints -- and is interactive --
    // almost instantly; a single higher tier is picked and fetched in the background
    // afterward (see pickTargetTierIndex/_upgradeToTier), each tier a standalone image.
    const [landBuf, annualBuf, monthlyBuf, zipBuf, countryBuf, regionBuf, texture] = await Promise.all([
      fetch(`${this._dataUrl}/${files.landMask}`).then((r) => r.arrayBuffer()),
      fetch(`${this._dataUrl}/${files.annual}`).then((r) => r.arrayBuffer()),
      fetch(`${this._dataUrl}/${files.monthly}`).then((r) => r.arrayBuffer()),
      fetch(`${this._dataUrl}/${files.zips}`).then((r) => r.arrayBuffer()),
      fetch(`${this._dataUrl}/${files.country}`).then((r) => r.arrayBuffer()),
      fetch(`${this._dataUrl}/${files.region}`).then((r) => r.arrayBuffer()),
      this._loadTexture(`${this._dataUrl}/${tierFile(meta.texture[this._tierChain[0]])}`),
    ]);

    const grid = meta.grid;
    const landBits = new Uint8Array(landBuf);
    const state = {
      meta,
      landBits,
      landPrefix: buildLandIndex(landBits, grid.height * grid.width),
      // Native TypedArray byte order is little-endian on every real-world
      // browser platform, matching the '<u2' export encoding.
      annual: new Uint16Array(annualBuf),
      monthly: new Uint16Array(monthlyBuf),
      zipTable: parseZipTable(zipBuf),
      // Full-grid id lookups (0 = no data), same row/col math as land/annual/monthly --
      // no separate compaction needed since these aren't restricted to land cells.
      countryIds: new Uint16Array(countryBuf),
      regionIds: new Uint16Array(regionBuf),
    };
    this._state = state;

    const geometry = new THREE.SphereGeometry(1, 128, 64);
    const uv = geometry.attributes.uv;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lon = uv.getX(i) * 360 - 180;
      const lat = uv.getY(i) * 180 - 90;
      const [x, y, z] = xyzFromLatLon(lat, lon, 1.0);
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({ map: texture });
    this._globeMesh = new THREE.Mesh(geometry, material);
    this._scene.add(this._globeMesh);

    const legend = buildLegend(meta);
    this._container.appendChild(legend);

    this.dispatchEvent(new CustomEvent("ready", { detail: { meta } }));

    const targetIndex = pickTargetTierIndex(this._tierChain, meta.texture, this._renderer);
    if (targetIndex > this._tierStage) this._upgradeToTier(targetIndex);
  }

  /** Fetches exactly `targetIndex`'s tier -- skipping any tier in between -- and
   * crossfades it in over the mesh. */
  async _upgradeToTier(targetIndex) {
    const tierName = this._tierChain[targetIndex];
    const tier = this._state.meta.texture[tierName];
    const url = `${this._dataUrl}/${tierFile(tier)}`;
    const nextTexture = await this._loadTexture(url);
    await this._swapTextureSmooth(nextTexture);
    this._tierStage = targetIndex;
    this.dispatchEvent(new CustomEvent("texturequalityupgraded", { detail: { tier: tierName, stage: targetIndex } }));
  }

  /** Cross-fades `nextTexture` in over the current one instead of an abrupt swap: a
   * transparent overlay mesh (same geometry; depthWrite off so it can't z-fight the
   * opaque original) fades from 0 to full opacity, then the base mesh's material is
   * updated and the overlay is torn down. */
  async _swapTextureSmooth(nextTexture, durationMs = 600) {
    const overlayMaterial = new THREE.MeshBasicMaterial({
      map: nextTexture, transparent: true, opacity: 0, depthWrite: false,
    });
    const overlay = new THREE.Mesh(this._globeMesh.geometry, overlayMaterial);
    overlay.renderOrder = this._globeMesh.renderOrder + 1;
    this._scene.add(overlay);

    await new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        overlayMaterial.opacity = Math.min(1, (now - start) / durationMs);
        if (overlayMaterial.opacity < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    const prevTexture = this._globeMesh.material.map;
    this._globeMesh.material.map = nextTexture;
    this._globeMesh.material.needsUpdate = true;
    this._scene.remove(overlay);
    overlayMaterial.dispose();
    prevTexture.dispose();
  }

  /** Resolves once initial data + texture are loaded and the globe is visible. */
  ready() { return this._ready; }

  _resize() {
    const w = this._container.clientWidth || 1;
    const h = this._container.clientHeight || 1;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  _updateCamera() {
    const az = degToRad(this._cam.az);
    const el = degToRad(this._cam.el);
    const d = this._cam.dist;
    this._camera.position.set(
      d * Math.cos(el) * Math.cos(az),
      d * Math.cos(el) * Math.sin(az),
      d * Math.sin(el),
    );
    this._camera.up.set(0, 0, 1);
    this._camera.lookAt(0, 0, 0);
    this._updatePin();
  }

  _cancelFlight() {
    if (this._flying) this._flying.cancelled = true;
  }

  _onPointerDown(e) {
    this._cancelFlight();
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Can throw in edge cases (e.g. the pointer already released) -- capture is a nicety
    // for tracking drags past the canvas edge, not required for gesture recognition itself.
    try { this._canvas.setPointerCapture(e.pointerId); } catch { /* not fatal */ }

    if (this._pointers.size === 2) {
      // A second touch just landed: switch to pinch-zoom and abandon any single-finger
      // drag/click tracking, so lifting fingers afterward doesn't drop a pin.
      this._drag.active = false;
      this._drag.pressPos = null;
      const [p1, p2] = this._pointers.values();
      this._pinch = {
        startDist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        startCamDist: this._cam.dist,
      };
    } else if (this._pointers.size === 1) {
      this._drag.active = true;
      this._drag.last = [e.clientX, e.clientY];
      this._drag.pressPos = [e.clientX, e.clientY];
      this._canvas.style.cursor = "grabbing";
    }
  }

  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pinch && this._pointers.size >= 2) {
      const [p1, p2] = this._pointers.values();
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const ratio = dist / this._pinch.startDist;   // >1 = fingers spread apart -> zoom in
      this._cam.dist = clamp(this._pinch.startCamDist / ratio, DIST_MIN, DIST_MAX);
      this._updateCamera();
      return;
    }

    if (!this._drag.active) return;
    const curr = [e.clientX, e.clientY];
    const dx = curr[0] - this._drag.last[0];
    const dy = curr[1] - this._drag.last[1];
    this._drag.last = curr;
    const speed = 0.3 * this._cam.dist / 3.5;
    this._cam.az -= dx * speed;
    // '+dy' (not '-dy'): this makes the surface under the cursor track the drag,
    // i.e. you're dragging the map around rather than steering the camera.
    this._cam.el = clamp(this._cam.el + dy * speed, -EL_LIMIT, EL_LIMIT);
    this._updateCamera();
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch = null;

    if (!this._drag.active) return;
    this._drag.active = false;
    this._canvas.style.cursor = "grab";
    const press = this._drag.pressPos;
    this._drag.pressPos = null;
    if (!press) return;
    const dx = e.clientX - press[0], dy = e.clientY - press[1];
    const slop = e.pointerType === "touch" ? CLICK_MAX_DRAG_PX_TOUCH : CLICK_MAX_DRAG_PX;
    if (dx * dx + dy * dy > slop * slop) return; // was a rotate drag
    this._handleClick(e);
  }

  /** OS-interrupted gesture (e.g. an incoming call, or the browser claiming the touch for
   * its own edge-swipe gesture) -- clean up without treating it as a completed click. */
  _onPointerCancel(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
    this._drag.active = false;
    this._drag.pressPos = null;
    this._canvas.style.cursor = "grab";
  }

  _handleClick(e) {
    const rect = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(ndc, this._camera);
    const hits = this._raycaster.intersectObject(this._globeMesh);
    if (hits.length === 0) return;
    const { x, y, z } = hits[0].point;
    const [lat, lon] = latLonFromXYZ(x, y, z);
    this._selectLocation(lat, lon, { animate: false });
  }

  _onWheel(e) {
    e.preventDefault();
    this._cancelFlight();
    if (e.deltaY < 0) {
      this._cam.dist = Math.max(DIST_MIN, this._cam.dist * 0.9);
    } else {
      this._cam.dist = Math.min(DIST_MAX, this._cam.dist * 1.1);
    }
    this._updateCamera();
  }

  /** A plain dot, built at unit radius and scaled per-frame by _updatePin. A sphere
   * rather than a flat disc: it presents as a circle from every angle without needing to
   * be turned to face the camera, and it can't half-sink through the surface at the
   * globe's edge the way a camera-facing disc standing perpendicular to it would. */
  _buildPin() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    );
    mesh.visible = false;
    this._scene.add(mesh);
    return mesh;
  }

  /** Keeps the marker at PIN_SCREEN_PX on screen. The world size that works out to
   * depends on both the zoom and the canvas height, so it's recomputed here rather than
   * baked into the geometry. Cheap enough to run from _updateCamera (i.e. every frame of
   * a flight, every drag step). */
  _updatePin() {
    const pin = this._pinActor;
    if (!pin || !pin.visible || !this._pinDir) return;

    // World units spanned by one CSS pixel at the marker's distance from the camera --
    // its true distance, not the camera's distance to the globe's centre. A pin the
    // camera is facing sits a full sphere-radius nearer than the centre does, so using
    // the orbit distance would let the marker balloon exactly when you zoom in on it.
    const distanceToPin = this._camera.position.distanceTo(this._pinDir);
    const viewHeight = 2 * distanceToPin * Math.tan(degToRad(this._camera.fov) / 2);
    const radius = (PIN_SCREEN_PX / 2) * (viewHeight / (this._container.clientHeight || 1));

    pin.scale.setScalar(radius);
    // Seat the dot on the surface rather than at a fixed altitude above it: zoomed out,
    // one pixel is worth enough world units that a fixed offset would let the dot sink
    // into the globe, and zoomed in it would leave it hovering.
    pin.position.copy(this._pinDir).multiplyScalar(1 + radius * 0.6);
  }

  _dropPin(lat, lon) {
    if (!this._pinActor) this._pinActor = this._buildPin();
    const [x, y, z] = xyzFromLatLon(lat, lon, 1.0);
    // The point on the unit sphere; _updatePin lifts the dot off it by its own radius.
    this._pinDir = new THREE.Vector3(x, y, z);
    this._pinActor.visible = true;
    this._updatePin();
  }

  _flyTo(lat, lon) {
    return new Promise((resolve) => {
      const startAz = this._cam.az, startEl = this._cam.el, startDist = this._cam.dist;
      const targetAz = lon;
      const targetEl = clamp(lat, -EL_LIMIT, EL_LIMIT);
      const dAz = ((targetAz - startAz + 180) % 360 + 360) % 360 - 180;
      const dEl = targetEl - startEl;
      const travel = Math.hypot(dAz, dEl);
      const zoomOut = Math.min(travel * 0.015, 1.5);
      const peakDist = Math.min(startDist + zoomOut, DIST_MAX);
      const duration = clamp(
        FLY_DURATION_MIN_MS + travel * FLY_DURATION_MS_PER_DEGREE,
        FLY_DURATION_MIN_MS, FLY_DURATION_MAX_MS,
      );

      const flight = { cancelled: false };
      this._flying = flight;
      const t0 = performance.now();

      const step = (now) => {
        if (flight.cancelled) { resolve(); return; }
        const t = Math.min((now - t0) / duration, 1);
        const s = t * t * (3 - 2 * t);   // cubic ease-in-out
        this._cam.az = startAz + dAz * s;
        this._cam.el = startEl + dEl * s;
        this._cam.dist = startDist + (peakDist - startDist) * Math.sin(Math.PI * t);
        this._updateCamera();
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          this._cam.az = ((targetAz + 180) % 360 + 360) % 360 - 180;
          this._cam.el = targetEl;
          this._cam.dist = startDist;
          this._updateCamera();
          this._flying = null;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  _lookupCell(lat, lon) {
    const grid = this._state.meta.grid;
    let row = Math.round((lat - grid.lat0) / grid.latStep);
    let col = Math.round((lon - grid.lon0) / grid.lonStep);
    row = clamp(row, 0, grid.height - 1);
    col = clamp(col, 0, grid.width - 1);
    const k = row * grid.width + col;

    // Country/region lookup is independent of the land mask below (different source
    // dataset), so it applies to ocean clicks too -- id 0 means "no data" either way.
    const countryId = this._state.countryIds[k] || null;
    const regionId = this._state.regionIds[k] || null;
    const country = countryId ? this._state.meta.countries[countryId] : null;
    const region = regionId ? this._state.meta.regions[regionId] : null;
    const geo = {
      country: country ? country.name : null,
      countryCode: country ? country.code : null,
      countryId,
      region: region ? region.name : null,
      regionCode: region ? region.code : null,
      regionId,
    };

    const byte = this._state.landBits[k >> 3];
    const isLand = !!((byte >> (7 - (k & 7))) & 1);
    if (!isLand) {
      return {
        isLand: false, regime: null,
        annual_L_day: null, annual_mL_hr: null, monthly_L_day: null, monthly_mL_hr: null,
        ...geo,
      };
    }

    const idx = this._state.landPrefix[k];
    const q = this._state.meta.quantization;
    const annual = this._state.annual[idx] / q.annualScale;
    const monthlyMLHr = new Array(12);
    const monthlyLDay = new Array(12);
    for (let m = 0; m < 12; m++) {
      const v = this._state.monthly[idx * 12 + m] / q.monthlyScale;
      monthlyMLHr[m] = v;
      monthlyLDay[m] = mLHrToLDay(v);
    }
    const regime = classifyRegime(annual, this._state.meta.regimes.centres);
    return {
      isLand: true, regime,
      annual_L_day: mLHrToLDay(annual), annual_mL_hr: annual,
      monthly_L_day: monthlyLDay, monthly_mL_hr: monthlyMLHr,
      ...geo,
    };
  }

  async _selectLocation(lat, lon, { animate = true, zip = undefined } = {}) {
    await this._ready;
    lat = clamp(lat, -90, 90);
    lon = normalizeLon(lon);
    this._dropPin(lat, lon);
    if (animate) await this._flyTo(lat, lon);
    const cell = this._lookupCell(lat, lon);
    const detail = { lat, lon, zip, ...cell };
    this._lastSelection = detail;
    this.dispatchEvent(new CustomEvent("locationselected", { detail }));
    return detail;
  }

  /** The most recent `locationselected` detail, or null if nothing has been picked yet.
   * Lets UI that attaches after a selection (a stats panel mounted later, a chart the host
   * page builds on demand) catch up without waiting for the next event. */
  getLastSelection() { return this._lastSelection ?? null; }

  /** Programmatically place the pin at (lat, lon), flying the camera there. */
  goToCoord(lat, lon, options = {}) {
    return this._selectLocation(lat, lon, { animate: true, ...options });
  }

  /** Look up a US ZIP code and place the pin there. Fires 'locationerror' if unknown. */
  async goToZip(zip, options = {}) {
    await this._ready;
    const zipCode = parseInt(String(zip).trim(), 10);
    const i = Number.isFinite(zipCode) ? findZip(this._state.zipTable, zipCode) : -1;
    if (i < 0) {
      this.dispatchEvent(new CustomEvent("locationerror", { detail: { reason: "zip-not-found", zip } }));
      return null;
    }
    const lat = this._state.zipTable.lats[i] / 100;
    const lon = this._state.zipTable.lons[i] / 100;
    return this._selectLocation(lat, lon, { animate: true, zip: String(zip), ...options });
  }

  /** Resolves to every country: [{ id, name, code, lat, lon }, ...], for populating a
   * country dropdown. `id` is what goToCountry() and getRegions() expect. */
  async getCountries() {
    await this._ready;
    const countries = this._state.meta.countries;
    const out = [];
    for (let id = 1; id < countries.length; id++) {
      if (countries[id]) out.push({ id, ...countries[id] });
    }
    return out;
  }

  /** Resolves to the regions belonging to countryId (from getCountries()): [{ id, name,
   * code, lat, lon }, ...]. Empty for countries this bundle has no admin-1 detail for. */
  async getRegions(countryId) {
    await this._ready;
    const regions = this._state.meta.regions;
    const out = [];
    for (let id = 1; id < regions.length; id++) {
      if (regions[id] && regions[id].countryId === countryId) out.push({ id, ...regions[id] });
    }
    return out;
  }

  /** Fly to a country's centroid (id from getCountries()). Fires 'locationerror' if the
   * country has no usable centroid at this bundle's grid resolution. */
  async goToCountry(countryId, options = {}) {
    await this._ready;
    const country = this._state.meta.countries[countryId];
    if (!country || country.lat == null) {
      this.dispatchEvent(new CustomEvent("locationerror", { detail: { reason: "country-not-found", countryId } }));
      return null;
    }
    return this._selectLocation(country.lat, country.lon, { animate: true, ...options });
  }

  /** Fly to a region's centroid (id from getRegions()). Fires 'locationerror' if the
   * region has no usable centroid at this bundle's grid resolution. */
  async goToRegion(regionId, options = {}) {
    await this._ready;
    const region = this._state.meta.regions[regionId];
    if (!region || region.lat == null) {
      this.dispatchEvent(new CustomEvent("locationerror", { detail: { reason: "region-not-found", regionId } }));
      return null;
    }
    return this._selectLocation(region.lat, region.lon, { animate: true, ...options });
  }

  destroy() {
    this._resizeObserver.disconnect();
    this._renderer.setAnimationLoop(null);
    if (this._pinActor) {
      this._pinActor.geometry.dispose();
      this._pinActor.material.dispose();
      this._scene.remove(this._pinActor);
      this._pinActor = null;
    }
    this._renderer.dispose();
    this._canvas.remove();
  }
}
