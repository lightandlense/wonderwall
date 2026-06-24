// src/calibration.js
// 4-point homography: click 4 corners on webcam feed, then 4 on canvas.
// Saves homography matrix to localStorage. Updates cameraToScreen().

let calibrationPoints = { cam: [], canvas: [] };
let homographyMatrix = null;

const savedH = localStorage.getItem('calibration-homography');
if (savedH) {
  const parsed = JSON.parse(savedH);
  // v1 stored canvas points as raw pixels — they break if window size changes.
  // Detect by checking if any canvas value > 1 (normalized values are always ≤1).
  // If old format, discard and force re-calibration.
  const isOldFormat = parsed.canvas && parsed.canvas.some(p => p.x > 1 || p.y > 1);
  if (isOldFormat) {
    localStorage.removeItem('calibration-homography');
    console.warn('[ArUco] Old calibration format detected (raw pixels) — please re-run Calibrate AR.');
  } else {
    homographyMatrix = parsed;
    // Defer: W/H are declared in index.html's inline script which runs
    // AFTER this file loads. overrideCameraToScreen() reads W/H, so calling it
    // here would throw "W is not defined" and halt this script before
    // _calibSmooth (below) initializes, leaving it in TDZ for tryAutoCalibrate.
    setTimeout(overrideCameraToScreen, 0);
  }
}

function startCalibration() {
  calibrationPoints = { cam: [], canvas: [] };
  alert('Click 4 corners on the webcam feed (top-left, top-right, bottom-right, bottom-left)');
  showWebcamForCalibration();
}

function showWebcamForCalibration() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000a;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  const vid = document.createElement('video');
  vid.style.cssText = 'width:640px;height:480px;border:2px solid #4af;cursor:crosshair;';
  vid.autoplay = true;
  navigator.mediaDevices.getUserMedia({ video: true }).then(stream => { vid.srcObject = stream; });
  const instr = document.createElement('div');
  instr.style.cssText = 'color:#fff;margin-top:8px;font:14px monospace;';
  instr.textContent = `Webcam: click corner ${calibrationPoints.cam.length + 1}/4`;
  overlay.appendChild(vid); overlay.appendChild(instr);

  vid.addEventListener('click', e => {
    const rect = vid.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    calibrationPoints.cam.push({ x: cx, y: cy });
    instr.textContent = `Webcam: click corner ${calibrationPoints.cam.length + 1}/4`;
    if (calibrationPoints.cam.length === 4) {
      document.body.removeChild(overlay);
      collectCanvasPoints();
    }
  });
  document.body.appendChild(overlay);
}

function collectCanvasPoints() {
  // Guide dots at the 4 canvas corners — numbered to match the webcam click order.
  const margin = 60;
  const guideCorners = [
    { x: margin,     y: margin },
    { x: W - margin, y: margin },
    { x: W - margin, y: H - margin },
    { x: margin,     y: H - margin },
  ];

  const guideEls = guideCorners.map((pt, i) => {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed',
      `left:${pt.x}px`, `top:${pt.y}px`,
      'transform:translate(-50%,-50%)',
      'width:48px', 'height:48px', 'border-radius:50%',
      'border:3px solid #555', 'background:rgba(255,255,255,0.1)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'color:#888', 'font:bold 20px monospace',
      'z-index:998', 'pointer-events:none',
      'transition:border-color 0.15s,background 0.15s,color 0.15s,box-shadow 0.15s',
    ].join(';');
    el.textContent = i + 1;
    document.body.appendChild(el);
    return el;
  });

  function highlightCorner(idx) {
    guideEls.forEach((el, i) => {
      if (i < idx) {
        el.style.cssText += ';border-color:#44ff88;background:rgba(68,255,136,0.3);color:#44ff88;box-shadow:none;';
      } else if (i === idx) {
        el.style.cssText += ';border-color:#ffcc00;background:rgba(255,204,0,0.35);color:#fff;box-shadow:0 0 18px #ffcc00;';
      }
    });
  }
  highlightCorner(0);

  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#4af;color:#000;padding:8px 16px;font:14px monospace;z-index:999;border-radius:4px;pointer-events:none;text-align:center;line-height:1.5;';
  banner.innerHTML = 'Click canvas corner <b>1</b> of 4 — same order as webcam<br><small>Click the glowing yellow dot</small>';
  document.body.appendChild(banner);

  setTimeout(() => {
    const handler = e => {
      calibrationPoints.canvas.push({ x: e.clientX, y: e.clientY });
      const n = calibrationPoints.canvas.length;
      if (n === 4) {
        document.removeEventListener('click', handler);
        document.body.removeChild(banner);
        guideEls.forEach(el => document.body.removeChild(el));
        computeAndSaveHomography();
      } else {
        highlightCorner(n);
        banner.innerHTML = `Click canvas corner <b>${n + 1}</b> of 4 — same order as webcam<br><small>Click the glowing yellow dot</small>`;
      }
    };
    document.addEventListener('click', handler);
  }, 50);
}

function computeAndSaveHomography() {
  // Store canvas points normalized to [0,1] so calibration survives window resizes
  // and different screen sizes. Denormalized back to pixels at runtime.
  homographyMatrix = {
    cam: calibrationPoints.cam,
    canvas: calibrationPoints.canvas.map(p => ({ x: p.x / W, y: p.y / H }))
  };
  localStorage.setItem('calibration-homography', JSON.stringify(homographyMatrix));
  overrideCameraToScreen();
  alert('Calibration saved!');
}

// Compute a 3x3 perspective homography mapping the 4 src points to the 4 dst
// points. Returns the 8 free coefficients [h11, h12, h13, h21, h22, h23, h31,
// h32] (h33 fixed at 1), or null if the system is singular.
//
// Each (sx,sy) → (dx,dy) pair gives:
//   dx = (h11*sx + h12*sy + h13) / (h31*sx + h32*sy + 1)
//   dy = (h21*sx + h22*sy + h23) / (h31*sx + h32*sy + 1)
// Rearranged into 2 linear equations per pair → 8x8 system from 4 pairs.
// Solved with Gaussian elimination + partial pivoting. This is the same math
// cv2.getPerspectiveTransform uses; replaces a bilinear approximation that
// produced position-dependent error whenever the camera wasn't perpendicular
// to the wall.
function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1,  0,  0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    A.push([ 0,  0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotMag = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const m = Math.abs(A[r][col]);
      if (m > pivotMag) { pivotMag = m; pivotRow = r; }
    }
    if (pivotMag < 1e-12) return null; // singular — collinear cam points
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }
    for (let r = col + 1; r < n; r++) {
      const factor = A[r][col] / A[col][col];
      if (factor === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }
  const h = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= A[r][c] * h[c];
    h[r] = sum / A[r][r];
  }
  return h;
}

function applyHomography(hMat, p) {
  const denom = hMat[6] * p.x + hMat[7] * p.y + 1;
  return {
    x: (hMat[0] * p.x + hMat[1] * p.y + hMat[2]) / denom,
    y: (hMat[3] * p.x + hMat[4] * p.y + hMat[5]) / denom,
  };
}

function overrideCameraToScreen() {
  if (!homographyMatrix) return;
  const cam = homographyMatrix.cam;       // 4 corner-marker centers in normalized [0,1] cam space
  const canvasNorm = homographyMatrix.canvas; // 4 corresponding canvas corners in normalized [0,1] space
  // Compute the homography in normalized space. W and H multiply at apply time,
  // so window resize doesn't require a recompute.
  const hMat = computeHomography(cam, canvasNorm);
  if (!hMat) {
    console.warn('[calibration] homography is singular — 4 cam points are degenerate');
    return;
  }
  window.cameraToScreen = function(camPoint) {
    const norm = applyHomography(hMat, camPoint);
    return { x: norm.x * W, y: norm.y * H };
  };
}

window.startCalibration = startCalibration;

// ── Auto-calibration via corner markers ──────────────────────────────────────
// Place physical markers at the corners of the projected play area.
// When all 4 are visible the homography is solved automatically — no clicking.
//   10 = top-left   11 = top-right
//   13 = bottom-left  18 = bottom-right
// (ID 18 replaces ID 12 — ID 12's top row is all-black, merges with the
//  marker border, and shifts the detected center upward by ~half a cell
//  which corrupts the homography. ID 18 has clean borders.)
const CALIB_MARKER_IDS = {
  10: { x: 0, y: 0 },
  11: { x: 1, y: 0 },
  18: { x: 1, y: 1 },
  13: { x: 0, y: 1 },
};

const _calibSmooth = {};
const _CALIB_EMA = 0.12; // slow EMA — calibration should be rock-steady
// Grace window: keep a corner "present" for this many detection frames after its
// last real sighting (≈1.5s at ~20 detect-fps). Smooths the 3↔4 visible flicker
// from a borderline marker so brief dropouts don't break the calibration lock.
const _calibAge = {};
const _CALIB_GRACE_FRAMES = 30;
// Corner markers often sit at the edge of camera FOV where they appear smaller and
// more skewed. Use a more permissive area threshold for them than for prop markers,
// so the auto-cal doesn't get stuck waiting on a marker that ArUco IS decoding but
// the 200px² prop filter is rejecting.
const MIN_CALIB_AREA_PX = 50;
window.calibVisibleCorners = []; // diagnostic — IDs of corner markers passing the area filter

// Re-Cal averaging: accumulator filled across RECALIB_FRAMES detection frames.
// On Re-Cal click we clear the EMA smoother and capture N fresh raw samples per
// corner, then average them. This avoids the EMA lag bias (~12% convergence
// per frame) that previously made the captured corner position trail the true
// current position by a small but visible amount.
const RECALIB_FRAMES = 5;
let _recalibSamples = null;

// Canvas anchors for the homography, in the fixed order [10, 11, 18, 13].
// Sourced from window.CALIB_CORNER_ANCHORS (defined in calib-overlay.js) so the
// solver always agrees with where the overlay actually drew the markers.
function calibCanvasAnchors() {
  const A = window.CALIB_CORNER_ANCHORS;
  return [A[10], A[11], A[18], A[13]];
}

function tryAutoCalibrate(rawMarkers) {
  // rawMarkers: raw js-aruco2 output, corners in 0-640 / 0-480 pixel space.
  // markerArea() is defined in tracking.js — available at call time.
  const found = {};
  const visible = [];
  const rawById = {};
  rawMarkers.forEach(m => {
    if (!CALIB_MARKER_IDS[m.id]) return;
    if (markerArea(m.corners) < MIN_CALIB_AREA_PX) return;
    visible.push(m.id);
    const cx = m.corners.reduce((s, c) => s + c.x, 0) / 4 / (window.arW || 640);
    const cy = m.corners.reduce((s, c) => s + c.y, 0) / 4 / (window.arH || 480);
    rawById[m.id] = { x: cx, y: cy };
    const key = `c${m.id}`;
    if (!_calibSmooth[key]) _calibSmooth[key] = { x: cx, y: cy };
    else {
      _calibSmooth[key].x += _CALIB_EMA * (cx - _calibSmooth[key].x);
      _calibSmooth[key].y += _CALIB_EMA * (cy - _calibSmooth[key].y);
    }
    found[m.id] = { ..._calibSmooth[key] };
  });

  // Carry corners over a brief dropout so 3↔4 visible flicker doesn't break the
  // lock. A corner stays usable for up to _CALIB_GRACE_FRAMES after its last real
  // sighting, using its last EMA-smoothed position; after that it's dropped.
  [10, 11, 18, 13].forEach(id => {
    const key = `c${id}`;
    if (found[id]) {
      _calibAge[id] = 0;
    } else if (_calibSmooth[key] && (_calibAge[id] || 0) < _CALIB_GRACE_FRAMES) {
      _calibAge[id] = (_calibAge[id] || 0) + 1;
      found[id] = { ..._calibSmooth[key] }; // carry over last known position
    } else {
      delete _calibSmooth[key];
      delete _calibAge[id];
    }
  });

  window.calibMarkersFound = Object.keys(found).length;
  window.calibVisibleCorners = visible.sort();

  if (!found[10] || !found[11] || !found[18] || !found[13]) return;

  // Re-Cal averaging path: collect RECALIB_FRAMES fresh raw samples for each
  // corner, then average and save. Skips the (potentially lagged) EMA values.
  if (_recalibSamples) {
    [10, 11, 18, 13].forEach(id => {
      if (rawById[id]) _recalibSamples[id].push(rawById[id]);
    });
    const ready = [10, 11, 18, 13].every(id => _recalibSamples[id].length >= RECALIB_FRAMES);
    if (!ready) return;
    const cam = [10, 11, 18, 13].map(id => {
      const samples = _recalibSamples[id];
      return {
        x: samples.reduce((s, p) => s + p.x, 0) / samples.length,
        y: samples.reduce((s, p) => s + p.y, 0) / samples.length,
      };
    });
    _recalibSamples = null;
    homographyMatrix = {
      cam,
      canvas: calibCanvasAnchors()
    };
    localStorage.setItem('calibration-homography', JSON.stringify(homographyMatrix));
    overrideCameraToScreen();
    window.calibSource = 'auto';
    window.calibLastCam = cam; // diagnostic — inspect via console
    return;
  }

  // Continuous auto-cal. Every frame all 4 projected markers are visible, we
  // re-solve from the EMA-smoothed corner positions. This makes the homography
  // self-heal: if the camera or projector is bumped, the projected markers move
  // in the camera image and the mapping re-converges within a few frames.
  const cam = [found[10], found[11], found[18], found[13]];
  homographyMatrix = {
    cam,
    canvas: calibCanvasAnchors()
  };
  // Update the live mapping every frame for immediate self-healing, but only
  // persist to localStorage when the corners actually moved beyond a small
  // threshold — avoids ~20 redundant writes/second during steady-state.
  const _prevCam = window.calibLastCam;
  const _CALIB_PERSIST_THRESHOLD = 0.001; // ~0.1% of normalized cam space
  const _moved = !_prevCam || cam.some((c, i) =>
    !_prevCam[i] ||
    Math.abs(c.x - _prevCam[i].x) > _CALIB_PERSIST_THRESHOLD ||
    Math.abs(c.y - _prevCam[i].y) > _CALIB_PERSIST_THRESHOLD
  );
  if (_moved) {
    localStorage.setItem('calibration-homography', JSON.stringify(homographyMatrix));
    window.calibLastCam = cam;
  }
  overrideCameraToScreen();
  window.calibSource = 'auto';
}

// Click handler for the Re-Cal button. Clears the EMA so the next N detection
// frames give fresh, lag-free raw corner positions; the accumulator above
// averages them before writing the homography.
window.requestRecalibration = function() {
  Object.keys(_calibSmooth).forEach(k => delete _calibSmooth[k]);
  _recalibSamples = { 10: [], 11: [], 18: [], 13: [] };
};

window.tryAutoCalibrate = tryAutoCalibrate;
window.CALIB_MARKER_IDS = CALIB_MARKER_IDS;
window.calibMarkersFound = 0;
window.calibSource = homographyMatrix ? 'saved' : 'none';
