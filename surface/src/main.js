/* EUROPA — Surface section spike (three.js r160, WebXR)
 *
 * Proves: the look (sunlit ice, motionless Jupiter, black sky) and the 90 fps
 * budget on PC Link. Kai integrates into the main Europa build.
 *
 * Architecture notes for Kai are inline, marked [KAI].
 */

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/* ---------------------------------------------------------- config */
const PLAYER_HEIGHT = 1.7;
const JUPITER_DISTANCE = 900;                 // scene units (m)
const JUPITER_RADIUS = JUPITER_DISTANCE * Math.tan(THREE.MathUtils.degToRad(6)); // ~12 deg across
const SUN_DIR = new THREE.Vector3(0.55, 0.42, 0.35).normalize(); // low sun -> long shadows

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

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 4000);
const rig = new THREE.Group();          // moving the rig moves the player
rig.position.set(0, 0, 0);
rig.add(camera);
camera.position.set(0, PLAYER_HEIGHT, 0);
scene.add(rig);

/* ---------------------------------------------------------- lights */
// Hard sunlight — no atmosphere on Europa, so no sky bounce, just a point source.
const sun = new THREE.DirectionalLight(0xfff4e0, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 400;
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// Faint fill: starlight + ice bounce. Kept low — shadows should stay deep.
scene.add(new THREE.HemisphereLight(0x24344a, 0x0a1018, 0.35));

// Jupiter-shine: a whisper of warm reflected light from Jupiter's direction.
const jupiterDir = new THREE.Vector3(-0.52, 0.30, -0.80).normalize();
const jupiterShine = new THREE.DirectionalLight(0xd8b48f, 0.18);
jupiterShine.position.copy(jupiterDir).multiplyScalar(100);
scene.add(jupiterShine);

/* ---------------------------------------------------------- sky rig (follows player XZ) */
const skyRig = new THREE.Group();
scene.add(skyRig);

// Stars — the real Hipparcos catalog (assets/stars.json), baked by tools/bake-stars.py:
// 8,870 real stars, true positions, true B-V colors, brightness pre-scaled by Vmag.
// Sorted brightest-first, so the first tier is the naked-eye standouts.
// [KAI] Keep this path relative to the spike's index.html if surface/ moves.
{
  let starData = null;
  try {
    const res = await fetch('./assets/stars.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    starData = await res.json();
  } catch (e) { console.warn('[europa] star catalog missing — band-only sky', e); }

  if (starData && starData.stars && starData.stars.length) {
    const STAR_R = 1560, tiers = [{ count: 420, size: 2.4 }, { count: Infinity, size: 1.5 }];
    let offset = 0;
    for (const t of tiers) {
      const n = Math.min(t.count, starData.stars.length - offset);
      if (n <= 0) break;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = starData.stars[offset + i];
        let y = s[1]; if (y < -0.04) y = Math.abs(y); // keep a few below-horizon ones out of the dirt
        pos.set([s[0] * STAR_R, y * STAR_R, s[2] * STAR_R], i * 3);
        col.set([s[3], s[4], s[5]], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      skyRig.add(new THREE.Points(g, new THREE.PointsMaterial({
        size: t.size, sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: 0.98, depthWrite: false
      })));
      offset += n;
    }
  }
}

// Sky draw order — explicit and pose-independent. three.js sorts transparent
// objects by the projected centre of each geometry's bounding sphere; the star
// tiers' centres sit off-origin (centroid of the catalogue) while the Milky Way
// sphere's is the origin, so their order flipped with head pose. When the stars
// drew AFTER the band, normal blending (opacity 0.98) overwrote the bright haze
// with the faint stars' near-black colours: dark dots near Jupiter. Fixed: stars
// first (renderOrder 1), band added on top (renderOrder 2), Jupiter opaque.
const SKY_ORDER = { stars: 1, milkyWay: 2 };
for (const o of skyRig.children) if (o.isPoints) o.renderOrder = SKY_ORDER.stars;

// Milky Way — a REAL all-sky photograph, locked to the REAL galactic plane.
// Image: ESO/S. Brunier, "The Milky Way panorama" (eso0932a), CC BY 4.0,
// https://www.eso.org/public/images/eso0932a/ — equirectangular in galactic
// coordinates (l=0 at centre, l increasing to the left, b=+90 at top).
// Preprocessed by tools/prep-milkyway.py to 4096x2048: 7px median at 6000px so
// point stars are removed (the Hipparcos catalog, stars.json, stays the only star
// source), mosaic/JPEG seams smoothed, magenta cast graded to warm starlight with
// tan dust, and band brightness evened out along longitude. The galactic frame below is expressed in the SAME convention
// as tools/bake-stars.py (x = cos d cos a, y = sin d, z = -cos d sin a).
{
  const GAL_POLE = new THREE.Vector3(-0.8677, 0.4560, 0.1981).normalize();   // NGP, J2000
  const GAL_CENTER = new THREE.Vector3(-0.0548, -0.4838, 0.8734).normalize(); // l=0,b=0, J2000
  const GAL_Y = new THREE.Vector3().crossVectors(GAL_POLE, GAL_CENTER).normalize(); // l=90
  // MW_STRENGTH — overall Milky Way brightness, the single knob to tune.
  const MW_STRENGTH = 1.6;
  const MW_CAP = 0.24;        // max luminance of the band (hue-preserving cap)
  const MW_CONTRAST = 1.35;   // >1: brighter core, darker rift lanes, dark sky outside
  const mwTex = await new THREE.TextureLoader().loadAsync('./assets/milkyway-eso0932a-4k.jpg').catch(() => null);
  if (mwTex) {
    mwTex.colorSpace = THREE.SRGBColorSpace;
    mwTex.generateMipmaps = false;               // 4096x2048 RGBA = 32 MiB GPU, no mip chain
    mwTex.minFilter = THREE.LinearFilter;        // also avoids a mip seam at l=180
    mwTex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.ShaderMaterial({
      defines: { MW_STRENGTH: MW_STRENGTH.toFixed(3), MW_CAP: MW_CAP.toFixed(3), MW_CONTRAST: MW_CONTRAST.toFixed(3) },
      uniforms: { uMap: { value: mwTex }, uPole: { value: GAL_POLE }, uCenter: { value: GAL_CENTER }, uGy: { value: GAL_Y } },
      side: THREE.BackSide, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform sampler2D uMap;
        uniform vec3 uPole, uCenter, uGy;
        void main() {
          vec3 d = normalize(vDir);
          float l = atan(dot(d, uGy), dot(d, uCenter));          // galactic longitude
          float b = asin(clamp(dot(d, uPole), -1.0, 1.0));       // galactic latitude
          vec2 uv = vec2(0.5 - l / 6.2831853, 0.5 + b / 3.1415927);
          vec3 c = texture2D(uMap, uv).rgb;                       // linear (sRGB decoded)
          float Y = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float Yc = pow(max(Y - 0.004, 0.0), MW_CONTRAST) * 1.6;   // contrast on luminance only (keeps hue)
          vec3 color = c * (Yc / max(Y, 1e-5)) * MW_STRENGTH;
          float Ym = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color *= min(1.0, MW_CAP / max(Ym, 1e-5));             // hue-preserving brightness cap
          float horizon = smoothstep(-0.03, 0.05, d.y);           // fade below the ice
          // dither: breaks up 8-bit banding / residual texel grid
          float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          color *= 1.0 + (n - 0.5) * 0.06;                        // multiplicative, so dark sky stays black
          gl_FragColor = vec4(color * horizon, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const band = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), mat);
    band.renderOrder = SKY_ORDER.milkyWay;
    skyRig.add(band);
  }
}

// Jupiter — tidally locked: it NEVER moves. Fixed to the sky rig, ~12 deg across.
// Texture: NASA/JPL-Caltech/SwRI/MSSS, JunoCam PIA21384 (public domain).
const jupiterMesh = (await new THREE.TextureLoader().loadAsync('./assets/jupiter-hi.jpg')
  .catch(() => null));
let jupiter;
if (jupiterMesh) {
  jupiterMesh.colorSpace = THREE.SRGBColorSpace;
  jupiter = new THREE.Mesh(
    new THREE.SphereGeometry(JUPITER_RADIUS, 64, 48),
    new THREE.MeshBasicMaterial({ map: jupiterMesh })
  );
  jupiter.position.copy(jupiterDir).multiplyScalar(JUPITER_DISTANCE);
  skyRig.add(jupiter);
}

// Visible sun disc — a hard white point in a black sky.
{
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(9, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  sunDisc.position.copy(SUN_DIR).multiplyScalar(1500);
  skyRig.add(sunDisc);
}

/* ---------------------------------------------------------- procedural ice texture */
function makeIceTextures(size = 1024) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const bv = document.createElement('canvas'); bv.width = bv.height = size;
  const x = cv.getContext('2d'), b = bv.getContext('2d');

  const g = x.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#e8f0f7'); g.addColorStop(0.5, '#cfdde9'); g.addColorStop(1, '#bccfdd');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  b.fillStyle = '#808080'; b.fillRect(0, 0, size, size);

  // soft blotches
  for (let i = 0; i < 260; i++) {
    const r = 20 + Math.random() * 90;
    x.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${215 + Math.random() * 40 | 0},${230 + Math.random() * 25 | 0},0.08)`;
    x.beginPath(); x.ellipse(Math.random() * size, Math.random() * size, r, r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, 7); x.fill();
  }
  // cracks — dark in color, recessed in bump
  for (let i = 0; i < 46; i++) {
    let px = Math.random() * size, py = Math.random() * size, a = Math.random() * Math.PI * 2;
    const steps = 24 + Math.random() * 40 | 0, w = 1 + Math.random() * 2.5;
    for (const [ctx, style, lw] of [[x, 'rgba(38,64,92,0.55)', w], [b, 'rgba(30,30,30,0.8)', w * 1.4]]) {
      ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(px, py);
      let qx = px, qy = py, qa = a;
      for (let s = 0; s < steps; s++) {
        qa += (Math.random() - 0.5) * 0.9;
        const len = 8 + Math.random() * 22;
        qx += Math.cos(qa) * len; qy += Math.sin(qa) * len;
        ctx.lineTo(qx, qy);
      }
      ctx.stroke();
    }
    // faint bright lip beside some cracks
    if (Math.random() < 0.5) {
      x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = w * 0.7;
      x.beginPath(); x.moveTo(px + 3, py + 3); x.lineTo(px + 60, py + 40); x.stroke();
    }
  }
  // speckle
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.10})`;
    x.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6);
  }
  const map = new THREE.CanvasTexture(cv);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const bump = new THREE.CanvasTexture(bv);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}
// [KAI] Production path: replace with generated 4K/8K ice textures -> KTX2 (Basis).
// The KTX2 pipeline already in the Europa build transcodes to BC7 on desktop.
const ice = makeIceTextures(1024);
const groundMat = new THREE.MeshStandardMaterial({
  map: ice.map, bumpMap: ice.bump, bumpScale: 0.6,
  roughness: 0.5, metalness: 0.02, color: 0xf2f6fa
});
ice.map.repeat.set(90, 90); ice.bump.repeat.set(90, 90);

/* ---------------------------------------------------------- shared ground */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---------------------------------------------------------- location system */
// [KAI] This is the per-teleport load/dispose architecture from the plan.
// Each location owns an asset group; only the active one is resident.
// Shared: ground, sky, lights. Per-location: features + high-res textures.
const locationGroups = new Map();
let activeLocation = null;

function registerLocation(def) {
  const group = new THREE.Group();
  def.build(group);
  group.visible = false;
  scene.add(group);
  locationGroups.set(def.id, { def, group, loaded: false });
  group.traverse(o => { if (o.isMesh && !o.material.isShaderMaterial) { o.castShadow = true; o.receiveShadow = true; } });
}

/* --- art-directed vistas (art by Mars) ---
 * Each painted spot shows one or more flat 16:9 stills on curved cylinder
 * segments centred on the player's eye, so each image's horizon row sits at eye
 * height. Unlit, not tone mapped, drawn after ground + sky (depthTest off).
 *
 * HOW TO ADD A PICTURE to a spot: drop the JPG in surface/assets/vistas/ named
 * <spot>-<view>.jpg (e.g. crevasse-front.jpg, crevasse-left.jpg, crevasse-right.jpg,
 * crevasse-back.jpg) and add an entry to that spot's `vistas: [...]` list:
 *   { url, yawDeg, arcDeg, horizon, keySky/keyLo/keyHi/keyBand, topFade, sideFade, bright, order }
 *   yawDeg   where the picture's centre faces: 0 = spawn forward, -75 = left, +75 = right, 180 = back
 *   arcDeg   how wide it wraps (90-116); neighbours should overlap ~30-40 deg
 *   horizon  horizon row as a fraction DOWN from the image top (must match across a spot's pictures)
 *   keySky   key out the dark painted sky so the real stars show; keyBand = [v0,v1] uv rows where keying starts
 *   sideFade soft left/right edge width (uv, default 0.16), or [left, right]: the panel ON TOP
 *            in an overlap fades wide (~0.16-0.22), the one underneath stays nearly hard (~0.04)
 *   bright/tint  exposure and [r,g,b] multiplier (linear) to match neighbours at the overlaps
 *   order    draw priority: higher draws on top in overlaps (front 12, sides 11, back 10)
 * All pictures of the active spot load behind the teleport fade and are disposed
 * on leave. Quest budget: one 4096x2304 front (~50 MB w/ mips) + side/back at
 * 2048x1152 (~12.5 MB) or 3072x1728 (~28 MB). A single-picture spot is just a
 * one-element list. */
const EYE = PLAYER_HEIGHT;
const vistaLoader = new THREE.TextureLoader();
function addVista(group, def, opt) {
  if (opt.vistas) { for (const v of opt.vistas) addVista(group, def, { ...opt, vistas: null, ...v }); return; }
  const R = opt.radius || 300, arc = THREE.MathUtils.degToRad(opt.arcDeg || 104);
  const H = R * arc * 9 / 16;
  const geo = new THREE.CylinderGeometry(R, R, H, 72, 1, true, Math.PI - arc / 2, arc);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null }, uBright: { value: opt.bright ?? 1.0 },
      uKey: { value: opt.keySky ? 1.0 : 0.0 }, uKeyLo: { value: opt.keyLo ?? 0.16 }, uKeyHi: { value: opt.keyHi ?? 0.24 },
      uTopFade: { value: opt.topFade ?? 0.0 },
      uSide: { value: new THREE.Vector2(...[].concat(opt.sideFade ?? 0.16, opt.sideFade ?? 0.16).slice(0, 2)) },
      uTint: { value: new THREE.Vector3(...(opt.tint || [1, 1, 1])) },
      uKeyBand: { value: new THREE.Vector2(...(opt.keyBand || [0.45, 0.62])) }
    },
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = vec2(1.0 - uv.x, uv.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uMap; uniform float uBright, uKey, uKeyLo, uKeyHi, uTopFade; uniform vec2 uKeyBand, uSide; uniform vec3 uTint;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        float a = smoothstep(0.0, uSide.x, vUv.x) * smoothstep(1.0, 1.0 - uSide.y, vUv.x) // side edges [left,right]
                * smoothstep(0.0, 0.16, vUv.y);                                   // bottom edge (soft, over procedural ground)
        if (uTopFade > 0.0) a *= smoothstep(1.0, 1.0 - uTopFade, vUv.y);         // top into sky
        if (uKey > 0.5) {                                                         // key the dark sky slot
          float l = dot(t.rgb /* linear */, vec3(0.299, 0.587, 0.114));
          // key on a slightly blurred (mip-biased) sample so isolated grain in the
          // painted sky doesn't survive as dark specks over the Milky Way
          float lb = dot(texture2D(uMap, vUv, 2.0).rgb, vec3(0.299, 0.587, 0.114));
          float k = smoothstep(uKeyLo, uKeyHi, l) * smoothstep(uKeyLo * 0.6, uKeyHi * 0.8, lb);
          a *= mix(1.0, k, smoothstep(uKeyBand.x, uKeyBand.y, vUv.y));                        // only the top of the frame
        }
        gl_FragColor = vec4(t.rgb * uBright * uTint, a);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  // horizon row (fraction down from the top) at eye height
  // cylinder centre is H/2 below its top; image top is horizon*H above the eye
  mesh.position.set(def.pos.x, (def.playerY || 0) + EYE + opt.horizon * H - H / 2, def.pos.z);
  mesh.rotation.y = -THREE.MathUtils.degToRad(opt.yawDeg || 0);  // + yaw = to the right
  mesh.renderOrder = opt.order ?? 10; mesh.visible = false; mesh.frustumCulled = false;
  mesh.userData.vista = { url: opt.url, tex: null };
  group.add(mesh); (group.userData.vistas ||= []).push(mesh);
}
async function loadPanel(m) {
  if (!m.userData.vista.tex) {
    const t = await vistaLoader.loadAsync(m.userData.vista.url).catch(e => { console.warn('[europa] vista missing', e); return null; });
    if (!t) return;
    t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    renderer.initTexture(t);   // upload (and mip) now, behind the fade, not on the first visible frame
    m.userData.vista.tex = t;
  }
  m.material.uniforms.uMap.value = m.userData.vista.tex; m.visible = true;
}
async function loadVista(entry) {   // all panels of the spot, in parallel, behind the fade
  const ms = entry.group.userData.vistas || []; if (!ms.length) return;
  const t0 = performance.now();
  await Promise.all(ms.map(loadPanel));
  console.info(`[europa] ${entry.def.id}: ${ms.length} vista panel(s) ready in ${Math.round(performance.now() - t0)} ms`);
}
function disposeVista(entry) {
  for (const m of entry.group.userData.vistas || []) {
    m.visible = false; m.material.uniforms.uMap.value = null;
    if (m.userData.vista.tex) { m.userData.vista.tex.dispose(); m.userData.vista.tex = null; }
  }
}

let loadToken = 0;
async function loadLocation(id) {
  if (activeLocation === id) return;
  const token = ++loadToken;
  fadeEl.style.opacity = '1';
  const prev = activeLocation ? locationGroups.get(activeLocation) : null;
  if (prev) { prev.group.visible = false; disposeVista(prev); }
  const next = locationGroups.get(id);
  activeLocation = id;
  await loadVista(next);
  if (token !== loadToken) return;
  next.group.visible = true;
  next.loaded = true;
  rig.position.set(next.def.pos.x, next.def.playerY || 0, next.def.pos.z);
  document.querySelector('#hud .loc').textContent = next.def.name;
  document.querySelectorAll('#teleport-ui button').forEach(b =>
    b.classList.toggle('active', b.dataset.loc === id));
  setTimeout(() => { if (token === loadToken) fadeEl.style.opacity = '0'; }, 220);
}

/* soft unlit tint patch over the shared ground, per location (seam blend toward a vista's foreground) */
function groundTint(group, c, color, R, alpha = 0.7) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vP; uniform vec3 uCol;
      void main(){ float r = length(vP) / ${R.toFixed(1)}; float a = ${alpha.toFixed(2)} * (1.0 - smoothstep(0.5, 1.0, r));
        gl_FragColor = vec4(uCol, a);
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(R, 48), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.02, c.z); m.renderOrder = 5;
  group.add(m);
}

/* --- location builders --- */
function pressureRidges(group, count, spread, hMax, center = new THREE.Vector3(), behindOnly = false) {
  for (let i = 0; i < count; i++) {
    const w = 6 + Math.random() * 14, d = 2 + Math.random() * 4, h = 1 + Math.random() * hMax;
    const geo = new THREE.BoxGeometry(w, h, d, 8, 3, 3);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      p.setY(v, p.getY(v) + (Math.random() - 0.35) * h * 0.5);
      p.setX(v, p.getX(v) + (Math.random() - 0.5) * 1.2);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, groundMat);
    // behindOnly: keep ridges out of the forward vista cone (z < 0 within ~65 deg of -Z)
    const a = behindOnly ? (Math.PI * 0.5 - 2.0) + Math.random() * 4.0 : Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * spread;
    m.position.set(center.x + Math.cos(a) * r, h * 0.15, center.z + Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    group.add(m);
  }
}

registerLocation({
  id: 'open-ice', name: 'Canyon', pos: new THREE.Vector3(0, 0, 0),
  build(group) {
    addVista(group, this, { url: './assets/canyon-vista.jpg', horizon: 0.47, arcDeg: 116, keySky: true, keyLo: 0.028, keyHi: 0.065, keyBand: [0.705, 0.725] });  // key only above the far-end sky slot (row ~0.28); the dark back of the canyon floor (rows 0.30-0.55) was being keyed out
    groundTint(group, this.pos, 0x737a84, 160, 0.7);
    pressureRidges(group, 7, 60, 2.2, this.pos, true);
  }
});

/* Crevasse Rim surround (Mars): measured horizon rows + sky key per picture */
const LEFT_H  = { h: 0.212, lo: 0.006, hi: 0.016, band: [0.79, 0.81] };   // crevasse-left (alt): curved wall sweeping from the left foreground, black strip ~20%
const RIGHT_H = { h: 0.217, lo: 0.006, hi: 0.016, band: [0.76, 0.79] };   // crevasse-right: crevasse receding centre, black strip ~21%
const SIDE_BRIGHT = 1.6, SIDE_TINT = [1.0, 1.0, 1.0];
const BACK_BRIGHT = 1.75, BACK_TINT = [1.0, 1.12, 1.3];                   // back reads darker/warmer than the front
registerLocation({
  id: 'crevasse', name: 'Crevasse Rim \u2014 Open Lineae', pos: new THREE.Vector3(130, 0, -50),
  build(group) {
    // horizon rows measured per picture (brightness jump); every panel's horizon lands at eye height.
    // front on top (wide fades), sides next (hard toward the front, soft toward the back), back underneath.
    // back is 140 deg wide (uniformly scaled) so it overlaps each side by ~23 deg instead of 11.
    const side = { arcDeg: 116, order: 11, keySky: true, bright: SIDE_BRIGHT, tint: SIDE_TINT };
    addVista(group, this, { vistas: [
      { url: './assets/vistas/crevasse-front.jpg', yawDeg: 0, arcDeg: 116, horizon: 0.02, topFade: 0.08, sideFade: 0.22, order: 12 },
      { ...side, url: './assets/vistas/crevasse-left.jpg',  yawDeg: -75, horizon: LEFT_H.h, keyLo: LEFT_H.lo, keyHi: LEFT_H.hi, keyBand: LEFT_H.band, sideFade: [0.16, 0.04] },
      { ...side, url: './assets/vistas/crevasse-right.jpg', yawDeg: 75,  horizon: RIGHT_H.h, keyLo: RIGHT_H.lo, keyHi: RIGHT_H.hi, keyBand: RIGHT_H.band, sideFade: [0.04, 0.16] },
      { url: './assets/vistas/crevasse-back.jpg', yawDeg: 180, arcDeg: 140, order: 10, horizon: 0.275, keySky: true, keyLo: 0.012, keyHi: 0.020, keyBand: [0.70, 0.73], sideFade: 0.04, bright: BACK_BRIGHT, tint: BACK_TINT }
    ] });
    groundTint(group, this.pos, 0x6c7a8a, 160, 0.7);
    // no procedural ridges here: the four panels cover 360 deg and ridges poked above the low horizon

  }
});

registerLocation({
  id: 'ridge', name: 'Ridge Overlook', pos: new THREE.Vector3(-95, 0, 105), playerY: 1.6,
  build(group) {
    pressureRidges(group, 12, 45, 4.5);
    // overlook platform — a broad flat-topped rise
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 2.4, 24), groundMat);
    plat.position.set(-95, 0.4, 105);
    group.add(plat);
  }
});

registerLocation({
  id: 'chaos', name: 'Chaos Terrain', pos: new THREE.Vector3(-20, 0, -160),
  build(group) {
    addVista(group, this, { url: './assets/chaos-terrain-vista.jpg', horizon: 0.15, arcDeg: 116, keySky: true, keyLo: 0.022, keyHi: 0.034, keyBand: [0.76, 0.84] });
    groundTint(group, this.pos, 0x767b86, 160, 0.7);
    pressureRidges(group, 7, 50, 2.0, this.pos, true);
  }
});

registerLocation({
  id: 'fissure', name: 'Fissure Vantage', pos: new THREE.Vector3(160, 0, 110),
  build(group) {
    addVista(group, this, { url: './assets/fissure-vantage-vista.jpg', horizon: 0.125, arcDeg: 116, keySky: true, keyLo: 0.030, keyHi: 0.050, keyBand: [0.85, 0.89] });
    groundTint(group, this.pos, 0x7f8698, 160);   // blend procedural ice toward the still's foreground tone
    pressureRidges(group, 7, 50, 2.0, this.pos, true);
  }
});

/* ---------------------------------------------------------- teleport */
const discs = [];
{
  const discGeo = new THREE.RingGeometry(0.9, 1.25, 40);
  for (const [id, { def }] of locationGroups) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x54c8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(discGeo, mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(def.pos.x, (def.playerY || 0) + 0.06, def.pos.z + 2.6);
    disc.userData.locationId = id;
    scene.add(disc); discs.push(disc);
  }
}

const raycaster = new THREE.Raycaster();
const fadeEl = document.getElementById('fade');
function flashFade() {
  fadeEl.style.opacity = '1';
  setTimeout(() => fadeEl.style.opacity = '0', 220);
}
function tryTeleportFromRay(origin, dir) {
  raycaster.set(origin, dir);
  const hit = raycaster.intersectObjects(discs, false)[0];
  if (hit && hit.object.userData.locationId !== activeLocation) loadLocation(hit.object.userData.locationId);
  else nextLocation(); // [KAI] far discs are 130m+ away and unaimable; trigger cycles spots
}
function nextLocation() {
  const ids = [...locationGroups.keys()];
  loadLocation(ids[(ids.indexOf(activeLocation) + 1) % ids.length]);
}

// XR controllers
for (let i = 0; i < 2; i++) {
  const ctl = renderer.xr.getController(i);
  ctl.addEventListener('selectstart', () => {
    const m = new THREE.Matrix4().identity().extractRotation(ctl.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
    const origin = new THREE.Vector3().setFromMatrixPosition(ctl.matrixWorld);
    tryTeleportFromRay(origin, dir);
  });
  // [KAI] visible pointer ray so you can see where you aim
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
    new THREE.LineBasicMaterial({ color: 0x54c8ff, transparent: true, opacity: 0.6 }));
  ctl.add(ray);
  rig.add(ctl);
}

/* ---------------------------------------------------------- helmet rim (suit presence) */
{
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.055, 12, 48, Math.PI * 1.15),
    new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.7, metalness: 0.3, transparent: true, opacity: 1 })
  );
  rim.renderOrder = 100; // drawn after the vista panel (which ignores depth)
  rim.position.set(0, -0.12, -0.32);
  rim.rotation.set(0.15, 0, Math.PI * 0.925); // arc centered at bottom of view
  camera.add(rim); // camera is already in the scene graph via rig — children render fine
}

/* ---------------------------------------------------------- desktop fallback + UI */
let yaw = 0, pitch = 0, dragging = false, px = 0, py = 0;
const dom = renderer.domElement;
dom.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; });
window.addEventListener('pointerup', e => {
  if (dragging && Math.hypot(e.clientX - px, e.clientY - py) < 6) {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(discs, false)[0];
    if (hit) loadLocation(hit.object.userData.locationId);
  }
  dragging = false;
});
window.addEventListener('pointermove', e => {
  if (!dragging || renderer.xr.isPresenting) return;
  yaw -= (e.clientX - px) * 0.0032; pitch -= (e.clientY - py) * 0.0028;
  pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
  px = e.clientX; py = e.clientY;
});

{
  const ui = document.getElementById('teleport-ui');
  for (const [id, { def }] of locationGroups) {
    const b = document.createElement('button');
    b.textContent = def.name; b.dataset.loc = id;
    b.onclick = () => loadLocation(id);
    ui.appendChild(b);
  }
}

{
  const btn = document.getElementById('enter-vr');
  if ('xr' in navigator) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => {
      if (ok) {
        btn.disabled = false; btn.textContent = 'Enter VR';
        btn.onclick = () => document.getElementById('overlay').classList.add('hidden');
        document.body.appendChild(VRButton.createButton(renderer));
        document.querySelector('#VRButton').style.display = 'none'; // we use our own button flow
        const real = document.querySelector('#VRButton');
        btn.addEventListener('click', () => real.click(), { once: true });
      } else { btn.textContent = 'VR not available — desktop mode'; }
    }).catch(() => { btn.textContent = 'VR not available — desktop mode'; });
  } else { btn.textContent = 'VR not available — desktop mode'; }
  renderer.xr.addEventListener('sessionstart', () =>
    document.getElementById('overlay').classList.add('hidden'));
  renderer.xr.addEventListener('sessionend', () =>
    document.getElementById('overlay').classList.remove('hidden'));
}

/* ---------------------------------------------------------- fps meter */
const fpsEl = document.querySelector('#hud .fps');
let frames = 0, lastT = performance.now(), ema = 60;
function tickFps(now) {
  frames++;
  const dt = now - lastT;
  if (dt >= 500) {
    const fps = frames * 1000 / dt;
    ema = ema * 0.6 + fps * 0.4;
    fpsEl.textContent = `${ema.toFixed(0)} fps`;
    fpsEl.style.color = ema >= 85 ? '#7dffa8' : ema >= 60 ? '#ffd47d' : '#ff8d7d';
    frames = 0; lastT = now;
  }
}

/* ---------------------------------------------------------- main loop */
const clock = new THREE.Clock();
await loadLocation('open-ice'); // preloads the spawn vista before the first frame
let roll = 0;
window.__surface = { loadLocation, look: (y, p = 0, r = 0) => { yaw = y; pitch = p; roll = r; },
  head: (x = 0, y = 0, z = 0) => camera.position.set(x, PLAYER_HEIGHT + y, z), get active() { return activeLocation; } };

renderer.setAnimationLoop(() => {
  const now = performance.now();
  tickFps(now);

  if (!renderer.xr.isPresenting) {
    camera.rotation.set(0, 0, 0);
    camera.rotateY(yaw); camera.rotateX(pitch); if (roll) camera.rotateZ(roll);
  }

  // sun + shadow frustum follow the player
  sun.position.copy(rig.position).addScaledVector(SUN_DIR, 160);
  sun.target.position.copy(rig.position);
  sun.target.updateMatrixWorld();

  // sky stays glued to the player (fixed stars, motionless Jupiter)
  skyRig.position.set(rig.position.x, 0, rig.position.z);

  // gentle disc pulse
  const s = 1 + Math.sin(now * 0.003) * 0.06;
  discs.forEach(d => d.scale.set(s, s, 1));

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
