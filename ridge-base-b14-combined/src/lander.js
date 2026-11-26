/* EUROPA Ridge Base b12 - gold science lander (from Scott's two reference pictures, described by Kai's parent).
 * A boxy, chunky lander: rounded gold-foil hull ~1.6:1 wide:tall with a slightly domed roof, quilted plates, pipes and greebles,
 * thruster clusters (3 bells on pylons) on the four upper corners plus two belly nozzles, four long splayed legs with hydraulic
 * struts and dish foot pads, a big front bay with its door hinged at the top and raised like an awning, a ribbed ramp down to the
 * ice, and three silver/grey capsule pods in the warmly lit bay. Scorch marks on the ice under the thrusters and round the pads.
 * Local frame: +z = front (ramp side), y = 0 is the ice. Everything is merged per material (a handful of draw calls). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let seed = 90210; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function foilNormalTexture(N = 512) {   // crinkled gold foil: random creases -> height -> normals
  const h = new Float32Array(N * N);
  for (let k = 0; k < 900; k++) {        // creases: random straight ridges/valleys with soft profile
    const cx = rnd() * N, cy = rnd() * N, a = rnd() * Math.PI, len = 20 + rnd() * 120, w = 1.5 + rnd() * 5, amp = (rnd() - 0.5) * 2;
    const dx = Math.cos(a), dy = Math.sin(a), r = Math.ceil(len / 2 + w * 2);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const px = (Math.floor(cx + x) % N + N) % N, py = (Math.floor(cy + y) % N + N) % N;
      const along = x * dx + y * dy, across = -x * dy + y * dx;
      if (Math.abs(along) > len / 2) continue;
      h[py * N + px] += amp * Math.max(0, 1 - Math.abs(across) / w) * (1 - Math.abs(along) / (len / 2));
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const H = (xx, yy) => h[((yy + N) % N) * N + ((xx + N) % N)];
    let nx = (H(x - 1, y) - H(x + 1, y)) * 1.6, ny = (H(x, y - 1) - H(x, y + 1)) * 1.6, nz = 1; const l = Math.hypot(nx, ny, nz);
    const i = (y * N + x) * 4; img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8; return t;
}
function quiltTextures(N = 1024) {   // albedo multiply (panels, seams, brass tint, soot low down) + roughness per panel
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const r = document.createElement('canvas'); r.width = r.height = 256; const gr = r.getContext('2d');
  const cols = 6, rows = 5, pw = N / cols, ph = N / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const t = rnd(), l = 0.86 + 0.14 * rnd();
    g.fillStyle = t < 0.35 ? `rgb(${255 * l | 0},${225 * l | 0},${175 * l | 0})` : `rgb(${255 * l | 0},${248 * l | 0},${230 * l | 0})`;   // some brassier panels
    g.fillRect(i * pw, j * ph, pw, ph);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.08})`; g.fillRect(i * pw + rnd() * pw, j * ph, 2 + rnd() * 10, ph); }   // foil wrinkle streaks
    const rv = 90 + rnd() * 70; gr.fillStyle = `rgb(${rv},${rv},${rv})`; gr.fillRect(i * 256 / cols, j * 256 / rows, 256 / cols, 256 / rows);
  }
  g.strokeStyle = 'rgba(60,40,10,0.85)'; g.lineWidth = 7;
  for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * pw, 0); g.lineTo(i * pw, N); g.stroke(); }
  for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, j * ph); g.lineTo(N, j * ph); g.stroke(); }
  g.fillStyle = 'rgba(70,50,20,0.9)';   // rivets along the seams
  for (let i = 0; i <= cols; i++) for (let y = 10; y < N; y += 34) { g.beginPath(); g.arc(i * pw + 9, y, 3, 0, 7); g.fill(); }
  // soot: the lower part of each face (v small = bottom of the canvas) goes dark brown, patchy
  const sg = g.createLinearGradient(0, N, 0, N * 0.55); sg.addColorStop(0, 'rgba(25,14,6,0.75)'); sg.addColorStop(1, 'rgba(25,14,6,0)');
  g.fillStyle = sg; g.fillRect(0, N * 0.55, N, N * 0.45);
  for (let k = 0; k < 40; k++) { const x = rnd() * N, y = N * (0.75 + rnd() * 0.25), rr = 20 + rnd() * 70; const rg = g.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, 'rgba(20,10,4,0.35)'); rg.addColorStop(1, 'rgba(20,10,4,0)'); g.fillStyle = rg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const rough = new THREE.CanvasTexture(r);
  return { map, rough };
}
function scorchTexture(N = 256) {
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  for (let k = 0; k < 140; k++) {
    const a = rnd() * 6.283, d = Math.pow(rnd(), 1.4) * N * 0.36, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, rr = N * (0.05 + rnd() * 0.16) * (1 - d / (N * 0.5));
    const rg = g.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, `rgba(255,255,255,${0.10 + 0.18 * (1 - d / (N * 0.4))})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let k = 0; k < 50; k++) {   // radial blast streaks
    const a = rnd() * 6.283, l0 = N * 0.1, l1 = N * (0.3 + rnd() * 0.18);
    g.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.08})`; g.lineWidth = 2 + rnd() * 6; g.beginPath();
    g.moveTo(N / 2 + Math.cos(a) * l0, N / 2 + Math.sin(a) * l0); g.lineTo(N / 2 + Math.cos(a) * l1, N / 2 + Math.sin(a) * l1); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

export function buildLander({ envMap }) {
  const group = new THREE.Group();
  const foil = foilNormalTexture(), { map: quilt, rough } = quiltTextures();
  const foil2 = foil.clone(); foil2.repeat.set(2, 2); foil2.anisotropy = 8; foil2.needsUpdate = true;
  const M = {
    gold: new THREE.MeshPhysicalMaterial({ color: 0xb48d36, metalness: 1, roughness: 0.45, map: quilt, roughnessMap: rough, normalMap: foil, normalScale: new THREE.Vector2(0.275, 0.275), envMap, envMapIntensity: 1.05, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    plate: new THREE.MeshPhysicalMaterial({ color: 0xbe9944, metalness: 1, roughness: 0.45, normalMap: foil2, normalScale: new THREE.Vector2(0.4, 0.4), envMap, envMapIntensity: 1.12, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    brass: new THREE.MeshPhysicalMaterial({ color: 0x967036, metalness: 1, roughness: 0.45, normalMap: foil2, normalScale: new THREE.Vector2(0.25, 0.25), envMap, envMapIntensity: 0.91 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x757a81, metalness: 1, roughness: 0.45, envMap, envMapIntensity: 0.84 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x25282c, metalness: 0.85, roughness: 0.55, envMap, envMapIntensity: 0.56 }),
    nozzle: new THREE.MeshStandardMaterial({ color: 0x322a23, metalness: 0.9, roughness: 0.5, envMap, envMapIntensity: 0.63, side: THREE.DoubleSide }),
    bay: new THREE.MeshStandardMaterial({ color: 0x83796c, metalness: 0.55, roughness: 0.55, envMap, envMapIntensity: 0.35 }),
    silver: new THREE.MeshPhysicalMaterial({ color: 0xb6b9bd, metalness: 1, roughness: 0.45, envMap, envMapIntensity: 0.98, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    grey: new THREE.MeshPhysicalMaterial({ color: 0x7a8086, metalness: 0.9, roughness: 0.45, envMap, envMapIntensity: 0.77, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    window: new THREE.MeshPhysicalMaterial({ color: 0x06090d, metalness: 0.6, roughness: 0.3, envMap, envMapIntensity: 1.12, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    light: new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
  };
  const bins = {}; for (const k in M) bins[k] = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function put(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    const g = geo.clone(); g.applyMatrix4(_m); bins[mat].push(g); return g;
  }
  const box = (mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => put(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
  function rod(mat, a, b, r, seg = 10) {   // cylinder from point a to point b
    _dir.subVectors(b, a); const L = _dir.length(); const g = new THREE.CylinderGeometry(r, r, L, seg, 1);
    _q.setFromUnitVectors(_up, _dir.normalize()); _m.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m); bins[mat].push(g);
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const W = 14, H = 8.4, D = 11, YB = 4.4, R = 1.3, FD = 5.5;      // hull: 14 x 8.4 (1.67:1) x 11 m, bottom 4.4 m above the ice
  const OW = 7.6, FLOOR = YB + 1.0, OTOP = FLOOR + 4.8;              // bay opening 7.6 x 4.8 m
  /* hull: rear block + a front frame (two pillars, lintel, sill) round the bay, domed roof */
  put('gold', new RoundedBoxGeometry(W, H, D - FD, 3, R), 0, YB + H / 2, -D / 2 + (D - FD) / 2);
  const PWd = (W - OW) / 2;
  for (const sx of [-1, 1]) put('gold', new RoundedBoxGeometry(PWd, H, FD + 0.6, 3, R), sx * (OW / 2 + PWd / 2), YB + H / 2, (FD - 0.6) / 2);
  put('gold', new RoundedBoxGeometry(OW + 1.2, YB + H - OTOP, FD + 0.6, 2, 0.5), 0, (OTOP + YB + H) / 2, (FD - 0.6) / 2);
  put('gold', new RoundedBoxGeometry(OW + 1.2, FLOOR - YB, FD + 0.6, 2, 0.35), 0, (YB + FLOOR) / 2, (FD - 0.6) / 2);
  put('gold', new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, YB + H - 0.55, 0, 0, 0, 0, W / 2 - 0.5, 1.25, D / 2 - 0.5);
  // raised foil plates (quilt) on the sides, back and lintel
  const plates = (face, u0, u1, v0, v1, cw, ch) => {
    for (let u = u0; u < u1 - 0.3; u += cw) for (let v = v0; v < v1 - 0.3; v += ch) {
      if (rnd() < 0.12) continue;
      const w = Math.min(cw, u1 - u) - 0.12, h = Math.min(ch, v1 - v) - 0.12, mat = rnd() < 0.3 ? 'brass' : 'plate';
      const cu = u + w / 2 + 0.06, cv = v + h / 2 + 0.06, t = 0.05 + rnd() * 0.05;
      if (face === 'L' || face === 'R') { const sx = face === 'L' ? -1 : 1; box(mat, t, h, w, sx * (W / 2 + t / 2 - 0.01), cv, cu); }
      else if (face === 'B') box(mat, w, h, t, cu, cv, -D / 2 - t / 2 + 0.01);
      else if (face === 'F') box(mat, w, h, t, cu, cv, FD + t / 2 - 0.01);
    }
  };
  for (const f of ['L', 'R']) plates(f, -D / 2 + 1.2, D / 2 - 1.2, YB + 1.1, YB + H - 1.2, 1.55, 1.3);
  plates('B', -W / 2 + 1.2, W / 2 - 1.2, YB + 1.1, YB + H - 1.2, 1.5, 1.3);
  plates('F', -OW / 2 - 0.4, OW / 2 + 0.4, OTOP + 0.2, YB + H - 0.6, 1.4, 1.0);
  for (const sx of [-1, 1]) plates('F', sx > 0 ? OW / 2 + 0.25 : -W / 2 + 1.2, sx > 0 ? W / 2 - 1.2 : -OW / 2 - 0.25, YB + 1.1, YB + H - 1.2, 1.1, 1.3);
  // pipes + greebles along the sides and back
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.28);
    for (const [y, r, z0, z1] of [[YB + 1.0, 0.13, -4.6, 4.8], [YB + 1.35, 0.09, -4.2, 4.3], [YB + H - 1.05, 0.11, -4.6, 4.8], [YB + 3.6, 0.07, -3.0, 3.6]]) {
      rod(rnd() < 0.5 ? 'steel' : 'brass', V(x, y, z0), V(x, y, z1), r, 8);
      for (let z = z0 + 0.6; z < z1; z += 1.6) box('dark', 0.3, 0.12, 0.12, x - sx * 0.12, y, z);   // pipe clamps
    }
    for (const z of [-3.6, -1.2, 1.4, 3.8]) rod('steel', V(x + sx * 0.05, YB + 1.0, z), V(x + sx * 0.05, YB + H - 1.05, z), 0.06, 6);
    for (let k = 0; k < 9; k++) { const w = 0.3 + rnd() * 0.7, h = 0.25 + rnd() * 0.6; box(rnd() < 0.5 ? 'dark' : 'steel', 0.22, h, w, sx * (W / 2 + 0.2), YB + 1.8 + rnd() * (H - 3.6), -4 + rnd() * 8); }
    put('steel', new THREE.CapsuleGeometry(0.45, 2.2, 6, 14), sx * (W / 2 + 0.55), YB + 2.6, -2.2, Math.PI / 2, 0, 0);   // side tanks
    put('steel', new THREE.CapsuleGeometry(0.45, 2.2, 6, 14), sx * (W / 2 + 0.55), YB + 2.6, 2.4, Math.PI / 2, 0, 0);
  }
  for (let k = 0; k < 6; k++) rod(k % 2 ? 'steel' : 'brass', V(-5 + k * 2, YB + 1.0, -D / 2 - 0.25), V(-5 + k * 2, YB + H - 1.0, -D / 2 - 0.25), 0.08 + 0.04 * (k % 3), 8);
  for (let k = 0; k < 8; k++) box('dark', 0.5 + rnd() * 1.2, 0.3 + rnd() * 0.8, 0.25, -5 + rnd() * 10, YB + 1.6 + rnd() * 5, -D / 2 - 0.2);
  /* roof: equipment boxes, antennas, masts, a dish */
  const RT = YB + H + 0.4;
  for (const [w, h, d, x, z, m] of [[2.6, 1.0, 1.8, -3.6, -2.4, 'dark'], [1.8, 0.8, 1.4, 3.4, -2.0, 'brass'], [1.4, 1.3, 1.4, 0.8, -3.2, 'steel'], [2.2, 0.6, 1.2, -1.6, 1.2, 'plate'], [1.0, 0.7, 1.0, 4.4, 1.6, 'dark']])
    put(m, new RoundedBoxGeometry(w, h, d, 2, 0.12), x, RT + h / 2, z);
  rod('steel', V(-4.8, RT, 2.2), V(-4.8, RT + 3.6, 2.2), 0.06, 6); put('light', new THREE.SphereGeometry(0.12, 8, 6), -4.8, RT + 3.65, 2.2);
  rod('steel', V(5.0, RT, -3.0), V(5.0, RT + 2.6, -3.0), 0.05, 6); rod('steel', V(4.4, RT, -3.6), V(4.4, RT + 1.6, -3.6), 0.04, 6);
  rod('dark', V(2.4, RT, 0.6), V(2.4, RT + 1.8, 0.6), 0.12, 8);
  put('silver', new THREE.SphereGeometry(1.2, 24, 8, 0, Math.PI * 2, 0, 0.9), 2.4, RT + 2.3, 0.6, -2.4, 0.6, 0, 1, 0.45, 1);   // dish, tilted up toward Jupiter
  rod('steel', V(2.4, RT + 1.9, 0.6), V(2.1, RT + 2.9, 0.1), 0.03, 4);
  box('brass', 3.0, 0.08, 1.4, -0.2, RT + 1.5, -3.3, 0, 0, 0.25);    // small radiator panel on a stub
  rod('dark', V(-0.2, RT, -3.3), V(-0.2, RT + 1.4, -3.3), 0.08, 6);
  /* bay: lining, floor, ceiling lights, three pods */
  box('bay', OW, 0.12, FD, 0, FLOOR + 0.06, FD / 2);
  box('bay', OW, 0.1, FD, 0, OTOP - 0.05, FD / 2);
  for (const sx of [-1, 1]) box('bay', 0.1, OTOP - FLOOR, FD, sx * (OW / 2 - 0.05), (FLOOR + OTOP) / 2, FD / 2);
  box('bay', OW, OTOP - FLOOR, 0.1, 0, (FLOOR + OTOP) / 2, 0.05);
  for (let z = 0.6; z < FD; z += 0.9) box('dark', OW - 0.3, 0.04, 0.12, 0, FLOOR + 0.13, z);   // floor ribs
  for (const x of [-2.4, 0, 2.4]) box('light', 1.6, 0.04, 0.22, x, OTOP - 0.12, FD / 2);
  for (const sx of [-1, 1]) box('light', 0.04, 0.16, FD - 1, sx * (OW / 2 - 0.12), OTOP - 0.5, FD / 2);
  const pods = [[-2.5, 0.78, 'silver'], [0, 0.88, 'grey'], [2.5, 0.78, 'silver']];
  for (const [px, pr, pm] of pods) {
    const py = FLOOR + 0.12 + 0.3 + pr, pz = FD / 2 - 0.1;
    put(pm, new THREE.CapsuleGeometry(pr, 1.9, 8, 20), px, py, pz, Math.PI / 2, 0, 0);
    put('window', new THREE.SphereGeometry(pr * 0.82, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), px, py + pr * 0.25, pz + 1.15, Math.PI / 2 - 0.35, 0, 0, 1, 1, 0.75);   // front visor
    for (const sx of [-1, 1]) box('window', 0.03, pr * 0.42, 1.2, px + sx * pr * 0.97, py + pr * 0.18, pz - 0.15);       // side windows
    box('dark', pr * 2.1, 0.08, 0.25, px, py - pr * 0.1, pz + 0.95);                                                   // bumper band
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('dark', new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14), px + sx * (pr - 0.12), FLOOR + 0.12 + 0.3, pz + sz * 0.95, 0, 0, Math.PI / 2);
    if (pm === 'grey') { rod('steel', V(px + 0.4, py + pr * 0.8, pz - 0.8), V(px + 0.4, py + pr + 0.9, pz - 0.8), 0.03, 4); put('light', new THREE.SphereGeometry(0.06, 6, 4), px + 0.4, py + pr + 0.92, pz - 0.8); }
  }
  /* door: hinged on the top edge of the opening, raised outward like an awning (~11 deg above level) */
  const DW = OW + 0.8, DH = OTOP - FLOOR + 0.5, HINGE = V(0, OTOP + 0.15, FD + 0.12), DA = -(Math.PI / 2 + 0.2);
  const doorPt = (x, along, out) => V(x, -along, out).applyEuler(new THREE.Euler(DA, 0, 0)).add(HINGE);   // along = distance from hinge
  { const c = doorPt(0, DH / 2, 0.16); put('gold', new RoundedBoxGeometry(DW, DH, 0.32, 2, 0.12), c.x, c.y, c.z, DA, 0, 0); }
  for (let a = 0.6; a < DH; a += 0.95) { const c = doorPt(0, a, -0.05); box('steel', DW - 0.4, 0.12, 0.1, c.x, c.y, c.z, DA, 0, 0); }   // ribs on the underside
  { const c = doorPt(0, DH - 0.25, -0.05); box('light', DW - 1.2, 0.1, 0.04, c.x, c.y, c.z, DA, 0, 0); }   // light strip under the awning's lip
  for (let k = 0; k < 10; k++) { const c = doorPt(-DW / 2 + 0.6 + rnd() * (DW - 1.2), 0.5 + rnd() * (DH - 1), 0.34); box(rnd() < 0.5 ? 'plate' : 'brass', 0.8 + rnd() * 0.7, 0.7 + rnd() * 0.6, 0.05, c.x, c.y, c.z, DA, 0, 0); }
  rod('dark', HINGE.clone().add(V(-DW / 2, 0, 0)), HINGE.clone().add(V(DW / 2, 0, 0)), 0.16, 10);   // hinge barrel
  for (const sx of [-1, 1]) {   // hydraulic struts from the frame to the door's underside
    const a = V(sx * (OW / 2 + 0.35), FLOOR + 2.2, FD + 0.15), b = doorPt(sx * (DW / 2 - 0.5), DH * 0.55, -0.1), m = a.clone().lerp(b, 0.55);
    rod('dark', a, m, 0.14, 10); rod('steel', m, b, 0.08, 8);
  }
  /* ramp: wide, ribbed, from the bay floor down to the ice */
  const RL = 12, RWd = 6.8, RA = Math.asin(FLOOR / RL), run = Math.cos(RA) * RL;
  const rampPt = t => V(0, FLOOR * (1 - t), FD + run * t);
  { const c = rampPt(0.5); box('grey', RWd, 0.3, RL, c.x, c.y - 0.15, c.z, RA, 0, 0); }
  for (let t = 0.03; t < 1; t += 0.035) { const c = rampPt(t); box('steel', RWd - 0.4, 0.07, 0.12, c.x, c.y + 0.03, c.z, RA, 0, 0); }
  for (const sx of [-1, 1]) { const c = rampPt(0.5); box('brass', 0.18, 0.35, RL, sx * (RWd / 2 - 0.09), c.y + 0.02, c.z, RA, 0, 0); }
  for (const sx of [-1, 1]) { const a = rampPt(0.02), b = rampPt(0.45); rod('dark', V(sx * 2.4, a.y - 0.3, a.z), V(sx * 2.4, 0.1, b.z + 0.8), 0.1, 8); }   // ramp jacks
  /* legs: four long splayed legs, hydraulic struts, dish foot pads */
  const pads = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = V(sx * (W / 2 - 0.4), YB + 1.4, sz * (D / 2 - 1.3)), foot = V(sx * (W / 2 + 4.2), 0.55, sz * (D / 2 + 3.2));
    rod('brass', top, foot, 0.3, 12);
    rod('plate', top, top.clone().lerp(foot, 0.32), 0.42, 12);                                       // foil sleeve on the upper leg
    const h0 = V(sx * (W / 2 - 2.6), YB + 0.1, sz * (D / 2 - 3.0)), k = top.clone().lerp(foot, 0.58), hm = h0.clone().lerp(k, 0.52);
    rod('dark', h0, hm, 0.2, 10); rod('steel', hm, k, 0.11, 8);                                      // hydraulic strut: housing + piston
    put('dark', new THREE.SphereGeometry(0.28, 10, 8), k.x, k.y, k.z);
    const side = V(sx * (W / 2 - 0.4), YB + 0.6, sz * (D / 2 - 3.6)); rod('steel', side, top.clone().lerp(foot, 0.4), 0.09, 6);   // side brace
    put('dark', new THREE.SphereGeometry(0.4, 12, 8), foot.x, foot.y + 0.05, foot.z);
    put('steel', new THREE.LatheGeometry([V(0.05, 0.0, 0), V(1.35, 0.06, 0), V(1.45, 0.2, 0), V(1.3, 0.32, 0), V(0.5, 0.42, 0), V(0.3, 0.6, 0)], 24), foot.x, 0.02, foot.z);
    pads.push([foot.x, foot.z]);
  }
  /* thrusters: a cluster of three bells on a pylon at each upper corner, two big bells under the belly */
  const bell = (s) => new THREE.LatheGeometry([V(0.2 * s, 0.75 * s, 0), V(0.24 * s, 0.4 * s, 0), V(0.3 * s, 0.1 * s, 0), V(0.42 * s, -0.25 * s, 0), V(0.56 * s, -0.6 * s, 0), V(0.68 * s, -0.95 * s, 0), V(0.64 * s, -0.95 * s, 0), V(0.52 * s, -0.6 * s, 0), V(0.38 * s, -0.25 * s, 0), V(0.18 * s, 0.1 * s, 0)], 22);
  const jets = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const C = V(sx * (W / 2 + 1.5), YB + H - 1.9, sz * (D / 2 - 1.2));
    rod('dark', V(sx * (W / 2 - 0.4), C.y + 0.3, C.z), V(C.x, C.y + 0.3, C.z), 0.22, 8);                   // pylon
    put('brass', new RoundedBoxGeometry(1.3, 0.7, 1.3, 2, 0.12), C.x, C.y + 0.45, C.z);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094 + 0.5, ox = Math.cos(a) * 0.42, oz = Math.sin(a) * 0.42;
      put('nozzle', bell(0.75), C.x + ox, C.y - 0.35, C.z + oz, -sz * 0.18, 0, sx * 0.3);
    }
    jets.push([C.x + sx * 1.2, C.z]);
  }
  for (const sx of [-1, 1]) { put('nozzle', bell(1.3), sx * 3.0, YB - 0.6, -1.6); put('dark', new THREE.CylinderGeometry(0.5, 0.6, 0.5, 12), sx * 3.0, YB + 0.1, -1.6); }
  /* merge per material */
  let tris = 0, draws = 0;
  for (const k in bins) {
    if (!bins[k].length) continue;
    const merged = mergeGeometries(bins[k].map(g => g.index ? g.toNonIndexed() : g), false);
    const mesh = new THREE.Mesh(merged, M[k]); mesh.castShadow = k !== 'light'; mesh.receiveShadow = k !== 'light'; group.add(mesh);
    tris += merged.attributes.position.count / 3; draws++;
  }
  /* warm bay light (+ a weaker fill under the awning) */
  const bayLight = new THREE.PointLight(0xffb066, 38, 13, 1.5); bayLight.position.set(0, OTOP - 0.8, FD * 0.55); group.add(bayLight);
  /* scorch marks on the ice: under each thruster cluster, under the belly bells, round each pad; one faint wide blast ring */
  const sTex = scorchTexture(), sGeos = [];
  const blot = (x, z, r, a = rnd() * 6.28) => { const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); g.rotateY(a); g.translate(x, 0, z); sGeos.push(g); };
  blot(0, -0.5, 13); blot(0, -1.6, 7.5);
  for (const sx of [-1, 1]) blot(sx * 3.0, -1.6, 4.2);
  for (const [x, z] of jets) { blot(x, z, 4.5); blot(x * 1.15, z * 1.1, 3.2); }
  for (const [x, z] of pads) blot(x, z, 3.0);
  const scorch = new THREE.Mesh(mergeGeometries(sGeos, false), new THREE.MeshBasicMaterial({ color: 0x140d07, alphaMap: sTex, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  scorch.position.y = 0.06; scorch.renderOrder = 1; group.add(scorch);
  tris += sGeos.length * 2; draws++;
  return { group, tris: Math.round(tris), draws, rampFoot: FD + run, bayLight, hullBottom: YB };
}
