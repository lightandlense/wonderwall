// src/services/tracking.js
// ArUco webcam detection loop — ported from Gizmo Factory's level-runner.html.
// Detects markers, auto-calibrates homography from corner IDs, then calls
// window.onMarkersDetected(detected) each detection frame with module markers.

let webcamActive = false;
let webcamStream = null;

// Position the webcam preview left of the bottom-right calibration marker tile
// so it doesn't overlap it. Same calculation as Gizmo Factory's level-runner.
const _brTile    = Math.min(window.innerWidth, window.innerHeight) * (window.CALIB_TILE_FRAC || 0.2);
const _camRight  = Math.round((window.CALIB_INSET || 0.13) * window.innerWidth + _brTile / 2 + 16);

const arVideo = document.createElement('video');
arVideo.autoplay = true;
arVideo.style.cssText = `position:fixed;bottom:36px;right:${_camRight}px;width:200px;height:150px;border:1px solid #444;display:none;z-index:50;opacity:0.75;`;
document.body.appendChild(arVideo);

const arCanvas = document.createElement('canvas');
arCanvas.width  = 640;
arCanvas.height = 480;
const arCtx = arCanvas.getContext('2d');
window.arCanvas = arCanvas;
window.arCtx    = arCtx;
window.arW      = 640;
window.arH      = 480;

// Marker dictionary — MUST match print.html.
// 4×4 grid, 50 IDs: bigger cells than 6×6, better detection at distance.
const MARKER_DICT = 'ARUCO_4X4_50';
const arDetector  = new AR.Detector({ dictionaryName: MARKER_DICT, maxHammingDistance: 0 });

function toggleWebcam() {
  if (webcamActive) {
    webcamActive = false;
    window.arLastDetected = null;
    arVideo.style.display = 'none';
    if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
  } else {
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        webcamStream      = stream;
        arVideo.srcObject = stream;
        arVideo.style.display = 'block';
        webcamActive      = true;
        window.arLastDetected = [];

        // Detect at the camera's actual capture resolution so every marker
        // gets the most pixels the sensor can give. Avoids the corner calibration
        // markers being pushed out of frame by a centre-crop "zoom."
        arVideo.addEventListener('loadedmetadata', () => {
          if (arVideo.videoWidth > 0) {
            window.arW      = arVideo.videoWidth;
            window.arH      = arVideo.videoHeight;
            arCanvas.width  = window.arW;
            arCanvas.height = window.arH;
          }
        }, { once: true });

        arLoop();
      })
      .catch(e => alert('Webcam not available: ' + e.message));
  }
}

// Minimum marker area in camera pixels² to reject noise / false positives.
// ~15×15 px in a 640×480 frame. Scaled to actual resolution inside arLoop.
const MIN_MARKER_AREA_PX = 200;

// Shoelace area of the four marker corners (raw pixel coords).
function markerArea(corners) {
  const [a, b, c, d] = corners;
  return 0.5 * Math.abs(
    a.x * (b.y - d.y) + b.x * (c.y - a.y) +
    c.x * (d.y - b.y) + d.x * (a.y - c.y)
  );
}
// Exposed globally so calibration.js can call it from tryAutoCalibrate.
window.markerArea = markerArea;

let _arFrame = 0;
const AR_DETECT_INTERVAL = 3;   // run expensive detect() every 3rd rAF ≈ 20fps
let _arDetectTimes = [];
window._arDetectFps = '--';

function arLoop() {
  if (!webcamActive) return;
  _arFrame++;
  arCtx.drawImage(arVideo, 0, 0, window.arW, window.arH);

  // Throttle detection so audio scheduling isn't starved
  if (_arFrame % AR_DETECT_INTERVAL === 0) {
    const minArea = MIN_MARKER_AREA_PX * (window.arW * window.arH) / (640 * 480);

    const t0        = performance.now();
    const imageData = arCtx.getImageData(0, 0, window.arW, window.arH);
    const markers   = arDetector.detect(imageData);
    const elapsed   = performance.now() - t0;

    // Rolling FPS estimate from last 20 detect cycles
    _arDetectTimes.push(elapsed);
    if (_arDetectTimes.length >= 20) {
      const avg = _arDetectTimes.reduce((a, b) => a + b, 0) / _arDetectTimes.length;
      _arDetectTimes = [];
      window._arDetectFps = Math.round(1000 / avg);
    }

    // Auto-calibrate homography from corner markers (IDs 10, 11, 13, 18)
    tryAutoCalibrate(markers);

    // Raw diagnostic list (excludes calibration markers) — read by visualEngine
    window.arRawDetected = markers
      .filter(m => !CALIB_MARKER_IDS[m.id])
      .map(m => ({
        id:      m.id,
        area:    Math.round(markerArea(m.corners)),
        knownId: !!MODULE_REGISTRY[m.id],
      }));

    // Filter to known module markers above the minimum area, then enrich with
    // rotation (topmost-edge approach) and world coordinates.
    const detected = markers
      .filter(m => !CALIB_MARKER_IDS[m.id] && MODULE_REGISTRY[m.id] && markerArea(m.corners) >= minArea)
      .map(m => {
        // --- Rotation extraction ---
        // Use the topmost edge in screen space rather than corner[0]→corner[1]
        // so "card held flat" consistently yields rotation ≈ 0 regardless of
        // how the ArUco bit pattern is printed.
        let topEdgeIdx = 0;
        let minMidY    = Infinity;
        for (let i = 0; i < 4; i++) {
          const a = m.corners[i], b = m.corners[(i + 1) % 4];
          const midY = (a.y + b.y) / 2;
          if (midY < minMidY) { minMidY = midY; topEdgeIdx = i; }
        }
        const topA = m.corners[topEdgeIdx];
        const topB = m.corners[(topEdgeIdx + 1) % 4];
        const dx   = topB.x - topA.x;
        const dy   = topB.y - topA.y;
        // Ensure the direction vector points rightward for a flat card
        const rotation = dx >= 0
          ? Math.atan2(dy, dx)
          : Math.atan2(-dy, -dx);

        // Normalised camera coords [0,1]
        const centerNorm = {
          x: m.corners.reduce((s, c) => s + c.x, 0) / 4 / window.arW,
          y: m.corners.reduce((s, c) => s + c.y, 0) / 4 / window.arH,
        };
        const cornersNorm = m.corners.map(c => ({
          x: c.x / window.arW,
          y: c.y / window.arH,
        }));

        // World (screen pixel) coords via the calibrated homography
        const world        = cameraToScreen(centerNorm);
        const screenCorners = cornersNorm.map(c => cameraToScreen(c));

        return {
          id:           m.id,
          center:       centerNorm,   // normalised cam coords
          corners:      cornersNorm,  // normalised cam coords
          rotation,                   // radians, topmost-edge convention
          wx:           world.x,      // screen pixels
          wy:           world.y,
          angle:        rotation,     // alias used by audioEngine
          screenCorners,              // screen pixel corners for debug overlay
        };
      });

    window.arLastDetected = detected;

    if (window.onMarkersDetected) {
      window.onMarkersDetected(detected);
    }
  }

  requestAnimationFrame(arLoop);
}

window.toggleWebcam = toggleWebcam;

// Auto-start
toggleWebcam();
