// src/components/visualEngine.js
// Draws module rings, param arcs, and ArUco debug overlay onto two canvases.

const visualEngine = (() => {
  let visCtx   = null; // reactive visuals canvas (rings, arcs, labels)
  let debugCtx = null; // ArUco debug overlay (green boxes, status bar)

  const _anim = (typeof require === 'function') ? require('../utils/cableAnim.js') : window.cableAnim;
  const PULSE_MS = 150;                                  // sequencer beat-pulse window
  const WAVELENGTH = 42, MAX_AMP = 14, SAMPLE_STEP = 6;  // audio/effect waveform
  const LFO_WAVELENGTH = 80, LFO_AMP = 6;                // slow control ripple
  const TAIL_SEGS = 4, TAIL_SPACING = 7;                 // sequencer pulse comet tail
  const RING_PULSE_MAX = 10;                             // extra px the ring glow grows
  const RING_ALPHA_MIN = 0.15, RING_ALPHA_MAX = 0.7;     // pulse glow alpha range
  const HUB_COLOR = '#88ffcc';                           // master output color
  let _lastMarkers = [], _lastEdges = []; // cached frame state, drawn every rAF by render()
  let _modEdges = []; // modulation cables, updated each detection frame

  function init(visCanvas, dbgCanvas) {
    visCtx   = visCanvas.getContext('2d');
    debugCtx = dbgCanvas.getContext('2d');
  }

  // Cache the latest detection frame (called ~20fps on detection frames).
  function setFrame(markers, edges) {
    _lastMarkers = markers || [];
    _lastEdges = edges || [];
  }

  function setModulationEdges(edges) {
    _modEdges = edges || [];
  }

  // Back-compat: cache + draw in one call (used by tests and any direct callers).
  function draw(markers, edges) { setFrame(markers, edges); render(); }

  // Draw the cached frame; called every rAF (~60fps) so animation is smooth.
  function render() {
    if (!visCtx || !debugCtx) return;
    const detectedWorldMarkers = _lastMarkers;
    const edges = _lastEdges;

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

    // Index active modules by id for quick lookup (needed by edge coloring + rings)
    const activeById = {};
    getActiveModules().forEach(m => { activeById[m.id] = m; });

    // Draw edges beneath module rings so rings appear on top
    if (edges && edges.length > 0) {
      _drawEdges(edges, activeById);
    }

    // Modulation cables (Phase 9) — drawn above patch cables, below rings
    if (_modEdges.length > 0) {
      _drawModulationCables(_modEdges);
    }

    // Draw a ring + param arc for each detected marker that has an active module
    detectedWorldMarkers.forEach(marker => {
      const mod = activeById[marker.id];
      if (!mod) return;

      const { wx, wy } = marker;
      const angle = mod.angle; // smoothed [0, 2π)
      const def   = mod.def;

      // Size the ring to sit outside the physical marker. Derive half-diagonal
      // from the calibrated screen corners so it adapts to zoom/projector distance.
      const markerR = marker.screenCorners && marker.screenCorners.length === 4
        ? marker.screenCorners.reduce((s, c) => s + Math.hypot(c.x - wx, c.y - wy), 0) / 4
        : 50;
      const ringR = Math.max(55, Math.round(markerR * 1.35));

      // Outer glow ring — halo sits just outside the physical ArUco marker
      visCtx.save();
      visCtx.shadowColor = def.color;
      visCtx.shadowBlur  = 32;
      visCtx.strokeStyle = def.color;
      visCtx.lineWidth   = 3;
      visCtx.globalAlpha = 0.75;
      visCtx.beginPath();
      visCtx.arc(wx, wy, ringR, 0, 2 * Math.PI);
      visCtx.stroke();
      visCtx.restore();

      // Level-reactive pulse: an extra outer glow ring that grows/brightens with output level.
      const lvl = (typeof getModuleLevel === 'function') ? getModuleLevel(mod.id) : 0;
      if (lvl > 0.01) {
        visCtx.save();
        visCtx.globalCompositeOperation = 'lighter';
        visCtx.globalAlpha = RING_ALPHA_MIN + (RING_ALPHA_MAX - RING_ALPHA_MIN) * lvl;
        visCtx.strokeStyle = def.color;
        visCtx.shadowColor = def.color;
        visCtx.shadowBlur = 16;
        visCtx.lineWidth = 2;
        visCtx.beginPath();
        visCtx.arc(wx, wy, ringR + RING_PULSE_MAX * lvl, 0, 2 * Math.PI);
        visCtx.stroke();
        visCtx.restore();
      }

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

      // Param value below the ring — loop name for samplers, percentage otherwise
      const paramPct = Math.round(paramT * 100);
      const belowLabel = (def.type === 'sampler' && def.getName)
        ? `${def.paramLabel}: ${def.getName(angle)}`
        : `${def.paramLabel}: ${paramPct}%`;
      visCtx.save();
      visCtx.fillStyle = 'rgba(255,255,255,0.65)';
      visCtx.font      = '11px monospace';
      visCtx.textAlign = 'center';
      visCtx.fillText(belowLabel, wx, wy + ringR + 18);
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

    // Tempo HUD pill (below the Tonality pill) when a Tempo puck is present
    const tempoMod = getActiveModules().find(m => m.def.subtype === 'tempo');
    if (tempoMod) {
      const bpm = tempoMod.def.getBpm(tempoMod.angle);
      visCtx.save();
      visCtx.fillStyle   = 'rgba(26,12,12,0.85)';
      visCtx.strokeStyle = '#4a1f1f';
      const px2 = W - 360, py2 = 64;
      visCtx.beginPath();
      if (visCtx.roundRect) visCtx.roundRect(px2, py2, 180, 34, 17); else visCtx.rect(px2, py2, 180, 34);
      visCtx.fill();
      visCtx.stroke();
      visCtx.fillStyle = '#ff9a9a';
      visCtx.font      = '14px monospace';
      visCtx.textAlign = 'left';
      visCtx.fillText(`TEMPO  ${bpm} BPM`, px2 + 16, py2 + 22);
      visCtx.restore();
    }

    if (window.showOverlay !== false) _drawDebugOverlay(detectedWorldMarkers, W, H);
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

  // edges: [{fromPos, toPos, kind, ctrl, connected, alpha, srcId, dstId}]
  // Each connected cable renders its source signal as an animated wave; disconnected = faint dash.
  function _drawEdges(edges, activeById) {
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    const colorOf = (id) => (id === 'master' ? HUB_COLOR : (activeById[id] && activeById[id].def.color) || HUB_COLOR);

    edges.forEach(edge => {
      const { fromPos, toPos, kind, connected, alpha, ctrl, srcId, dstId } = edge;
      const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
      const len = Math.hypot(dx, dy);

      visCtx.save();

      // Disconnected: faint dashed straight line, no signal (Phase 5 look).
      if (!connected || len === 0) {
        visCtx.globalAlpha = alpha * 0.35;
        visCtx.strokeStyle = '#aaaaff';
        visCtx.lineWidth = 1;
        visCtx.setLineDash([8, 8]);
        visCtx.beginPath(); visCtx.moveTo(fromPos.x, fromPos.y); visCtx.lineTo(toPos.x, toPos.y); visCtx.stroke();
        visCtx.restore();
        return;
      }

      const ux = dx / len, uy = dy / len;       // along-cable unit vector
      const px = -uy, py = ux;                   // perpendicular unit vector

      // Source -> dest color gradient, applied to whatever we stroke on this cable.
      const grad = visCtx.createLinearGradient(fromPos.x, fromPos.y, toPos.x, toPos.y);
      grad.addColorStop(0, colorOf(srcId));
      grad.addColorStop(1, colorOf(dstId));

      // Sequencer trigger link: dim base line + one beat-synced comet pulse (no continuous wave).
      if (kind === 'control' && ctrl === 'sequencer') {
        visCtx.globalAlpha = alpha * 0.5;
        visCtx.strokeStyle = grad; visCtx.lineWidth = 2;
        visCtx.shadowColor = '#ffb74d'; visCtx.shadowBlur = 8; visCtx.setLineDash([3, 9]);
        visCtx.beginPath(); visCtx.moveTo(fromPos.x, fromPos.y); visCtx.lineTo(toPos.x, toPos.y); visCtx.stroke();

        const pulses = (typeof getSeqPulses === 'function') ? getSeqPulses() : {};
        const prog = _anim.pulseProgress(pulses[srcId], now, PULSE_MS);
        if (prog != null) {
          const head = len * prog;
          visCtx.globalCompositeOperation = 'lighter';
          visCtx.setLineDash([]);
          const drawDot = (d, a, r) => {
            const x = fromPos.x + ux * d, y = fromPos.y + uy * d;
            visCtx.globalAlpha = a; visCtx.fillStyle = '#ffd9a0';
            visCtx.shadowColor = '#ffb74d'; visCtx.shadowBlur = 22;
            visCtx.beginPath(); visCtx.arc(x, y, r, 0, 2 * Math.PI); visCtx.fill();
          };
          _anim.cometTail(head, TAIL_SEGS, TAIL_SPACING, len).forEach(s => drawDot(s.d, s.alpha * 0.8, 3));
          drawDot(head, 1, 5);
        }
        visCtx.restore();
        return;
      }

      // Everything else renders an animated wave scrolling source -> dest.
      const isControl = kind === 'control';                     // LFO link
      const srcMod = activeById[srcId];
      const srcType = srcMod && srcMod.def ? (srcMod.def.subtype || srcMod.def.type) : 'oscillator';

      // Sampler: draw the loop's real sample waveform (mirrored peak envelope) scrolling along the cable.
      if (srcType === 'sampler') {
        const peaks = (typeof getLoopPeaks === 'function') ? getLoopPeaks(srcId) : [];
        if (peaks.length > 1) {
          const lvl = (typeof getModuleLevel === 'function') ? getModuleLevel(srcId) : 0.5;
          const amp = MAX_AMP * (0.4 + 0.6 * lvl);
          const speed = _anim.flowSpeed({ kind: 'audio', level: lvl });
          const scroll = Math.floor((speed * (now / 1000)) / SAMPLE_STEP);
          const N = Math.max(2, Math.floor(len / SAMPLE_STEP));
          visCtx.globalCompositeOperation = 'lighter';
          visCtx.globalAlpha = alpha * 0.9;
          visCtx.strokeStyle = grad; visCtx.lineWidth = 2; visCtx.lineJoin = 'round';
          visCtx.shadowColor = colorOf(srcId); visCtx.shadowBlur = 12;
          visCtx.beginPath();
          for (let k = 0; k <= N; k++) {                        // top edge (+peak)
            const d = (k / N) * len;
            const pk = peaks[(k + scroll) % peaks.length] * amp;
            const x = fromPos.x + ux * d + px * pk, y = fromPos.y + uy * d + py * pk;
            if (k === 0) visCtx.moveTo(x, y); else visCtx.lineTo(x, y);
          }
          for (let k = N; k >= 0; k--) {                        // bottom edge (-peak)
            const d = (k / N) * len;
            const pk = peaks[(k + scroll) % peaks.length] * amp;
            const x = fromPos.x + ux * d - px * pk, y = fromPos.y + uy * d - py * pk;
            visCtx.lineTo(x, y);
          }
          visCtx.closePath(); visCtx.stroke();
          visCtx.restore();
          return;
        }
        // no peaks yet -> fall through to the generic wave below
      }

      const level = (typeof getModuleLevel === 'function') ? getModuleLevel(srcId) : 0.5;

      let shape, wavelength, amp, speed;
      if (isControl) {                                          // LFO: slow fixed-amp sine
        shape = 'sine'; wavelength = LFO_WAVELENGTH; amp = LFO_AMP;
        const rate = (typeof getLfoRate === 'function') ? getLfoRate(srcId) : 1;
        speed = _anim.flowSpeed({ kind, ctrl, lfoRate: rate });
      } else {                                                  // audio chain
        shape = (srcType === 'filter') ? 'softsaw' : 'saw';
        wavelength = WAVELENGTH; amp = MAX_AMP * level;
        speed = _anim.flowSpeed({ kind: 'audio', level });
      }

      const phase = -(speed * (now / 1000)) / wavelength;        // scroll source -> dest
      const offs = _anim.waveSamples(len, { shape, wavelength, amplitude: amp, phase, step: SAMPLE_STEP });

      // Reconstruct the d positions waveSamples used (0,step,...,len).
      const ds = [];
      for (let d = 0; d <= len; d += SAMPLE_STEP) ds.push(d);
      if (ds.length === 0 || ds[ds.length - 1] !== len) ds.push(len);

      const isDelay = !isControl && srcType === 'delay';
      visCtx.globalCompositeOperation = 'lighter';              // additive bloom
      visCtx.globalAlpha = alpha * (isControl ? 0.8 : 0.95);
      visCtx.strokeStyle = grad;
      visCtx.lineWidth = isControl ? 1.5 : 2;
      visCtx.lineCap = 'round'; visCtx.lineJoin = 'round';
      visCtx.shadowColor = colorOf(srcId); visCtx.shadowBlur = 14;
      visCtx.beginPath();
      for (let k = 0; k < offs.length; k++) {
        const d = ds[k];
        const env = isDelay ? _anim.echoEnvelope(d, len, { count: 3, decay: 0.55 }) : 1;
        const o = offs[k] * env;
        const x = fromPos.x + ux * d + px * o;
        const y = fromPos.y + uy * d + py * o;
        if (k === 0) visCtx.moveTo(x, y); else visCtx.lineTo(x, y);
      }
      visCtx.stroke();
      visCtx.restore();
    });
  }

  // Draws thin particle cables for cross-modulation connections (Phase 9).
  // Called after _drawEdges so modulation cables render on top of patch cables.
  function _drawModulationCables(edges) {
    if (!visCtx || !edges || edges.length === 0) return;
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;

    edges.forEach(edge => {
      const { fromPos, toPos, depth, srcColor } = edge;
      if (!(depth > 0)) return;
      const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      const ux = dx / len, uy = dy / len;

      // Dim dashed base line — fades in as pucks approach
      visCtx.save();
      visCtx.globalAlpha = depth * 0.35;
      visCtx.strokeStyle = srcColor;
      visCtx.lineWidth = 1;
      visCtx.setLineDash([4, 7]);
      visCtx.shadowColor = srcColor;
      visCtx.shadowBlur = 5;
      visCtx.beginPath();
      visCtx.moveTo(fromPos.x, fromPos.y);
      visCtx.lineTo(toPos.x, toPos.y);
      visCtx.stroke();
      visCtx.setLineDash([]);
      visCtx.restore();

      // Flowing directional particles — denser at higher depth
      const speed = 80;
      const spacing = Math.max(10, 35 - depth * 20); // 35px sparse → 15px dense
      const dots = _anim.flowDotDistances(len, spacing, speed, now);
      dots.forEach(d => {
        const x = fromPos.x + ux * d;
        const y = fromPos.y + uy * d;
        visCtx.save();
        visCtx.globalCompositeOperation = 'lighter';
        visCtx.globalAlpha = depth * 0.75;
        visCtx.fillStyle = srcColor;
        visCtx.shadowColor = srcColor;
        visCtx.shadowBlur = 12;
        visCtx.beginPath();
        visCtx.arc(x, y, 2, 0, 2 * Math.PI);
        visCtx.fill();
        visCtx.restore();
      });
    });
  }

  return { init, draw, setFrame, render, setModulationEdges };
})();

window.visualEngine = visualEngine;
