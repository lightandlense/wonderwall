// src/components/visualEngine.js
// Draws module rings, param arcs, and ArUco debug overlay onto two canvases.

const visualEngine = (() => {
  let visCtx   = null; // reactive visuals canvas (rings, arcs, labels)
  let debugCtx = null; // ArUco debug overlay (green boxes, status bar)

  function init(visCanvas, dbgCanvas) {
    visCtx   = visCanvas.getContext('2d');
    debugCtx = dbgCanvas.getContext('2d');
  }

  // detectedWorldMarkers: [{id, wx, wy, angle, screenCorners}]
  function draw(detectedWorldMarkers) {
    if (!visCtx || !debugCtx) return;

    const W = visCtx.canvas.width;
    const H = visCtx.canvas.height;

    visCtx.clearRect(0, 0, W, H);
    debugCtx.clearRect(0, 0, W, H);

    // Index active modules by id for quick lookup
    const activeById = {};
    getActiveModules().forEach(m => { activeById[m.id] = m; });

    // Draw a ring + param arc for each detected marker that has an active module
    detectedWorldMarkers.forEach(marker => {
      const mod = activeById[marker.id];
      if (!mod) return;

      const { wx, wy } = marker;
      const angle = mod.angle; // smoothed [0, 2π)
      const def   = mod.def;
      const ringR = 50;

      // Outer glow ring
      visCtx.save();
      visCtx.shadowColor = def.color;
      visCtx.shadowBlur  = 24;
      visCtx.strokeStyle = def.color;
      visCtx.lineWidth   = 2;
      visCtx.globalAlpha = 0.6;
      visCtx.beginPath();
      visCtx.arc(wx, wy, ringR, 0, 2 * Math.PI);
      visCtx.stroke();
      visCtx.restore();

      // Param arc — sweeps clockwise from top (−π/2) by the smoothed angle
      visCtx.save();
      visCtx.strokeStyle  = def.color;
      visCtx.lineWidth    = 6;
      visCtx.lineCap      = 'round';
      visCtx.globalAlpha  = 0.95;
      visCtx.shadowColor  = def.color;
      visCtx.shadowBlur   = 12;
      visCtx.beginPath();
      visCtx.arc(wx, wy, ringR + 9, -Math.PI / 2, -Math.PI / 2 + angle, false);
      visCtx.stroke();
      visCtx.restore();

      // Module name above the ring
      visCtx.save();
      visCtx.fillStyle  = def.color;
      visCtx.font       = 'bold 13px monospace';
      visCtx.textAlign  = 'center';
      visCtx.shadowColor = def.color;
      visCtx.shadowBlur  = 8;
      visCtx.fillText(def.name.toUpperCase(), wx, wy - ringR - 14);
      visCtx.restore();

      // Param percentage below the ring
      const paramPct = Math.round((angle / (2 * Math.PI)) * 100);
      visCtx.save();
      visCtx.fillStyle = 'rgba(255,255,255,0.65)';
      visCtx.font      = '11px monospace';
      visCtx.textAlign = 'center';
      visCtx.fillText(`${def.paramLabel}: ${paramPct}%`, wx, wy + ringR + 18);
      visCtx.restore();
    });

    _drawDebugOverlay(detectedWorldMarkers, W, H);
  }

  function _drawDebugOverlay(markers, W, H) {
    // Status line — ArUco detection state
    const raw = window.arRawDetected || [];
    let statusText, statusColor;
    if (markers.length > 0) {
      statusText  = `ArUco: ${markers.length} detected — IDs: ${markers.map(m => m.id).join(', ')}`;
      statusColor = '#44ff88';
    } else if (raw.length > 0) {
      statusText  = `ArUco: filtered — ${raw.map(r => `ID ${r.id}`).join(', ')}`;
      statusColor = '#ffaa22';
    } else {
      statusText  = 'ArUco: scanning — no markers detected';
      statusColor = '#ff6644';
    }

    // Calibration status line
    const src     = window.calibSource || 'none';
    const visible = window.calibVisibleCorners || [];
    const nFound  = visible.length;
    const missing = [10, 11, 18, 13].filter(id => !visible.includes(id));
    let calibText, calibColor;
    if (src === 'auto' && nFound === 4) {
      calibText  = `Calib: locked ✓ (${nFound}/4 corners)`;
      calibColor = '#44ff88';
    } else if (src === 'saved') {
      calibText  = `Calib: saved — ${nFound}/4 visible`;
      calibColor = nFound === 4 ? '#88ccff' : '#ffaa22';
    } else if (nFound > 0) {
      calibText  = `Calib: searching — ${nFound}/4 visible (missing: ${missing.join(', ')})`;
      calibColor = '#ffaa22';
    } else {
      calibText  = 'Calib: none — place corner markers 10, 11, 18, 13 at projected corners';
      calibColor = '#ff6644';
    }

    // Status bars at bottom-left
    debugCtx.save();
    debugCtx.font      = '12px monospace';
    debugCtx.textAlign = 'left';

    debugCtx.fillStyle = 'rgba(0,0,0,0.65)';
    debugCtx.fillRect(8, H - 52, Math.min(W - 16, 640), 20);
    debugCtx.fillStyle = calibColor;
    debugCtx.fillText(calibText, 14, H - 38);

    debugCtx.fillStyle = 'rgba(0,0,0,0.65)';
    debugCtx.fillRect(8, H - 28, Math.min(W - 16, 540), 20);
    debugCtx.fillStyle = statusColor;
    debugCtx.fillText(statusText, 14, H - 14);

    // Detection FPS badge — top-right
    const fps   = window._arDetectFps || '--';
    const badge = `detect: ${fps} fps`;
    const bw    = badge.length * 7 + 16;
    debugCtx.fillStyle = 'rgba(0,0,0,0.65)';
    debugCtx.fillRect(W - bw - 8, 8, bw, 20);
    debugCtx.fillStyle    = '#aaa';
    debugCtx.textAlign    = 'right';
    debugCtx.fillText(badge, W - 12, 22);

    debugCtx.restore();

    // Green marker outline boxes + ID labels
    debugCtx.save();
    markers.forEach(m => {
      const sc = m.screenCorners;
      if (!sc || sc.length < 4) return;

      debugCtx.beginPath();
      debugCtx.moveTo(sc[0].x, sc[0].y);
      for (let i = 1; i < sc.length; i++) debugCtx.lineTo(sc[i].x, sc[i].y);
      debugCtx.closePath();
      debugCtx.fillStyle   = 'rgba(68,255,136,0.15)';
      debugCtx.fill();
      debugCtx.strokeStyle = '#44ff88';
      debugCtx.lineWidth   = 2;
      debugCtx.stroke();

      // ID label chip
      debugCtx.fillStyle = 'rgba(0,0,0,0.75)';
      debugCtx.fillRect(m.wx + 8, m.wy - 22, 52, 18);
      debugCtx.fillStyle = '#44ff88';
      debugCtx.font      = 'bold 12px monospace';
      debugCtx.textAlign = 'left';
      debugCtx.fillText(`ID ${m.id}`, m.wx + 12, m.wy - 8);
    });
    debugCtx.restore();
  }

  return { init, draw };
})();

window.visualEngine = visualEngine;
