/* EUROPA Ridge Base b12 - an original Starship-inspired ship (no logos) slowly orbiting high across the stars.
 * Stainless cylinder, ogive nose, two small forward flaps and two larger aft flaps, a dark heat-shield belly stripe and engine skirt.
 * It lives on the sky rig (moves with your head, like the stars), ~1400 m out (in front of the 1560 m star sphere), about 1.3 deg long.
 * Path: a great circle that rises in the front-right sky, passes high overhead toward the back-left and sets behind you, staying
 * at least ~70 deg away from Jupiter. The visible arc takes about 3.5 min; the hidden half is skipped quickly. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildShip({ envMap, SUN_DIR }) {
  // one mesh with vertex colours (a separate tile layer would depth-fight at 1400 m)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 1, roughness: 0.28, envMap, envMapIntensity: 1.6 });
  const STEEL = [0.79, 0.81, 0.83], TILE = [0.08, 0.085, 0.09];
  const parts = [];
  const add = (g, colFn) => { g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = colFn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getZ(i)); c.set(k, i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g); };
  const R = 4.5, L = 34;   // body radius / length (m); nose 14 m -> ~50 m long
  const belly = (x, y, z, nx, nz) => (nz < -0.55 && y < L / 2 - 1 ? TILE : STEEL);   // heat-shield side = local -z of the cylinder
  add(new THREE.CylinderGeometry(R, R, L, 32, 6, true), belly);
  const nose = []; for (let i = 0; i <= 12; i++) { const t = i / 12; nose.push(new THREE.Vector2(R * Math.sqrt(1 - t * t * 0.98) * (1 - 0.15 * t), t * 14)); }
  add(new THREE.LatheGeometry(nose, 32).translate(0, L / 2, 0), (x, y, z, nx, nz) => (nz < -0.6 && y < L / 2 + 8 ? TILE : STEEL));
  for (const s of [-1, 1]) for (const [w, h, y] of [[3.2, 6, L / 2 + 3.5], [5.2, 10, -L / 2 + 6]]) add(new THREE.BoxGeometry(w, h, 0.5).translate(s * (R + w / 2 - 0.3), y, 0), () => STEEL);
  add(new THREE.CylinderGeometry(R * 0.9, R * 1.02, 2.4, 32, 1).translate(0, -L / 2 - 1.2, 0), () => TILE);   // engine skirt
  const group = new THREE.Group();
  const body = new THREE.Group(); group.add(body); body.scale.setScalar(1.35);
  body.add(new THREE.Mesh(mergeGeometries(parts), mat));
  body.rotation.x = -Math.PI / 2;   // long axis along local -z -> pointed along the direction of travel
  // faint glint
  const gc = document.createElement('canvas'); gc.width = gc.height = 64; const g2 = gc.getContext('2d'); const rg = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,250,235,1)'); rg.addColorStop(0.25, 'rgba(255,245,220,0.35)'); rg.addColorStop(1, 'rgba(255,245,220,0)'); g2.fillStyle = rg; g2.fillRect(0, 0, 64, 64);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }));
  glint.scale.setScalar(26); group.add(glint);
  group.traverse(o => { o.frustumCulled = false; });
  // orbit: c(th) = A cos th + P sin th (both unit, orthogonal), radius 1400
  const A = new THREE.Vector3(0.9, 0, -0.44).normalize(), P0 = new THREE.Vector3(0.2, 0.8, 0.56);
  const P = P0.clone().addScaledVector(A, -P0.dot(A)).normalize();
  const RAD = 1400, VIS = 210, HID = 40;   // seconds for the visible half / the hidden half
  const tmp = new THREE.Vector3(), nxt = new THREE.Vector3(), _m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  let phase = 0.22 * VIS;   // starts a little above the front-right horizon on load
  const pos = th => tmp.copy(A).multiplyScalar(Math.cos(th)).addScaledVector(P, Math.sin(th));
  function tick(dt, camWorld) {
    phase = (phase + dt) % (VIS + HID);
    const th = phase < VIS ? -0.06 + (Math.PI + 0.12) * (phase / VIS) : Math.PI + 0.06 + (Math.PI - 0.12) * ((phase - VIS) / HID);
    const p = pos(th).clone(); nxt.copy(A).multiplyScalar(Math.cos(th + 0.01)).addScaledVector(P, Math.sin(th + 0.01));
    group.position.copy(p).multiplyScalar(RAD);
    _m.lookAt(p, nxt, tmp.copy(p).negate()); group.quaternion.setFromRotationMatrix(_m);   // nose along the track, steel side toward us
    group.visible = phase < VIS && p.y > -0.02;
    // a soft glint now and then, strongest when the sun lights it from the side we see
    const k = Math.max(0, SUN_DIR.dot(p.clone().negate().add(SUN_DIR).normalize()));
    glint.material.opacity = 0.18 + 0.35 * Math.pow(k, 4) * (0.6 + 0.4 * Math.sin(phase * 0.9));
    return th;
  }
  return { group, tick, get dirNow() { return group.position.clone().normalize(); }, setPhase: s => { phase = s; }, VIS, tris: 0 };
}
