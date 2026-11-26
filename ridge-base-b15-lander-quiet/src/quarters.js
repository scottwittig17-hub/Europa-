/* Ridge Base b4 — upper storey living quarters on the cabin roof, plus the outside stair up to it.
 * Same brushed-steel + glass look as the cabin. Glass on the Jupiter side (front -z and left -x), solid steel at the back
 * and right (tablets, screens, bunks against them). All boxes are merged per material (~8 draw calls). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepGlassMaterial, aabb, registerGlass, registerSolid, postCenters, paneSpans, GLASS_INSET } from './glass-fit.js';

export function buildQuarters({ U, envMap, brushed, deckTop = 15 }) {
  const group = new THREE.Group(); group.name = 'quarters';
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x949ba4, metalness: 1, roughness: 0.5, roughnessMap: brushed, anisotropy: 0.2, envMap, envMapIntensity: 0.6 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x4f5761, metalness: 1, roughness: 0.5, roughnessMap: brushed, anisotropy: 0.2, envMap, envMapIntensity: 0.6 });
  const floorM = new THREE.MeshStandardMaterial({ color: 0x808790, metalness: 0.3, roughness: 0.7, envMap, envMapIntensity: 0.3 });
  const railM = new THREE.MeshPhysicalMaterial({ color: 0x4f5761, metalness: 1, roughness: 0.5, anisotropy: 0, envMap, envMapIntensity: 0.6 });
  const glass = prepGlassMaterial(new THREE.MeshStandardMaterial({ color: 0x9fc6e0, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, envMap, envMapIntensity: 1.4 }));
  const amber = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb860, emissiveIntensity: 1.4 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 0.85 });     // warm leather couch
  const bed = new THREE.MeshStandardMaterial({ color: 0x3f5f80, roughness: 0.9 });         // blankets
  const linen = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 });       // pillows, mattress edge
  const rug = new THREE.MeshStandardMaterial({ color: 0x7a3e22, roughness: 1.0 });
  const buckets = new Map();
  const add = (geo, mat, x, y, z) => { geo.translate(x, y, z); if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
  const box = (w, h, d, x, y, z, m = metal) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const ext = (x0, x1, y0, y1, z0, z1, m = metal) => box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, m);
  const extSolid = (x0, x1, y0, y1, z0, z1, m, name) => { ext(x0, x1, y0, y1, z0, z1, m); registerSolid(aabb(x0, x1, y0, y1, z0, z1, name)); };
  const extGlass = (x0, x1, y0, y1, z0, z1, name) => { ext(x0, x1, y0, y1, z0, z1, glass); registerGlass(aabb(x0, x1, y0, y1, z0, z1, name)); };
  const cylY = (r, h, x, y, z, m, seg = 16) => add(new THREE.CylinderGeometry(r, r, h, seg), m, x, y + h / 2, z);

  /* the storey: x -8..8, z -1..7 on the cabin roof (top U) */
  const X0 = -8, X1 = 8, Z0 = -1, Z1 = 7, H = 3.1;
  ext(X0, X1, U, U + 0.1, Z0, Z1, floorM);
  // roof: steel over the back, a glass skylight band over the front so Jupiter stays in view from the lounge.
  // b14: posts, header, fascia and rafters all have DISTINCT depths so they don't share coplanar faces
  // at the upper beam joint (the roof fascia where vertical posts meet the horizontal beam and the glass).
  // Posts are thickest and rise into the fascia; the header sits inside the posts; the fascia is offset
  // outward; rafters are thinner than the posts and stop short of the fascia. Glass is split into panes
  // between the rafters/posts and inset so nothing crosses or sits coplanar with it.
  const POST_H = 0.11;             // wall-post half-width in the long direction (0.22 m posts)
  const HEADER_H = 0.06;           // sill/header depth sits inside the posts
  const RAFTER_H = 0.07;           // rafters thinner than posts
  // Distinct z faces at the upper beam joint (no two parts share a face):
  //   fascia  [-1.20, -1.06],  front posts [-1.16, -0.92],  header/sill [-1.00, -0.88]
  const FASCIA_Z0 = Z0 - 0.20, FASCIA_Z1 = Z0 - 0.06;
  const POST_Z0 = Z0 - 0.16, POST_Z1 = Z0 + 0.08;
  const HEAD_Z0 = Z0 + 0.00, HEAD_Z1 = Z0 + 0.12;
  const STEEL_Z = 3.0;
  ext(X0 - 0.2, X1 + 0.2, U + H, U + H + 0.25, STEEL_Z, Z1 + 0.2, metal);   // steel roof over the back
  // front fascia (horizontal beam) — offset outward; posts tenon into it from below
  extSolid(X0 - 0.2, X1 + 0.2, U + H, U + H + 0.22, FASCIA_Z0, FASCIA_Z1, dark, 'q-fascia');
  // rafters: thinner than the wall posts, start just inside the fascia, stop short of the steel roof
  const qxs = postCenters(X0, X1, 2);
  for (const x of qxs) {
    extSolid(x - RAFTER_H, x + RAFTER_H, U + H, U + H + 0.22, FASCIA_Z1 + GLASS_INSET, STEEL_Z - GLASS_INSET, dark, `q-rafter-${x}`);
  }
  // skylight panes between rafters. Start past the front posts' inner face so the posts don't pierce the glass.
  const skyY0 = U + H + 0.08, skyY1 = U + H + 0.12;
  const skyZ0 = POST_Z1 + GLASS_INSET;                 // -0.92 + 0.02 = -0.90
  for (const s of paneSpans(qxs, RAFTER_H)) {
    extGlass(s.a, s.b, skyY0, skyY1, skyZ0, STEEL_Z - GLASS_INSET, `q-skylight-${s.mid.toFixed(2)}`);
  }
  // glass walls (front, left): sills/headers sit inside the posts (shallower, different depth)
  extSolid(X0, X1, U + 0.1, U + 0.6, HEAD_Z0, HEAD_Z1, dark, 'q-sill-front');
  extSolid(X0, X1, U + H - 0.3, U + H, HEAD_Z0, HEAD_Z1, dark, 'q-header-front');
  extSolid(X0 - HEADER_H, X0 + HEADER_H, U + 0.1, U + 0.6, Z0, Z1, dark, 'q-sill-left');
  extSolid(X0 - HEADER_H, X0 + HEADER_H, U + H - 0.3, U + H, Z0, Z1, dark, 'q-header-left');
  // front posts: 0.22 m in x, distinct z from fascia and header, rise into the fascia (no coplanar cap at U+H)
  for (const x of qxs) extSolid(x - POST_H, x + POST_H, U, U + H + 0.12, POST_Z0, POST_Z1, dark, `q-post-front-${x}`);
  const qzs = postCenters(Z0, Z1, 2);
  for (const z of qzs) {
    if (Math.abs(z - Z0) < 0.05) continue;   // front-left corner already placed
    extSolid(X0 - POST_H, X0 + POST_H, U, U + H, z - POST_H, z + POST_H, dark, `q-post-left-${z}`);
  }
  // wall glass panes: between posts, between sill and header, shifted just inside the wall
  const paneY0 = U + 0.6 + GLASS_INSET, paneY1 = U + H - 0.3 - GLASS_INSET;
  const gThick = 0.04;
  const frontInnerZ = POST_Z1 + GLASS_INSET;           // just inside the front posts (-0.90)
  for (const s of paneSpans(qxs, POST_H)) {
    extGlass(s.a, s.b, paneY0, paneY1, frontInnerZ, frontInnerZ + gThick, `q-glass-front-${s.mid.toFixed(2)}`);
  }
  const leftInnerX = X0 + POST_H + GLASS_INSET;
  for (const s of paneSpans(qzs, POST_H)) {
    extGlass(leftInnerX, leftInnerX + gThick, paneY0, paneY1, s.a, s.b, `q-glass-left-${s.mid.toFixed(2)}`);
  }
  // solid steel back and right walls, with a dark band and a door on the right
  ext(X0, X1, U, U + H, Z1 - 0.1, Z1 + 0.1, metal); ext(X0, X1, U + 2.3, U + 2.45, Z1 - 0.14, Z1 + 0.14, dark);
  ext(X1 - 0.1, X1 + 0.1, U, U + H, Z0, Z1, metal); ext(X1 - 0.14, X1 + 0.14, U + 2.3, U + 2.45, Z0, Z1, dark);
  ext(X1 + 0.1, X1 + 0.16, U + 0.1, U + 2.2, 4.6, 5.8, dark);                                     // door (outside face)
  // warm amber light strips on the ceiling
  for (const x of [-5, 0, 5]) ext(x - 0.9, x + 0.9, U + H - 0.04, U + H, 4.9, 5.1, amber);

  /* lounge: rug, couch facing the Jupiter glass, coffee table */
  ext(-5.2, -0.4, U + 0.1, U + 0.12, -0.2, 3.6, rug);
  ext(-4.4, -1.2, U + 0.1, U + 0.55, 2.2, 3.15, fabric);       // seat
  ext(-4.4, -1.2, U + 0.55, U + 1.15, 2.95, 3.2, fabric);      // back
  ext(-4.6, -4.4, U + 0.1, U + 0.8, 2.2, 3.2, fabric); ext(-1.2, -1.0, U + 0.1, U + 0.8, 2.2, 3.2, fabric);   // arms
  for (const x of [-3.7, -2.8, -1.9]) ext(x - 0.38, x + 0.38, U + 0.55, U + 0.68, 2.25, 2.9, fabric);           // cushions
  ext(-3.5, -2.1, U + 0.42, U + 0.47, 0.8, 1.5, dark); cylY(0.12, 0.32, -2.8, U + 0.1, 1.15, dark, 10);       // coffee table
  /* small dining table with two stools */
  cylY(0.6, 0.05, 2.0, U + 0.74, 1.4, dark, 20); cylY(0.08, 0.64, 2.0, U + 0.1, 1.4, dark, 8); cylY(0.35, 0.03, 2.0, U + 0.1, 1.4, dark, 16);
  for (const [x, z] of [[1.1, 1.4], [2.9, 1.4]]) { cylY(0.22, 0.06, x, U + 0.5, z, fabric, 14); cylY(0.05, 0.4, x, U + 0.1, z, dark, 6); }
  /* two bunk beds against the back wall */
  for (const x0 of [1.6, 4.5]) {
    const x1 = x0 + 2.1, z0 = 5.9, z1 = 6.85;
    for (const y of [U + 0.35, U + 1.55]) {
      ext(x0, x1, y, y + 0.08, z0, z1, dark);                       // slat base
      ext(x0 + 0.05, x1 - 0.05, y + 0.08, y + 0.26, z0 + 0.05, z1 - 0.05, linen);  // mattress
      ext(x0 + 0.5, x1 - 0.05, y + 0.26, y + 0.3, z0 + 0.03, z1 - 0.03, bed);      // blanket
      ext(x0 + 0.08, x0 + 0.48, y + 0.26, y + 0.38, z0 + 0.15, z1 - 0.15, linen);  // pillow
    }
    for (const x of [x0, x1]) for (const z of [z0, z1]) ext(x - 0.04, x + 0.04, U + 0.1, U + 2.2, z - 0.04, z + 0.04, dark);
    ext(x1 - 0.4, x1 - 0.36, U + 0.1, U + 2.0, z0 - 0.04, z0, dark); ext(x1 - 0.04, x1, U + 0.1, U + 2.0, z0 - 0.04, z0, dark);   // ladder rails
    for (let y = U + 0.5; y < U + 1.9; y += 0.35) ext(x1 - 0.4, x1, y, y + 0.03, z0 - 0.04, z0, dark);
    ext(x0 + 0.2, x1 - 0.2, U + 2.25, U + 2.29, z1 - 0.06, z1 - 0.02, amber);   // reading light strip
  }
  /* galley counter on the right wall */
  ext(7.2, 7.9, U + 0.1, U + 0.95, 2.6, 4.2, dark); ext(7.15, 7.9, U + 0.95, U + 1.0, 2.55, 4.25, metal);
  ext(7.6, 7.9, U + 1.6, U + 2.1, 2.6, 4.2, dark); ext(7.55, 7.6, U + 1.55, U + 1.6, 2.6, 4.2, amber);

  /* outside stair from the deck (right of the cabin) up to the cabin roof, a landing, and a roof terrace railing */
  {
    const SX0 = 10.5, SX1 = 11.7, ZA = -5.0, ZB = 2.5, n = 17;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, z = ZA + (ZB - ZA) * t, y = deckTop + (U - deckTop) * t; ext(SX0, SX1, y - 0.05, y + 0.05, z - 0.24, z + 0.24, floorM); }
    const L = Math.hypot(ZB - ZA, U - deckTop), ang = Math.atan2(U - deckTop, ZB - ZA);
    for (const x of [SX0, SX1]) for (const dy of [0, 1.0]) {
      const g = new THREE.BoxGeometry(0.07, dy ? 0.06 : 0.25, L); g.rotateX(-ang);
      add(g, railM, x, (deckTop + U) / 2 + dy, (ZA + ZB) / 2);
    }
    for (const x of [SX0, SX1]) for (const t of [0, 0.5, 1]) ext(x - 0.045, x + 0.045, deckTop + (U - deckTop) * t, deckTop + (U - deckTop) * t + 1.0, ZA + (ZB - ZA) * t - 0.03, ZA + (ZB - ZA) * t + 0.03, railM);
    ext(10.0, SX1, U - 0.12, U, ZB, ZB + 1.6, floorM);   // landing onto the roof
    // terrace railing round the cabin roof (gap at the landing)
    const rail = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      // b13-railing: rails along z stop 0.03 short at each end (no overlapping coplanar faces with the x rails at corners),
      // posts 0.085 m thick so the 0.06 m rails sit inside them instead of sharing their side faces (z-fighting flashes)
      const zs = alongX ? 0 : 0.03;
      for (const y of [U + 1.1, U + 0.55]) ext(Math.min(ax, bx) - (alongX ? 0 : 0.03), Math.max(ax, bx) + (alongX ? 0 : 0.03), y - 0.03, y + 0.03, Math.min(az, bz) - (alongX ? 0.03 : 0) + zs, Math.max(az, bz) + (alongX ? 0.03 : 0) - zs, railM);
      const k = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= k; i++) { const x = ax + (bx - ax) * i / k, z = az + (bz - az) * i / k; ext(x - 0.0425, x + 0.0425, U, U + 1.1, z - 0.0425, z + 0.0425, railM); }
    };
    rail(-9.9, -6.9, 9.9, -6.9); rail(-9.9, 6.9, 9.9, 6.9); rail(-9.9, -6.9, -9.9, 6.9); rail(9.9, -6.9, 9.9, 2.4); rail(9.9, 4.2, 9.9, 6.9);
  }

  for (const [mat, geos] of buckets) {
    const g = mergeGeometries(geos, false); const m = new THREE.Mesh(g, mat);
    m.castShadow = mat !== glass && mat !== amber; m.receiveShadow = true; if (mat === glass) m.renderOrder = 5; group.add(m);
  }

  /* wall tablets + the big live screen (canvas textures) */
  const tabletTex = (title, lines, accent) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 320; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#0b1e30'); gr.addColorStop(1, '#051019'); g.fillStyle = gr; g.fillRect(0, 0, 512, 320);
    g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(6, 6, 500, 308);
    g.fillStyle = accent; g.font = 'bold 40px Arial, sans-serif'; g.fillText(title, 28, 60);
    g.fillStyle = '#cfe9ff'; g.font = '30px Arial, sans-serif'; lines.forEach((l, i) => g.fillText(l, 28, 120 + i * 48));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const tablet = (tex, w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m;
  };
  tablet(tabletTex('HABITAT', ['Cabin  21 °C', 'O2  20.9 %', 'Pressure  101 kPa'], '#7fd8ff'), 1.1, 0.69, -6.2, U + 1.55, Z1 - 0.12, Math.PI);
  tablet(tabletTex('CREW', ['Scott', 'Kai', 'Shift: night'], '#ffc46b'), 1.1, 0.69, -4.6, U + 1.55, Z1 - 0.12, Math.PI);
  tablet(tabletTex('JUPITER', ['Always up', 'from the ridge', ''], '#e7b98a'), 1.1, 0.69, -3.0, U + 1.55, Z1 - 0.12, Math.PI);
  const live = document.createElement('canvas'); live.width = 1024; live.height = 560;
  const liveTex = new THREE.CanvasTexture(live); liveTex.colorSpace = THREE.SRGBColorSpace;
  tablet(liveTex, 2.4, 1.31, X1 - 0.12, U + 1.6, 0.6, -Math.PI / 2);
  function updateLive(rigZ) {
    const g = live.getContext('2d');
    g.fillStyle = '#06121c'; g.fillRect(0, 0, 1024, 560); g.strokeStyle = '#ffb860'; g.lineWidth = 8; g.strokeRect(8, 8, 1008, 544);
    g.fillStyle = '#ffb860'; g.font = 'bold 56px Arial, sans-serif'; g.fillText('RIG E-7 · LIVE', 40, 86);
    const d = Math.round(-rigZ), st = Math.abs(rigZ) < 15 ? 'UNDER THE BASE' : rigZ < 0 ? 'APPROACHING' : 'HEADING AWAY';
    g.fillStyle = '#e8f4ff'; g.font = '44px Arial, sans-serif';
    g.fillText(`${st}`, 40, 170); g.fillText(`${Math.abs(d)} m ${d >= 0 ? 'ahead' : 'behind'}  ·  0.8 m/s`, 40, 236);
    // trench strip map: base in the middle, rig as a dot
    g.fillStyle = '#16324a'; g.fillRect(60, 330, 904, 90); g.fillStyle = '#9fb8cc'; g.fillRect(500, 300, 24, 150);
    const px = 512 + THREE.MathUtils.clamp(rigZ, -250, 190) / 250 * 452; g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(px, 375, 22, 0, 7); g.fill();
    g.fillStyle = '#7f9bb3'; g.font = '30px Arial, sans-serif'; g.fillText('ahead', 70, 480); g.fillText('base', 482, 480); g.fillText('behind', 870, 480);
    liveTex.needsUpdate = true;
  }
  updateLive(-110);

  const lamp = new THREE.PointLight(0xffb870, 16, 10, 1.8); lamp.position.set(0, U + H - 0.6, 4); group.add(lamp);   // b14: was 28/14/1.4 — less of an orange specular hot spot on the floor
  return { group, updateLive };
}
