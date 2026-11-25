/* EUROPA Ridge Base b13-drill - drill hole for the submarine drop (Leyra's idea, Next Steps item 3).
 * Only an Earth-style drill tower over the hole is modelled: a tapered four-leg lattice derrick on a raised substructure,
 * drill floor, crown block, travelling block and hook on cables, drill string going down into the bore, a doghouse cabin,
 * drawworks, a pipe rack and work lights. The one-way cylindrical boring machine that cut the shaft and sank into the
 * ocean is part of the story (wall screen), not modelled. The bore is a dark shaft with a raised ice collar.
 * Local frame: y = 0 is the ice, the bore is at the origin, +z faces the base. Merged per material (a few draw calls). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
function strut(list, a, b, r, seg = 6) {               // round tube from a to b
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, false);
  g.applyMatrix4(_m.compose(A.add(B).multiplyScalar(0.5), _q.setFromUnitVectors(_up, d.normalize()), _one));
  list.push(g);
}
function block(list, x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); list.push(g);
}

function shaftTexture() {   // looking down a bore: near-black centre, faint blue ice walls toward the rim
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, '#000000'); r.addColorStop(0.55, '#020407'); r.addColorStop(0.82, '#0d1a26'); r.addColorStop(0.95, '#3a5266'); r.addColorStop(1, '#6f8798');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildDrillTower({ envMap = null } = {}) {
  const group = new THREE.Group(); group.name = 'drill-tower';
  const B = { steel: [], red: [], dark: [], deck: [], cable: [], lamp: [], glass: [], hole: [], collar: [] };
  const SUB_H = 6.0, SUB_W = 12, TOP_H = 34, BASE_HW = 4.5, TOP_HW = 1.1;   // substructure, derrick height above the floor, half-widths
  const F = SUB_H;                                                        // drill floor height

  // substructure: box frame on 8 columns with X bracing, drill floor plate with a rotary opening over the bore
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    block(B.red, sx * SUB_W / 2 - 0.4, sx * SUB_W / 2 + 0.4, 0, F, sz * SUB_W / 2 - 0.4, sz * SUB_W / 2 + 0.4);
    block(B.dark, sx * SUB_W / 2 - 0.9, sx * SUB_W / 2 + 0.9, 0, 0.35, sz * SUB_W / 2 - 0.9, sz * SUB_W / 2 + 0.9);   // foot pads
  }
  const S2 = SUB_W / 2;
  for (const [ax, az, bx, bz] of [[-S2, -S2, S2, -S2], [S2, -S2, S2, S2], [S2, S2, -S2, S2], [-S2, S2, -S2, -S2]]) {   // X brace + top girt per side
    strut(B.red, [ax, 0.4, az], [bx, F - 0.4, bz], 0.13); strut(B.red, [bx, 0.4, bz], [ax, F - 0.4, az], 0.13);
    strut(B.red, [ax, F - 0.3, az], [bx, F - 0.3, bz], 0.16);
  }
  // floor plate (4 pieces round a 1.6 m rotary opening)
  const o = 0.8, h = SUB_W / 2 + 0.6;
  block(B.deck, -h, h, F, F + 0.3, o, h); block(B.deck, -h, h, F, F + 0.3, -h, -o);
  block(B.deck, -h, -o, F, F + 0.3, -o, o); block(B.deck, o, h, F, F + 0.3, -o, o);
  // floor railing (posts thicker than rails - no z-fighting)
  for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [-h, h, -h, -h]]) {
    for (const y of [F + 1.4, F + 0.75]) strut(B.red, [ax, y, az], [bx, y, bz], 0.035);
    const n = 6; for (let i = 0; i <= n; i++) { const t = i / n; block(B.red, ax + (bx - ax) * t - 0.05, ax + (bx - ax) * t + 0.05, F + 0.3, F + 1.42, az + (bz - az) * t - 0.05, az + (bz - az) * t + 0.05); }
  }
  // stair from the ice up to the floor on the base-facing (+z) side
  { const n = 22; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; block(B.deck, h - 1.6, h - 0.2, t * F - 0.05, t * F + 0.05, h + 6 - t * 6 - 0.25, h + 6 - t * 6 + 0.25); }
    for (const x of [h - 1.6, h - 0.2]) { strut(B.red, [x, 0.0, h + 6], [x, F, h], 0.06); strut(B.red, [x, 1.0, h + 6], [x, F + 1.0, h], 0.035); } }

  // derrick: four tapered legs, horizontal girts and X bracing on every face, a crown platform on top
  const legAt = (sx, sz, y) => { const t = y / TOP_H, hw = BASE_HW + (TOP_HW - BASE_HW) * t; return [sx * hw, F + y, sz * hw]; };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) strut(B.red, legAt(sx, sz, 0), legAt(sx, sz, TOP_H), 0.22, 8);
  const LEVELS = 9;
  for (let i = 0; i <= LEVELS; i++) {
    const y = i / LEVELS * TOP_H, y2 = (i + 1) / LEVELS * TOP_H;
    const faces = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
    for (const [[ax, az], [bx, bz]] of faces) {
      if (i > 0) strut(B.red, legAt(ax, az, y), legAt(bx, bz, y), 0.1);            // girt
      if (i < LEVELS) {                                                            // X brace up to the next level
        // the base-facing face keeps the lowest bay open (the V-door where pipe comes up onto the floor)
        if (i === 0 && az === 1 && bz === 1) continue;
        strut(B.red, legAt(ax, az, y), legAt(bx, bz, y2), 0.065);
        strut(B.red, legAt(bx, bz, y), legAt(ax, az, y2), 0.065);
      }
    }
  }
  block(B.deck, -2.0, 2.0, F + TOP_H, F + TOP_H + 0.3, -2.0, 2.0);                // crown platform
  block(B.dark, -0.9, 0.9, F + TOP_H + 0.3, F + TOP_H + 1.5, -0.7, 0.7);          // crown block (sheaves)
  for (let i = -2; i <= 2; i++) strut(B.steel, [i * 0.3, F + TOP_H + 0.9, -0.75], [i * 0.3, F + TOP_H + 0.9, 0.75], 0.42, 14);   // sheave wheels
  // gin pole + warning light
  strut(B.red, [0, F + TOP_H + 1.5, 0], [0, F + TOP_H + 4.0, 0], 0.08);
  // monkey board (racking platform) at about 2/3 height
  { const y = TOP_H * 0.62, hw = BASE_HW + (TOP_HW - BASE_HW) * 0.62; block(B.deck, -hw, hw, F + y, F + y + 0.15, -hw - 1.2, -hw + 0.2); }

  // travelling block + hook on cables, a top drive, and the drill string going down the bore
  const TB = F + TOP_H * 0.55;
  block(B.dark, -0.55, 0.55, TB, TB + 2.2, -0.45, 0.45);
  block(B.steel, -0.5, 0.5, TB - 2.6, TB, -0.5, 0.5);                            // top drive
  strut(B.steel, [0, TB - 2.6, 0], [0, TB - 3.4, 0], 0.18, 10);
  for (let i = -2; i <= 2; i++) strut(B.cable, [i * 0.3, F + TOP_H + 0.9, 0], [i * 0.18, TB + 2.2, 0], 0.025, 4);
  strut(B.cable, [1.4, F + TOP_H + 0.9, 0], [3.0, F + 0.8, 4.0], 0.03, 4);       // fast line down to the drawworks
  strut(B.steel, [0, TB - 3.4, 0], [0, -24, 0], 0.11, 10);                       // drill string (down into the shaft)
  strut(B.dark, [0, F + 0.3, 0], [0, F + 0.9, 0], 0.65, 18);                     // rotary table

  // drawworks + doghouse on the floor, pipe rack beside the stair
  block(B.dark, 1.6, 4.6, F + 0.3, F + 1.9, 2.4, 5.2);
  strut(B.steel, [1.6, F + 1.2, 3.8], [4.6, F + 1.2, 3.8], 0.6, 16);
  block(B.steel, -h + 0.2, -1.8, F + 0.3, F + 3.0, 2.2, h - 0.2);                // doghouse
  block(B.glass, -h + 0.15, -1.85, F + 1.5, F + 2.4, h - 0.25, h - 0.15);        // its window toward the base
  block(B.lamp, -h + 0.5, -2.2, F + 2.9, F + 3.05, h - 0.3, h - 0.1);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) strut(B.steel, [-14, 0.6 + j * 0.24 + 0.12, 2 + i * 0.24], [-14 + 9.5, 0.6 + j * 0.24 + 0.12, 2 + i * 0.24], 0.1, 8);   // stacked pipe
  for (const x of [-13.5, -9.25, -5]) block(B.dark, x - 0.2, x + 0.2, 0, 0.6, 1.6, 3.6);

  // work lights on the derrick legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [8, 20]) {
    const p = legAt(sx, sz, y); block(B.lamp, p[0] - 0.25, p[0] + 0.25, p[1] - 0.15, p[1] + 0.15, p[2] - 0.25, p[2] + 0.25);
  }

  // the bore: dark shaft and a raised, cracked ice collar
  // (the ice is one opaque heightfield, so the opening is a dark disc with a radial falloff that reads as a deep shaft)
  B.hole.push(new THREE.CircleGeometry(1.75, 40).rotateX(-Math.PI / 2).translate(0, 0.08, 0));
  B.collar.push(new THREE.TorusGeometry(2.1, 0.55, 10, 36).rotateX(Math.PI / 2).translate(0, 0.1, 0));
  B.collar.push(new THREE.RingGeometry(1.5, 4.5, 40, 1).rotateX(-Math.PI / 2).translate(0, 0.04, 0));

  const M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa1a9, metalness: 1, roughness: 0.32, envMap, envMapIntensity: 1.1 }),
    red: new THREE.MeshStandardMaterial({ color: 0x7a1414, metalness: 0.55, roughness: 0.45, envMap, envMapIntensity: 0.8 }),   // darker safety-red derrick paint (was 0xb8412a)
    dark: new THREE.MeshStandardMaterial({ color: 0x2e3238, metalness: 0.85, roughness: 0.5, envMap, envMapIntensity: 0.8 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x6d737b, metalness: 0.9, roughness: 0.48, envMap, envMapIntensity: 0.8 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.9, roughness: 0.35, envMap, envMapIntensity: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffd7a0, toneMapped: false }),
    glass: new THREE.MeshBasicMaterial({ color: 0xffc27a, toneMapped: false }),
    hole: new THREE.MeshBasicMaterial({ map: shaftTexture(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    collar: new THREE.MeshStandardMaterial({ color: 0xc9d6e2, metalness: 0.05, roughness: 0.55, envMap, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  let tris = 0;
  for (const k in B) {
    if (!B[k].length) continue;
    const geos = B[k].map(g => g.index ? g.toNonIndexed() : g);
    for (const g of geos) { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); }
    const g = mergeGeometries(geos, false); tris += g.attributes.position.count / 3;
    const m = new THREE.Mesh(g, M[k]); m.castShadow = !['lamp', 'glass', 'hole', 'collar', 'cable'].includes(k); m.receiveShadow = k !== 'lamp';
    group.add(m);
  }
  // a warm work light so the tower reads at night, and the red beacon blinks
  const lightP = new THREE.PointLight(0xffc98a, 50, 45, 1.3); lightP.position.set(0, F + 9, 6); group.add(lightP);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
  red.position.set(0, F + TOP_H + 4.2, 0); group.add(red);
  return { group, tris: Math.round(tris), height: F + TOP_H + 4.5, tick: t => { red.visible = (t % 2.0) < 0.9; } };
}
