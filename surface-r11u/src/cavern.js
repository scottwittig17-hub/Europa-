/* EUROPA — Ice Cavern (test branch kai/cavern)
 * A self-contained teleport spot: rough displaced cave shell, hanging icicles,
 * translucent-looking ice with glowing cyan veins (fake glow: emissive vein map +
 * fresnel rim, no true transparency on the walls), a dark reflective pool and
 * bioluminescent jellyfish drifters (adapted from app/scene.js createJellies).
 * The shared sun / sky / Jupiter / ground plane are switched off by main.js while
 * this spot is active (see setCaveEnvironment).
 */
import * as THREE from 'three';

/* ---------- tiny deterministic value noise ---------- */
function h3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let _seed = 12345;
const rnd = () => { _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0; return _seed / 4294967296; };

/* ---------- vein texture: branching cyan cracks with a soft glow ---------- */
function makeVeinTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  function vein(x, y, ang, len, w, depth) {
    g.beginPath(); g.moveTo(x, y);
    const steps = Math.max(6, Math.floor(len / 14));
    for (let i = 0; i < steps; i++) {
      ang += (rnd() - 0.5) * 0.7;
      x += Math.cos(ang) * len / steps; y += Math.sin(ang) * len / steps;
      g.lineTo(x, y);
      if (depth < 3 && rnd() < 0.16) vein(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.8), len * (0.35 + rnd() * 0.3), w * 0.65, depth + 1);
    }
    g.lineWidth = w; g.stroke();
  }
  for (const pass of [{ blur: 14, a: 0.4, w: 2.6 }, { blur: 5, a: 0.8, w: 1.2 }]) {
    _seed = 777;                                  // same veins on both passes (glow + core)
    g.shadowColor = 'rgba(40,200,255,1)'; g.shadowBlur = pass.blur;
    g.strokeStyle = `rgba(110,235,255,${pass.a})`;
    for (let i = 0; i < 24; i++) vein(rnd() * W, rnd() * H, rnd() * Math.PI * 2, 260 + rnd() * 380, pass.w * (0.6 + rnd() * 0.9), 0);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/* soft animated ripples for the pool */
function makeRippleNormal() {
  const N = 256, hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * Math.PI * 2, v = y / N * Math.PI * 2;
    hgt[y * N + x] = Math.sin(u * 3 + Math.sin(v * 2) * 1.4) * 0.5 + Math.sin(v * 4 + u * 2) * 0.35 + Math.sin(u * 7 - v * 5) * 0.15;
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N], hy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
    const nx = -hx * 3, ny = -hy * 3, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return t;
}

/* ---------- jellyfish drifters (adapted from app/scene.js createJellies, anchor mode) ---------- */
function createDrifters(anchors) {
  const group = new THREE.Group(); const jellies = [];
  const bellGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const deep = new THREE.Color(0.02, 0.14, 0.34), cyan = new THREE.Color(0.2, 0.85, 1.0), amber = new THREE.Color(1.0, 0.7, 0.3);
  const SEG = 14, TENT = 7;
  anchors.forEach((an, i) => {
    const amberEye = i === 2;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMood: { value: 0.3 }, uDeep: { value: deep }, uCyan: { value: cyan }, uAmber: { value: amber }, uPulse: { value: 0 }, uWarm: { value: amberEye ? 1 : 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; varying float vDist;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz);
          vY = position.y; vDist = length(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `precision mediump float;
        uniform float uMood, uPulse, uWarm; uniform vec3 uDeep, uCyan, uAmber; varying vec3 vN; varying vec3 vV; varying float vY; varying float vDist;
        void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          vec3 c = mix(uDeep, uCyan, 0.6 + 0.4 * uMood);
          float inner = smoothstep(0.2, 0.9, vY) * 0.25;
          vec3 col = c * (0.10 + fr * 0.85 + inner) * (0.75 + 0.35 * uPulse) * 1.6;
          col += uAmber * uWarm * smoothstep(0.75, 1.0, vY) * 0.6;
          col *= exp(-vDist * 0.03);
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const bell = new THREE.Mesh(bellGeo, mat); bell.renderOrder = 3;
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TENT * SEG * 2 * 3), 3));
    const tMat = new THREE.LineBasicMaterial({ color: cyan.clone().multiplyScalar(0.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const tent = new THREE.LineSegments(tGeo, tMat); tent.frustumCulled = false; tent.renderOrder = 3;
    const root = new THREE.Group(); root.add(bell, tent); group.add(root);
    jellies.push({ root, bell, tent, mat, tMat, size: (0.45 + rnd() * 0.55) * 1.5, c: an.pos, r: an.r, yAmp: an.sub ? 0.35 : 0.7,
      a0: rnd() * Math.PI * 2, w: (0.05 + rnd() * 0.04) * (i % 2 ? 1 : -1), ph: rnd() * 10, phase: rnd() * 5 });
  });
  return {
    group, jellies,
    update(dt, speed = 0.9, breath = 0.5) {
      for (const j of jellies) {
        const pulse = 0.5 + 0.5 * Math.sin(j.ph + j.phase * 2.2);
        j.phase += dt * speed * (0.55 + 0.45 * pulse);
        const a = j.a0 + j.w * j.phase * 1.8;
        const x = j.c.x + Math.sin(a) * j.r, z = j.c.z - Math.cos(a) * j.r, y = j.c.y + Math.sin(j.phase * 0.12 + j.ph) * j.yAmp;
        j.root.position.set(x, y, z);
        const s = j.size; j.bell.scale.set(s * (1 + 0.12 * pulse), s * (0.8 - 0.12 * pulse), s * (1 + 0.12 * pulse));
        j.bell.rotation.z = Math.sin(j.phase * 0.4 + j.ph) * 0.12;
        j.mat.uniforms.uPulse.value = pulse * (0.8 + 0.2 * breath);
        const arr = j.tent.geometry.attributes.position.array; let k = 0;
        for (let ti = 0; ti < TENT; ti++) {
          const ang = ti / TENT * Math.PI * 2, rx = Math.cos(ang) * s * 0.55, rz = Math.sin(ang) * s * 0.55;
          let px = rx, py = -s * 0.05, pz = rz;
          for (let si = 0; si < SEG; si++) {
            const f = (si + 1) / SEG, len = s * 0.2;
            const nx = px + Math.sin(j.phase * 1.3 + si * 0.5 + ti) * len * 0.25 * f - rx * 0.02;
            const ny = py - len, nz = pz + Math.cos(j.phase * 1.1 + si * 0.45 + ti * 1.7) * len * 0.25 * f - rz * 0.02;
            arr[k++] = px; arr[k++] = py; arr[k++] = pz; arr[k++] = nx; arr[k++] = ny; arr[k++] = nz; px = nx; py = ny; pz = nz;
          }
        }
        j.tent.geometry.attributes.position.needsUpdate = true;
        j.tMat.opacity = 0.35 + 0.2 * pulse;
      }
    },
  };
}

/* ---------- the cavern ---------- */
export const CAVE_CENTER = new THREE.Vector3(1500, 0, 1500);   // far off the 1400 m ground plane, so it never shows from the surface
export const CAVE_SPAWN = new THREE.Vector3(CAVE_CENTER.x, 0, CAVE_CENTER.z + 13);

export function buildCavern(group, { drifters = 24 } = {}) {
  const C = CAVE_CENTER;
  const R = 24, H = 15, CY = 3, POOL_R = 8;
  const floorY = (x, z) => {
    const r = Math.hypot(x - C.x, z - C.z);
    let y = -3.2 * (1 - smooth(6, 9, r));
    y += (fbm(x * 0.35, 3, z * 0.35) - 0.5) * 1.6 * smooth(17, 23, r);          // rubble toward the walls; flat at the spawn ring
    return y;
  };

  /* shell: displaced sphere, seen from inside; lower part flattened to a floor with a pool basin */
  const geo = new THREE.SphereGeometry(1, 128, 64);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const icicleSeeds = [];
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    let x = dx * R, y = CY + dy * H, z = dz * R;
    const n = fbm(x * 0.09 + 7, y * 0.09, z * 0.09) - 0.5;
    const n2 = fbm(x * 0.4 + 3, y * 0.4, z * 0.4) - 0.5;
    const k = 1 + n * 0.55 + n2 * 0.12;
    x *= k; z *= k; y = CY + dy * H * (1 + n * 0.35 + n2 * 0.12);
    if (y <= 0.2 || dy < -0.187) { y = floorY(x + C.x, z + C.z); }
    p.setXYZ(i, x + C.x, y, z + C.z);
    if (y <= 0.2 || dy < -0.187) uv.setXY(i, 0.5 + x / 60, 0.5 + z / 30);   // flat floor: planar uv so veins don't fan out from the pole
    if (y > 6 && dy > 0.3) icicleSeeds.push(new THREE.Vector3(x + C.x, y, z + C.z));
  }
  geo.computeVertexNormals();

  const veins = makeVeinTexture();
  veins.repeat.set(2, 1);
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x0a2440, roughness: 0.32, metalness: 0.05, side: THREE.BackSide,
    emissive: 0xffffff, emissiveMap: veins, emissiveIntensity: 0.85, map: null,
  });
  iceMat.onBeforeCompile = (sh) => {            // fake translucency: cyan fresnel rim lifts the grazing surfaces
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.5);
       totalEmissiveRadiance += vec3(0.02, 0.28, 0.42) * fres * 0.55;`);
  };
  const shell = new THREE.Mesh(geo, iceMat); shell.frustumCulled = false;
  group.add(shell);

  /* icicles: one instanced mesh, cones hanging from the ceiling */
  const iceMatFront = iceMat.clone(); iceMatFront.side = THREE.FrontSide; iceMatFront.onBeforeCompile = iceMat.onBeforeCompile;
  const N = Math.min(150, icicleSeeds.length);
  const cone = new THREE.ConeGeometry(1, 1, 7, 1, true);
  const ic = new THREE.InstancedMesh(cone, iceMatFront, N); ic.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const s = icicleSeeds[Math.floor(rnd() * icicleSeeds.length)];
    const h = 2.5 + rnd() * rnd() * 9, r = 0.3 + rnd() * 0.5;
    e.set(Math.PI + (rnd() - 0.5) * 0.18, rnd() * 6.28, (rnd() - 0.5) * 0.18);
    q.setFromEuler(e); sc.set(r, h, r); pos.set(s.x, s.y - h * 0.42, s.z);
    m4.compose(pos, q, sc); ic.setMatrixAt(i, m4);
  }
  group.add(ic);

  /* pool */
  const ripple = makeRippleNormal();
  const water = new THREE.Mesh(new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x010a14, roughness: 0.05, metalness: 0.75, transparent: true, opacity: 0.9,
      normalMap: ripple, normalScale: new THREE.Vector2(0.14, 0.14), envMapIntensity: 1.6 }));
  water.rotation.x = -Math.PI / 2; water.position.set(C.x, -0.35, C.z); water.renderOrder = 1;
  group.add(water);

  /* cave lighting: dim cyan point lights + a deep-blue ambient */
  group.add(new THREE.AmbientLight(0x0b2b4a, 2.4));
  const L = (col, I, dist, x, y, z) => { const l = new THREE.PointLight(col, I, dist, 2); l.position.set(C.x + x, y, C.z + z); group.add(l); return l; };
  L(0x39c8ff, 110, 46, 0, 10, 0); L(0x2fb8f0, 90, 34, -13, 3.5, -8); L(0x2fb8f0, 90, 34, 12, 4, -7); L(0x2a6ea0, 30, 22, 0, 3, 11);

  /* drifters: most hover above the pool, a few sit just under the surface */
  const anchors = [];
  for (let i = 0; i < drifters; i++) {
    const sub = i % 5 === 4, a = rnd() * Math.PI * 2, rr = 3 + rnd() * 15;
    const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
    if (Math.hypot(x - CAVE_SPAWN.x, z - CAVE_SPAWN.z) < 4) { i--; continue; }
    anchors.push({ pos: new THREE.Vector3(x, sub ? -1.2 - rnd() * 0.8 : 0.8 + rnd() * rnd() * 7, z), r: 1.2 + rnd() * 3, sub });
  }
  const drift = createDrifters(anchors);
  group.add(drift.group);

  /* one-time soft reflections: cube map of the lit cave, used by the pool */
  let captured = false;
  return {
    update(dt, t) { drift.update(dt); ripple.offset.set(t * 0.012, t * 0.008); },
    captureReflections(renderer, scene) {
      if (captured) return; captured = true;
      const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
      const cam = new THREE.CubeCamera(0.1, 120, rt); cam.position.set(C.x, 1.0, C.z);
      water.visible = false; drift.group.visible = false;
      cam.update(renderer, scene);
      water.visible = true; drift.group.visible = true;
      water.material.envMap = rt.texture; water.material.needsUpdate = true;
    },
  };
}

/* ---------- faint cyan glow bleeding up through a crack in the surface ice (sits beside the cavern disc) ---------- */
export function makeCrackGlow() {
  const W = 1024, Hh = 512, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
    const halo = g.createRadialGradient(W / 2, Hh / 2, 10, W / 2, Hh / 2, W * 0.5);
  halo.addColorStop(0, 'rgba(50,190,255,0.30)'); halo.addColorStop(0.5, 'rgba(40,170,240,0.12)'); halo.addColorStop(1, 'rgba(40,170,240,0)');
  g.save(); g.scale(1, 0.5); g.fillStyle = halo; g.fillRect(0, 0, W, Hh * 2); g.restore();
  _seed = 4242;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const crack = (x, y, a, len, w, depth) => {
    g.beginPath(); g.moveTo(x, y);
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps; g.lineTo(x, y);
      if (depth < 2 && rnd() < 0.22) crack(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.6), len * 0.35, w * 0.6, depth + 1);
    }
    g.lineWidth = w; g.stroke();
  };
  for (const [blur, a, w] of [[40, 0.30, 34], [14, 0.6, 14], [4, 0.95, 5]]) {
    _seed = 4242; g.shadowColor = 'rgba(40,190,255,1)'; g.shadowBlur = blur; g.strokeStyle = `rgba(90,225,255,${a})`;
    crack(W * 0.12, Hh * 0.55, -0.06, W * 0.76, w, 0);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false, fog: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 6; m.userData.base = 0.8;
  return m;
}
