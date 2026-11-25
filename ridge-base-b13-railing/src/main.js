/* EUROPA — Ridge Base test b1: base on legs over a trench, sized for rig E-7 (three.js r160, WebXR). Built from Enceladus e4's engine.
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
import { buildRigE7 } from './rig-e7.js';
import { buildQuarters } from './quarters.js';
import { createRigSound } from './rig-sound.js';
import { buildSnowTrench } from './snowbanks.js';
import { buildLander } from './lander.js';
import { buildShip } from './ship.js';

/* ---------------------------------------------------------- config */
const BUILD = 'Ridge Base b13-railing \u00b7 b12 + railing join flashing fix (no shared faces)';
const SCENE_VER = 'base b13-railing';
const PLAYER_HEIGHT = 1.7, EYE = PLAYER_HEIGHT;
// Sun: the picture lights Saturn and the ice lumps from the right, a little from behind the viewer, low.
const SUN_DIR = new THREE.Vector3(0.55, 0.42, 0.35).normalize();   // the Europa surface sun

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
const saturnShine = new THREE.DirectionalLight(0xe8c8a0, 0.18);   // warm Jupiter-shine from Jupiter's side         // warm light reflected off Saturn, ahead and above
saturnShine.position.set(-0.52, 0.30, -0.80).multiplyScalar(100);
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
// (b1: Enceladus picture tile not used; procedural ice)
const GROUND_SIZE = 4000, TILE_M = 15.6;
ice.map.repeat.setScalar(GROUND_SIZE / TILE_M); ice.bump.repeat.setScalar(GROUND_SIZE / TILE_M);
// colour tuned so the 3D ice at the panel's bottom edge matches the painted plain (sRGB ~145,149,154, slightly cool)
const groundMat = new THREE.MeshStandardMaterial({ map: ice.map, bumpMap: ice.bump, bumpScale: 0.5,
  roughness: 0.75, metalness: 0.0, color: new THREE.Color(0xf4f7fb) });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMat); ground.visible = false;   // b1: replaced by the trench ground below
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
    if (r < 45 || Math.abs(sx) < 30) continue;   // b1: keep the trench and its rims clear   // e4: no near mounds - up close they read as dark slabs with smeared shadows (Scott's plateau photo)
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

/* ---------------------------------------------------------- b2: metal look */
// Reflection map for the metal only (not the ice plain): black starry sky above, the bright ice horizon band, ice below,
// a warm patch toward the Sun. Without something to reflect, metal just renders dark.
const metalEnv = (() => {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#020306'); gr.addColorStop(0.44, '#0a0d14'); gr.addColorStop(0.49, '#9aa4b2'); gr.addColorStop(0.5, '#e8ecf0');
  gr.addColorStop(0.62, '#b8bec6'); gr.addColorStop(1, '#7a8088');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; g.fillRect(Math.random() * W, Math.random() * H * 0.45, 1, 1); }
  const sd = SUN_DIR.clone().normalize();
  const sx = W * (0.5 + Math.atan2(sd.x, -sd.z) / (2 * Math.PI)), sy = H * (0.5 - Math.asin(sd.y) / Math.PI);
  const rg = g.createRadialGradient(sx, sy, 0, sx, sy, 60); rg.addColorStop(0, 'rgba(255,240,210,1)'); rg.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = rg; g.fillRect(sx - 60, sy - 60, 120, 120);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromEquirectangular(t); pm.dispose(); t.dispose(); return rt.texture;
})();
// brushed-metal grain: fine streaks in one direction, used as a roughness map
const brushed = (() => {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 90 | 0; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(Math.random() * N, Math.random() * N, 40 + Math.random() * 220, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t;
})();
const trenchMat = groundMat.clone();              // polished ice sheen on the trench floor and walls only
trenchMat.roughness = 0.38; trenchMat.metalness = 0.12; trenchMat.envMap = metalEnv; trenchMat.envMapIntensity = 0.55;

/* ---------------------------------------------------------- b1: Ridge base on legs over the trench (no rig yet) */
/* Sizes (metres). Scott's Europa Ice Mining Rig E-7 picture, scaled from its lit windows (~1.5 m) and deck railings (~1.1 m):
 *   rig ~22 wide over its treads, ~40 long, ~22 tall to the cabin roof (masts extra).
 * Ridge platform numbers are the floor: >= 1.6 m up, >= 18 m across the top, >= 24 m at the bottom, eye 1.7 m above the floor.
 *   trench:  36 wide, 10 deep, straight, running away from you (-z) and behind you (+z)
 *   legs:    4 columns standing on the rims, 43 m apart across the trench, 20 m apart along it, 15 m tall above the rims
 *   deck:    46 x 24, top 25 m above the trench floor; underside clearance 23.8 m (rig 22 m + 1.8 m) over the full 36 m width
 *   cabin:   20 x 14 x 4 m on the deck, glass all round; a 8 x 5 m glass floor panel in front of you to look straight down
 */
const TRENCH_W = 36, TRENCH_D = 10, DECK_TOP = 15, DECK_T = 1.2, DECK_W = 46, DECK_L = 24;
const LEG_X = 21.5, LEG_Z = 10, LEG_S = 1.6, CAB_W = 20, CAB_L = 14, CAB_H = 4, HOLE_W = 8, HOLE_L = 5;
const BASE_SPAWN = new THREE.Vector3(0, DECK_TOP, 4.5);
// ground with the trench cut into it (world-scaled UVs so the ice texture matches everywhere)
function worldUV(geo, mesh) {
  mesh.updateMatrixWorld(true); const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3(), n = new THREE.Vector3();
  geo.computeVertexNormals(); const nn = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); n.fromBufferAttribute(nn, i).transformDirection(mesh.matrixWorld);
    const a = Math.abs(n.x) > 0.5 ? [v.z, v.y] : [v.x, v.z];
    uv.setXY(i, a[0] / GROUND_SIZE + 0.5, a[1] / GROUND_SIZE + 0.5);
  }
  uv.needsUpdate = true;
}
function iceSlab(w, h, x, y, z, rx = -Math.PI / 2, ry = 0, mat = groundMat) {
  const g = new THREE.PlaneGeometry(w, h, 1, 1), m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); m.receiveShadow = true; m.castShadow = false;
  scene.add(m); worldUV(g, m); return m;
}
{
  const half = GROUND_SIZE / 2, side = half - TRENCH_W / 2;
  // b10: the flat rim plains are replaced by the snowy heightfields in snowbanks.js (built just below)
  iceSlab(TRENCH_W, GROUND_SIZE, 0, -TRENCH_D, 0, -Math.PI / 2, 0, trenchMat);                          // trench floor
  iceSlab(GROUND_SIZE, TRENCH_D, -TRENCH_W / 2, -TRENCH_D / 2, 0, 0, Math.PI / 2, trenchMat);   // left wall, faces into the trench
  iceSlab(GROUND_SIZE, TRENCH_D, TRENCH_W / 2, -TRENCH_D / 2, 0, 0, -Math.PI / 2, trenchMat);   // right wall
}
// b10: chunky snowy trench walls, lip berms, ice blocks, rubble, rolling drifts to the horizon
const snow = buildSnowTrench({ scene, groundMat, trenchMat, TRENCH_W, TRENCH_D, GROUND_SIZE,
  legs: [[-LEG_X, -LEG_Z], [-LEG_X, LEG_Z], [LEG_X, -LEG_Z], [LEG_X, LEG_Z]],
  detailZ: 600,                         // b12: detailed walls/rims out to +-600 m, past the rig's +-560 m run
  flats: [[-48, -52, 18, 25]] });       // b12: flat landing site for the lander
// Jupiter (same texture, place and size as the Europa surface: ~12 deg across, 33 deg left of forward)
{
  const t = await new THREE.TextureLoader().loadAsync('./assets/jupiter-hi.jpg').catch(() => null);
  if (t) {
    t.colorSpace = THREE.SRGBColorSpace;
    const D = 900, Rj = D * Math.tan(THREE.MathUtils.degToRad(6));
    const j = new THREE.Mesh(new THREE.SphereGeometry(Rj, 64, 48), new THREE.MeshBasicMaterial({ map: t }));
    j.position.set(-0.52, 0.30, -0.80).normalize().multiplyScalar(D); skyRig.add(j);
  }
}
// the base
const base = new THREE.Group(); scene.add(base);
{
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xa8b0ba, metalness: 1, roughness: 0.3, roughnessMap: brushed, anisotropy: 0.7, envMap: metalEnv, envMapIntensity: 1.25 });   // brushed steel
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x5a636e, metalness: 1, roughness: 0.26, roughnessMap: brushed, anisotropy: 0.5, envMap: metalEnv, envMapIntensity: 1.1 });   // gunmetal
  const floorM = new THREE.MeshPhysicalMaterial({ color: 0x8e96a0, metalness: 0.9, roughness: 0.42, roughnessMap: brushed, anisotropy: 0.6, envMap: metalEnv, envMapIntensity: 0.9 });   // brushed deck plate
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc6e0, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, envMap: metalEnv, envMapIntensity: 1.4 });
  const amber = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb860, emissiveIntensity: 1.4 });
  const box = (w, h, d, x, y, z, m = metal, cast = true) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = cast; b.receiveShadow = true; base.add(b); return b; };
  const dy = DECK_TOP - DECK_T / 2;
  // deck slab with the glass-floor hole in the middle (4 pieces)
  box(DECK_W, DECK_T, (DECK_L - HOLE_L) / 2, 0, dy, -(HOLE_L / 2 + (DECK_L - HOLE_L) / 4), floorM);
  box(DECK_W, DECK_T, (DECK_L - HOLE_L) / 2, 0, dy, (HOLE_L / 2 + (DECK_L - HOLE_L) / 4), floorM);
  box((DECK_W - HOLE_W) / 2, DECK_T, HOLE_L, -(HOLE_W / 2 + (DECK_W - HOLE_W) / 4), dy, 0, floorM);
  box((DECK_W - HOLE_W) / 2, DECK_T, HOLE_L, (HOLE_W / 2 + (DECK_W - HOLE_W) / 4), dy, 0, floorM);
  const gf = box(HOLE_W, 0.06, HOLE_L, 0, DECK_TOP - 0.03, 0, glass, false);
  box(HOLE_W + 0.3, 0.08, 0.15, 0, DECK_TOP, -HOLE_L / 2, dark); box(HOLE_W + 0.3, 0.08, 0.15, 0, DECK_TOP, HOLE_L / 2, dark);
  box(0.15, 0.08, HOLE_L, -HOLE_W / 2, DECK_TOP, 0, dark); box(0.15, 0.08, HOLE_L, HOLE_W / 2, DECK_TOP, 0, dark);
  box(0.1, 0.08, HOLE_L, 0, DECK_TOP, 0, dark);                                   // one glazing bar
  // under-deck girders across the trench (the rig passes under these)
  for (const z of [-LEG_Z, -LEG_Z / 2 + 0.5, LEG_Z / 2 - 0.5, LEG_Z]) if (Math.abs(z) > HOLE_L / 2) box(DECK_W, 0.6, 0.5, 0, DECK_TOP - DECK_T - 0.3, z, dark);
  // legs: 4 columns on the rims, with cross-bracing along the trench direction
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(LEG_S, DECK_TOP - DECK_T, LEG_S, sx * LEG_X, (DECK_TOP - DECK_T) / 2, sz * LEG_Z);
      box(LEG_S * 2.2, 0.5, LEG_S * 2.2, sx * LEG_X, 0.25, sz * LEG_Z, dark);   // foot pad
    }
    const L = Math.hypot(2 * LEG_Z, DECK_TOP - DECK_T - 1);
    for (const k of [-1, 1]) {
      const b = box(0.35, L, 0.35, sx * LEG_X, (DECK_TOP - DECK_T) / 2, 0, dark);
      b.rotation.x = k * Math.atan2(2 * LEG_Z, DECK_TOP - DECK_T - 1);
    }
  }
  // railing round the deck edge
  // b13-railing: the flashing at the joins was z-fighting - posts and rails were the SAME 0.06 m thick on the same centre
  // line (coplanar side faces), and the side rails overlapped the end rails at the corners (coplanar top/bottom faces).
  // Now posts are 0.085 m (rails sit inside them, no shared faces) and the side rails stop at the end rails' inner face.
  const RP = 0.085, RT = 0.06;
  const rail = (w, d, x, z) => { box(w, 0.06, d, x, DECK_TOP + 1.1, z, dark, false); box(w, 0.04, d, x, DECK_TOP + 0.55, z, dark, false); };
  rail(DECK_W, RT, 0, -DECK_L / 2); rail(DECK_W, RT, 0, DECK_L / 2); rail(RT, DECK_L - RT, -DECK_W / 2, 0); rail(RT, DECK_L - RT, DECK_W / 2, 0);
  for (let x = -DECK_W / 2; x <= DECK_W / 2 + 0.01; x += 2.3) { box(RP, 1.1, RP, x, DECK_TOP + 0.55, -DECK_L / 2, dark, false); box(RP, 1.1, RP, x, DECK_TOP + 0.55, DECK_L / 2, dark, false); }
  for (let z = -DECK_L / 2 + 2.4; z < DECK_L / 2; z += 2.4) { box(RP, 1.1, RP, -DECK_W / 2, DECK_TOP + 0.55, z, dark, false); box(RP, 1.1, RP, DECK_W / 2, DECK_TOP + 0.55, z, dark, false); }
  // cabin: glass walls, posts every 2.5 m, sill and header bands, roof
  const cy = DECK_TOP + CAB_H / 2;
  box(CAB_W, 0.25, CAB_L, 0, DECK_TOP + CAB_H + 0.125, 0, metal);                // roof
  for (const [w, d, x, z] of [[CAB_W, 0.05, 0, -CAB_L / 2], [CAB_W, 0.05, 0, CAB_L / 2], [0.05, CAB_L, -CAB_W / 2, 0], [0.05, CAB_L, CAB_W / 2, 0]]) {
    box(w, CAB_H - 1.0, d, x, DECK_TOP + 0.6 + (CAB_H - 1.0) / 2, z, glass, false);
    box(w + (d > 1 ? 0.2 : 0), 0.6, d > 1 ? 0.2 : d + 0.2, x, DECK_TOP + 0.3, z, dark);   // sill
    box(w + (d > 1 ? 0.2 : 0), 0.4, d > 1 ? 0.2 : d + 0.2, x, DECK_TOP + CAB_H - 0.2, z, dark); // header
  }
  for (let x = -CAB_W / 2; x <= CAB_W / 2 + 0.01; x += 2.5) for (const z of [-CAB_L / 2, CAB_L / 2]) box(0.18, CAB_H, 0.18, x, cy, z, dark);
  for (let z = -CAB_L / 2 + 2.33; z < CAB_L / 2; z += 2.33) for (const x of [-CAB_W / 2, CAB_W / 2]) box(0.18, CAB_H, 0.18, x, cy, z, dark);
  // a door on the back wall out to the open deck (just a frame for now) and warm ceiling light strips
  for (const x of [-4, 0, 4]) box(1.6, 0.05, 0.25, x, DECK_TOP + CAB_H - 0.03, 0, amber, false);
  const lamp = new THREE.PointLight(0xffc98a, 45, 30, 1.4); lamp.position.set(0, DECK_TOP + CAB_H - 0.5, 0); base.add(lamp);
  // small amber deck lights at the leg tops so the base reads at night
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.5, 0.3, 0.5, sx * LEG_X, DECK_TOP + 0.15, sz * LEG_Z, amber, false);
}
if (false) { // b10: the b2 polished steel lip strips are gone - the lips are snow now
  const lip = new THREE.MeshPhysicalMaterial({ color: 0xb4bcc6, metalness: 1, roughness: 0.22, roughnessMap: brushed, anisotropy: 0.8, envMap: metalEnv, envMapIntensity: 1.3 });
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 1200), lip); m.position.set(sx * (TRENCH_W / 2 + 0.5), 0.12, 0); m.receiveShadow = true; scene.add(m); }
}
rig.position.copy(BASE_SPAWN);

/* ---------------------------------------------------------- b3: mining rig E-7 crawling along the trench */
// Drives along the trench axis (x = 0) on the floor (y = -10), heading +z: it comes out of the distance ahead of you,
// passes under the deck (seen through the glass floor), and carries on behind; it fades out at the far end and back in ahead.
// Clearance: highest mast tip 20.6 m -> y 10.6; lowest under-deck girder 13.2 -> 2.6 m to spare. Widest point 17.2 m (mid deck),
// so it stays 9 m+ inside the 36 m trench walls; the base legs stand on the rims at x +-21.5, outside the trench.
// b11: Scott saw the rig vanish too soon behind the base and pop back in too close ahead. Both ends are now far out on the
// 4 km floor (ground edge at +-2000): it fades in at -560 and out at +560, each over the last 90 m where it is a speck
// (~1 deg tall), and re-enters at the far front every time. The load start stays at -110 (under the glass ~2.3 min after load).
// Speed is the same 0.8 m/s near the base; beyond ~250 m out (where it is under 4 deg tall) it eases up to 2.4 m/s so a full
// pass takes ~15 min instead of ~23.
const RIG = { z0: -560, z1: 560, start: -110, speed: 0.8, fade: 90, farFrom: 250, farTo: 360, farMul: 3 };
const e7 = buildRigE7({ envMap: metalEnv, envI: 0.75 });
e7.group.rotation.y = -Math.PI / 2;                   // local +x (boom) -> world +z, the travel direction
e7.group.position.set(0, -TRENCH_D, RIG.start);
scene.add(e7.group);
let rigZ = RIG.start, rigPaused = false;
const rigDecal = e7.group.children.find(m => m.isMesh && m.renderOrder === 2), _rcam = new THREE.Vector3();
// b6: the grinding sound rides on the rig (between the hull and the cutter wheel), starts on the first click / key / Enter VR
const soundAnchor = new THREE.Object3D(); soundAnchor.position.set(8, 4, 0); e7.group.add(soundAnchor);
const rigSound = createRigSound({ camera, anchor: soundAnchor, onState: () => updateSoundBtn() });
function updateSoundBtn() { const b = document.getElementById('rig-sound-btn'); if (b) b.textContent = rigSound.muted ? '\u{1F507} Rig sound off (M)' : '\u{1F50A} Rig sound on (M)'; try { drawPanel(); syncDeskPanel(); } catch (e) { /* music UI not built yet */ } }
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => rigSound.start(), { capture: true });
renderer.xr.addEventListener('sessionstart', () => rigSound.start());
window.addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') rigSound.toggleMute(); });
{ const b = document.createElement('button'); b.id = 'rig-sound-btn';
  b.style.cssText = 'position:fixed;right:12px;bottom:116px;z-index:6;font-size:13px;padding:8px 14px;border-radius:999px;cursor:pointer;background:rgba(10,28,46,.8);color:#cfe9ff;border:1px solid #2f5b85';
  b.onclick = ev => { ev.stopPropagation(); rigSound.start(); rigSound.toggleMute(); }; document.body.appendChild(b); updateSoundBtn(); }
function tickRig(t, dt) {
  let moved = 0;
  if (!rigPaused) {
    const k = THREE.MathUtils.smoothstep(Math.abs(rigZ), RIG.farFrom, RIG.farTo);
    moved = RIG.speed * (1 + (RIG.farMul - 1) * k) * dt; rigZ += moved;
    if (rigZ > RIG.z1) rigZ = RIG.z0;               // faded out at the far rear -> straight to the far front, still hidden
  }
  // the soft contact-shadow decal only near the camera (no depth fight with the floor when the rig is far away)
  if (rigDecal) { camera.getWorldPosition(_rcam); rigDecal.visible = Math.abs(rigZ - _rcam.z) < 160; }
  e7.group.position.z = rigZ;
  const f = Math.min(1, (rigZ - RIG.z0) / RIG.fade, (RIG.z1 - rigZ) / RIG.fade);
  e7.setOpacity(Math.max(0, f));
  rigSound.update(Math.max(0, f));   // b6: distance-shaped grind, faded with the rig
  e7.tick(t, dt, 0.18, moved);       // b5: tracks + wheels roll by the distance crawled
}

/* ---------------------------------------------------------- b4: upper storey living quarters on the cabin roof */
const ROOF_TOP = DECK_TOP + CAB_H + 0.25;          // 19.25 m: the cabin roof is the quarters' floor
const quarters = buildQuarters({ U: ROOF_TOP, envMap: metalEnv, brushed, deckTop: DECK_TOP });
base.add(quarters.group);

/* ---------------------------------------------------------- b12: gold science lander on the Jupiter-side rim */
// From the front railing (looking down the trench, -z) Jupiter is 33 deg to the LEFT (x < 0), so the Jupiter-facing rim is the
// left one. It sits ~52 m out from the deck's front-left corner on the left plain, ramp turned toward the base, Jupiter behind it.
const LANDER = { x: -50, z: -54 }; LANDER.ry = Math.atan2(0 - LANDER.x, -11 - LANDER.z);   // ramp faces the front railing
const lander = buildLander({ envMap: metalEnv });
lander.group.position.set(LANDER.x, 0, LANDER.z); lander.group.rotation.y = LANDER.ry; scene.add(lander.group);
const landerAt = (fwd, side = 0) => [LANDER.x + Math.sin(LANDER.ry) * fwd + Math.cos(LANDER.ry) * side, 0, LANDER.z + Math.cos(LANDER.ry) * fwd - Math.sin(LANDER.ry) * side];
/* ---------------------------------------------------------- b12: ship orbiting overhead */
const ship = buildShip({ envMap: metalEnv, SUN_DIR }); skyRig.add(ship.group);

/* ---------------------------------------------------------- b4: teleport spots */
// Glowing rings with labels. VR: point a controller at a ring (or its label) and pull the trigger. Desktop: number keys,
// the buttons along the bottom, or click a ring. Always an instant jump behind a quick black fade (no gliding).
const SPOTS = [
  { key: '1', name: 'Cabin', to: [0, DECK_TOP, 4.5], yaw: 0, pitch: -0.08 },
  { key: '2', name: 'Front railing', to: [0, DECK_TOP, -11.0], yaw: 0, pitch: -0.42 },
  { key: '3', name: 'Rear railing', to: [0, DECK_TOP, 11.0], yaw: Math.PI, pitch: -0.35 },
  { key: '4', name: 'Left edge', to: [-17.0, DECK_TOP, -11.0], yaw: -0.3, pitch: -0.45 },   // front-left corner, right above the trench's left wall
  { key: '5', name: 'Right edge', to: [17.0, DECK_TOP, -11.0], yaw: 0.3, pitch: -0.45 },    // front-right corner, above the right wall
  { key: '6', name: 'Glass floor', to: [1.3, DECK_TOP + 0.03, 0.6], yaw: 0, pitch: -1.15 },
  // b7: nudged 1.7 m right (was x -2.6) so the line down to the Table ring clears the couch back; faces the front glass
  // with Jupiter ~23 deg to the left (through the skylight) and the Table ring ~20 deg to the right
  { key: '7', name: 'Living quarters', to: [-0.9, ROOF_TOP + 0.1, 4.4], yaw: 0.175, pitch: -0.05 },
  { key: '8', name: 'Table', to: [-0.3, ROOF_TOP + 0.1, 1.0], yaw: 0.58, pitch: 0.12 },   // b7: open floor beside the round table, facing Jupiter
  // b8: the open cabin-roof terrace in front of the quarters storey (z -7..-1, railed on its outer edges in b4)
  { key: '9', name: 'Roof deck', to: [-3.0, ROOF_TOP, -4.6], yaw: 0.3, pitch: -0.22 },
  { key: '0', name: 'Lander', to: landerAt(lander.rampFoot + 3), yaw: LANDER.ry, pitch: 0.2 },   // b12: foot of the ramp, looking up into the bay
];
// extra pads that lead to a spot from somewhere else: the foot of the outside stair goes up to the quarters
const PADS = SPOTS.map((s, i) => ({ spot: i, at: s.to }));
PADS.push({ spot: 6, at: [11.1, DECK_TOP, -6.4], label: 'Upstairs \u2191' });
PADS.push({ spot: 0, at: [6.2, ROOF_TOP + 0.1, 1.2], label: 'Down to cabin \u2193' });
PADS.push({ spot: 0, at: [3.2, ROOF_TOP, -3.4], label: 'Down to cabin \u2193' });   // b8: return ring on the roof deck
PADS.push({ spot: 6, at: [-7.0, ROOF_TOP, -2.6], label: 'Quarters \u2192' });       // b8: back inside
PADS.push({ spot: 9, at: [-14.5, DECK_TOP, -9.0], label: 'To lander \u2192' });      // b12: deck, front-left, near the Left edge spot
PADS.push({ spot: 0, at: landerAt(lander.rampFoot + 3, 2.8), label: 'Back to base \u21a9' });   // b12: beside the Lander spot
const padGroup = new THREE.Group(); scene.add(padGroup);
const padHits = [];
const ringMat = new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
const discMat = new THREE.MeshBasicMaterial({ color: 0x2a6f9a, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const ringGeo = new THREE.RingGeometry(0.55, 0.7, 40).rotateX(-Math.PI / 2), discGeo = new THREE.CircleGeometry(0.55, 32).rotateX(-Math.PI / 2);
const hitGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.3, 12), hitMat = new THREE.MeshBasicMaterial({ visible: false });
function labelMesh(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112; const g = c.getContext('2d');
  g.beginPath(); g.roundRect(4, 4, 504, 104, 40); g.fillStyle = 'rgba(4,16,28,0.82)'; g.fill(); g.strokeStyle = '#8fdcff'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 52px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25 * 112 / 512), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
}
for (const p of PADS) {
  const s = SPOTS[p.spot], g = new THREE.Group(); g.position.set(p.at[0], p.at[1] + 0.03, p.at[2]);
  const ring = new THREE.Mesh(ringGeo, ringMat), disc = new THREE.Mesh(discGeo, discMat), hit = new THREE.Mesh(hitGeo, hitMat);
  const lab = labelMesh(p.label || `${s.key} \u00b7 ${s.name}`); lab.position.y = 1.55;
  ring.renderOrder = disc.renderOrder = 6; lab.renderOrder = 7; hit.position.y = 0.15;
  lab.userData.pad = hit.userData.pad = p; g.add(ring, disc, hit, lab); padGroup.add(g);
  p.group = g; p.label3d = lab; padHits.push(hit, lab);
}
// fade: a black shell on the camera (works in the headset as well as on desktop)
const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
fadeMesh.renderOrder = 999; fadeMesh.visible = false; camera.add(fadeMesh);
let fadeAnim = null, currentSpot = 0;
function fadeTo(target, ms, done) { fadeAnim = { from: fadeMesh.material.opacity, to: target, t0: performance.now(), ms, done }; fadeMesh.visible = true; }
function tickFade(now) {
  if (!fadeAnim) return; const k = Math.min(1, (now - fadeAnim.t0) / fadeAnim.ms);
  fadeMesh.material.opacity = fadeAnim.from + (fadeAnim.to - fadeAnim.from) * k;
  if (k >= 1) { const d = fadeAnim.done; fadeAnim = null; if (fadeMesh.material.opacity <= 0.001) fadeMesh.visible = false; if (d) d(); }
}
const _e = new THREE.Euler(), _hp = new THREE.Vector3();
function placeAt(i) {
  const s = SPOTS[i];
  if (renderer.xr.isPresenting) {                  // keep the real head pose; turn the play space so you face the spot's view
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    rig.rotation.set(0, s.yaw - _e.y, 0); rig.position.set(s.to[0], s.to[1], s.to[2]); rig.updateMatrixWorld(true);
    camera.getWorldPosition(_hp); rig.position.x += s.to[0] - _hp.x; rig.position.z += s.to[2] - _hp.z; rig.updateMatrixWorld(true);
  } else { rig.rotation.set(0, 0, 0); rig.position.set(s.to[0], s.to[1], s.to[2]); yaw = s.yaw; pitch = s.pitch; }
  currentSpot = i; tpButtons.forEach((b, k) => b.classList.toggle('active', k === i));
}
function teleportTo(i) { if (fadeAnim) return; fadeTo(1, 110, () => { placeAt(i); fadeTo(0, 170); }); }
// VR: controller rays hit the rings / labels
const tpRay = new THREE.Raycaster(), _tq = new THREE.Matrix4();
function padUnder(ctl) {
  _tq.identity().extractRotation(ctl.matrixWorld);
  tpRay.ray.origin.setFromMatrixPosition(ctl.matrixWorld); tpRay.ray.direction.set(0, 0, -1).applyMatrix4(_tq);
  const h = tpRay.intersectObjects(padHits, false).find(o => o.object.parent.visible); return h ? { pad: h.object.userData.pad, dist: h.distance } : null;
}
const tpCtls = [renderer.xr.getController(0), renderer.xr.getController(1)];
for (const c of tpCtls) c.addEventListener('select', () => {   // b12: the music panel and the music screens win over rings
  if (panelZone(c)) return; const h = padUnder(c), s = screenUnder(c);
  if (s && (!h || s.distance <= h.dist)) return; if (h) teleportTo(h.pad.spot); });   // b9: the music panel wins when you point at it
function tickPads(now) {
  camera.getWorldPosition(_hp);
  const pulse = 0.6 + 0.25 * Math.sin(now * 0.003); ringMat.opacity = pulse;
  let hover = null;
  if (renderer.xr.isPresenting) for (const c of tpCtls) {
    const h = padUnder(c), line = c.children.find(o => o.isLine);
    if (line) line.scale.z = h ? h.dist / 4 : 1;
    if (h) hover = h.pad;
  }
  for (const p of PADS) {
    const g = p.group, s = SPOTS[p.spot];
    g.visible = Math.hypot(_hp.x - p.at[0], _hp.z - p.at[2]) > 1.6 || Math.abs(_hp.y - EYE - p.at[1]) > 2;   // hide the ring you are standing on
    p.label3d.lookAt(_hp.x, g.position.y + 1.55, _hp.z);
    const sc = p === hover ? 1.25 : 1; g.children[0].scale.setScalar(sc);
  }
}
// desktop: number keys, buttons, click a ring
window.addEventListener('keydown', e => { const i = SPOTS.findIndex(s => s.key === e.key); if (i >= 0) teleportTo(i); });
const tpButtons = [];
{
  const ui = document.createElement('div'); ui.id = 'teleport-ui';
  SPOTS.forEach((s, i) => { const b = document.createElement('button'); b.textContent = `${s.key} ${s.name}`; b.onclick = ev => { ev.stopPropagation(); teleportTo(i); }; ui.appendChild(b); tpButtons.push(b); });
  document.body.appendChild(ui); tpButtons[0].classList.add('active');
  let down = null; const mray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mray.setFromCamera(ndc, camera);
    const sh = mray.intersectObjects(musicScreens, false)[0];
    const h = mray.intersectObjects(padHits, false).find(o => o.object.parent.visible);
    if (sh && (!h || sh.distance <= h.distance)) { openDeskPanel(); return; }   // b12: a music screen opens the panel, never a teleport
    if (h) teleportTo(h.object.userData.pad.spot);
  });
}

/* ---------------------------------------------------------- HUD */
document.querySelector('#hud .build').textContent = BUILD;
document.querySelector('#hud .loc').textContent = `Ridge Base · ${SCENE_VER}`;

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
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.fillText('Europa \u2014 Ridge Base (test)', 512, 70);
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
renderer.xr.addEventListener('sessionstart', () => { rig.rotation.y = 0; rig.position.copy(BASE_SPAWN); currentSpot = 0; });   // start inside the cabin, facing along the trench

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

/* ---------------------------------------------------------- b12: music - pick Two Moons Rising or Rings of Gold (both atmospheric, by Mars) */
// Starts on the first click / Enter VR (browsers need a tap before sound). Open the music panel by clicking (desktop) or pointing +
// pulling the trigger (VR) at a music screen: one on the cabin's left wall, one on the quarters' back wall. B or Y also opens/closes
// it in VR. The panel: the two tracks, volume - / +, mute, and the rig sound on/off. Track, volume and mute are remembered.
const TRACKS = [{ id: 'moons', name: 'Two Moons Rising', src: './assets/two-moons-rising-atmospheric.mp3' },
                { id: 'gold', name: 'Rings of Gold', src: './assets/rings-of-gold-atmospheric.mp3' }];
const VOL_KEY = 'ridge-base-b12-music';
let vol = 0.5, muted = false, track = 0, musicStarted = false;
try { const o = JSON.parse(localStorage.getItem(VOL_KEY) || 'null'); if (o) { vol = Math.min(1, Math.max(0, +o.vol || 0)); muted = !!o.muted; track = Math.max(0, TRACKS.findIndex(t => t.id === o.track)); } } catch (e) { /* ignore */ }
const music = new Audio(TRACKS[track].src); music.loop = true; music.preload = 'auto';
function startMusic() { musicStarted = true; if (music.paused) music.play().catch(() => {}); }
const musicUI = { slider: null, mute: null, pct: null, title: null };
function saveMusic() { try { localStorage.setItem(VOL_KEY, JSON.stringify({ track: TRACKS[track].id, vol, muted })); } catch (e) { /* ignore */ } }
function applyVol() {
  music.volume = muted ? 0 : vol; saveMusic();
  if (musicUI.slider) musicUI.slider.value = String(Math.round(vol * 100));
  if (musicUI.pct) musicUI.pct.textContent = muted ? 'off' : `${Math.round(vol * 100)}%`;
  if (musicUI.mute) musicUI.mute.textContent = muted || vol === 0 ? '\u{1F507}' : '\u{1F50A}';
  if (musicUI.title) musicUI.title.textContent = `\u266B ${TRACKS[track].name}`;
  drawPanel(); drawScreens(); syncDeskPanel();
}
function setVol(v) { vol = Math.min(1, Math.max(0, Math.round(v * 10) / 10)); if (vol > 0) muted = false; startMusic(); applyVol(); }
function toggleMute() { muted = !muted; if (!muted && vol === 0) vol = 0.3; startMusic(); applyVol(); }
function setTrack(i) {
  if (i === track) { startMusic(); applyVol(); return; }
  track = i; music.src = TRACKS[i].src; music.currentTime = 0; if (musicStarted) music.play().catch(() => {}); else startMusic(); applyVol();
}
function toggleRigSound() { rigSound.start(); rigSound.toggleMute(); }
// VR panel (1024 x 512 canvas): top row = the two tracks, bottom row = mute, -, bar, +, rig sound
const PW = 0.56, PH = 0.28, pc = document.createElement('canvas'); pc.width = 1024; pc.height = 512;
const pTex = new THREE.CanvasTexture(pc); pTex.colorSpace = THREE.SRGBColorSpace;
const musicPanel = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH),
  new THREE.MeshBasicMaterial({ map: pTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
musicPanel.renderOrder = 1000; musicPanel.position.set(0, 0.95, -0.7); musicPanel.rotation.x = -0.55; musicPanel.visible = false;
rig.add(musicPanel);
function zoneAt(u, v) {   // v: 0 bottom .. 1 top
  if (v > 0.5) return u < 0.5 ? 'track0' : 'track1';
  if (u < 0.15) return 'mute'; if (u < 0.29) return 'down'; if (u > 0.82) return 'rig'; if (u > 0.68) return 'up'; return 'bar';
}
let hoverZone = null;
function drawPanel() {
  const g = pc.getContext('2d'), W = pc.width, H = pc.height; g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(6,16,28,0.86)'; g.strokeStyle = 'rgba(243,210,122,0.7)'; g.lineWidth = 5;
  g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 46); g.fill(); g.stroke();
  // tracks
  TRACKS.forEach((t, i) => {
    const x = 30 + i * 487, on = i === track, hv = hoverZone === 'track' + i;
    g.fillStyle = on ? 'rgba(150,112,30,0.9)' : hv ? 'rgba(80,160,230,0.55)' : 'rgba(30,70,110,0.7)';
    g.beginPath(); g.roundRect(x, 30, 477, 190, 36); g.fill();
    if (on) { g.strokeStyle = '#f3d27a'; g.lineWidth = 6; g.stroke(); }
    g.fillStyle = on ? '#fff6dc' : '#cfe9ff'; g.font = '600 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((on ? '\u266B ' : '') + t.name, x + 238, 125);
  });
  const cy = 375;
  const btn = (cx, id, draw, lit) => {
    g.fillStyle = hoverZone === id ? 'rgba(80,160,230,0.55)' : lit ? 'rgba(150,112,30,0.9)' : 'rgba(30,70,110,0.7)';
    g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#cfe9ff'; g.fillStyle = '#cfe9ff'; g.lineWidth = 13; g.lineCap = 'round'; draw(cx);
  };
  btn(W * 0.075, 'mute', cx => {
    g.beginPath(); g.moveTo(cx - 38, cy - 18); g.lineTo(cx - 16, cy - 18); g.lineTo(cx + 8, cy - 40); g.lineTo(cx + 8, cy + 40);
    g.lineTo(cx - 16, cy + 18); g.lineTo(cx - 38, cy + 18); g.closePath(); g.fill(); g.lineWidth = 9;
    if (muted || vol === 0) { g.beginPath(); g.moveTo(cx + 20, cy - 16); g.lineTo(cx + 44, cy + 16); g.moveTo(cx + 44, cy - 16); g.lineTo(cx + 20, cy + 16); g.stroke(); }
    else { g.beginPath(); g.arc(cx + 10, cy, 26, -0.8, 0.8); g.stroke(); }
  });
  btn(W * 0.22, 'down', cx => { g.beginPath(); g.moveTo(cx - 30, cy); g.lineTo(cx + 30, cy); g.stroke(); });
  btn(W * 0.75, 'up', cx => { g.beginPath(); g.moveTo(cx - 30, cy); g.lineTo(cx + 30, cy); g.moveTo(cx, cy - 30); g.lineTo(cx, cy + 30); g.stroke(); });
  btn(W * 0.91, 'rig', cx => { g.font = '600 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RIG', cx, cy - 14); g.font = '600 28px sans-serif'; g.fillText(rigSound.muted ? 'off' : 'on', cx, cy + 22); }, !rigSound.muted);
  const x0 = W * 0.31, x1 = W * 0.66;
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.roundRect(x0, cy + 4, x1 - x0, 24, 12); g.fill();
  g.fillStyle = muted ? 'rgba(160,170,180,0.6)' : '#f3d27a'; g.beginPath(); g.roundRect(x0, cy + 4, Math.max(24, (x1 - x0) * vol), 24, 12); g.fill();
  g.fillStyle = '#e8f4ff'; g.font = '600 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(`Volume ${muted ? 'off' : Math.round(vol * 100) + '%'}`, (x0 + x1) / 2, cy - 22);
  pTex.needsUpdate = true;
}
// wall screens (cabin downstairs, quarters upstairs): show the current track; click / trigger opens the panel
const screenCanvas = document.createElement('canvas'); screenCanvas.width = 640; screenCanvas.height = 360;
const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
const musicScreens = [];
{
  const faceMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.4, metalness: 0.6 });
  const make = (x, y, z, ry, w = 1.5) => {
    const h = w * 9 / 16, g = new THREE.Group();
    const bez = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06), bezelMat); bez.position.z = -0.035; g.add(bez);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat); face.position.z = 0.0; g.add(face);
    g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); face.userData.musicScreen = true; musicScreens.push(face);
  };
  make(-CAB_W / 2 + 0.16, DECK_TOP + 1.85, 3.0, Math.PI / 2, 2.4);          // downstairs: cabin left wall, facing in
  make(-1.0, ROOF_TOP + 1.6, 7 - 0.14, Math.PI, 1.7);                      // upstairs: quarters back wall, between the tablets and the bunks
}
function drawScreens() {
  const g = screenCanvas.getContext('2d'), W = 640, H = 360;
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a1206'); gr.addColorStop(1, '#06121f'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#f3d27a'; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#f3d27a'; g.font = '600 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('\u266B  MUSIC', W / 2, 70);
  g.fillStyle = '#fff6dc'; g.font = '600 50px sans-serif'; g.fillText(TRACKS[track].name, W / 2, 160);
  g.fillStyle = '#9fc8e8'; g.font = '34px sans-serif'; g.fillText(muted ? 'muted' : `volume ${Math.round(vol * 100)}%`, W / 2, 220);
  g.fillStyle = 'rgba(111,183,239,0.25)'; g.beginPath(); g.roundRect(120, 262, 400, 64, 32); g.fill();
  g.fillStyle = '#cfe9ff'; g.font = '600 30px sans-serif'; g.fillText('tap to open', W / 2, 295);
  screenTex.needsUpdate = true;
}
const mRay = new THREE.Raycaster(), _mq = new THREE.Matrix4();
function ctlRay(ctl) { _mq.identity().extractRotation(ctl.matrixWorld); mRay.ray.origin.setFromMatrixPosition(ctl.matrixWorld); mRay.ray.direction.set(0, 0, -1).applyMatrix4(_mq); return mRay; }
function panelZone(ctl) {
  if (!musicPanel.visible) return null;
  const h = ctlRay(ctl).intersectObject(musicPanel, false)[0]; if (!h) return null;
  return zoneAt(h.uv.x, h.uv.y);
}
function screenUnder(ctl) { const h = ctlRay(ctl).intersectObjects(musicScreens, false)[0]; return h && h.distance < 25 ? h : null; }
function openPanelVR(show = true) {   // place it low in front of where you are looking
  if (show) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'), hy = e.y;
    musicPanel.position.set(camera.position.x - Math.sin(hy) * 0.7, camera.position.y - 0.62, camera.position.z - Math.cos(hy) * 0.7);
    musicPanel.rotation.set(-0.55, hy, 0, 'YXZ');
  }
  musicPanel.visible = show;
}
const mCtls = [renderer.xr.getController(0), renderer.xr.getController(1)];
for (const c of mCtls) c.addEventListener('select', () => {
  startMusic();
  const z = panelZone(c);
  if (z) {
    if (z === 'mute') toggleMute(); else if (z === 'down') setVol(vol - 0.1); else if (z === 'up') setVol(vol + 0.1);
    else if (z === 'track0') setTrack(0); else if (z === 'track1') setTrack(1); else if (z === 'rig') toggleRigSound();
    return;
  }
  if (screenUnder(c)) openPanelVR(true);
});
const mPrev = new Map();
function tickMusicVR() {
  let hz = null; for (const c of mCtls) hz = hz || panelZone(c);
  if (hz !== hoverZone) { hoverZone = hz; drawPanel(); }
  const sess = renderer.xr.getSession && renderer.xr.getSession(); if (!sess) return;
  for (const src of sess.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const p = gp.buttons[5] && gp.buttons[5].pressed;
    if (p && !mPrev.get(src)) openPanelVR(!musicPanel.visible);   // B / Y opens / closes the music panel
    mPrev.set(src, p);
  }
}
renderer.xr.addEventListener('sessionstart', () => { startMusic(); });
renderer.xr.addEventListener('sessionend', () => { musicPanel.visible = false; });
// desktop: compact slider bottom-right, and the full panel that the wall screens open
const deskPanel = document.createElement('div'); deskPanel.id = 'music-panel';
deskPanel.innerHTML = `<h3>\u266B Music</h3>
  <div class="row">${TRACKS.map((t, i) => `<button type="button" data-t="${i}">${t.name}</button>`).join('')}</div>
  <div class="row"><button type="button" data-a="down">\u2212</button><span class="vol"></span><button type="button" data-a="up">+</button></div>
  <div class="row"><button type="button" data-a="mute"></button><button type="button" data-a="rig"></button></div>
  <div class="row"><button type="button" data-a="close">Close</button></div>`;
document.body.appendChild(deskPanel);
for (const ev of ['pointerdown', 'pointerup', 'click']) deskPanel.addEventListener(ev, e => e.stopPropagation());
deskPanel.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.t) setTrack(+b.dataset.t);
  const a = b.dataset.a;
  if (a === 'down') setVol(vol - 0.1); else if (a === 'up') setVol(vol + 0.1); else if (a === 'mute') toggleMute();
  else if (a === 'rig') { toggleRigSound(); syncDeskPanel(); drawPanel(); } else if (a === 'close') deskPanel.classList.remove('open');
});
function syncDeskPanel() {
  deskPanel.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', +b.dataset.t === track));
  deskPanel.querySelector('.vol').textContent = muted ? 'muted' : `Volume ${Math.round(vol * 100)}%`;
  const m = deskPanel.querySelector('[data-a="mute"]'); m.textContent = muted ? '\u{1F507} Unmute music' : '\u{1F50A} Mute music';
  const r = deskPanel.querySelector('[data-a="rig"]'); r.textContent = rigSound.muted ? 'Rig sound: off' : 'Rig sound: on'; r.classList.toggle('on', !rigSound.muted);
}
function openDeskPanel() { startMusic(); syncDeskPanel(); deskPanel.classList.add('open'); }
{
  const box = document.createElement('div'); box.id = 'music-ui';
  box.innerHTML = '<span class="t" title="open the music panel"></span><button type="button" class="m"></button><input type="range" min="0" max="100" step="5"><span class="p"></span>';
  document.body.appendChild(box);
  musicUI.slider = box.querySelector('input'); musicUI.mute = box.querySelector('.m'); musicUI.pct = box.querySelector('.p'); musicUI.title = box.querySelector('.t');
  musicUI.slider.addEventListener('input', () => { vol = Number(musicUI.slider.value) / 100; muted = false; startMusic(); applyVol(); });
  musicUI.mute.addEventListener('click', toggleMute);
  musicUI.title.addEventListener('click', openDeskPanel);
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
  head: (x = 0, y = 0, z = 0) => camera.position.set(x, PLAYER_HEIGHT + y, z), at: (x, y, z) => rig.position.set(x, y, z),
  lander, ship, setTrack, openDeskPanel, musicScreens, get track() { return track; },
  tp: { go: i => placeAt(i), spots: SPOTS }, sound: rigSound, snow, music, setVol, toggleMute, musicPanel, get vol() { return vol; }, get muted() { return muted; },
  rigE7: { set: z => { rigZ = z; }, roll: d => e7.roll(d), pause: (b = true) => { rigPaused = b; }, get z() { return rigZ; }, tris: e7.tris, model: e7 },
  dbg: { ring, THREE, scene, camera, renderer, ground, groundMat, front, sun, rim: camera.children[0] } };
const _skyPos = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const now = performance.now(); tickFps(now);
  if (!renderer.xr.isPresenting) { camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch); if (roll) camera.rotateZ(roll); }
  sun.position.copy(rig.position).addScaledVector(SUN_DIR, 160); sun.target.position.copy(rig.position); sun.target.updateMatrixWorld();
  camera.getWorldPosition(_skyPos); skyRig.position.copy(_skyPos);
  front.position.set(_skyPos.x, _skyPos.y - EYE, _skyPos.z); ring.position.copy(front.position);   // panel centred on the eye (horizon stays at eye level, no parallax)
  if (renderer.xr.isPresenting) { pollPads(); tickMusicVR(); }
  { const t = now * 0.001, dt = Math.min(0.1, t - (tickRig.last || t)); tickRig.last = t; tickRig(t, dt); ship.tick(dt); tickPads(now); tickFade(now);
    if (!tickRig.scr || t - tickRig.scr > 1) { tickRig.scr = t; quarters.updateLive(rigZ); } }
  vrLabel.update();
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
