/* ENCELADUS — Saturn View test spot e1 (three.js r160, WebXR)
 *
 * Single standalone spot built on the Europa surface pattern (surface-r12g):
 *   - front: Scott's Saturn picture on a curved panel around the eye, its painted horizon at eye level
 *   - sides / back: real-star black sky (Hipparcos stars.json + faint dust) and a soft blue horizon glow
 *     matched to the glow in the picture, so the panel's side fades land on the same sky
 *   - ground: real 3D smooth ice (the seamless no-crack ground from Fissure / Crevasse), coloured and lit
 *     to match the painted plain, which the panel's bottom edge fades into
 * Nothing here is shared with /surface/ — this folder is self-contained.
 */
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/* ---------------------------------------------------------- config */
const BUILD = 'Enceladus e2 \u00b7 e1 + ground tiled from one picture patch';
const SCENE_VER = 'v1 Saturn front, star sky, 3D ice';
const PLAYER_HEIGHT = 1.7, EYE = PLAYER_HEIGHT;
// Sun: the picture lights Saturn and the ice lumps from the right, a little from behind the viewer, low.
const SUN_DIR = new THREE.Vector3(0.78, 0.30, 0.42).normalize();

/* Front picture (assets/saturn-front.jpg, 4096x2304, from Scott's 7168x4032 4x upscale).
 *   arcDeg   horizontal wrap. 104 deg: the rings span ~87 deg, Saturn's globe ~27 deg tall.
 *   horizon  painted horizon row, fraction down from the top (measured 0.852 across the frame).
 *   rows are laid out ANGLE-linear (elevation proportional to picture row, same deg/px as horizontally),
 *   so Saturn keeps its shape high in the sky instead of being squashed the way a straight cylinder
 *   (rows linear in height) compresses everything above ~30 deg. */
const FRONT = { url: './assets/saturn-front.jpg?v=e1', arcDeg: 104, horizon: 0.852, radius: 300,
  sideFade: 0.055, groundSideFade: 0.16, bottomFade: 0.035, bright: 1.0 };

/* ---------------------------------------------------------- renderer / scene */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
const rig = new THREE.Group();
rig.add(camera); camera.position.set(0, PLAYER_HEIGHT, 0);
scene.add(rig);

/* ---------------------------------------------------------- lights */
const sun = new THREE.DirectionalLight(0xfff6ea, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x2a3a50, 0x10161e, 0.45);       // starlight + ice bounce, cool
scene.add(hemi);
const saturnShine = new THREE.DirectionalLight(0xe8d6b0, 0.22);         // warm light reflected off Saturn, ahead and above
saturnShine.position.set(0, 0.6, -0.8).multiplyScalar(100);
scene.add(saturnShine);

/* ---------------------------------------------------------- stars (same round sprites as the surface builds) */
const STAR_ROUND_SCALE = 1.25, STAR_MIN_PX = 2.2, STAR_GLOW_TAIL = 0.05, STAR_EDGE_POW = 1.0, DUST_EDGE_POW = 3.0;
function roundStarMaterial(size, glow = false, edgePow = STAR_EDGE_POW) {
  const px = Math.max(size * STAR_ROUND_SCALE, STAR_MIN_PX);
  const gain = (size / px) ** 2 / 0.249;
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: px }, uGain: { value: gain }, uGlow: { value: glow ? STAR_GLOW_TAIL : 0 }, uEdgePow: { value: edgePow } },
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uSize, uEdgePow; varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float c = max(-normalize(mv.xyz).z, 0.0);
        vCol = color * pow(c, uEdgePow);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize;
      }`,
    fragmentShader: `
      uniform float uGain, uGlow; varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = exp(-12.0 * r * r) + uGlow * exp(-4.0 * r * r) * (1.0 - 2.0 * r);
        a *= 1.0 - smoothstep(0.42, 0.5, r);
        if (a < 0.002) discard;
        gl_FragColor = vec4(vCol * a * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
const skyRig = new THREE.Group();
scene.add(skyRig);
{
  let starData = null;
  try { const res = await fetch('./assets/stars.json'); if (!res.ok) throw new Error('HTTP ' + res.status); starData = await res.json(); }
  catch (e) { console.warn('[enceladus] star catalog missing', e); }
  const STAR_R = 1560;
  if (starData && starData.stars && starData.stars.length) {
    const tiers = [{ count: 60, size: 2.0, glow: true }, { count: 360, size: 2.4 }, { count: Infinity, size: 1.5 }];
    let offset = 0;
    for (const t of tiers) {
      const n = Math.min(t.count, starData.stars.length - offset); if (n <= 0) break;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = starData.stars[offset + i];
        let y = s[1]; if (y < -0.04) y = Math.abs(y);
        pos.set([s[0] * STAR_R, y * STAR_R, s[2] * STAR_R], i * 3);
        col.set([s[3], s[4], s[5]], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const p = new THREE.Points(g, roundStarMaterial(t.size, t.glow)); p.renderOrder = 1; skyRig.add(p);
      offset += n;
    }
  }
  // faint procedural dust, so the open sky has the same fine sprinkle as the picture's painted sky
  const N = 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const y = Math.abs(u);                                     // upper hemisphere only
    pos.set([r * Math.cos(th) * STAR_R, y * STAR_R, r * Math.sin(th) * STAR_R], i * 3);
    const b = 0.05 + 0.10 * rnd() ** 3, w = rnd();
    col.set([b * (0.9 + 0.1 * w), b * 0.95, b * (1.05 - 0.1 * w)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dust = new THREE.Points(g, roundStarMaterial(0.8, false, DUST_EDGE_POW)); dust.renderOrder = 1.5; skyRig.add(dust);
}
// distant Sun: a small hard point at SUN_DIR (Saturn is ~9.5 AU out, the Sun is a tiny brilliant disc)
{
  const d = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfff8ee, toneMapped: false }));
  d.position.copy(SUN_DIR).multiplyScalar(1500); skyRig.add(d);
}
// horizon glow: the picture has a thin cold-blue glow just above its horizon (sRGB ~40,46,55 at the line, gone by ~4 deg up).
// The same glow all the way round, so the panel's side fades blend into matching sky.
{
  const R = 900, top = THREE.MathUtils.degToRad(7), bot = THREE.MathUtils.degToRad(-0.6);
  const yT = R * Math.tan(top), yB = R * Math.tan(bot);
  const geo = new THREE.CylinderGeometry(R, R, yT - yB, 96, 1, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: top }, uBot: { value: bot } },
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying float vE; uniform float uTop, uBot;
      void main(){ vE = mix(uBot, uTop, uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying float vE;
      void main(){ float e = degrees(max(vE, 0.0));
        vec3 c = vec3(0.021, 0.027, 0.038) * exp(-e / 1.25);          // linear; ~sRGB (40,46,55) at the line
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(geo, mat); m.position.y = (yT + yB) / 2; m.renderOrder = 2; m.frustumCulled = false;
  skyRig.add(m);
}

/* ---------------------------------------------------------- ground: smooth seamless ice */
function makeIceTextures(size = 1024) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const bv = document.createElement('canvas'); bv.width = bv.height = size;
  const x = cv.getContext('2d'), b = bv.getContext('2d');
  // periodic gradient (light at the tile edges) so the texture wraps without a step — the r12d smooth ground
  const g = x.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#e4ebf1'); g.addColorStop(0.5, '#d4dee7'); g.addColorStop(1, '#e4ebf1');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  b.fillStyle = '#808080'; b.fillRect(0, 0, size, size);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const wrapDraw = (ctx, fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ctx, ox, oy); };
  for (let i = 0; i < 260; i++) {                         // soft blotches (drawn wrapped -> seamless)
    const r = 20 + rnd() * 90, cx = rnd() * size, cy = rnd() * size, e = 0.4 + rnd() * 0.6, rot = rnd() * 3;
    const dk = rnd() < 0.4, fill = dk ? `rgba(${150 + rnd() * 30 | 0},${160 + rnd() * 30 | 0},${172 + rnd() * 30 | 0},0.07)` : `rgba(${225 + rnd() * 30 | 0},${230 + rnd() * 25 | 0},${238 + rnd() * 17 | 0},0.10)`;
    wrapDraw(x, (c, ox, oy) => { c.fillStyle = fill; c.beginPath(); c.ellipse(cx + ox, cy + oy, r, r * e, rot, 0, 7); c.fill(); });
  }
  for (let i = 0; i < 700; i++) {                         // gentle bump lumps (frost texture, no cracks)
    const r = 4 + rnd() * 26, cx = rnd() * size, cy = rnd() * size, v = rnd() < 0.5 ? 255 : 0;
    wrapDraw(b, (c, ox, oy) => { const gr = c.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.10)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); c.fillStyle = gr; c.fillRect(cx + ox - r, cy + oy - r, 2 * r, 2 * r); });
  }
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.10})`; x.fillRect(rnd() * size, rnd() * size, 1.6, 1.6); }
  const map = new THREE.CanvasTexture(cv); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const bump = new THREE.CanvasTexture(bv); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}
const ice = makeIceTextures(1024);
// e2: Scott - fill the bare ground left/right/behind by repeating ONE exact patch of the picture's own ice: a flat-snow patch
// from the bottom of his Saturn picture (7168x4032 4x, x 4300-5000, 75 rows above the bottom edge, stretched back to square),
// made seamless (half-offset crossfade, left-right then top-bottom) and set to the old ground's brightness. The same tile
// repeats everywhere; the frost bump map stays for close-up shading.
{ const tile = await new THREE.TextureLoader().loadAsync('./assets/enceladus-ground-tile.jpg').catch(() => null);
  if (tile) { tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.colorSpace = THREE.SRGBColorSpace;
    tile.anisotropy = renderer.capabilities.getMaxAnisotropy(); ice.map = tile; } }
const GROUND_SIZE = 4000, TILE_M = 15.6;
ice.map.repeat.setScalar(GROUND_SIZE / TILE_M); ice.bump.repeat.setScalar(GROUND_SIZE / TILE_M);
// colour tuned so the 3D ice at the panel's bottom edge matches the painted plain (sRGB ~145,149,154, slightly cool)
const groundMat = new THREE.MeshStandardMaterial({ map: ice.map, bumpMap: ice.bump, bumpScale: 0.5,
  roughness: 0.75, metalness: 0.0, color: new THREE.Color(0xf4f7fb) });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
// low snow mounds like the lumps in the painted plain (stay well under the horizon; the front ones past ~11 m sit under the picture)
{
  const mounds = new THREE.Group(); scene.add(mounds);
  let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {                    // lumpy, not perfect domes
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const n = 1 + 0.18 * Math.sin(vx * 5.1 + vz * 3.7) * Math.cos(vz * 4.3 - vx * 2.2) + 0.08 * Math.sin(vx * 11 + vz * 9);
    p.setXYZ(i, vx * n, vy * n, vz * n);
  }
  geo.computeVertexNormals();
  // clustered like the picture's lumpy ridges: ~45 clusters of 1-5 lumps
  const spots = [];
  for (let c = 0; c < 45; c++) {
    const a = rnd() * Math.PI * 2, r = 8 + 170 * rnd() ** 1.5, k = 1 + (rnd() * 5 | 0);
    for (let j = 0; j < k; j++) spots.push([Math.cos(a) * r + (rnd() - 0.5) * r * 0.12, Math.sin(a) * r + (rnd() - 0.5) * r * 0.12, r]);
  }
  for (const [sx, sz, r] of spots) {
    const a = Math.atan2(sz, sx);
    const w = (0.3 + rnd() * 1.1) * (1 + r / 70), h = w * (0.18 + rnd() * 0.22);
    const m = new THREE.Mesh(geo, groundMat);
    m.scale.set(w, h, w * (0.5 + rnd() * 0.6)); m.rotation.y = rnd() * Math.PI;
    m.position.set(sx, -0.02, sz);
    m.castShadow = m.receiveShadow = true; mounds.add(m);
  }
}

/* ---------------------------------------------------------- front picture panel */
function addPanel(o) {
  const R = o.radius, arc = THREE.MathUtils.degToRad(o.arcDeg), vert = arc * 9 / 16;   // same deg per pixel both ways
  const SEG_H = 64;
  const geo = new THREE.CylinderGeometry(R, R, 1, 96, SEG_H, true, Math.PI - arc / 2, arc);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const e = (uv.getY(i) - (1 - o.horizon)) * vert;        // elevation of this picture row (0 = painted horizon)
    pos.setY(i, EYE + R * Math.tan(e));
  }
  pos.needsUpdate = true; geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uBright: { value: o.bright }, uSide: { value: o.sideFade }, uSideG: { value: o.groundSideFade }, uHor: { value: 1 - o.horizon }, uBot: { value: o.bottomFade } },
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = vec2(1.0 - uv.x, uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform sampler2D uMap; uniform float uBright, uSide, uSideG, uHor, uBot;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        float w = mix(uSideG, uSide, smoothstep(uHor - 0.004, uHor + 0.02, vUv.y));   // wide fade over the painted plain, narrow in the sky
        float a = smoothstep(0.0, w, vUv.x) * smoothstep(1.0, 1.0 - w, vUv.x) * smoothstep(0.0, uBot, vUv.y);
        gl_FragColor = vec4(t.rgb * uBright, a);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = -THREE.MathUtils.degToRad(o.yawDeg || 0);
  mesh.renderOrder = 12; mesh.frustumCulled = false; mesh.visible = false;
  scene.add(mesh);                                       // world-fixed (snap turning lets you turn away); re-centred on the eye every frame
  return mesh;
}
const front = addPanel(FRONT);
{
  const t = await new THREE.TextureLoader().loadAsync(FRONT.url).catch(e => { console.warn('[enceladus] front picture missing', e); return null; });
  if (t) {
    t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    renderer.initTexture(t);
    front.material.uniforms.uMap.value = t; front.visible = true;
  }
}

/* ---------------------------------------------------------- HUD */
document.querySelector('#hud .build').textContent = BUILD;
document.querySelector('#hud .loc').textContent = `Saturn View · ${SCENE_VER}`;

/* ---------------------------------------------------------- helmet rim (suit presence, as on the surface) */
{
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 12, 48, Math.PI * 1.15),
    new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.7, metalness: 0.3 }));
  rim.renderOrder = 100; rim.position.set(0, -0.12, -0.32); rim.rotation.set(0.15, 0, Math.PI * 0.925);
  camera.add(rim);
}

/* ---------------------------------------------------------- in-headset label (scene name, version, build) */
const vrLabel = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 150;
  const g = c.getContext('2d');
  g.beginPath(); g.roundRect(8, 8, 1008, 134, 28); g.fillStyle = 'rgba(4,14,24,0.78)'; g.fill(); g.strokeStyle = '#4f8fc0'; g.lineWidth = 3; g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.fillText('Enceladus \u2014 Saturn View', 512, 70);
  g.fillStyle = '#9fd8ff'; g.font = '36px sans-serif'; g.fillText(`${SCENE_VER}  ·  ${BUILD}`, 512, 118);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5 * 150 / 1024),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = 300; m.position.set(0, -0.27, -0.8); m.frustumCulled = false; m.visible = false; camera.add(m);
  let pinned = true;
  return { toggle() { pinned = !pinned; }, update() { m.visible = renderer.xr.isPresenting && pinned; } };
})();

/* ---------------------------------------------------------- XR: snap turn, A/X toggles the label */
const SNAP_TURN_DEG = 30;
function snapTurn(deg) {
  const before = new THREE.Vector3(); camera.getWorldPosition(before);
  rig.rotation.y += THREE.MathUtils.degToRad(deg); rig.updateMatrixWorld(true);
  const after = new THREE.Vector3(); camera.getWorldPosition(after);
  rig.position.x += before.x - after.x; rig.position.z += before.z - after.z; rig.updateMatrixWorld(true);
}
for (let i = 0; i < 2; i++) {
  const ctl = renderer.xr.getController(i);
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
    new THREE.LineBasicMaterial({ color: 0x54c8ff, transparent: true, opacity: 0.6 }));
  ctl.add(ray); rig.add(ctl);
}
const was = new Map(), stickArmed = new Map();
function pollPads() {
  const sess = renderer.xr.getSession && renderer.xr.getSession(); if (!sess) return;
  for (const src of sess.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const prev = was.get(src) || [];
    if (gp.buttons[4] && gp.buttons[4].pressed && !prev[4]) vrLabel.toggle();
    const sx = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
    const armed = stickArmed.get(src) !== false;
    if (armed && Math.abs(sx) > 0.7) { snapTurn(sx > 0 ? -SNAP_TURN_DEG : SNAP_TURN_DEG); stickArmed.set(src, false); }
    else if (!armed && Math.abs(sx) < 0.3) stickArmed.set(src, true);
    was.set(src, gp.buttons.map(b => b.pressed));
  }
}
renderer.xr.addEventListener('sessionstart', () => { rig.rotation.y = 0; rig.position.set(0, 0, 0); });   // always start facing Saturn

/* ---------------------------------------------------------- desktop look + Enter VR */
let yaw = 0, pitch = 0, roll = 0, dragging = false, px = 0, py = 0;
const dom = renderer.domElement;
dom.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', e => {
  if (!dragging || renderer.xr.isPresenting) return;
  yaw -= (e.clientX - px) * 0.0032; pitch -= (e.clientY - py) * 0.0028;
  pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2); px = e.clientX; py = e.clientY;
});
{
  const overlay = document.getElementById('overlay'), btn = document.getElementById('enter-vr');
  overlay.addEventListener('click', e => { if (e.target !== btn) overlay.classList.add('hidden'); });
  if ('xr' in navigator) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => {
      if (ok) {
        btn.disabled = false; btn.textContent = 'Enter VR';
        btn.onclick = () => overlay.classList.add('hidden');
        document.body.appendChild(VRButton.createButton(renderer));
        const real = document.querySelector('#VRButton'); real.style.display = 'none';
        btn.addEventListener('click', () => real.click(), { once: true });
      } else btn.textContent = 'VR not available — desktop mode';
    }).catch(() => { btn.textContent = 'VR not available — desktop mode'; });
  } else btn.textContent = 'VR not available — desktop mode';
  renderer.xr.addEventListener('sessionstart', () => overlay.classList.add('hidden'));
  renderer.xr.addEventListener('sessionend', () => overlay.classList.remove('hidden'));
}

/* ---------------------------------------------------------- fps meter */
const fpsEl = document.querySelector('#hud .fps');
let frames = 0, lastT = performance.now(), ema = 60;
function tickFps(now) {
  frames++;
  if (now - lastT >= 500) {
    const fps = frames * 1000 / (now - lastT); ema = ema * 0.6 + fps * 0.4;
    fpsEl.textContent = `${ema.toFixed(0)} fps`;
    fpsEl.style.color = ema >= 85 ? '#7dffa8' : ema >= 60 ? '#ffd47d' : '#ff8d7d';
    frames = 0; lastT = now;
  }
}

/* ---------------------------------------------------------- main loop */
window.__enceladus = { build: BUILD, look: (y, p = 0, r = 0) => { yaw = y; pitch = p; roll = r; },
  head: (x = 0, y = 0, z = 0) => camera.position.set(x, PLAYER_HEIGHT + y, z),
  dbg: { THREE, scene, camera, renderer, ground, groundMat, front, sun, rim: camera.children[0] } };
const _skyPos = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const now = performance.now(); tickFps(now);
  if (!renderer.xr.isPresenting) { camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch); if (roll) camera.rotateZ(roll); }
  sun.position.copy(rig.position).addScaledVector(SUN_DIR, 160); sun.target.position.copy(rig.position); sun.target.updateMatrixWorld();
  camera.getWorldPosition(_skyPos); skyRig.position.copy(_skyPos);
  front.position.set(_skyPos.x, _skyPos.y - EYE, _skyPos.z);   // panel centred on the eye (horizon stays at eye level, no parallax)
  if (renderer.xr.isPresenting) pollPads();
  vrLabel.update();
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
