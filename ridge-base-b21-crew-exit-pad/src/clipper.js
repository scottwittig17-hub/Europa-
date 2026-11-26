/* NASA Europa Clipper — a small bright cruiser on a smooth, continuous high-overhead loop.
 * Reads as a crisp little star moving steadily across the sky; a tiny bus + long solar-array
 * silhouette shows if you squint. No comet tail, no streak. Lives on the sky rig (moves with
 * the head). Orbit radius 2200 m sits in front of the 2400 m starship and the 3200 m stars,
 * and well inside camera.far (8000). The path is a small circle around a near-zenith axis
 * (elevation stays ~37–59 deg), so it never clips the horizon or the snow ridges. */
import * as THREE from 'three';

export function buildClipper({ SUN_DIR }) {
  const group = new THREE.Group();
  const body = new THREE.Group(); group.add(body);

  const gold = new THREE.MeshBasicMaterial({ color: 0xf0d59a, toneMapped: false });
  const wing = new THREE.MeshBasicMaterial({ color: 0xe8c56a, toneMapped: false });
  const bus = new THREE.MeshBasicMaterial({ color: 0xc9a24e, toneMapped: false });
  const dark = new THREE.MeshBasicMaterial({ color: 0x6a5a38, toneMapped: false });

  // Stylized Clipper: boxy bus, high-gain dish, two long thin solar wings. Sized so the
  // 14 m array span is only ~0.36 deg at 2200 m — a bright point at a glance, a silhouette
  // if you look closely. Wings are thick enough (0.55 m) that they do not shimmer as hairlines.
  body.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 3.2), bus));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold);
  dish.position.set(0, 0.2, 1.9); dish.rotation.x = Math.PI / 2; body.add(dish);
  const dishBack = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), dark);
  dishBack.position.set(0, 0.2, 1.85); body.add(dishBack);
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.55, 2.2), wing);
    panel.position.set(s * (1.2 + 3.2), 0, 0); body.add(panel);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.22), dark);
    boom.position.set(s * 1.5, 0, 0); body.add(boom);
  }

  // Tight bright core — the "little star" read. Soft radial disc, no tail, no streak.
  const gc = document.createElement('canvas'); gc.width = gc.height = 64;
  const g2 = gc.getContext('2d');
  const rg = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,252,240,1)');
  rg.addColorStop(0.22, 'rgba(255,240,200,0.55)');
  rg.addColorStop(0.55, 'rgba(255,230,170,0.12)');
  rg.addColorStop(1, 'rgba(255,230,170,0)');
  g2.fillStyle = rg; g2.fillRect(0, 0, 64, 64);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.95, toneMapped: false,
  }));
  core.scale.setScalar(7.5); group.add(core);

  body.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
  group.traverse(o => { o.frustumCulled = false; });

  // Small high circle around a slightly off-zenith axis, period 210 s, constant speed.
  const RAD = 2200, PERIOD = 210, RHO = 42 * Math.PI / 180;
  const C = new THREE.Vector3(0.16, 1, -0.10).normalize();
  const A0 = new THREE.Vector3(1, 0, 0);
  const A = A0.clone().addScaledVector(C, -A0.dot(C)).normalize();
  const P = new THREE.Vector3().crossVectors(C, A).normalize();
  const tmp = new THREE.Vector3(), nxt = new THREE.Vector3(), _m = new THREE.Matrix4();
  let phase = 0.15 * PERIOD;   // already up in the loop on load

  function place(th) {
    // p = C cosρ + (A cos th + P sin th) sinρ
    const c = Math.cos(RHO), s = Math.sin(RHO);
    tmp.copy(C).multiplyScalar(c).addScaledVector(A, Math.cos(th) * s).addScaledVector(P, Math.sin(th) * s);
    return tmp;
  }

  function tick(dt) {
    phase = (phase + dt) % PERIOD;
    const th = (phase / PERIOD) * Math.PI * 2;
    const p = place(th).clone();
    place(th + 0.01); nxt.copy(tmp);
    group.position.copy(p).multiplyScalar(RAD);
    // Nose along the track; keep the array axis roughly across the path and the dish leading.
    _m.lookAt(p, nxt, C);
    group.quaternion.setFromRotationMatrix(_m);
    // Subtle array glint when the sun rakes the wings — a twinkle, not a streak.
    const facing = Math.max(0, SUN_DIR.dot(p.clone().negate().add(SUN_DIR).normalize()));
    core.material.opacity = 0.72 + 0.28 * Math.pow(facing, 3);
    return th;
  }

  return { group, tick, RAD, PERIOD };
}
