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

// Milky Way — a luminous band locked to the REAL galactic plane.
// The galactic north pole in the catalog's frame (+Y = north celestial pole) is
// (-0.8677, 0.4560, 0.1981), so the band falls on the same great circle as the
// density band in the star data — astronomically aligned, not eyeballed.
{
  const GAL_POLE = new THREE.Vector3(-0.8677, 0.4560, 0.1981).normalize();
  const GAL_CENTER = new THREE.Vector3(-0.0547, -0.4849, 0.8728).normalize(); // Sgr A*, J2000
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPole: { value: GAL_POLE }, uCenter: { value: GAL_CENTER } },
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
      uniform vec3 uPole;
      uniform vec3 uCenter;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), u.x),
                       mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
                   mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), u.x),
                       mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = abs(dot(d, uPole));
        float band = exp(-pow(h / 0.16, 2.0));          // ~+/-9 deg around the galactic plane
        float glow = exp(-pow(h / 0.42, 2.0)) * 0.22;   // faint halo
        float mottle = noise3(d * 7.0) * 0.55 + noise3(d * 17.0 + 3.7) * 0.45;
        float lanes = smoothstep(0.52, 0.85, noise3(d * 11.0 + 9.1)); // dark dust lanes
        float core = 0.45 + 0.55 * smoothstep(-0.6, 1.0, dot(d, uCenter)); // brighter toward Sagittarius
        float horizon = smoothstep(-0.03, 0.05, d.y);   // fade below the ice
        vec3 color = mix(vec3(0.62, 0.72, 1.0), vec3(1.0, 0.90, 0.78), core * 0.6)
                   * (band * (0.30 + 0.70 * mottle) + glow);
        color *= 1.0 - 0.55 * lanes * band;
        gl_FragColor = vec4(color * horizon * 0.85, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const band = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 32), mat);
  band.renderOrder = SKY_ORDER.milkyWay;
  skyRig.add(band);
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
 * Flat 16:9 stills shown on a curved cylinder segment facing -Z, centred on the
 * player's eye so the image's horizon row sits at eye height. Unlit, not tone
 * mapped, drawn after ground + sky (depthTest off) so it replaces them in its arc.
 * Only one vista texture is resident at a time (loaded on teleport, disposed on leave). */
const EYE = PLAYER_HEIGHT;
const vistaLoader = new THREE.TextureLoader();
function addVista(group, def, opt) {
  const R = opt.radius || 300, arc = THREE.MathUtils.degToRad(opt.arcDeg || 104);
  const H = R * arc * 9 / 16;
  const geo = new THREE.CylinderGeometry(R, R, H, 72, 1, true, Math.PI - arc / 2, arc);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null }, uBright: { value: opt.bright ?? 1.0 },
      uKey: { value: opt.keySky ? 1.0 : 0.0 }, uKeyLo: { value: opt.keyLo ?? 0.16 }, uKeyHi: { value: opt.keyHi ?? 0.24 },
      uTopFade: { value: opt.topFade ?? 0.0 },
      uKeyBand: { value: new THREE.Vector2(...(opt.keyBand || [0.45, 0.62])) },
      uHorizonV: { value: 1.0 - opt.horizon }, uHorizonFade: { value: opt.horizonFade ?? 0.008 }
    },
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = vec2(1.0 - uv.x, uv.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uMap; uniform float uBright, uKey, uKeyLo, uKeyHi, uTopFade, uHorizonV, uHorizonFade; uniform vec2 uKeyBand;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        float a = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x)   // side edges
                * smoothstep(uHorizonV - 2.0 * uHorizonFade, uHorizonV - uHorizonFade, vUv.y);  // opaque just below the horizon, past the decal's far edge         // below horizon: the ground decal carries it
        if (uTopFade > 0.0) a *= smoothstep(1.0, 1.0 - uTopFade, vUv.y);         // top into sky
        if (uKey > 0.5) {                                                         // key the dark sky slot
          // key on a slightly blurred (mip-biased) sample so isolated grain in the
          // painted sky doesn't survive as dark specks over the Milky Way
          float l = dot(t.rgb /* linear */, vec3(0.299, 0.587, 0.114));
          float lb = dot(texture2D(uMap, vUv, 2.0).rgb, vec3(0.299, 0.587, 0.114));
          float k = smoothstep(uKeyLo, uKeyHi, l) * smoothstep(uKeyLo * 0.6, uKeyHi * 0.8, lb);
          a *= mix(1.0, k, smoothstep(uKeyBand.x, uKeyBand.y, vUv.y));                        // only the top of the frame
        }
        gl_FragColor = vec4(t.rgb * uBright, a);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  // horizon row (fraction down from the top) at eye height
  // cylinder centre is H/2 below its top; image top is horizon*H above the eye
  mesh.position.set(def.pos.x, (def.playerY || 0) + EYE + opt.horizon * H - H / 2, def.pos.z);
  mesh.renderOrder = 10; mesh.visible = false; mesh.frustumCulled = false;
  mesh.userData.vista = { url: opt.url, tex: null };
  group.add(mesh); group.userData.vista = mesh;
  mesh.userData.decal = addVistaDecal(group, def, opt, mesh, R, arc, H);
}

/* Ground decal: the still's below-horizon part projected INTO the ground plane.
 * For each ground fragment, the ray from the spot's eye point is intersected with
 * the vista cylinder and the panel's UV is sampled there, so from the spawn eye the
 * decal is pixel-identical to the panel, but it lies on the real ground (correct
 * level + parallax when the head moves). Outside the painted arc the image is
 * mirrored (continuous, no hard line) all the way round 360 deg, and below the
 * still's bottom row it mirrors back up, so every visible ground pixel is painted.
 * One opaque unlit draw; replaces the shared procedural ground while the spot is
 * active (shared ground is hidden, so the sun-lit/painted brightness mismatch is gone). */
function addVistaDecal(group, def, opt, panel, R, arc, H) {
  const eyeY = (def.playerY || 0) + EYE;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null }, uBright: { value: opt.bright ?? 1.0 },
      uEye: { value: new THREE.Vector3(def.pos.x, eyeY, def.pos.z) },
      uCamH: { value: opt.camH ?? EYE },                      // virtual camera height of the still
      uR: { value: R }, uArc: { value: arc }, uH: { value: H },
      uBottom: { value: panel.position.y - H / 2 - eyeY },     // panel bottom, relative to the eye
      uHorizonV: { value: 1.0 - opt.horizon }
    },
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vW;
      uniform sampler2D uMap; uniform vec3 uEye;
      uniform float uBright, uCamH, uR, uArc, uH, uBottom, uHorizonV;
      void main() {
        vec2 d = vW.xz - uEye.xz;
        float dist = max(length(d), 1e-3);
        float phi = atan(d.x, -d.y);                    // 0 = straight ahead (-Z), + = right
        float ha = 0.5 * uArc, s = 2.0 * (3.14159265 - ha);
        float u = 0.5 + phi / uArc;
        if (phi > ha) u = 1.0 - (phi - ha) / s;         // mirror out of the arc,
        if (phi < -ha) u = (-phi - ha) / s;             // meeting continuously behind
        float y = -uCamH * (uR / dist);                 // height on the panel along the eye ray
        float v = (y - uBottom) / uH;
        v = clamp(v, 0.002, uHorizonV - 0.0005);
        vec4 t = texture2D(uMap, vec2(u, v));         // mirror lines are continuous: no mip seam
        // Under the still's bottom row (near the feet) there is no painted data: fill
        // with the bottom band of the still laid flat on the ground (mirrored repeat,
        // tile ~ the footprint size), cross-faded in, so looking down never streaks.
        float d0 = uCamH * uR / max(-uBottom, 1e-3);      // ground distance of the still's bottom row
        vec2 q = d / (d0 * 0.9);
        vec2 pp = 1.0 - abs(1.0 - mod(q + 1.0, 2.0));     // ping-pong 0..1
        vec4 tp = texture2D(uMap, vec2(0.3 + 0.4 * pp.x, 0.01 + 0.16 * uHorizonV * pp.y));
        t = mix(t, tp, smoothstep(d0 * 1.5, d0 * 0.95, dist));
        gl_FragColor = vec4(t.rgb * uBright, 1.0);
        #include <colorspace_fragment>
      }`
  });
  // polar grid, rings dense near the feet: avoids huge fan triangles whose apex sits
  // right under the eye (bad varying precision when the view is exactly level)
  const geo = new THREE.RingGeometry(0, 1, 96, 40), gp = geo.attributes.position, Rd = opt.decalRadius || 760;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), y = gp.getY(i), r = Math.hypot(x, y), k = r > 0 ? Rd * Math.pow(r, 2.5) / r : 0;
    gp.setXY(i, x * k, y * k);
  }
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(def.pos.x, (def.playerY || 0) + 0.005, def.pos.z);
  m.visible = false; m.frustumCulled = false; m.renderOrder = 0;
  group.add(m);
  return m;
}
async function loadVista(entry) {
  const m = entry.group.userData.vista; if (!m) return;
  if (!m.userData.vista.tex) {
    const t = await vistaLoader.loadAsync(m.userData.vista.url).catch(e => { console.warn('[europa] vista missing', e); return null; });
    if (!t) return;
    t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    m.userData.vista.tex = t;
  }
  m.material.uniforms.uMap.value = m.userData.vista.tex; m.visible = true;
  const dc = m.userData.decal; dc.material.uniforms.uMap.value = m.userData.vista.tex; dc.visible = true;
}
function disposeVista(entry) {
  const m = entry.group.userData.vista; if (!m || !m.userData.vista.tex) return;
  m.visible = false; m.material.uniforms.uMap.value = null;
  m.userData.decal.visible = false; m.userData.decal.material.uniforms.uMap.value = null;
  m.userData.vista.tex.dispose(); m.userData.vista.tex = null;
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
  const vm = next.group.userData.vista;
  ground.visible = !(vm && vm.userData.decal.visible);  // painted spots: the decal IS the ground
  next.group.visible = true;
  next.loaded = true;
  rig.position.set(next.def.pos.x, next.def.playerY || 0, next.def.pos.z);
  document.querySelector('#hud .loc').textContent = next.def.name;
  document.querySelectorAll('#teleport-ui button').forEach(b =>
    b.classList.toggle('active', b.dataset.loc === id));
  setTimeout(() => { if (token === loadToken) fadeEl.style.opacity = '0'; }, 220);
}

/* soft unlit tint patch over the shared ground, per location (seam blend toward a vista's foreground) */
function groundTint(group, c, color, R) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vP; uniform vec3 uCol;
      void main(){ float r = length(vP) / ${R.toFixed(1)}; float a = 0.7 * (1.0 - smoothstep(0.5, 1.0, r));
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
    addVista(group, this, { url: './assets/canyon-vista.jpg', horizon: 0.47, arcDeg: 116, keySky: true, keyLo: 0.028, keyHi: 0.065 });
  }
});

registerLocation({
  id: 'crevasse', name: 'Crevasse Rim \u2014 Open Lineae', pos: new THREE.Vector3(130, 0, -50),
  build(group) {
    addVista(group, this, { url: './assets/crevasse-rim-vista.jpg', horizon: 0.02, arcDeg: 116, topFade: 0.08 });
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
  }
});

registerLocation({
  id: 'fissure', name: 'Fissure Vantage', pos: new THREE.Vector3(160, 0, 110),
  build(group) {
    addVista(group, this, { url: './assets/fissure-vantage-vista.jpg', horizon: 0.125, arcDeg: 116, keySky: true, keyLo: 0.030, keyHi: 0.050, keyBand: [0.85, 0.89] });
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
