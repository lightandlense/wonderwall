// src/calib-overlay.js
// Projected self-calibration overlay. The projector draws the 4 corner ArUco
// markers itself on small opaque tiles. Their KNOWN drawn positions (below) are
// the single source of truth for the homography canvas anchors used by
// calibration.js. Continuous detection of these projected markers keeps the
// homography self-healing.
//
// Load AFTER aruco-4x4-dict.js (needs AR + the dictionary) and BEFORE the
// inline runner script calls window.initCalibOverlay().

// Marker CENTER inset from each canvas edge, normalized [0,1]. Derived from the
// marker SIZE so the (square) tile always sits fully on-screen with a margin —
// otherwise large markers near the corners clip off the screen edge, which both
// looks wrong against the crosshairs and stops the clipped marker from decoding.
// Recomputed whenever the marker size changes. Both the projected markers and the
// homography anchors read CALIB_CORNER_ANCHORS, so they always stay in agreement.
window.recomputeCalibAnchors = function() {
  // Tile side = CALIB_TILE_FRAC of the SHORTER screen axis, so half the tile (as a
  // fraction of that axis) plus a 0.03 margin is the inset needed to avoid clipping.
  const inset = window.CALIB_TILE_FRAC / 2 + 0.03;
  window.CALIB_INSET = inset;
  window.CALIB_CORNER_ANCHORS = {
    10: { x: inset,     y: inset     }, // top-left
    11: { x: 1 - inset, y: inset     }, // top-right
    18: { x: 1 - inset, y: 1 - inset }, // bottom-right
    13: { x: inset,     y: 1 - inset }, // bottom-left
  };
};

// The dictionary MUST match MARKER_DICT in tracking.js.
const CALIB_OVERLAY_DICT = 'ARUCO_4X4_50';

// Cache of rasterized marker images, keyed by ID. Populated async on init.
const _calibMarkerImgs = {};
window._calibOverlayReady = false;

function _rasterizeCalibMarkers() {
  const dict = new AR.Dictionary(CALIB_OVERLAY_DICT);
  const ids = Object.keys(window.CALIB_CORNER_ANCHORS).map(Number);
  let loaded = 0;
  ids.forEach(id => {
    const svg = dict.generateSVG(id); // ASCII SVG string
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (loaded === ids.length) window._calibOverlayReady = true;
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svg);
    _calibMarkerImgs[id] = img;
  });
}

window._calibMarkerImgs = _calibMarkerImgs;
window._rasterizeCalibMarkers = _rasterizeCalibMarkers;

// Visual sizing of each marker tile, as a fraction of the smaller canvas
// dimension. Backing tile is opaque so the marker keeps full contrast no matter
// what the game draws behind it. Size + on/off state persist across reloads and
// are adjustable live in the runner (M to toggle, [ / ] to scale).
const _savedTileFrac = parseFloat(localStorage.getItem('calibTileFrac'));
window.CALIB_TILE_FRAC = (_savedTileFrac > 0) ? _savedTileFrac : 0.20; // 20% of min(W,H)
window.showCalibMarkers = (localStorage.getItem('showCalibMarkers') !== '0');
const _TILE_PAD_FRAC = 0.18;     // dark padding around the marker, fraction of tile
// Build the anchors now that the size is known (and again whenever size changes).
window.recomputeCalibAnchors();

let _calibCtx = null;

window.initCalibOverlay = function(calibCanvas) {
  _calibCtx = calibCanvas.getContext('2d');
  _rasterizeCalibMarkers();
  // Markers are static in canvas space, so draw once ready + on resize only.
  const tryDraw = () => {
    if (window._calibOverlayReady) window.drawCalibOverlay();
    else setTimeout(tryDraw, 50);
  };
  tryDraw();
};

window.drawCalibOverlay = function() {
  if (!_calibCtx) return;
  const Wpx = _calibCtx.canvas.width, Hpx = _calibCtx.canvas.height;
  const tile = Math.round(Math.min(Wpx, Hpx) * window.CALIB_TILE_FRAC);
  const pad = Math.round(tile * _TILE_PAD_FRAC);
  const markerSize = tile - pad * 2;
  _calibCtx.clearRect(0, 0, Wpx, Hpx);
  if (!window.showCalibMarkers) return; // markers toggled off — leave the canvas clear
  Object.keys(window.CALIB_CORNER_ANCHORS).forEach(idStr => {
    const id = Number(idStr);
    const a = window.CALIB_CORNER_ANCHORS[id];
    const cx = a.x * Wpx, cy = a.y * Hpx;       // tile center in pixels
    const x = Math.round(cx - tile / 2), y = Math.round(cy - tile / 2);
    _calibCtx.fillStyle = '#000';                // opaque dark backing tile
    _calibCtx.fillRect(x, y, tile, tile);
    const img = window._calibMarkerImgs[id];
    if (img && img.complete) {
      _calibCtx.imageSmoothingEnabled = false;   // keep marker cells crisp
      _calibCtx.drawImage(img, x + pad, y + pad, markerSize, markerSize);
    }
  });
};
