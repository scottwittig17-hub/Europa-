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
const BUILD = 'Enceladus e5 \u00b7 e4 + Rings of Gold music with volume control + comet';
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
    if (r < 45) continue;   // e4: no near mounds - up close they read as dark slabs with smeared shadows (Scott's plateau photo)
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

/* ---------------------------------------------------------- e3: painted ice all the way around */
// Scott: the sides and back looked bare next to the painted front. The picture's own ground band (rows 1940-2304 of
// saturn-front.jpg; plume glow at the horizon patched out; left/right edges crossfaded so it wraps with no seam) is laid on a
// full 360-degree ring at the same degrees-per-pixel and horizon as the front picture, repeated 4 times (90 deg each).
// It sits under the front panel (front draws on top, its side fades now blend into this ice instead of bare ground);
// only the ground shows, everything above the horizon is transparent so the stars stay exactly as they were.
const RING = { url: './assets/enceladus-ring.jpg', rows: 364, picRows: 2304, copies: 4 };
const ring = (() => {
  const R = FRONT.radius - 2, vert = THREE.MathUtils.degToRad(FRONT.arcDeg) * 9 / 16, hor = 1 - FRONT.horizon, frac = RING.rows / RING.picRows;
  const geo = new THREE.CylinderGeometry(R, R, 1, 256, 32, true);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) pos.setY(i, EYE + R * Math.tan((uv.getY(i) * frac - hor) * vert));
  pos.needsUpdate = true; geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uFrac: { value: frac }, uHor: { value: hor }, uBot: { value: FRONT.bottomFade }, uN: { value: RING.copies }, uRingFade: { value: 0.11 } },
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform sampler2D uMap; uniform float uFrac, uHor, uBot, uN, uRingFade;
      void main(){
        vec4 t = texture2D(uMap, vec2((1.0 - vUv.x) * uN, vUv.y))   /* e4: no fract() - it made a shimmering 1-px line at each of the 4 joins */;
        float v = vUv.y * uFrac;                                  // row in front-picture terms (0 = bottom)
        float a = pow(smoothstep(0.0, uRingFade, v), 1.6) *   /* e4: long soft fade into the near snow instead of a hard ledge */ (1.0 - smoothstep(uHor - 0.001, uHor + 0.004, v));
        gl_FragColor = vec4(t.rgb, a);
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 11; m.frustumCulled = false; m.visible = false; scene.add(m);
  return m;
})();
{
  const t = await new THREE.TextureLoader().loadAsync(RING.url).catch(e => { console.warn('[enceladus] ring picture missing', e); return null; });
  if (t) {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    renderer.initTexture(t); ring.material.uniforms.uMap.value = t; ring.visible = true;
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

/* e5: the same comet as Europa surface r12t. Enceladus has no air either, so no burning
 * meteor trail: a small bright coma with a faint dust tail lit by the sun, the tail always pointing away from the
 * sun. Timing modelled on the beach shooting stars (occasional, random, faint, brief) but slower, so it reads as a
 * comet: fades in, drifts a couple of degrees, fades out over ~6-9 s, then 20-50 s until the next. Lives in skyRig.
 * Here it only appears to your sides and behind you, never over the Saturn picture in front. */
const COMET_R = 1400;
const comet = (() => {
  const g = new THREE.BufferGeometry();
  const N = 24, pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx = [];
  for (let i = 0; i <= N; i++) { uv.set([i / N, 0, i / N, 1], i * 4); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uFade;
      void main(){
        float u = vUv.x, v = vUv.y * 2.0 - 1.0;            // u: 0 head -> 1 tail end; v: across
        float w = 0.22 + 0.78 * sqrt(u);                    // tail widens away from the head
        float across = exp(-pow(v / w, 2.0) * 3.0);
        float along = pow(1.0 - u, 1.6);                    // dims toward the tail end
        float coma = exp(-u * 22.0) * exp(-v * v * 5.0);    // bright little head
        float i = (along * across * 0.55 + coma * 1.4) * uFade;
        vec3 c = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.97, 0.9), u);   // blue-white coma, pale sunlit dust
        gl_FragColor = vec4(c * i, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 1.6;   // after stars/dust, before the Saturn picture and ice ring (they cover it)
  skyRig.add(mesh);
  return { mesh, mat, pos, g, N, active: false, t0: 0, dur: 7, from: new THREE.Vector3(), to: new THREE.Vector3(), len: 0.12, wid: 0.01 };
})();
let nextCometAt = 6 + Math.random() * 8;   // first one after a short beat, then 20-50 s gaps
function spawnComet(t) {
  const d2r = Math.PI / 180, antiSun = SUN_DIR.clone().negate();
  let dir;
  for (let k = 0; k < 30; k++) {
    const yaw = (60 + Math.random() * 240) * d2r, elev = (25 + Math.random() * 40) * d2r;
    dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), -Math.cos(yaw) * Math.cos(elev));
    if (dir.angleTo(SUN_DIR) > 35 * d2r) break;   // e5: not in the sun's glare; yaw kept off the Saturn picture ahead
  }
  // slow drift of 1.5-3 deg in a random sky direction
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const a = Math.random() * Math.PI * 2, span = (1.5 + Math.random() * 1.5) * d2r;
  const drift = side.multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  comet.from.copy(dir); comet.to.copy(dir).addScaledVector(drift, span).normalize();
  comet.len = (6 + Math.random() * 5) * d2r;    // tail 6-11 deg long
  comet.wid = (0.8 + Math.random() * 0.4) * d2r; // ~0.8-1.2 deg wide at the end
  comet.t0 = t; comet.dur = 6 + Math.random() * 3; comet.active = true; comet.mesh.visible = true;
}
const _cP = new THREE.Vector3(), _cT = new THREE.Vector3(), _cW = new THREE.Vector3(), _cQ = new THREE.Vector3();
function tickComet(t) {
  if (!comet.active && t >= nextCometAt) { spawnComet(t); nextCometAt = t + comet.dur + 20 + Math.random() * 30; }
  if (!comet.active) return;
  const p = (t - comet.t0) / comet.dur;
  if (p >= 1) { comet.active = false; comet.mesh.visible = false; return; }
  const fade = p < 0.25 ? p / 0.25 : p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
  comet.mat.uniforms.uFade.value = fade * fade * (3 - 2 * fade) * 0.9;   // faint
  _cP.lerpVectors(comet.from, comet.to, p).normalize();
  _cT.copy(SUN_DIR).negate().addScaledVector(_cP, SUN_DIR.dot(_cP)).normalize();   // anti-sun direction on the sky at the head
  _cW.crossVectors(_cP, _cT).normalize();
  for (let i = 0; i <= comet.N; i++) {
    const u = i / comet.N, w = comet.wid * (0.2 + 0.8 * Math.sqrt(u));
    _cQ.copy(_cP).addScaledVector(_cT, comet.len * u);
    for (let s = 0; s < 2; s++) {
      const q = _cQ.clone().addScaledVector(_cW, s ? w : -w).normalize().multiplyScalar(COMET_R);
      comet.pos.set([q.x, q.y, q.z], (i * 2 + s) * 3);
    }
  }
  comet.g.attributes.position.needsUpdate = true;
}

/* ---------------------------------------------------------- e5: music (Rings of Gold, atmospheric, by Mars) + volume */
// Loops quietly. Starts on the first click (Enter VR, the page, or the desktop slider): browsers need a tap before sound.
// In VR: a small panel low in front of you (look down). Point and pull the trigger on  -  /  +  or the speaker to mute.
// B or Y hides / shows the panel. On desktop: the slider bottom-right. The volume is remembered between visits.
const music = new Audio('./assets/rings-of-gold-atmospheric.mp3'); music.loop = true; music.preload = 'auto';
const VOL_KEY = 'enceladus-e5-music';
let vol = 0.5, muted = false;
try { const o = JSON.parse(localStorage.getItem(VOL_KEY) || 'null'); if (o) { vol = Math.min(1, Math.max(0, +o.vol || 0)); muted = !!o.muted; } } catch (e) { /* ignore */ }
function startMusic() { if (music.paused) music.play().catch(() => {}); }
const musicUI = { slider: null, mute: null, pct: null };
function applyVol() {
  music.volume = muted ? 0 : vol;
  try { localStorage.setItem(VOL_KEY, JSON.stringify({ vol, muted })); } catch (e) { /* ignore */ }
  if (musicUI.slider) musicUI.slider.value = String(Math.round(vol * 100));
  if (musicUI.pct) musicUI.pct.textContent = muted ? 'off' : `${Math.round(vol * 100)}%`;
  if (musicUI.mute) musicUI.mute.textContent = muted || vol === 0 ? '\u{1F507}' : '\u{1F50A}';
  drawPanel();
}
function setVol(v) { vol = Math.min(1, Math.max(0, Math.round(v * 10) / 10)); if (vol > 0) muted = false; startMusic(); applyVol(); }
function toggleMute() { muted = !muted; if (!muted && vol === 0) vol = 0.3; startMusic(); applyVol(); }
// VR panel: [speaker] [ - ] [ bar ] [ + ]
const PW = 0.48, PH = 0.12, pc = document.createElement('canvas'); pc.width = 1024; pc.height = 256;
const pTex = new THREE.CanvasTexture(pc); pTex.colorSpace = THREE.SRGBColorSpace;
const musicPanel = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH),
  new THREE.MeshBasicMaterial({ map: pTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
musicPanel.renderOrder = 1000; musicPanel.position.set(0, 0.95, -0.7); musicPanel.rotation.x = -0.55; musicPanel.visible = false;
rig.add(musicPanel);
const ZONES = [[0, 0.2, 'mute'], [0.2, 0.36, 'down'], [0.84, 1, 'up']];   // u ranges on the panel
let hoverZone = null;
function drawPanel() {
  const g = pc.getContext('2d'), W = pc.width, H = pc.height; g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(6,16,28,0.82)'; g.strokeStyle = 'rgba(120,190,240,0.6)'; g.lineWidth = 4;
  g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 40); g.fill(); g.stroke();
  const btn = (cx, id, draw) => {
    g.fillStyle = hoverZone === id ? 'rgba(80,160,230,0.55)' : 'rgba(30,70,110,0.7)';
    g.beginPath(); g.arc(cx, H / 2, 78, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#cfe9ff'; g.fillStyle = '#cfe9ff'; g.lineWidth = 14; g.lineCap = 'round'; draw(cx);
  };
  btn(W * 0.1, 'mute', cx => {   // speaker, with an X when off
    g.beginPath(); g.moveTo(cx - 40, H / 2 - 20); g.lineTo(cx - 18, H / 2 - 20); g.lineTo(cx + 8, H / 2 - 44); g.lineTo(cx + 8, H / 2 + 44);
    g.lineTo(cx - 18, H / 2 + 20); g.lineTo(cx - 40, H / 2 + 20); g.closePath(); g.fill();
    g.lineWidth = 9;
    if (muted || vol === 0) { g.beginPath(); g.moveTo(cx + 22, H / 2 - 18); g.lineTo(cx + 46, H / 2 + 18); g.moveTo(cx + 46, H / 2 - 18); g.lineTo(cx + 22, H / 2 + 18); g.stroke(); }
    else { g.beginPath(); g.arc(cx + 12, H / 2, 28, -0.8, 0.8); g.stroke(); }
  });
  btn(W * 0.28, 'down', cx => { g.beginPath(); g.moveTo(cx - 34, H / 2); g.lineTo(cx + 34, H / 2); g.stroke(); });
  btn(W * 0.92, 'up', cx => { g.beginPath(); g.moveTo(cx - 34, H / 2); g.lineTo(cx + 34, H / 2); g.moveTo(cx, H / 2 - 34); g.lineTo(cx, H / 2 + 34); g.stroke(); });
  const x0 = W * 0.39, x1 = W * 0.81, y = H / 2 + 10;
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.roundRect(x0, y - 12, x1 - x0, 24, 12); g.fill();
  g.fillStyle = muted ? 'rgba(160,170,180,0.6)' : '#f3d27a'; g.beginPath(); g.roundRect(x0, y - 12, Math.max(24, (x1 - x0) * vol), 24, 12); g.fill();
  g.fillStyle = '#e8f4ff'; g.font = '600 40px sans-serif'; g.textAlign = 'center';
  g.fillText(`Rings of Gold \u00b7 ${muted ? 'off' : Math.round(vol * 100) + '%'}`, (x0 + x1) / 2, y - 34);
  pTex.needsUpdate = true;
}
const mRay = new THREE.Raycaster(), _mq = new THREE.Matrix4();
function panelZone(ctl) {
  if (!musicPanel.visible) return null;
  _mq.identity().extractRotation(ctl.matrixWorld);
  mRay.ray.origin.setFromMatrixPosition(ctl.matrixWorld); mRay.ray.direction.set(0, 0, -1).applyMatrix4(_mq);
  const h = mRay.intersectObject(musicPanel, false)[0]; if (!h) return null;
  const u = h.uv.x; for (const [a, b, id] of ZONES) if (u >= a && u < b) return id; return 'bar';
}
const mCtls = [renderer.xr.getController(0), renderer.xr.getController(1)];
for (const c of mCtls) c.addEventListener('select', () => {
  const z = panelZone(c); startMusic();
  if (z === 'mute') toggleMute(); else if (z === 'down') setVol(vol - 0.1); else if (z === 'up') setVol(vol + 0.1);
});
const mPrev = new Map();
function tickMusicVR() {
  let hz = null; for (const c of mCtls) hz = hz || panelZone(c);
  if (hz !== hoverZone) { hoverZone = hz; drawPanel(); }
  const sess = renderer.xr.getSession && renderer.xr.getSession(); if (!sess) return;
  for (const src of sess.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const p = gp.buttons[5] && gp.buttons[5].pressed;
    if (p && !mPrev.get(src)) musicPanel.visible = !musicPanel.visible;   // B / Y
    mPrev.set(src, p);
  }
}
renderer.xr.addEventListener('sessionstart', () => { musicPanel.visible = true; startMusic(); });
renderer.xr.addEventListener('sessionend', () => { musicPanel.visible = false; });
{ // desktop: slider + speaker button, bottom right
  const box = document.createElement('div'); box.id = 'music-ui';
  box.innerHTML = '<span class="t">\u266B Rings of Gold</span><button type="button" class="m"></button><input type="range" min="0" max="100" step="5"><span class="p"></span>';
  document.body.appendChild(box);
  musicUI.slider = box.querySelector('input'); musicUI.mute = box.querySelector('.m'); musicUI.pct = box.querySelector('.p');
  musicUI.slider.addEventListener('input', () => { vol = Number(musicUI.slider.value) / 100; muted = false; startMusic(); applyVol(); });
  musicUI.mute.addEventListener('click', toggleMute);
  document.getElementById('enter-vr').addEventListener('click', startMusic);
  document.getElementById('overlay').addEventListener('click', startMusic);
  renderer.domElement.addEventListener('pointerdown', startMusic);
}
applyVol();

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
  comet: () => { nextCometAt = 0; }, music, setVol, toggleMute, musicPanel, get vol() { return vol; }, get muted() { return muted; },
  dbg: { ring, THREE, scene, camera, renderer, ground, groundMat, front, sun, rim: camera.children[0] } };
const _skyPos = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const now = performance.now(); tickFps(now);
  if (!renderer.xr.isPresenting) { camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch); if (roll) camera.rotateZ(roll); }
  sun.position.copy(rig.position).addScaledVector(SUN_DIR, 160); sun.target.position.copy(rig.position); sun.target.updateMatrixWorld();
  camera.getWorldPosition(_skyPos); skyRig.position.copy(_skyPos);
  front.position.set(_skyPos.x, _skyPos.y - EYE, _skyPos.z); ring.position.copy(front.position);   // panel centred on the eye (horizon stays at eye level, no parallax)
  if (renderer.xr.isPresenting) { pollPads(); tickMusicVR(); }
  tickComet(now * 0.001);   // e5: occasional sunlit comet
  vrLabel.update();
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
