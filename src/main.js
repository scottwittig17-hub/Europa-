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

// Stars — always visible, no atmosphere.
{
  const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1600);
    if (v.y < -60) v.y = Math.abs(v.y); // keep a few below horizon out
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(0.55 + Math.random() * 0.12, Math.random() * 0.5, 0.55 + Math.random() * 0.45);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  skyRig.add(new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false
  })));
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
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

function loadLocation(id) {
  if (activeLocation === id) return;
  const prev = activeLocation ? locationGroups.get(activeLocation) : null;
  if (prev) { prev.group.visible = false; } // [KAI] production: dispose() here, rebuild on revisit
  const next = locationGroups.get(id);
  next.group.visible = true;
  next.loaded = true;
  activeLocation = id;
  rig.position.set(next.def.pos.x, next.def.playerY || 0, next.def.pos.z);
  document.querySelector('#hud .loc').textContent = next.def.name;
  document.querySelectorAll('#teleport-ui button').forEach(b =>
    b.classList.toggle('active', b.dataset.loc === id));
  flashFade();
}

/* --- location builders --- */
function pressureRidges(group, count, spread, hMax) {
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
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * spread;
    m.position.set(Math.cos(a) * r, h * 0.15, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    group.add(m);
  }
}

registerLocation({
  id: 'open-ice', name: 'Open Ice Plain', pos: new THREE.Vector3(0, 0, 0),
  build(group) { pressureRidges(group, 7, 60, 2.2); }
});

registerLocation({
  id: 'crevasse', name: 'Crevasse', pos: new THREE.Vector3(130, 0, -50),
  build(group) {
    const wallMat = new THREE.MeshStandardMaterial({
      map: ice.map, bumpMap: ice.bump, bumpScale: 1.2,
      color: 0xaec6d8, roughness: 0.62
    });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(70, 9, 7, 12, 4, 2), wallMat);
      const p = wall.geometry.attributes.position;
      for (let v = 0; v < p.count; v++)
        p.setX(v, p.getX(v) + (Math.random() - 0.5) * 3.5);
      wall.geometry.computeVertexNormals();
      wall.position.set(130, 3.2, -50 + side * 7.5);
      group.add(wall);
    }
    // fallen slabs on the crevasse floor
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 3, 1 + Math.random() * 2, 2 + Math.random() * 3), groundMat);
      s.position.set(118 + Math.random() * 24, 0.6, -50 + (Math.random() - 0.5) * 9);
      s.rotation.set(Math.random(), Math.random() * 3, Math.random() * 0.6);
      group.add(s);
    }
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
  if (hit) loadLocation(hit.object.userData.locationId);
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
  rig.add(ctl);
}

/* ---------------------------------------------------------- helmet rim (suit presence) */
{
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.055, 12, 48, Math.PI * 1.15),
    new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.7, metalness: 0.3 })
  );
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
loadLocation('open-ice');

renderer.setAnimationLoop(() => {
  const now = performance.now();
  tickFps(now);

  if (!renderer.xr.isPresenting) {
    camera.rotation.set(0, 0, 0);
    camera.rotateY(yaw); camera.rotateX(pitch);
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
