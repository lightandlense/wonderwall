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
  // edges: [{fromPos, toPos, kind:'audio'|'control', connected, alpha}] — optional
  function draw(detectedWorldMarkers, edges) {
    if (!visCtx || !debugCtx) return;

    const W = visCtx.canvas.width;
    const H = visCtx.canvas.height;

    visCtx.clearRect(0, 0, W, H);
    debugCtx.clearRect(0, 0, W, H);

    // Always-on central output hub (the master sink lives at the wall center)
    const cx = W / 2, cy = H / 2;
    visCtx.save();
    visCtx.shadowColor = '#88ffcc'; visCtx.shadowBlur = 30;
    visCtx.fillStyle = 'rgba(136,255,204,0.9)';
    visCtx.beginPath(); visCtx.arc(cx, cy, 10, 0, 2 * Math.PI); visCtx.fill();
    visCtx.strokeStyle = 'rgba(136,255,204,0.35)'; visCtx.lineWidth = 2;
    visCtx.beginPath(); visCtx.arc(cx, cy, 18, 0, 2 * Math.PI); visCtx.stroke();
    visCtx.restore();

    // Draw edges beneath module rings so rings appear on top
    if (edges && edges.length > 0) {
      _drawEdges(edges);
    }

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

      // Use the module's mapped [0,1] value for display — avoids the 0/2π wrap
      // discontinuity that raw angle produces when the topmost edge flips at ~45°.
      const paramT = def.getParamT ? def.getParamT(angle) : angle / (2 * Math.PI);

      // Param arc — sweeps clockwise from top (−π/2) by paramT of a full circle
      visCtx.save();
      visCtx.strokeStyle  = def.color;
      visCtx.lineWidth    = 6;
      visCtx.lineCap      = 'round';
      visCtx.globalAlpha  = 0.95;
      visCtx.shadowColor  = def.color;
      visCtx.shadowBlur   = 12;
      visCtx.beginPath();
      visCtx.arc(wx, wy, ringR + 9, -Math.PI / 2, -Math.PI / 2 + paramT * 2 * Math.PI, false);
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
      const paramPct = Math.round(paramT * 100);
      visCtx.save();
      visCtx.fillStyle = 'rgba(255,255,255,0.65)';
      visCtx.font      = '11px monospace';
      visCtx.textAlign = 'center';
      visCtx.fillText(`${def.paramLabel}: ${paramPct}%`, wx, wy + ringR + 18);
      visCtx.restore();

      // Sequencer: ring of 16 step dots + sweeping playhead + pattern name
      if (def.subtype === 'sequencer' && window.rhythmPatterns) {
        const pat = window.rhythmPatterns.PATTERNS[def.getPatternIndex(angle)];
        const step = (typeof getSeqStep === 'function') ? getSeqStep() : -1;
        const rr = ringR + 22;
        for (let s = 0; s < 16; s++) {
          const a = -Math.PI / 2 + (s / 16) * 2 * Math.PI;
          const dx = wx + Math.cos(a) * rr, dy = wy + Math.sin(a) * rr;
          const on = pat && pat.steps[s];
          visCtx.beginPath();
          visCtx.fillStyle = s === step ? '#ffffff' : (on ? def.color : 'rgba(255,255,255,0.18)');
          visCtx.arc(dx, dy, s === step ? 4 : (on ? 3.5 : 2), 0, 2 * Math.PI);
          visCtx.fill();
        }
        visCtx.fillStyle = 'rgba(255,255,255,0.6)'; visCtx.font = '10px monospace'; visCtx.textAlign = 'center';
        visCtx.fillText(pat ? pat.name : '', wx, wy + ringR + 32);
      }
    });

    // Tonality HUD pill (top-right) when a Tonality puck is present
    const tonMod = getActiveModules().find(m => m.def.subtype === 'tonality');
    if (tonMod) {
      const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const root = tonMod.def.getRoot(tonMod.angle);
      visCtx.save();
      visCtx.fillStyle   = 'rgba(12,26,24,0.85)';
      visCtx.strokeStyle = '#1f4a44';
      const px = W - 360, py = 24;
      visCtx.beginPath();
      if (visCtx.roundRect) visCtx.roundRect(px, py, 336, 34, 17); else visCtx.rect(px, py, 336, 34);
      visCtx.fill();
      visCtx.stroke();
      visCtx.fillStyle = '#6ee7d6';
      visCtx.font      = '14px monospace';
      visCtx.textAlign = 'left';
      visCtx.fillText(`♪ ${NAMES[root]} minor pentatonic`, px + 18, py + 22);
      visCtx.restore();
    }

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

    // Audio debug line — oscillators always reach the center master hub
    const active = getActiveModules();
    const oscs   = active.filter(m => m.def.type === 'oscillator');
    let patchText, patchColor;
    if (oscs.length === 0) {
      patchText  = 'Audio: no oscillator — place ID 0 to make sound';
      patchColor = '#888888';
    } else {
      let minDist = Infinity;
      oscs.forEach(o => { const d = Math.hypot(o.wx - W / 2, o.wy - H / 2); if (d < minDist) minDist = d; });
      patchText  = `Audio: ${oscs.length} oscillator(s) -> center (nearest ${Math.round(minDist)}px)`;
      patchColor = '#44ffaa';
    }

    // Routing summary line (effect/controller counts; full chain logged to console)
    const effCount  = active.filter(m => m.def.type === 'effect').length;
    const ctrlCount = active.filter(m => m.def.type === 'controller').length;
    const routeText = `Modules: ${effCount} effect(s), ${ctrlCount} controller(s) — see console for live chain`;

    // Status bars at bottom-left (routing line at -100, patch line at -76)
    debugCtx.save();
    debugCtx.font      = '12px monospace';
    debugCtx.textAlign = 'left';

    debugCtx.fillStyle = 'rgba(0,0,0,0.65)';
    debugCtx.fillRect(8, H - 100, Math.min(W - 16, 700), 20);
    debugCtx.fillStyle = '#99aadd';
    debugCtx.fillText(routeText, 14, H - 86);

    debugCtx.fillStyle = 'rgba(0,0,0,0.65)';
    debugCtx.fillRect(8, H - 76, Math.min(W - 16, 700), 20);
    debugCtx.fillStyle = patchColor;
    debugCtx.fillText(patchText, 14, H - 62);

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

  // edges: [{fromPos, toPos, kind:'audio'|'control', connected, alpha}]
  // 'audio' = green glowing cable; 'control' = purple dotted modulation link.
  function _drawEdges(edges) {
    edges.forEach(edge => {
      const { fromPos, toPos, kind, connected, alpha, ctrl } = edge;

      visCtx.save();
      if (kind === 'control') {
        const amber = ctrl === 'sequencer'; // sequencer trigger = amber; LFO = purple
        visCtx.globalAlpha = alpha * 0.9;
        visCtx.strokeStyle = amber ? '#ffb74d' : '#c98bff';
        visCtx.lineWidth   = 2;
        visCtx.shadowColor = amber ? '#ffb74d' : '#c98bff';
        visCtx.shadowBlur  = 12;
        visCtx.setLineDash([3, 9]);
      } else {
        visCtx.globalAlpha = alpha * (connected ? 0.9 : 0.35);
        visCtx.strokeStyle = connected ? '#88ffcc' : '#aaaaff';
        visCtx.lineWidth   = connected ? 2 : 1;
        visCtx.shadowColor = connected ? '#44ffaa' : '#8888ff';
        visCtx.shadowBlur  = connected ? 16 : 6;
        if (!connected) visCtx.setLineDash([8, 8]);
      }

      visCtx.beginPath();
      visCtx.moveTo(fromPos.x, fromPos.y);
      visCtx.lineTo(toPos.x, toPos.y);
      visCtx.stroke();

      // Midpoint glow dot on active connections
      if (connected) {
        const mx = (fromPos.x + toPos.x) / 2;
        const my = (fromPos.y + toPos.y) / 2;
        visCtx.fillStyle  = kind === 'control' ? (ctrl === 'sequencer' ? '#ffd9a0' : '#e0b3ff') : '#88ffcc';
        visCtx.shadowBlur = 20;
        visCtx.beginPath();
        visCtx.arc(mx, my, 4, 0, 2 * Math.PI);
        visCtx.fill();
      }

      visCtx.restore();
    });
  }

  return { init, draw };
})();

window.visualEngine = visualEngine;
