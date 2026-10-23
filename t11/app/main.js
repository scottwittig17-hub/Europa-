// main.js — Europa's Hidden Ocean: audio-reactive WebXR visualizer (placeholder engine).
import * as THREE from 'three';
import { createXRApp, LoadTracker, loadTexture } from '../core/xr-core.js';
import { CanvasPanel, roundRect } from '../core/panels.js';
import { CONFIG } from './config.js';
import { Interaction, XRInput, DesktopControls } from '../core/input.js';
import { VideoManager } from '../core/media.js';
import { MusicPlayer, createMusicPanel } from '../core/music.js';
import { AudioAnalysis } from './analysis.js';
import { loadStill, stillStats } from './textures.js';
import { fogColor, setGradeMode, setLightingMode, updateHeadlights, LIGHT, LIGHT_U, GRADE, ICE_TEX, ICE_TEX_ON, ROCK_TEX, ROCK_TEX_ON, BACKDROP_ENERGY_U, BACKDROP_ANIM_U, createPath, buildRideWorld, createRide, createCockpit, createVignette } from './ride.js';
import { T11_TEX } from './ice11.js';
import { PALETTE, createCavern, createMarineSnow, createLightShafts, createJellies, createVentGlows, createLoopPlane, LOOP_ANCHORS } from './scene.js';

const params = new URLSearchParams(location.search);
const EYE = new THREE.Vector3(0, 1.2, 0);
const PLACEHOLDER_TRACKS = [
  { name: 'Under the Ice', url: 'assets/music/under-the-ice.mp3', placeholder: true },
  { name: 'Vent Pulse', url: 'assets/music/vent-pulse.mp3', placeholder: true },
];

/* ---------- app + world ---------- */
const app = createXRApp({
  canvas: document.getElementById('scene'), eye: EYE, fov: Number(params.get('fov')) || 70, far: 120,
  foveation: params.get('mode') === 'float' ? CONFIG.FOVEATION : CONFIG.FOVEATION_RIDE, framebufferScale: Math.max(1.0, CONFIG.FRAMEBUFFER_SCALE),   /* never below native */
  targetFrameRate: CONFIG.TARGET_FPS, maxPixelRatio: 1.5, background: fogColor().getHex(),   /* lit-teal fog colour: no pure black anywhere */ preserveDrawingBuffer: params.has('desktop'), localClipping: false,
});
const { renderer, camera, world } = app;
const tracker = new LoadTracker(document.getElementById('loading'));

/* ---------- two modes: 'ride' (default, submarine) and 'float' (stationary). Both graphs are built once; only one is visible. ---------- */
let mode = params.get('mode') === 'float' ? 'float' : 'ride';
const floatGroup = new THREE.Group(); world.add(floatGroup);
const cavern = createCavern({ eyeY: EYE.y }); floatGroup.add(cavern.mesh);
// Gentle water bob moves ONLY this group (particles + shafts). The camera, the XR reference space and `world` are never moved per frame;
// world.position.y is set once at session start by core enterVR() (local-floor fallback) and reset once at session end.
const bob = new THREE.Group(); bob.position.y = EYE.y; floatGroup.add(bob);
const snow = createMarineSnow({ count: Number(params.get('snow')) || CONFIG.SNOW_COUNT }); bob.add(snow.mesh);
const shafts = createLightShafts({ count: 5 }); shafts.group.position.y = -EYE.y; bob.add(shafts.group);
const jellies = createJellies({ count: 6, minDist: 5, eyeY: EYE.y }); floatGroup.add(jellies.group);
const vents = createVentGlows(cavern.uniforms); floatGroup.add(vents.group);

// ride: the WORLD (rideWorld) is moved past the user; the cockpit is attached to the user's reference space and never moves.
const rideWorld = new THREE.Group(); world.add(rideWorld);
const path = createPath();
const rw = buildRideWorld(path, rideWorld, { eyeY: EYE.y });
/* ride speed presets: entry page radio, ?speed=slow|veryslow|drift|<m/s>, and the in-VR dashboard toggle. Changes always ease (ride.setCruise). */
const SPEED_KEYS = Object.keys(CONFIG.RIDE_SPEEDS), SPEED_LABEL = { slow: 'Slow', veryslow: 'Very slow', drift: 'Drift' };
function parseSpeed(v) { if (v == null || v === '') return null; v = String(v).toLowerCase().replace(/[\s_-]/g, ''); if (CONFIG.RIDE_SPEEDS[v]) return v; const n = Number(v);
  if (n > 0) { let best = SPEED_KEYS[0]; for (const k of SPEED_KEYS) if (Math.abs(CONFIG.RIDE_SPEEDS[k] - n) < Math.abs(CONFIG.RIDE_SPEEDS[best] - n)) best = k; return { key: best, v: Math.min(0.5, n) }; } return null; }
let speedKey = CONFIG.RIDE_SPEED_DEFAULT, speedOverride = null;   // speedOverride: a numeric ?speed= value (capped at 0.5 m/s)
{ const ps = parseSpeed(params.get('speed')); if (typeof ps === 'string') speedKey = ps; else if (ps) { speedKey = ps.key; speedOverride = ps.v; } }
const speedValue = () => speedOverride ?? CONFIG.RIDE_SPEEDS[speedKey] ?? CONFIG.RIDE_SPEED;
const ride = createRide(path, rideWorld, { eyeY: EYE.y, startS: Number(params.get('rides')) || 0, cruise: speedValue() });
function setSpeed(key, now = clock.t) { if (!CONFIG.RIDE_SPEEDS[key]) return; speedKey = key; speedOverride = null; ride.setCruise(speedValue(), now);
  document.querySelectorAll('input[name=speed]').forEach((el) => { el.checked = el.value === key; }); speedPanel.dirty = true; }
const cockpit = createCockpit({ eyeY: EYE.y }); world.add(cockpit.group);
const vignette = createVignette(camera);
/* platform-split grade: HMD grade only while an XR session presents; desktop grade otherwise (shared uniforms, no recompiles) */
let gradeHmd = null;
function applyGrade(force) { const on = renderer.xr.isPresenting; if (on === gradeHmd && force !== true) return; gradeHmd = on; setGradeMode(on); fogColor(app.scene.background);
  console.info('[grade]', GRADE.mode, JSON.stringify({ expo: +GRADE.expo.toFixed(3), wall: GRADE.wall, vein: GRADE.vein, lights: GRADE.lights, headlight: GRADE.hl, amb: GRADE.amb })); }
/** Lighting mode: 'headlights' (default) or 'glow'. Uniform-only switch (no recompiles); also the dashboard LIGHTS toggle, the L key and ?lights=0|1. */
function setLights(m) { setLightingMode(m); applyGrade(true); lightsPanel.dirty = true; return LIGHT.mode; }
renderer.xr.addEventListener('sessionstart', applyGrade); renderer.xr.addEventListener('sessionend', applyGrade);
applyGrade();
let vignetteOn = CONFIG.COMFORT_VIGNETTE || params.has('vignette');

/** Compile all shaders up front (and again after async art arrives) so no program compiles mid-session. */
function precompile() { try { app.compile(); } catch (e) { console.info('[gl] precompile skipped', e && e.message); } }

/* ---------- optional art drop-ins, declared in art-manifest.json (no 404 probing; manifest.json is reserved for a future PWA manifest) ---------- */
let loadPano = null;   // set once the manifest lists a pano; called on first entry into float mode
const videos = []; const loopPlanes = []; const rideLoopPlanes = []; const loops = [];
fetch('art-manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m) => {
  // High-res stills (2K-4K; no downscale caps): mipmapped, anisotropy CONFIG.TEX_ANISOTROPY (8), sRGB. If the manifest lists a .ktx2 for a still
  // (tools/prepare_art.py --ktx2), it is transcoded to ASTC/BC7 (~4x less GPU memory); any failure falls back to the JPEG/WebP file.
  const k2 = (u) => (m.ktx2 && m.ktx2[u]) || null, still = (u, o = {}) => loadStill(u, { ktx2: k2(u), renderer, ...o });
  const texels = (t, rx = 1, ry = 1) => new THREE.Vector2((t.image?.width || 1024) * rx, (t.image?.height || 1024) * ry);
  // pano (float mode): 4096x2048 or larger, sampled with seam-free explicit LOD in the cavern shader (texel size from the real image)
  // loaded lazily on first use of float mode: the ride never shows it, so it costs no GPU memory there (4096x2048 RGBA8 + mips = ~43 MB)
  if (m.pano) loadPano = () => { loadPano = null; tracker.track(still(m.pano, { timeoutMs: 30000 }), 'pano').then((t) => { cavern.uniforms.uPano.value = t; cavern.uniforms.uPanoTexels.value.copy(texels(t)); cavern.uniforms.uUsePano.value = 1; precompile(); }, (e) => console.warn('[assets] pano failed, keeping procedural walls', e.message)); };
  if (mode === 'float' && loadPano) loadPano();
  if (m.tex?.walls) tracker.track(still(m.tex.walls, { repeat: true }), 'walls').then((t) => { cavern.uniforms.uWallTex.value = t; cavern.uniforms.uWallTexels.value.copy(texels(t, 8, 4)); cavern.uniforms.uUseWallTex.value = 1; ICE_TEX.value = t; ICE_TEX_ON.value = 1; if (!m.tex?.tunnel) { rw.tunnel.uniforms.uWallTex.value = t; rw.tunnel.uniforms.uUseWallTex.value = 1; } }, (e) => console.warn('[assets] walls texture failed', e.message));
  if (m.tex?.snow) tracker.track(loadTexture(m.tex.snow), 'snow').then((t) => { snow.uniforms.uMap.value = t; snow.uniforms.uUseMap.value = 1; rw.snow.uniforms.uMap.value = t; rw.snow.uniforms.uUseMap.value = 1; }, (e) => console.warn('[assets] snow sprite failed', e.message));
  // ride art: colour rock tile for the tunnel (gently brighter gain; tiling, up to 2048), cockpit console face, chamber backdrops (up to 4096 wide)
  if (m.tex?.tunnel) tracker.track(still(m.tex.tunnel, { repeat: true }), 'tunnel').then((t) => { rw.tunnel.uniforms.uWallTex.value = t; rw.tunnel.uniforms.uUseWallTex.value = 1; rw.tunnel.uniforms.uWallGain.value = 1.25; precompile(); }, (e) => console.warn('[assets] tunnel texture failed', e.message));
  if (m.tex?.veins) tracker.track(loadTexture(m.tex.veins), 'veins').then((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; rw.tunnel.uniforms.uVeinTex.value = t; rw.tunnel.uniforms.uUseVeinTex.value = 1; precompile(); }, (e) => console.warn('[assets] vein mask failed', e.message));
  // test #11: ice-wall + glassy-ice albedos (sRGB) and the generated normal(xy)/roughness(b) maps (LINEAR: NoColorSpace), KTX2 first, PNG/JPEG fallback
  for (const [key, lin] of [['icewall', 0], ['icecol', 0], ['icedet', 0], ['icewallNr', 1], ['icecolNr', 1], ['icedetNr', 1], ['rockNr', 1], ['tunnelNr', 1], ['wallsNr', 1]]) {
    if (!m.tex?.[key] || !T11_TEX[key]) continue;
    tracker.track(still(m.tex[key], { repeat: true, ...(lin ? { colorSpace: THREE.NoColorSpace } : {}) }), key).then((t) => { T11_TEX[key].value = t; precompile(); }, (e) => console.warn('[assets] t11 texture failed', key, e.message));
  }
  if (m.tex?.rock) tracker.track(still(m.tex.rock, { repeat: true }), 'rock').then((t) => { ROCK_TEX.value = t; ROCK_TEX_ON.value = 1; precompile(); }, (e) => console.warn('[assets] rock texture failed', e.message));   // rock props + vent chimneys
  if (m.tex?.creatures && CONFIG.CREATURES_ON !== false) tracker.track(still(m.tex.creatures), 'creatures').then((t) => { rw.setCreatureTexture(t); precompile(); }, (e) => console.warn('[assets] creature atlas failed', e.message));   // test #8
  if (m.tex?.dash) tracker.track(still(m.tex.dash), 'dash').then((t) => { cockpit.setDashTexture(t); precompile(); }, (e) => console.warn('[assets] dash texture failed', e.message));
  (m.chambers || []).forEach((url, i0) => { const i = /jelly/.test(url) ? 0 : /vent/.test(url) ? 1 : /pillar/.test(url) ? 2 : i0; tracker.track(still(url), 'chamber' + i).then((t) => { rw.addBackdrop(i, t); precompile(); }, (e) => console.warn('[assets] chamber backdrop failed', url, e.message)); });   // test #10: slot by name (only the vents backdrop ships)
  // at most CONFIG.MAX_LOOP_VIDEOS decoding at once; VideoTextures are LinearFilter, no mipmaps, uploaded only on new frames (requestVideoFrameCallback)
  (m.loops || []).slice(0, Math.min(LOOP_ANCHORS.length, rw.loopSpots.length)).forEach((url, i) => {
    const vm = new VideoManager({ stallMs: 10000, maxLongSide: 1920 });   // one manager per loop: each plays independently
    const entry = vm.get('loop' + i, url); const plane = createLoopPlane(entry.tex, LOOP_ANCHORS[i]); floatGroup.add(plane);
    const rplane = rw.addLoop(i, entry.tex);   // the same video texture also appears at a chamber along the ride
    const inst = rw.addLoopInstances(i, entry.tex);   // + extra planes fed by the SAME video (plumes on the vent chimneys, gliding rays, the big ray)
    plane.userData.url = url; plane.userData.floatSlot = i < CONFIG.MAX_LOOP_VIDEOS; if (!plane.userData.floatSlot) plane.visible = false;   // float shows the first MAX_LOOP_VIDEOS only
    const fit = () => { if (entry.el.videoWidth) { const a = entry.el.videoWidth / entry.el.videoHeight; plane.userData.setAspect(a); rplane?.userData.setAspect(a); for (const q of inst) q.userData.setAspect(a); } };   // real aspect, portrait or landscape
    entry.el.addEventListener('loadedmetadata', fit); fit();
    const loop = { vm, entry, plane, rplane, inst, index: i, playing: false, failed: false, retryAt: 0, upT: -1 };
    loop.play = () => { if (loop.playing || loop.failed || performance.now() < loop.retryAt) return; loop.playing = true; vm.play(entry, { onReady: () => { plane.userData.on = true; if (rplane) rplane.userData.on = true; for (const q of inst) q.userData.on = true; }, onFail: () => { loop.playing = false;
        if (!entry.failed) { loop.retryAt = performance.now() + 4000; return; }   // t10b: a stall / blocked play() is retried (fades out meanwhile); only a media error is permanent
        loop.failed = true; plane.visible = false; if (rplane) rplane.visible = false; for (const q of inst) { q.userData.failed = true; q.material.uniforms.uOpacity.value = 0; } } }); };
    loop.stop = () => { if (!loop.playing) return; loop.playing = false; vm.stop(entry); };
    if (rplane) rplane.userData.loop = loop; for (const q of inst) q.userData.loop = loop;
    loops.push(loop); videos.push(vm); loopPlanes.push(plane); if (rplane) rideLoopPlanes.push(rplane); rideLoopPlanes.push(...inst);
  });
  updateVideos(true); precompile();
});

/** Float: the first MAX_LOOP_VIDEOS loops play. Ride: only loops whose chamber is within RIDE_VIDEO_NEAR_M of the sub. */
let videoCheckT = 0;
function updateVideos(force, now = performance.now()) {
  if (!force && now - videoCheckT < 1000) return; videoCheckT = now;
  // never more than CONFIG.MAX_LOOP_VIDEOS decoding: float = first N loops; ride = the N nearest chambers' loops within RIDE_VIDEO_NEAR_M
  const cand = [];
  loops.forEach((l, i) => {
    if (mode !== 'ride') { if (l.plane.userData.floatSlot) cand.push([i, i]); return; }
    let d = Infinity; for (const sp of rw.loopSpotList(l.index)) { let x = Math.abs(sp - ride.state.s); x = Math.min(x, path.L - x); d = Math.min(d, x); }   // nearest of ALL planes this video feeds
    if (d < CONFIG.RIDE_VIDEO_NEAR_M) cand.push([d, i]);
  });
  // test #6: the plume video feeds all 14 chimney plumes (vents chamber + 3 lone corridor vents), so in the ride it keeps one decode slot for the
  // whole lap (PLUME_ALWAYS_DECODE): plumes are already firing when they come into view from far away. The remaining slots go to the nearest others.
  if (mode === 'ride' && CONFIG.PLUME_ALWAYS_DECODE !== false) loops.forEach((l, i) => { if (l.inst.some((q) => q.userData.kind === 'plume') && !l.failed) { const c = cand.find((x) => x[1] === i); if (c) c[0] = -1; else cand.push([-1, i]); } });
  // test #7: while a big-ray pass is on (incl. a short lead-in), its video (05) outranks everything but the plume: the overhead pass is in the jelly hall,
  // whose own loops would otherwise take both remaining slots
  if (mode === 'ride' && rw.bigActive(ride.state.s)) loops.forEach((l, i) => { if (l.inst.some((q) => q.userData.kind === 'bigray') && !l.failed) { const c = cand.find((x) => x[1] === i); if (c) c[0] = Math.min(c[0], -0.5); else cand.push([-0.5, i]); } });
  const want = new Set(cand.sort((a, b) => a[0] - b[0]).slice(0, CONFIG.MAX_LOOP_VIDEOS).map((c) => c[1]));
  loops.forEach((l, i) => { if (!want.has(i)) l.stop(); }); loops.forEach((l, i) => { if (want.has(i)) l.play(); });
  // t10b: a wanted video the browser paused behind our back (autoplay before the Enter-VR gesture, power saving, session switch) is resumed
  for (const l of loops) if (l.playing && !l.failed && l.entry.el.paused) { const p = l.entry.el.play(); if (p) p.catch(() => {}); }
}
/* t10b ROOT-CAUSE FIX: three's VideoTexture only re-uploads a frame from requestVideoFrameCallback. In an immersive WebXR session the Quest browser
   suspends the page's window frame loop, so those callbacks stop and every video texture (rays, the big manta, jelly loops, vent plumes) freezes on
   the frame shown when you entered VR, while the planes keep moving: "floating, not swimming". Pump the upload from OUR (XR) frame loop instead:
   whenever a playing video's currentTime has moved, flag the texture. Cheap: <= MAX_LOOP_VIDEOS uploads per new video frame, like rVFC. */
function pumpVideoTextures() {
  for (const l of loops) { if (!l.playing) continue; const v = l.entry.el; if (v.readyState < 2) continue; const ct = v.currentTime; if (ct !== l.upT) { l.upT = ct; l.entry.tex.needsUpdate = true; } }
}

/* ---------- music + analysis ---------- */
const player = new MusicPlayer({ tracks: PLACEHOLDER_TRACKS, volume: 0.6 });
const analysis = new AudioAnalysis(player.audio, {
  onBeat: (a) => {   // bass sends a slow light-ripple ring across the walls (rate-limited so it never gets busy)
    if (CONFIG.RIPPLES && a.bass > 0.25 && clock.t - lastRipple > CONFIG.RIPPLE_MIN_INTERVAL) {
      lastRipple = clock.t;
      const yaw = (Math.random() - 0.5) * 3.4, y = -0.15 + Math.random() * 0.5;
      if (mode === 'ride') { if (rw.ripple(ride.state.s, clock.t)) ripples++; return; }
      rippleDir.set(Math.sin(yaw), y, -Math.cos(yaw)).normalize();
      cavern.ripple(rippleDir, clock.t); ripples++;
    }
  },
});
let lastRipple = -10, ripples = 0; const rippleDir = new THREE.Vector3();
player.onChange(() => { if (player.playing) analysis.connect(); updateEntryTracks(); });

const panel = createMusicPanel(player, { theme: { moon: '#d8f3f5', inkSoft: '#8fb9c4', accent: '#ffb877', error: '#ffb877' }, anisotropy: Math.min(CONFIG.TEX_ANISOTROPY, app.maxAniso), superSample: CONFIG.PANEL_SUPERSAMPLE });
panel.mesh.userData.panel = panel;
panel.mesh.position.set(-0.78, 1.02, -1.45); panel.mesh.lookAt(0, 1.2, 0);   // fixed, front-left anchor
world.add(panel.mesh);
/* ---------- in-VR stats: small 'i' button under the music panel (or hold LEFT thumbstick click 1 s, or D on desktop) ---------- */
const infoBtn = new CanvasPanel(0.07, 0.07, 1400, (ctx, p) => {
  const W = ctx.lw, on = statsOn, hov = p.hover === 'info';
  ctx.fillStyle = on ? 'rgba(95,230,236,.35)' : hov ? 'rgba(7,30,46,.9)' : 'rgba(7,11,20,.7)';
  ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hov ? 'rgba(216,243,245,.8)' : 'rgba(216,243,245,.3)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#d8f3f5'; ctx.font = 'italic 600 64px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('i', W / 2, W / 2 + 4);
  p.regions.push({ id: 'info', x: 0, y: 0, w: W, h: W });
}, { superSample: CONFIG.PANEL_SUPERSAMPLE, anisotropy: Math.min(CONFIG.TEX_ANISOTROPY, app.maxAniso) });
infoBtn.onPress = () => toggleStats();
infoBtn.mesh.position.set(-0.42, 0.86, -1.32); infoBtn.mesh.lookAt(0, 1.2, 0); world.add(infoBtn.mesh);
let statsOn = params.has('stats');
const statsPanel = new CanvasPanel(0.42, 0.26, 1100, (ctx) => {
  const W = ctx.lw, H = ctx.lh, st = app.stats, a = analysis;
  ctx.fillStyle = 'rgba(4,19,31,.82)'; roundRect(ctx, 0, 0, W, H, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(95,230,236,.3)'; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 25); ctx.stroke();
  ctx.fillStyle = '#8fb9c4'; ctx.font = '600 22px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('STATS  (updates 2×/s)', 30, 44);
  ctx.fillStyle = '#d8f3f5'; ctx.font = '500 30px ui-monospace, Menlo, monospace';
  const vids = loopPlanes.reduce((n, p) => n + (p.visible && p.userData.on ? 1 : 0), 0);
  const lines = [
    `fps ${st.fps.toFixed(1)}${st.targetFrameRate ? ' / ' + st.targetFrameRate : ''}`,
    `frame ${st.frameMs.toFixed(1)} ms  max ${st.maxFrameMs.toFixed(0)}`,
    `beat ${a.beat.toFixed(2)}  bass ${a.bass.toFixed(2)}`,
    `mood ${a.mood.toFixed(2)}  bpm ${a.bpm ? a.bpm.toFixed(0) : '-'}`,
    `videos ${vids}  uploads ${panel.uploads}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 30, 92 + i * 46));
}, { minRedrawMs: 500, superSample: CONFIG.PANEL_SUPERSAMPLE, anisotropy: Math.min(CONFIG.TEX_ANISOTROPY, app.maxAniso) });
statsPanel.mesh.position.set(-0.78, 0.66, -1.42); statsPanel.mesh.lookAt(0, 1.2, 0); statsPanel.mesh.visible = statsOn; world.add(statsPanel.mesh);
function toggleStats() { statsOn = !statsOn; statsPanel.mesh.visible = statsOn; statsPanel.dirty = true; infoBtn.dirty = true; }
let statsLast = 0, stickHeld = 0;

/* ---------- in-VR ride speed toggle (dashboard, ride mode only): Slow · Very slow · Drift; always eases ---------- */
const speedPanel = new CanvasPanel(0.36, 0.085, 1400, (ctx, p) => {
  const W = ctx.lw, H = ctx.lh;
  ctx.fillStyle = 'rgba(7,11,20,.74)'; roundRect(ctx, 0, 0, W, H, 24); ctx.fill(); ctx.strokeStyle = 'rgba(216,243,245,.18)'; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 23); ctx.stroke();
  ctx.fillStyle = '#8fb9c4'; ctx.font = '600 22px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('SPEED', 22, H / 2);
  const x0 = 110, bw = (W - x0 - 14) / 3;
  SPEED_KEYS.forEach((k, i) => { const x = x0 + i * bw, on = k === speedKey && speedOverride == null, hov = p.hover === 'speed-' + k;
    ctx.fillStyle = on ? 'rgba(95,230,236,.32)' : hov ? 'rgba(7,30,46,.95)' : 'rgba(255,255,255,.04)'; roundRect(ctx, x + 4, 12, bw - 8, H - 24, 16); ctx.fill();
    if (hov || on) { ctx.strokeStyle = on ? 'rgba(95,230,236,.8)' : 'rgba(216,243,245,.5)'; ctx.lineWidth = 3; roundRect(ctx, x + 4, 12, bw - 8, H - 24, 16); ctx.stroke(); }
    ctx.fillStyle = on ? '#ffffff' : '#d8f3f5'; ctx.font = `${on ? 600 : 500} 27px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(SPEED_LABEL[k], x + bw / 2, H / 2 + 1);
    p.regions.push({ id: 'speed-' + k, x: x + 4, y: 12, w: bw - 8, h: H - 24 }); });
}, { superSample: CONFIG.PANEL_SUPERSAMPLE, anisotropy: Math.min(CONFIG.TEX_ANISOTROPY, app.maxAniso) });
speedPanel.onPress = (id) => setSpeed(id.slice(6));
world.add(speedPanel.mesh);
/* ---------- LIGHTS on/off pill (ride mode): small, left of the 'i' button, clear of the sonar ---------- */
const lightsPanel = new CanvasPanel(0.13, 0.05, 1400, (ctx, p) => {
  const W = ctx.lw, H = ctx.lh, on = LIGHT.mode === 'headlights', hov = p.hover === 'lights';
  ctx.fillStyle = on ? 'rgba(255,236,200,.22)' : hov ? 'rgba(7,30,46,.95)' : 'rgba(7,11,20,.74)'; roundRect(ctx, 0, 0, W, H, H / 2); ctx.fill();
  ctx.strokeStyle = on ? 'rgba(255,236,200,.75)' : hov ? 'rgba(216,243,245,.6)' : 'rgba(216,243,245,.25)'; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, W - 3, H - 3, H / 2 - 1.5); ctx.stroke();
  ctx.fillStyle = on ? '#fff1d6' : '#8fb9c4'; ctx.font = '600 23px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(on ? 'LIGHTS ON' : 'LIGHTS OFF', W / 2, H / 2 + 1);
  p.regions.push({ id: 'lights', x: 0, y: 0, w: W, h: H });
}, { superSample: CONFIG.PANEL_SUPERSAMPLE, anisotropy: Math.min(CONFIG.TEX_ANISOTROPY, app.maxAniso) });
lightsPanel.onPress = () => setLights(LIGHT.mode === 'headlights' ? 'glow' : 'headlights');
world.add(lightsPanel.mesh);

const targets = [panel.mesh, infoBtn.mesh, speedPanel.mesh, lightsPanel.mesh];   // constant array: no per-frame allocation in hit tests
const interaction = new Interaction({ getTargets: () => targets });
const xrInput = new XRInput({ renderer, scene: app.scene, camera, interaction, rayColor: 0xbfeff3, handColor: 0x9fd8e0,
  onAxisX: (dir) => { if (dir > 0) player.next(); else if (dir < 0) player.prev(); }, onButton: (b) => { if (b === 'a') player.toggle(); } });
const desktop = new DesktopControls({ canvas: renderer.domElement, camera, renderer, interaction, yawDeg: Number(params.get('yaw')) || 0, pitchDeg: Number(params.get('pitch')) || 0 });

/* ---------- debug overlay (D) ---------- */
const dbg = document.getElementById('debug');
let dbgOn = params.has('debug');
function drawDebug() {
  if (!dbgOn) { dbg.hidden = true; return; } dbg.hidden = false;
  const a = analysis, bar = (v) => '█'.repeat(Math.round(Math.min(1, v) * 20)).padEnd(20, '·');
  dbg.textContent = `beat   ${bar(a.beat)} ${a.beat.toFixed(2)}  (#${a.beats})\nbass   ${bar(a.bass)} ${a.bass.toFixed(2)}\nenergy ${bar(a.energy)} ${a.energy.toFixed(2)}\nmood   ${bar(a.mood)} ${a.mood.toFixed(2)}  ${a.mood > .5 ? 'cyan / bright' : 'deep blue / mellow'}\ncentroid ${a.centroid.toFixed(0)} Hz   bpm ${a.bpm ? a.bpm.toFixed(0) : '—'}   swim ×${a.speed.toFixed(2)}\nripples ${ripples}   fps ${app.fps.toFixed(0)}   ${a.active ? 'audio live' : 'idle breathing'}`;
}
setInterval(drawDebug, 100);

/* ---------- mode switching ---------- */
const _m4 = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
/** Orient a panel to face the seated eye, in the parent's (world group) local frame — independent of any world shift. */
function faceEye(mesh) { _m4.lookAt(EYE, mesh.position, _up); mesh.quaternion.setFromRotationMatrix(_m4); }
const PANEL_POSE = {
  float: { panel: [-0.78, 1.02, -1.45, 1], info: [-0.42, 0.86, -1.32], stats: [-0.78, 0.66, -1.42], speed: null, lights: null },
  ride:  { panel: [-0.44, 0.74, -0.80, 0.8], info: [-0.02, 0.66, -0.74], stats: [0.42, 0.74, -0.80], speed: [0.0, 0.78, -0.82], lights: [-0.125, 0.655, -0.745] },   // on the dashboard, below the window line
};
function setMode(m) {
  mode = m === 'float' ? 'float' : 'ride';
  floatGroup.visible = mode === 'float'; rideWorld.visible = cockpit.group.visible = mode === 'ride';
  const P = PANEL_POSE[mode];
  panel.mesh.position.set(P.panel[0], P.panel[1], P.panel[2]); panel.mesh.scale.setScalar(P.panel[3]); faceEye(panel.mesh);
  infoBtn.mesh.position.set(...P.info); faceEye(infoBtn.mesh);
  statsPanel.mesh.position.set(...P.stats); faceEye(statsPanel.mesh);
  speedPanel.mesh.visible = !!P.speed; if (P.speed) { speedPanel.mesh.position.set(...P.speed); faceEye(speedPanel.mesh); }
  lightsPanel.mesh.visible = !!P.lights; if (P.lights) { lightsPanel.mesh.position.set(...P.lights); faceEye(lightsPanel.mesh); }
  try { renderer.xr.setFoveation(mode === 'ride' ? CONFIG.FOVEATION_RIDE : CONFIG.FOVEATION); } catch (e) { /* not presenting */ }
  if (mode === 'float') { ride.stop(clock.t); if (loadPano) loadPano(); }
  updateVideos(true);
  document.querySelectorAll('input[name=mode]').forEach((el) => { el.checked = el.value === mode; });
}

/* ---------- frame loop ---------- */
const clock = { t: 0, last: performance.now() };
app.onFrame((now) => {
  const dt = Math.min(0.1, (now - clock.last) / 1000); clock.last = now; clock.t += dt; const t = clock.t;
  analysis.update(dt);
  const breath = Math.sin(t * 2 * Math.PI / 7.5);   // idle world breathing, ~8 breaths/min, independent of audio
  const U = cavern.uniforms;
  if (mode === 'float') {
    U.uTime.value = t; U.uBeat.value = analysis.beat; U.uBass.value = analysis.bass; U.uMood.value = analysis.mood; U.uBreath.value = breath;
    snow.uniforms.uTime.value = t; snow.uniforms.uBreath.value = breath;
    shafts.uniforms.uBreath.value = breath; shafts.uniforms.uMood.value = analysis.mood; shafts.uniforms.uBeat.value = analysis.beat; shafts.update(t);
    jellies.uniforms.uMood.value = analysis.mood; jellies.update(dt, t, analysis.speed, breath);
    vents.update(t);
    bob.position.y = EYE.y + Math.sin(t * 0.55) * 0.035; bob.position.x = Math.sin(t * 0.37) * 0.02;
    for (const p of loopPlanes) if (p.userData.on) p.material.uniforms.uOpacity.value = Math.min(0.85, p.material.uniforms.uOpacity.value + dt * 0.2);
  } else {
    ride.update(t, dt);   // ride speed never follows the music
    const TU = rw.tunnel.uniforms;
    TU.uTime.value = t; TU.uBeat.value = analysis.beat; TU.uBass.value = analysis.bass; TU.uMood.value = analysis.mood; TU.uBreath.value = breath;
    rw.snow.uniforms.uTime.value = t; rw.snow.uniforms.uBreath.value = breath; rw.snow.uniforms.uCenter.value.copy(ride.state.pos);
    for (const sh of rw.shafts) { sh.uniforms.uBreath.value = breath; sh.uniforms.uMood.value = analysis.mood; sh.uniforms.uBeat.value = analysis.beat; sh.update(t); }
    rw.jellies.uniforms.uMood.value = analysis.mood; rw.jellies.update(dt, t, analysis.speed, breath);   // creatures may follow tempo
    rw.vent.material.opacity = 0.5 + 0.1 * Math.sin(t * 0.35);
    rw.updateInstances(ride.state.s, t);   // plumes face the sub, rays glide, the big ray follows its once-per-lap choreography
    rw.updateCreatures(ride.state.s, t, dt);   // test #8: fish, angler, veil (one draw call)
    { const mp = loops[5]?.rplane; if (mp) { const b = mp.userData.hoverBase || (mp.userData.hoverBase = mp.position.clone());   // t11: the giant manta hovers (holds station, flapping in its video)
      mp.position.set(b.x, b.y + 0.28 * Math.sin(t * 0.21), b.z).addScaledVector(mp.userData.spotSide || (mp.userData.spotSide = new THREE.Vector3(1, 0, 0).applyQuaternion(mp.quaternion)), 0.35 * Math.sin(t * 0.13)); } }
    BACKDROP_ENERGY_U.value = CONFIG.BACKDROP_AUDIO * CONFIG.CALM * analysis.energy;   // backdrop glow breathing, lightly audio-reactive
    for (const p of rideLoopPlanes) { const u = p.material.uniforms.uOpacity;
      if (p.userData.on && !p.userData.failed && p.userData.loop?.playing !== false) u.value = Math.min(0.85, u.value + dt * 0.2);
      else if (p.userData.loop && !p.userData.loop.playing && u.value > 0) u.value = Math.max(0, u.value - dt * 0.3); }   // a paused loop fades out instead of freezing on a still frame
    rw.cathedral.uniforms.uLavaPulse.value = 0.12 * breath + CONFIG.LAVA_BASS_PULSE * CONFIG.CALM * analysis.bass;   // gentle; reads analysis only
    cockpit.update(t); updateHeadlights(cockpit.group.matrixWorld);   // lamps bolted to the sub: they glide with the ride (allocation-free)
    vignette.set(vignetteOn, 0.55 * Math.min(1, ride.state.speed / ride.cruise));
    updateVideos(false, now);
  }
  pumpVideoTextures();   // t10b: video frames keep uploading inside the XR session (see above)
  applyGrade();   // cheap guard (boolean compare) in case a session event was missed
  desktop.update(); xrInput.update(); interaction.applyHover(); panel.refresh(now); infoBtn.refresh(now); if (speedPanel.mesh.visible) speedPanel.refresh(now); if (lightsPanel.mesh.visible) lightsPanel.refresh(now);
  // hold LEFT thumbstick click for 1 s -> toggle stats (no allocation: iterate the live inputSources list)
  const session = renderer.xr.getSession();
  if (session) {
    let held = false;
    for (const src of session.inputSources) if (src.handedness === 'left' && src.gamepad && src.gamepad.buttons[3] && src.gamepad.buttons[3].pressed) held = true;
    if (held) { stickHeld += dt; if (stickHeld >= 1 && stickHeld - dt < 1) toggleStats(); } else stickHeld = 0;
  }
  if (statsOn && now - statsLast >= 500) { statsLast = now; statsPanel.dirty = true; }
  if (statsOn) statsPanel.refresh(now);
});

/* ---------- entry page ---------- */
const entryEl = document.getElementById('entry'), enterBtn = document.getElementById('enterVR'), previewBtn = document.getElementById('preview');
const fileInput = document.getElementById('musicInput'), trackList = document.getElementById('trackList'), vrNote = document.getElementById('vrNote');
function updateEntryTracks() { trackList.innerHTML = ''; player.list.forEach((tr, i) => { const li = document.createElement('li'); li.textContent = `${i + 1}. ${tr.name}`; if (tr.placeholder) { const s = document.createElement('span'); s.className = 'tag'; s.textContent = 'placeholder'; li.append(s); } trackList.append(li); }); }
updateEntryTracks();
/* Music queue (test #5): the WHOLE multi-selection becomes the queue; choosing again APPENDS (placeholders are replaced by the first real pick).
   Lenient filter: some pickers (Quest/Android content URIs) report an empty MIME type, so anything with an audio/video type, a known audio
   extension, or no type at all is queued; files that turn out unplayable are skipped by the player. */
const queueNote = document.getElementById('queueNote'), musicBtn = document.getElementById('musicBtn');
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|wav|wave|ogg|oga|opus|flac|webm|weba|mp4|aif|aiff|caf)$/i;
function addFiles(list) {
  const files = [...list].filter((f) => f.type.startsWith('audio/') || f.type.startsWith('video/') || AUDIO_EXT.test(f.name) || !f.type);
  if (!files.length) { queueNote.textContent = 'No audio files in that selection.'; return 0; }
  const n = player.addTracks(files.map((f) => ({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) })));
  queueNote.textContent = `Queued ${files.length} file${files.length > 1 ? 's' : ''} · ${n} track${n > 1 ? 's' : ''} in the queue. Choosing again adds more.`;
  musicBtn.classList.remove('pulse'); console.info('[music] queued', files.length, 'files; queue length', n); return files.length;
}
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });   // reset so picking the same files again still fires 'change'
document.getElementById('usePlaceholders').addEventListener('click', () => { player.setPlaylist(PLACEHOLDER_TRACKS); fileInput.value = ''; queueNote.textContent = 'Placeholder tracks queued.'; });
/* '+ Add' on the in-VR music panel. A file picker must open from a user gesture and cannot show inside an immersive session on Quest, so in VR
   it ends the session (music pauses, see below), returns to this page with the music button highlighted; pick files, then Enter VR again.
   On desktop the press arrives inside the pointer event, so the picker opens directly. */
let pendingAdd = false;
panel.setOnAdd(() => { if (renderer.xr.isPresenting) { pendingAdd = true; renderer.xr.getSession()?.end(); } else fileInput.click(); });
/* Bug fix (test #5): music kept playing after leaving VR. On XR session end: pause the track and suspend the AudioContext.
   Re-entering VR (begin) or the play button resumes. */
function onSessionEnded() { player.pause(); analysis.suspend(); if (pendingAdd) { pendingAdd = false; musicBtn.classList.add('pulse'); queueNote.textContent = 'Choose more music to add to the queue, then Enter VR again.'; } }
renderer.xr.addEventListener('sessionend', onSessionEnded);
function hideEntry() { entryEl.hidden = true; document.body.classList.add('in-scene'); }
function showEntry() { entryEl.hidden = false; document.body.classList.remove('in-scene'); }
function chosenMode() { const el = document.querySelector('input[name=mode]:checked'); return el ? el.value : 'ride'; }
function chosenSpeed() { const el = document.querySelector('input[name=speed]:checked'); return el ? el.value : speedKey; }
function unlockVideos() {   // t10b: inside the Enter-VR / Preview click (user gesture): start every loop element once so later play() calls are allowed
  for (const l of loops) { const v = l.entry.el; if (l.failed || !v.paused) continue; const p = v.play(); if (p) p.then(() => { if (!l.playing) v.pause(); }, () => {}); }
  updateVideos(true);
}
function begin() { unlockVideos(); setMode(chosenMode()); if (chosenSpeed() !== speedKey) { speedKey = chosenSpeed(); speedOverride = null; } ride.setCruise(speedValue(), clock.t); speedPanel.dirty = true; vignetteOn = document.getElementById('vignette').checked; hideEntry(); analysis.connect(); player.play(); if (mode === 'ride') ride.start(clock.t); }
previewBtn.addEventListener('click', begin);
app.vrSupport().then(({ ok, reason }) => {
  enterBtn.disabled = !ok;
  if (!ok) vrNote.textContent = reason === 'insecure' ? 'VR needs HTTPS (Netlify gives you that).' : 'No VR headset found — use the desktop preview, or open this page in the Quest browser.';
});
enterBtn.addEventListener('click', async () => {
  try { await app.enterVR({ onStart: begin, onEnd: () => { ride.stop(clock.t); showEntry(); } }); }
  catch (e) { console.warn('enterVR failed', e); vrNote.textContent = 'Could not start VR: ' + e.message; showEntry(); }
});
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); analysis.connect(); player.toggle(); }
  else if (e.key === 'n' || e.key === 'N') player.next();
  else if (e.key === 'p' || e.key === 'P') player.prev();
  else if (e.key === 'd' || e.key === 'D') { dbgOn = !dbgOn; drawDebug(); }
  else if (e.key === 'i' || e.key === 'I') toggleStats();
  else if (e.key === 'l' || e.key === 'L') setLights(LIGHT.mode === 'headlights' ? 'glow' : 'headlights');
  else if (e.key === 'Escape' && !app.isPresenting) { player.pause(); ride.stop(clock.t); showEntry(); }
});
document.getElementById('vignette').checked = vignetteOn;
document.querySelectorAll('input[name=speed]').forEach((el) => { el.checked = el.value === speedKey; el.addEventListener('change', () => { if (el.checked && !entryEl.hidden) { speedKey = el.value; speedOverride = null; } }); });
setMode(mode);
if (params.has('desktop')) { hideEntry(); if (mode === 'ride' && !params.has('noride')) ride.start(clock.t); }
precompile();

/* ---------- test hooks ---------- */
window.__ev = { stillStats, addFiles, updateVideos, onSessionEnded, BACKDROP_ANIM_U, BACKDROP_ENERGY_U, get pendingAdd() { return pendingAdd; }, setGradeMode, GRADE, applyGrade, setLights, LIGHT, LIGHT_U, lightsPanel, ride, rw, path, cockpit, vignette, rideWorld, setMode, get mode() { return mode; }, loops, rideLoopPlanes, desktop, snow, infoBtn, statsPanel, toggleStats, get statsOn() { return statsOn; }, app, analysis, player, panel, jellies, cavern, interaction, get ripples() { return ripples; }, get t() { return clock.t; }, get fps() { return app.fps; },
  panelScreenPos: (id) => panel.screenPos(id, camera), loopPlanes, speedPanel, setSpeed, get speedKey() { return speedKey; }, speedValue };
