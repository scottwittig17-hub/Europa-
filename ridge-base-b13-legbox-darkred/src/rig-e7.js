/* EUROPA ICE MINING RIG E-7 — procedural model from Scott's five reference views (b3).
 * Local frame: +x = front (boom / cutter wheel), y = up from the tread soles, z = across (lettering on both long sides).
 * Size: treads 24 m long x 14.2 m across x 4.4 m tall; decks 27.6 x 17.2 m; cab roof 14.4 m; masts top out at 20.6 m;
 * boom reaches to x = 29 m (cutter wheel 6.7 m across the teeth). Everything is merged per material (~8 draw calls). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];
class Bucket {
  constructor() { this.g = []; }
  add(geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups(); if (m) g.applyMatrix4(m); this.g.push(g); geo.dispose();
  }
  merge() { return mergeGeometries(this.g, false); }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
// axis-aligned box by extents
const bx = (b, x0, x1, y0, y1, z0, z1) => b.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), _m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
// box centred at p, rotated about z by a
const bxz = (b, w, h, d, x, y, z, a) => b.add(new THREE.BoxGeometry(w, h, d), _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a), _one));
// beam from a to c (length along x), w across z, h up
function beam(b, a, c, w, h) {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), d = C.clone().sub(A), L = d.length();
  b.add(new THREE.BoxGeometry(L, h, w), _m.compose(A.add(C).multiplyScalar(0.5), _q.setFromUnitVectors(X, d.normalize()), _one));
}
function cyl(b, a, c, r, seg = 10, r2 = r) {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), d = C.clone().sub(A), L = d.length();
  b.add(new THREE.CylinderGeometry(r2, r, L, seg), _m.compose(A.add(C).multiplyScalar(0.5), _q.setFromUnitVectors(Y, d.normalize()), _one));
}
const cylZ = (b, x, y, z, r, len, seg = 16) => cyl(b, [x, y, z - len / 2], [x, y, z + len / 2], r, seg);
// box-projected UVs so the panel texture keeps a steady metre scale on every face
function boxUV(geo, s) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay > ax && ay > az) uv.setXY(i, x * s, z * s); else if (ax > az) uv.setXY(i, z * s, y * s); else uv.setXY(i, x * s, y * s);
  }
  uv.needsUpdate = true;
}

/* ---------- textures */
function panelTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#5a6068'; g.fillRect(0, 0, N, N);
  // plates: rows of random-width panels, each a slightly different shade
  for (let y = 0; y < N;) {
    const h = [64, 128, 128, 192][rnd() * 4 | 0]; let x = 0;
    while (x < N) {
      const w = Math.min(N - x, [64, 128, 192, 256][rnd() * 4 | 0]); const v = 78 + rnd() * 26 | 0;
      g.fillStyle = `rgb(${v},${v + 4},${v + 10})`; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 2, y + 2, w - 2, 1);
      g.fillStyle = 'rgba(20,20,24,0.6)';
      for (let k = 10; k < w - 4; k += 22) { g.fillRect(x + k, y + 6, 2, 2); g.fillRect(x + k, y + h - 8, 2, 2); }
      x += w;
    }
    y += h;
  }
  for (let i = 0; i < 90; i++) {   // grime streaks running down
    const x = rnd() * N, y = rnd() * N, l = 40 + rnd() * 160;
    const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(20,16,12,0.22)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 6, l);
  }
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(150,90,40,${rnd() * 0.18})`; g.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 5, 2 + rnd() * 4); }   // rust specks
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function paneTexture() {
  const W = 128, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ffcf86'); gr.addColorStop(0.55, '#f0a24a'); gr.addColorStop(1, '#8a4c1c');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(60,30,10,0.45)'; g.fillRect(18, 54, 26, 74); g.fillRect(80, 70, 34, 58);   // shapes inside the room
  g.fillStyle = 'rgba(255,240,200,0.7)'; g.fillRect(10, 6, 108, 5);                                // ceiling strip light
  g.fillStyle = '#16181b'; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8); g.fillRect(0, 0, 8, H); g.fillRect(W - 8, 0, 8, H); g.fillRect(62, 0, 4, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function letterTexture() {
  const W = 1024, H = 640, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#3e434a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
  // logo: ringed circle
  g.strokeStyle = '#d8dde2'; g.lineWidth = 10; g.beginPath(); g.arc(150, 300, 92, 0, 7); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.arc(150, 300, 58, 0, 7); g.stroke();
  g.beginPath(); g.ellipse(150, 300, 120, 30, -0.35, 0, 7); g.stroke();
  g.fillStyle = '#dfe3e8'; g.font = 'bold 92px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle';
  g.fillText('EUROPA ICE', 290, 210); g.fillText('MINING', 290, 315); g.font = 'bold 120px Arial, Helvetica, sans-serif'; g.fillText('RIG E-7', 290, 450);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,16,12,${Math.random() * 0.15})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 30 + Math.random() * 120); }
  // hazard stripe along the bottom
  for (let x = -40; x < W; x += 60) { g.fillStyle = '#c8962e'; g.beginPath(); g.moveTo(x, H - 8); g.lineTo(x + 30, H - 8); g.lineTo(x + 60, H - 48); g.lineTo(x + 30, H - 48); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* ---------- the rig */
export function buildRigE7({ envMap = null, envI = 0.6 } = {}) {
  const hull = new Bucket(), track = new Bucket(), rail = new Bucket(), pane = new Bucket(), lamp = new Bucket(), wheelB = new Bucket();
  const group = new THREE.Group(); group.name = 'rig-e7';

  /* crawlers: 4 tracks (front + rear on each side) */
  const TL = 11.2, TH = 4.4, TW = 3.4, TR = TH / 2 - 0.2, TA = TL / 2 - TH / 2, YC = TH / 2;
  // b5: links, sprockets/idlers and road-wheel caps are instanced so they can roll with the crawl (see roll() below)
  const P_LOOP = 4 * TA + 2 * Math.PI * TR, N_LINK = Math.round(P_LOOP / 0.62);
  const crawlers = [], bigWheels = [], smallWheels = [];
  function loopPose(s) {          // position + tangent angle on the stadium loop (s in metres, bottom run heads +x)
    s = ((s % P_LOOP) + P_LOOP) % P_LOOP;
    if (s < 2 * TA) return [-TA + s, YC - TR, 0];
    if ((s -= 2 * TA) < Math.PI * TR) { const t = -Math.PI / 2 + s / TR; return [TA + Math.cos(t) * TR, YC + Math.sin(t) * TR, t + Math.PI / 2]; }
    if ((s -= Math.PI * TR) < 2 * TA) return [TA - s, YC + TR, Math.PI];
    s -= 2 * TA; const t = Math.PI / 2 + s / TR; return [-TA + Math.cos(t) * TR, YC + Math.sin(t) * TR, t + Math.PI / 2];
  }
  function crawler(cx, cz) {
    crawlers.push([cx, cz]);
    bx(hull, cx - TA - 0.3, cx + TA + 0.3, 0.75, 3.65, cz - TW / 2 + 0.15, cz + TW / 2 - 0.15);   // track frame
    for (const ex of [-TA, TA]) bigWheels.push([cx + ex, YC, cz]);
    const oz = cz > 0 ? cz + TW / 2 - 0.15 : cz - TW / 2 + 0.15, sg = Math.sign(cz);
    for (const px of [-2.4, 0, 2.4]) bx(hull, cx + px - 1.0, cx + px + 1.0, 1.1, 3.2, Math.min(oz, oz + sg * 0.22), Math.max(oz, oz + sg * 0.22));   // side armour plates
    for (const px of [-1.2, 1.2]) smallWheels.push([cx + px, 0.95, oz + sg * 0.1]);                                                           // road wheel caps
    bx(lamp, cx - 0.9, cx - 0.5, 2.6, 2.85, oz + sg * 0.22 - 0.06, oz + sg * 0.22 + 0.06);                                                     // small lamp on the frame
    bx(hull, cx - 2.2, cx + 2.2, 4.2, 5.7, cz - 1.3, cz + 1.3);                                                                                 // mount up to the chassis
  }
  for (const cx of [-6.0, 6.0]) for (const cz of [-5.4, 5.4]) crawler(cx, cz);

  /* railings: posts + top and mid rails */
  function railSeg(ax, az, cx2, cz2, y, h = 1.1) {
    const L = Math.hypot(cx2 - ax, cz2 - az), n = Math.max(1, Math.round(L / 1.7));
    beam(rail, [ax, y + h, az], [cx2, y + h, cz2], 0.08, 0.08); beam(rail, [ax, y + h * 0.5, az], [cx2, y + h * 0.5, cz2], 0.05, 0.05);
    for (let i = 0; i <= n; i++) { const t = i / n; bx(rail, ax + (cx2 - ax) * t - 0.04, ax + (cx2 - ax) * t + 0.04, y, y + h, az + (cz2 - az) * t - 0.04, az + (cz2 - az) * t + 0.04); }
  }
  const railLoop = (x0, x1, z0, z1, y, h) => { railSeg(x0, z0, x1, z0, y, h); railSeg(x1, z0, x1, z1, y, h); railSeg(x1, z1, x0, z1, y, h); railSeg(x0, z1, x0, z0, y, h); };
  function stairs(x0, y0, x1, y1, z, w = 1.0) {
    const n = Math.max(3, Math.round((y1 - y0) / 0.26));
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; bx(hull, x0 + (x1 - x0) * t - 0.2, x0 + (x1 - x0) * t + 0.2, y0 + (y1 - y0) * t - 0.04, y0 + (y1 - y0) * t + 0.04, z - w / 2, z + w / 2); }
    for (const s of [-1, 1]) {
      beam(rail, [x0, y0, z + s * w / 2], [x1, y1, z + s * w / 2], 0.08, 0.22);
      beam(rail, [x0, y0 + 1.0, z + s * w / 2], [x1, y1 + 1.0, z + s * w / 2], 0.07, 0.07);
      for (const t of [0, 0.5, 1]) bx(rail, x0 + (x1 - x0) * t - 0.03, x0 + (x1 - x0) * t + 0.03, y0 + (y1 - y0) * t, y0 + (y1 - y0) * t + 1.0, z + s * w / 2 - 0.03, z + s * w / 2 + 0.03);
    }
  }
  const panes = (x0, x1, step, w, y0, y1, z) => { for (let x = x0; x + w <= x1 + 0.01; x += step) bx(pane, x, x + w, y0, y1, z - 0.05, z + 0.05); };

  /* chassis + lower deck */
  bx(hull, -10.5, 10.5, 4.5, 6.3, -3.6, 3.6);
  bx(hull, -12.4, 12.0, 5.6, 6.3, -7.4, 7.4);
  bx(hull, -13.6, 12.6, 6.3, 6.65, -8.2, 8.2);
  for (let x = -12; x <= 12; x += 3) bx(hull, x - 0.2, x + 0.2, 5.85, 6.3, -8.2, 8.2);
  railLoop(-13.6, 12.6, -8.15, 8.15, 6.65, 1.1);
  for (const s of [-1, 1]) bx(lamp, -11, 11, 6.24, 6.3, s * 8.1 - 0.05, s * 8.1 + 0.05);    // thin amber deck-edge strip
  // rear module with the lit bay and the two big cable drums
  bx(hull, -13.0, -0.5, 6.65, 9.85, -6.8, 6.8);
  for (const s of [-1, 1]) { panes(-9.6, -2.2, 1.25, 1.05, 7.35, 8.75, s * 6.82); bx(hull, -10, -1.8, 8.85, 9.05, s * 6.8 - 0.15, s * 6.8 + 0.15); }
  for (const zc of [-3.4, 3.4]) {
    cyl(track, [-14.3, 8.25, zc], [-13.0, 8.25, zc], 1.55, 24);
    cyl(hull, [-14.45, 8.25, zc], [-14.15, 8.25, zc], 1.68, 24);
    cyl(hull, [-14.6, 8.25, zc], [-14.3, 8.25, zc], 0.45, 10);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; bx(hull, -14.52, -14.42, 8.25 + Math.sin(a) * 0.8 - 0.09, 8.25 + Math.sin(a) * 0.8 + 0.09, zc + Math.cos(a) * 0.8 - 0.09, zc + Math.cos(a) * 0.8 + 0.09); beam(hull, [-14.47, 8.25, zc], [-14.47, 8.25 + Math.sin(a) * 1.5, zc + Math.cos(a) * 1.5], 0.12, 0.12); }
  }
  // front machinery bay (open sides, lit back wall, tanks and pumps)
  for (const x of [0, 3, 6, 9]) for (const z of [-6.6, 6.6]) bx(hull, x - 0.25, x + 0.25, 6.65, 9.85, z - 0.25, z + 0.25);
  bx(pane, 0.6, 8.6, 6.7, 9.6, -0.35, 0.35);
  bx(hull, 0.5, 4, 6.65, 9.0, -5, -1.2); bx(hull, 4.6, 8.4, 6.65, 8.2, 1.2, 5.6); bx(hull, 5.2, 8.6, 6.65, 9.2, -5.6, -2.4);
  cyl(hull, [0.8, 7.7, 3.5], [4.2, 7.7, 3.5], 0.9, 14); cyl(hull, [1.0, 8.9, -5.9], [8.6, 8.9, -5.9], 0.22, 8); cyl(hull, [1.0, 8.9, 5.9], [8.6, 8.9, 5.9], 0.22, 8);
  bx(lamp, 0.8, 8.4, 9.72, 9.8, -5, -4.6); bx(lamp, 0.8, 8.4, 9.72, 9.8, 4.6, 5);
  // boom mount block at the front
  bx(hull, 9.0, 12.4, 6.3, 10.0, -2.3, 2.3);

  /* mid deck */
  bx(hull, -14.2, 13.4, 9.85, 10.25, -8.6, 8.6);
  railLoop(-14.2, 13.4, -8.55, 8.55, 10.25, 1.1);
  for (let x = -13.8; x <= 13.2; x += 3.37) for (const s of [-1, 1]) {
    bx(hull, x - 0.15, x + 0.15, 6.65, 9.85, s * 8.35 - 0.15, s * 8.35 + 0.15);
    bx(lamp, x + 1.3, x + 1.75, 9.72, 9.82, s * 8.25 - 0.15, s * 8.25 + 0.15);
  }
  stairs(-7.6, 6.65, -3.2, 9.85, 7.5); stairs(4.2, 6.65, 8.6, 9.85, -7.5);
  stairs(1.3, 0.3, -3.6, 6.3, 8.0); stairs(-3.6, 0.3, 1.3, 6.3, -8.0);

  /* upper hull (lettered) */
  bx(hull, -12.6, 2.6, 10.25, 14.8, -7.0, 7.0);
  bx(hull, -12.75, 2.75, 10.25, 10.7, -7.12, 7.12);
  bx(hull, -12.75, 2.75, 14.6, 14.85, -7.12, 7.12);
  for (const s of [-1, 1]) {
    for (const x of [-11.9, -8.2, -4.6]) bx(hull, x - 0.12, x + 0.12, 10.7, 14.6, s * 7.0 - 0.12, s * 7.0 + 0.12);   // ribs
    bx(track, -12.3, -11.0, 11.3, 13.8, s * 7.0 - 0.06, s * 7.0 + 0.06);                                          // vent grille
    for (let y = 11.5; y < 13.7; y += 0.3) bx(hull, -12.3, -11.0, y, y + 0.08, s * 7.0 - 0.1, s * 7.0 + 0.1);
    panes(-10.6, -8.5, 1.15, 0.95, 12.0, 13.1, s * 7.02); panes(-7.4, -5.3, 1.15, 0.95, 12.0, 13.1, s * 7.02);
    bx(hull, -4.0, -2.9, 10.7, 12.9, s * 7.0 - 0.1, s * 7.0 + 0.1);                                                // door
    bx(lamp, -4.2, -2.7, 13.05, 13.15, s * 7.0 - 0.12, s * 7.0 + 0.12);
  }
  for (const z of [-5.1, -3.9, 3.0, 4.2]) bx(pane, -12.66, -12.58, 12.0, 13.1, z, z + 0.95);
  // control cab: rounded roof, slanted chin, wrap-round window band
  {
    const sh = new THREE.Shape();
    sh.moveTo(2.6, 10.4); sh.lineTo(11.7, 10.4); sh.lineTo(12.8, 11.5); sh.lineTo(12.8, 13.3);
    sh.quadraticCurveTo(12.8, 14.4, 11.6, 14.4); sh.lineTo(2.6, 14.4); sh.lineTo(2.6, 10.4);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 12.6, bevelEnabled: false, curveSegments: 6 });
    hull.add(g, _m.makeTranslation(0, 0, -6.3));
    for (const s of [-1, 1]) panes(3.3, 11.6, 1.15, 1.0, 11.9, 13.3, s * 6.32);
    for (let z = -5.5; z + 1.0 <= 5.51; z += 1.1) bx(pane, 12.78, 12.86, 11.8, 13.25, z, z + 1.0);
    bx(hull, 2.6, 13.05, 13.35, 13.55, -6.5, 6.5);   // window eyebrow
    bx(hull, 2.6, 13.0, 11.55, 11.75, -6.45, 6.45);   // belt under the windows
    railLoop(2.8, 12.0, -6.25, 6.25, 14.4, 0.9);
    bx(hull, 4.0, 6.4, 14.4, 15.2, -2.0, 1.2); bx(hull, 8.5, 10.0, 14.4, 15.0, 2.0, 3.6);
    for (const z of [-4, 4]) cyl(hull, [8.2, 14.4, z], [8.2, 16.8, z], 0.05, 6);
    cyl(hull, [5.0, 15.0, -4.0], [5.3, 15.4, -4.0], 0.12, 12, 0.62);   // small dish
    cyl(hull, [5.0, 14.4, -4.0], [5.0, 15.0, -4.0], 0.08, 6);
    for (const s of [-1, 1]) bx(lamp, 12.2, 12.6, 14.25, 14.4, s * 5.6 - 0.2, s * 5.6 + 0.2);   // headlights
  }
  // roof: units, tanks, two equipment towers, masts, pipes
  const R0 = 14.85;
  railLoop(-12.6, 2.6, -7.0, 7.0, R0, 1.0);
  for (const [x0, x1, h, z0, z1] of [[-11.8, -9.2, 1.3, -5.6, -2.6], [-11.6, -9.4, 1.0, 1.0, 4.5], [-7.2, -3.8, 1.6, 1.4, 5.2], [-3.2, -0.6, 1.1, -5.2, -2.0], [-6.5, -4.2, 0.9, -6.2, -4.2]]) {
    bx(hull, x0, x1, R0, R0 + h, z0, z1); bx(hull, x0 + 0.3, x1 - 0.3, R0 + h, R0 + h + 0.15, z0 + 0.3, z1 - 0.3);
  }
  for (const [x, z] of [[-1.9, 3.6], [-1.9, 5.6]]) { cyl(hull, [x, R0, z], [x, R0 + 1.4, z], 0.8, 14); hull.add(new THREE.SphereGeometry(0.8, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), _m.makeTranslation(x, R0 + 1.4, z)); }
  function tower(x, z, top) {
    bx(hull, x - 1.2, x + 1.2, R0, R0 + 1.5, z - 1.2, z + 1.2); bx(hull, x - 0.8, x + 0.8, R0 + 1.5, R0 + 2.9, z - 0.8, z + 0.8);
    bx(hull, x - 0.5, x + 0.5, R0 + 2.9, R0 + 3.9, z - 0.5, z + 0.5);
    railLoop(x - 1.2, x + 1.2, z - 1.2, z + 1.2, R0 + 1.5, 0.7);
    cyl(hull, [x, R0 + 3.9, z], [x, top, z], 0.08, 6); cyl(hull, [x + 0.4, R0 + 3.9, z + 0.3], [x + 0.4, top - 1.6, z + 0.3], 0.05, 6);
    for (const y of [top - 2.2, top - 1.0]) bx(hull, x - 0.6, x + 0.6, y, y + 0.06, z - 0.03, z + 0.03);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(hull, [x + a * 0.5, R0 + 3.9, z + b * 0.5], [x + a * 0.5, R0 + 4.6, z + b * 0.5], 0.06, 5);
    bx(lamp, x - 0.08, x + 0.08, top - 0.12, top, z - 0.08, z + 0.08);   // beacon
  }
  tower(-8.4, -1.0, 20.6); tower(0.4, 2.4, 20.0);
  cyl(hull, [-4.6, R0 + 1.1, -3.0], [-4.6, 19.2, -3.0], 0.06, 6);
  for (const s of [-1, 1]) {
    cyl(hull, [-12.2, R0 + 0.45, s * 6.3], [2.2, R0 + 0.45, s * 6.3], 0.24, 8);
    cyl(hull, [-12.85, 10.6, s * 5.8], [-12.85, R0 + 0.45, s * 5.8], 0.22, 8);
    cyl(hull, [2.3, 10.6, s * 6.75], [2.3, R0 + 0.45, s * 6.75], 0.2, 8);
  }
  for (const [x, z] of [[-10.5, 0], [-6, -6], [-2, 0.5], [1.6, -5.6], [-12, 6.3]]) bx(lamp, x - 0.18, x + 0.18, R0, R0 + 0.14, z - 0.18, z + 0.18);
  stairs(-11.4, 10.25, -6.6, R0, 7.75);

  /* boom: pivot, two arm sections, rams, struts, pipes */
  const P0 = [11.2, 8.2], P1 = [19.0, 9.6], P2 = [25.6, 3.3], WZ = -1.4;
  cylZ(hull, P0[0], P0[1], 0, 0.9, 3.2, 14);
  beam(hull, [P0[0], P0[1], 0], [P1[0], P1[1], 0], 1.9, 1.7);
  beam(hull, [P0[0] + 0.5, P0[1] + 0.95, 0], [P1[0] - 0.5, P1[1] + 0.85, 0], 1.3, 0.25);
  cylZ(hull, P1[0], P1[1], 0, 1.05, 2.5, 14);
  beam(hull, [P1[0], P1[1], 0], [P2[0], P2[1], 0], 1.5, 1.35);
  beam(hull, [17.8, 9.6, 0], [18.6, 11.8, 0], 1.3, 1.0);
  for (const s of [-1, 1]) {
    cyl(hull, [9.6, 10.6, s * 0.75], [14.6, 11.0, s * 0.75], 0.34, 10); cyl(rail, [14.6, 11.0, s * 0.75], [17.9, 11.4, s * 0.75], 0.16, 8);
    cyl(hull, [18.4, 11.6, s * 0.55], [21.4, 8.4, s * 0.55], 0.28, 10); cyl(rail, [21.4, 8.4, s * 0.55], [23.4, 6.2, s * 0.55], 0.13, 8);
    cyl(hull, [23.3, 7.9, s * 0.45], [23.9, 5.2, s * 0.45], 0.3, 10);
    cyl(hull, [P0[0] + 0.3, P0[1] + 1.0, s * 1.05], [P1[0] - 0.3, P1[1] + 0.9, s * 1.05], 0.1, 6);
    cyl(hull, [P1[0] + 0.3, P1[1] + 0.85, s * 0.85], [P2[0] - 0.8, P2[1] + 0.95, s * 0.85], 0.09, 6);
  }
  cyl(hull, [10.2, 5.8, 0], [17.2, 8.7, 0], 0.45, 10);
  bx(hull, P2[0] - 1.0, P2[0] + 1.0, P2[1] - 1.0, P2[1] + 1.0, -0.6, 0.7);           // wheel drive housing
  cylZ(hull, P2[0], P2[1], -0.3, 0.7, 2.6, 12);
  // small idler gear down by the wheel (side view)
  cylZ(track, 22.0, 1.9, 0.9, 1.1, 0.55, 18);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; bxz(track, 0.28, 0.4, 0.5, 22.0 + Math.cos(a) * 1.2, 1.9 + Math.sin(a) * 1.2, 0.9, a + Math.PI / 2); }
  beam(hull, [22.0, 1.9, 0.6], [P2[0] - 0.6, P2[1] - 0.5, 0.6], 0.3, 0.6);

  /* cutter wheel (own mesh, turns) */
  {
    cylZ(wheelB, 0, 0, 0, 2.6, 2.0, 28);
    cylZ(wheelB, 0, 0, 0, 3.0, 1.6, 36);
    cylZ(wheelB, 0, 0, 0, 0.9, 2.6, 14);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; for (const z of [-0.85, 0.85]) bxz(wheelB, 2.1, 0.3, 0.2, Math.cos(a) * 1.9, Math.sin(a) * 1.9, z, a); }
    for (let k = 0; k < 12; k++) {   // buckets with teeth on the lip
      const a = k / 12 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      bxz(wheelB, 1.15, 0.75, 1.9, c * 3.25, s * 3.25, 0, a + Math.PI / 2);
      for (const z of [-0.65, 0, 0.65]) { const a2 = a + 0.2; bxz(wheelB, 0.22, 0.62, 0.26, Math.cos(a2) * 3.55, Math.sin(a2) * 3.55, z, a2 + 0.25); }
    }
    for (let k = 0; k < 24; k++) { const a = (k + 0.5) / 24 * Math.PI * 2; for (const z of [-0.95, 0.95]) bxz(wheelB, 0.2, 0.45, 0.22, Math.cos(a) * 3.2, Math.sin(a) * 3.2, z, a); }
  }

  /* materials + meshes */
  const panelMap = panelTexture();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, map: panelMap, metalness: 0.55, roughness: 0.52, envMap, envMapIntensity: envI });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x34383d, metalness: 0.6, roughness: 0.75, envMap, envMapIntensity: envI * 0.6 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc28d36, metalness: 0.8, roughness: 0.38, envMap, envMapIntensity: envI * 1.2, emissive: 0x2a1a06 });
  const paneMat = new THREE.MeshBasicMaterial({ map: paneTexture(), toneMapped: false });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  const textMat = new THREE.MeshStandardMaterial({ map: letterTexture(), metalness: 0.55, roughness: 0.5, envMap, envMapIntensity: envI, emissive: 0x161616 });
  const mats = [hullMat, trackMat, railMat, paneMat, lampMat, textMat];
  let tris = 0;
  const mk = (b, mat, parent = group, uv = 0) => {
    const g = b.merge(); if (uv) boxUV(g, uv); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = mat !== paneMat && mat !== lampMat; m.receiveShadow = true; parent.add(m);
    tris += g.attributes.position.count / 3; return m;
  };
  mk(hull, hullMat, group, 0.33); mk(track, trackMat); mk(rail, railMat); mk(pane, paneMat); mk(lamp, lampMat);
  /* b5: rolling running gear (3 instanced draws) */
  const linkB = new Bucket(); bx(linkB, -0.28, 0.28, -0.18, 0.18, -TW / 2, TW / 2); bx(linkB, -0.085, 0.085, -0.36, -0.16, -TW * 0.48, TW * 0.48);
  const bigB = new Bucket(); cylZ(bigB, 0, 0, 0, 1.72, TW - 0.3, 18); cylZ(bigB, 0, 0, 0, 0.75, TW + 0.25, 12);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; for (const z of [-1, 1]) bxz(bigB, 0.62, 0.14, 0.08, Math.cos(a) * 0.38, Math.sin(a) * 0.38, z * (TW + 0.33) / 2, a); }
  const smB = new Bucket(); cylZ(smB, 0, 0, 0, 0.42, 0.3, 10);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; for (const z of [-1, 1]) bxz(smB, 0.5, 0.1, 0.06, Math.cos(a) * 0.2, Math.sin(a) * 0.2, z * 0.18, a); }
  const mkI = (b, count) => { const g = b.merge(); const m = new THREE.InstancedMesh(g, trackMat, count); m.castShadow = m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); tris += g.attributes.position.count / 3 * count; return m; };
  const linksI = mkI(linkB, N_LINK * crawlers.length), bigI = mkI(bigB, bigWheels.length), smI = mkI(smB, smallWheels.length);
  const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rv = new THREE.Vector3(), ZA = new THREE.Vector3(0, 0, 1);
  let travelled = 0;
  function roll(d) {               // d = metres the rig has crawled forward (+x)
    travelled += d;
    let k = 0;
    for (const [cx, cz] of crawlers) for (let i = 0; i < N_LINK; i++) {
      const [x, y, a] = loopPose(i * P_LOOP / N_LINK - travelled);   // links run backwards relative to the hull: the bottom run stays put on the ice
      linksI.setMatrixAt(k++, _rm.compose(_rv.set(cx + x, y, cz), _rq.setFromAxisAngle(ZA, a), _one));
    }
    bigWheels.forEach(([x, y, z], i) => bigI.setMatrixAt(i, _rm.compose(_rv.set(x, y, z), _rq.setFromAxisAngle(ZA, -travelled / TR), _one)));   // sprocket pitch radius = loop radius
    smallWheels.forEach(([x, y, z], i) => smI.setMatrixAt(i, _rm.compose(_rv.set(x, y, z), _rq.setFromAxisAngle(ZA, -travelled / 0.42), _one)));
    linksI.instanceMatrix.needsUpdate = bigI.instanceMatrix.needsUpdate = smI.instanceMatrix.needsUpdate = true;
  }
  roll(0);
  for (const im of [linksI, bigI, smI]) im.computeBoundingSphere();
  for (const s of [-1, 1]) {   // EUROPA ICE MINING RIG E-7 lettering, both long sides
    const t = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.0), textMat);
    t.position.set(-0.2, 12.55, s * 7.03); t.rotation.y = s > 0 ? 0 : Math.PI; group.add(t); tris += 2;
  }
  const wheel = new THREE.Group(); wheel.position.set(P2[0], P2[1], WZ); group.add(wheel);
  mk(wheelB, hullMat, wheel, 0.33);

  /* ice spray off the front of the wheel (slow ballistic flakes, Europa gravity) */
  const NP = 420, seed = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
  pg.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const sprayMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uScale: { value: 600 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 seed; uniform float uTime, uScale; varying float vA;
      void main(){
        float t = fract(uTime / 3.2 + seed.x); float T = t * 3.2;
        vec3 o = vec3(${(P2[0] + 2.4).toFixed(2)} + seed.y * 1.4, 0.2 + seed.z * 0.8, ${WZ.toFixed(2)} + (seed.w - 0.5) * 2.2);
        vec3 v = vec3(0.6 + seed.z * 1.8, 1.6 + seed.y * 2.6, (seed.w - 0.5) * 2.0);
        vec3 p = o + v * T + vec3(0.0, -0.65 * T * T, 0.0); p.y = max(p.y, 0.05);
        vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uScale * (0.06 + 0.1 * seed.x) / -mv.z, 1.0, 24.0);
      }`,
    fragmentShader: `uniform float uFade; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(0.75, 0.82, 0.9) * vA * uFade * (1.0 - 2.0 * r) * 0.55, 1.0); }`
  });
  const spray = new THREE.Points(pg, sprayMat); spray.frustumCulled = false; group.add(spray);

  /* soft contact shadow under the treads (for when the sun's shadow map does not reach) */
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d');
    g.filter = 'blur(10px)'; g.fillStyle = 'rgba(0,0,0,0.75)';
    for (const [x, y] of [[66, 50], [146, 50], [66, 142], [146, 142]]) g.fillRect(x - 36, y - 18, 72, 36);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(30, 40, 176, 112);
    const t = new THREE.CanvasTexture(c);
    const sm = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: 0x000000, alphaMap: t, polygonOffset: true, polygonOffsetFactor: -4 });
    // alpha = canvas alpha: use the texture's alpha channel directly
    sm.alphaMap = null; sm.color.set(0xffffff);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(34, 25.5), sm); m.rotation.x = -Math.PI / 2; m.position.set(-2.0, 0.04, 0); m.renderOrder = 2; group.add(m);
    mats.push(sm);
  }

  // warm light that travels with the rig and washes the trench walls round it
  const glow = new THREE.PointLight(0xffb468, 60, 34, 1.3); glow.position.set(0, 8.0, 0); group.add(glow);

  let opacity = 1;
  function setOpacity(o) {
    if (Math.abs(o - opacity) < 1e-4) return; opacity = o;
    for (const m of mats) {
      const tr = o < 0.999 || m.depthWrite === false;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = m.userData.baseOpacity === undefined ? (m.userData.baseOpacity = m.opacity) * o : m.userData.baseOpacity * o;
    }
    sprayMat.uniforms.uFade.value = o; glow.intensity = 60 * o; group.visible = o > 0.003;
  }
  for (const m of mats) m.userData.baseOpacity = m.opacity;
  return {
    group, wheel, setOpacity, tris: Math.round(tris), drawCalls: 11, roll,
    tick(t, dt, spin = 0.18, d = 0) { wheel.rotation.z += spin * dt; sprayMat.uniforms.uTime.value = t; if (d) roll(d); }
  };
}
