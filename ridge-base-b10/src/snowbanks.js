/* Ridge Base b10 — chunky snowy trench: rough ledged walls, heaped snow berms along both lips, broken ice blocks,
 * rubble at the wall feet, and low rolling drifts out to the horizon (no haze, sky untouched).
 * Keep-outs: the rig corridor |x| < 10 stays clear (walls only bulge in to |x| >= 16.4, rubble sits at |x| >= 14.5; walls bulge in at most 2.2 m, to |x| >= 15.8);
 * the four base legs (x +-21.5, z +-10) get a flattened, chunk-free 7 m circle. Everything is merged or instanced. */
import * as THREE from 'three';

// value noise + fbm (deterministic)
function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); f *= 2.03; a *= 0.5; } return s / (1 - Math.pow(0.5, o)); }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildSnowTrench({ scene, groundMat, trenchMat, TRENCH_W = 36, TRENCH_D = 10, GROUND_SIZE = 4000, legs = [], detailZ = 420 }) {
  const HW = TRENCH_W / 2, stats = { tris: 0, draws: 0 };
  const legFlat = (x, z) => { let k = 1; for (const [lx, lz] of legs) k = Math.min(k, sstep(4.5, 7.5, Math.hypot(x - lx, z - lz))); return k; };
  // rim height: s = metres back from the lip (>= 0)
  function rimH(s, z, sx) {
    const zz = z + sx * 311;
    const amp = 1.1 + 1.6 * fbm(zz * 0.035, 3.1) + 0.8 * fbm(zz * 0.12, s * 0.15 + 7);   // berm crest 1.1 - 3.5 m, uneven
    const crest = 2.6 + 2.5 * fbm(zz * 0.02, 1.7);                                           // crest sits 2.6 - 5 m back from the lip
    let h = amp * sstep(0, 1.1, s) * Math.exp(-Math.pow((s - crest) / (2.2 + 2 * fbm(zz * 0.05, 9)), 2));
    h += 0.6 * sstep(4, 10, s) * Math.exp(-Math.pow((s - 9 - 3 * fbm(zz * 0.03, 4)) / 3, 2)) * fbm(zz * 0.08, 2);   // second, lower drift line
    h += (0.35 + 0.9 * Math.exp(-Math.pow((s - crest) / 3, 2))) * (fbm((sx * (s + HW)) * 0.3, zz * 0.26) - 0.35) * sstep(0, 1.5, s);   // lumpy, heaped snow, chunkiest on the crest
    // rolling drifts and low ridges further out (only well back from the trench), rising toward the horizon
    const X = sx * (s + HW), r = Math.hypot(X, z);
    h += sstep(40, 220, s) * (3 + 16 * sstep(300, 1500, r)) * fbm(X * 0.006, z * 0.006, 5);
    h += sstep(120, 400, s) * sstep(700, 1900, r) * 48 * Math.pow(Math.abs(fbm(X * 0.0025 + 3, z * 0.0025, 4) * 2 - 1), 0.7);
    return h * legFlat(X, z);
  }
  // non-uniform grid lines
  const zs = []; for (let z = -GROUND_SIZE / 2; z < -detailZ; z += 100) zs.push(z); for (let z = -detailZ; z <= detailZ; z += 3) zs.push(z); for (let z = detailZ + 100; z <= GROUND_SIZE / 2; z += 100) zs.push(z);
  const ss = []; for (let s = 0; s < 24; s += 1.2) ss.push(s); for (let s = 24, d = 2.5; s < GROUND_SIZE / 2 - HW; s += d, d *= 1.27) ss.push(s); ss.push(GROUND_SIZE / 2 - HW);

  function rimMesh(sx) {
    const nx = ss.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const z = zs[j], s = ss[i], x = sx * (HW + s), y = i === 0 ? 0 : rimH(s, z, sx), k = j * nx + i;
      pos.set([x, y, z], k * 3); uv.set([x / GROUND_SIZE + 0.5, z / GROUND_SIZE + 0.5], k * 2);
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (sx > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; m.castShadow = true; scene.add(m);
    stats.tris += idx.length / 3; stats.draws++;
  }
  rimMesh(-1); rimMesh(1);

  // rough walls (only bulge inward, so the flat wall behind never shows through); ledges from quantised noise
  function wallMesh(sx) {
    const dz = 1.8, rows = 12, nz = Math.round(2 * detailZ / dz) + 1, pos = new Float32Array(nz * (rows + 1) * 3), uv = new Float32Array(nz * (rows + 1) * 2), idx = [];
    for (let j = 0; j < nz; j++) for (let r = 0; r <= rows; r++) {
      const z = -detailZ + j * dz, y = -TRENCH_D + r * TRENCH_D / rows, zz = z + sx * 97;
      const ledge = Math.floor(fbm(zz * 0.03, y * 0.16 + 5) * 5) / 5;
      let d = 1.3 * fbm(zz * 0.12, y * 0.3) + 1.0 * ledge + 0.55 * vnoise(zz * 0.8, y * 0.9) - 0.5;
      d *= sstep(0, 0.8, -y) * (r === 0 ? 0.6 : 1);   // top row stays on the lip line (meets the berms), foot spreads a bit
      d = Math.min(2.2, Math.max(0, d)) * (1 - sstep(detailZ - 30, detailZ, Math.abs(z)));
      const x = sx * (HW - d), k = j * (rows + 1) + r;
      pos.set([x, y, z], k * 3); uv.set([z / GROUND_SIZE + 0.5, y / GROUND_SIZE + 0.5], k * 2);
    }
    for (let j = 0; j < nz - 1; j++) for (let r = 0; r < rows; r++) {
      const a = j * (rows + 1) + r, b = a + 1, c = a + rows + 1, d = c + 1;
      if (sx > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);   // faces into the trench
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, trenchMat); m.receiveShadow = true; m.castShadow = true; scene.add(m);
    stats.tris += idx.length / 3; stats.draws++;
  }
  wallMesh(-1); wallMesh(1);

  // broken ice blocks, lip blocks, rim boulders and floor rubble: one instanced draw
  const cg = new THREE.IcosahedronGeometry(1, 0), cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(cp, i); const k = 0.75 + 0.5 * hash(Math.round(v.x * 10) + 50, Math.round(v.y * 10 + v.z * 7) + 50); cp.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k); }
  cg.computeVertexNormals();
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0xdfe7ef, roughness: 0.62, metalness: 0.0, flatShading: true });
  const items = [];
  let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 300; i++) {             // floor rubble at the wall feet
      const z = (rnd() * 2 - 1) * detailZ, sz = 0.25 + 1.3 * rnd() ** 2.2, x = sx * (HW - 0.4 - rnd() * 3.1 - sz * 0.3);
      if (Math.abs(x) < 14.5) continue; items.push([x, -TRENCH_D + sz * 0.25, z, sz]);
    }
    for (let i = 0; i < 260; i++) {             // broken blocks along the lip, some hanging over the edge
      const z = (rnd() * 2 - 1) * detailZ, s = -0.6 + rnd() * 3.2, sz = 0.35 + 1.5 * rnd() ** 1.8, x = sx * (HW + s);
      if (legFlat(x, z) < 0.99) continue; items.push([x, (s > 0 ? rimH(s, z, sx) : 0) + sz * 0.15, z, sz]);
    }
    for (let i = 0; i < 160; i++) {             // scattered boulders on the plains
      const z = (rnd() * 2 - 1) * detailZ, s = 4 + 90 * rnd() ** 1.6, sz = 0.3 + 2.2 * rnd() ** 3, x = sx * (HW + s);
      if (legFlat(x, z) < 0.99) continue; items.push([x, rimH(s, z, sx) + sz * 0.2, z, sz]);
    }
  }
  const im = new THREE.InstancedMesh(cg, chunkMat, items.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  items.forEach(([x, y, z, s], i) => { e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28); q.setFromEuler(e); sc.set(s * (0.8 + 0.5 * rnd()), s * (0.5 + 0.4 * rnd()), s * (0.8 + 0.5 * rnd())); im.setMatrixAt(i, m4.compose(v.set(x, y, z), q, sc)); });
  im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  stats.tris += items.length * 20; stats.draws++; stats.chunks = items.length;
  return { stats, rimH };
}
