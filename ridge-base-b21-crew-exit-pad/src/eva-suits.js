/* Ridge Base b21 — four massive clickable EVA suits on a steel rack along the
 * cabin back wall (left of the crew portraits as you look at the front glass;
 * to the right of the portraits when you face the photos / Story board).
 * Click / trigger a suit to put it on; click it again (empty hanger) to hang it up.
 * Each suit has a named accent stripe, a clear nameplate, a backpack and twin
 * pack-thruster nozzles. */
import * as THREE from 'three';

export const EVA_CREW = [
  { name: 'Scott', accent: 0x4f9adf, accentHex: '#7eb6ef' },
  { name: 'Leyra', accent: 0xd4a84a, accentHex: '#f3d27a' },
  { name: 'Kai',   accent: 0x3aa8b8, accentHex: '#7fd8e8' },
  { name: 'Mars',  accent: 0xc4622e, accentHex: '#e8894f' },
];

function nameplateTex(name, hex) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1c20'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = hex; g.fillRect(0, 0, 18, 160); g.fillRect(494, 0, 18, 160);
  g.fillStyle = '#f4f7fb'; g.font = '700 86px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 256, 84);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function makeSuit({ accent, accentHex, name, envMap }) {
  const group = new THREE.Group(); group.name = `eva-${name}`;
  const white = new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.78, metalness: 0.12, envMap, envMapIntensity: 0.25 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.7,  metalness: 0.25, envMap, envMapIntensity: 0.2 });
  const trim  = new THREE.MeshStandardMaterial({ color: accent,   roughness: 0.55, metalness: 0.2,  envMap, envMapIntensity: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xc8a44a, roughness: 0.18, metalness: 0.85, envMap, envMapIntensity: 0.8 });
  const packM = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.72, metalness: 0.3,  envMap, envMapIntensity: 0.25 });
  const nozM  = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.6,  envMap, envMapIntensity: 0.35 });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };

  // boots + legs
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.42), dark), s * 0.19, 0.08, 0.04);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.62, 10), white), s * 0.19, 0.48, 0.0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.58, 10), white), s * 0.19, 1.06, 0.0);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.36), white), 0, 1.40, 0);
  // torso (massive)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.72, 0.50), white), 0, 1.88, 0);
  // accent stripe down the chest + shoulder bars
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.06), trim), 0, 1.90, 0.24);
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), trim), s * 0.30, 2.18, 0.18);
  // arms
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), white), s * 0.50, 2.14, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.58, 10), white), s * 0.62, 1.78, 0.02).rotation.z = s * 0.22;
    add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), dark),  s * 0.72, 1.48, 0.04);
  }
  // helmet + gold visor
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.20, 0.14, 12), dark), 0, 2.31, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), white), 0, 2.58, 0);
  const vis = add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), visor), 0, 2.56, 0.12);
  vis.rotation.x = Math.PI / 2;
  // backpack + twin downward thruster nozzles
  add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.28), packM), 0, 1.92, -0.36);
  for (const s of [-1, 1]) {
    const nozzle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 0.18, 10), nozM), s * 0.15, 1.55, -0.38);
    nozzle.rotation.x = 0.15;
    // slightly recessed glow ring (lit up when this suit is thrusting on the player, via userData)
    const glow = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.0, toneMapped: false })), s * 0.15, 1.45, -0.40);
    glow.rotation.x = 0.15;
    glow.userData.nozzleGlow = true;
  }
  // chest nameplate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13),
    new THREE.MeshBasicMaterial({ map: nameplateTex(name, accentHex), toneMapped: false }));
  plate.position.set(0, 1.72, 0.26); group.add(plate);

  group.userData.accent = accent;
  return group;
}

export function buildEvaRack({ scene, envMap, deckTop, cabL }) {
  const rack = new THREE.Group(); rack.name = 'eva-rack';
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a515a, roughness: 0.7, metalness: 0.35, envMap, envMapIntensity: 0.35 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.7, metalness: 0.25, envMap, envMapIntensity: 0.25 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; rack.add(m); return m;
  };

  const z = cabL / 2 - 0.95;                 // inset in front of the back-wall glass
  const xs = [-8.15, -6.60, -5.05, -3.50];
  const y0 = deckTop;
  // floor rail + uprights + hang bar
  add(new THREE.BoxGeometry(6.4, 0.08, 0.70), dark,  (xs[0] + xs[3]) / 2, y0 + 0.04, z);
  for (const x of [xs[0] - 0.7, xs[3] + 0.7]) {
    add(new THREE.BoxGeometry(0.10, 2.35, 0.10), steel, x, y0 + 1.18, z + 0.22);
  }
  add(new THREE.BoxGeometry(6.5, 0.08, 0.10), steel, (xs[0] + xs[3]) / 2, y0 + 2.32, z + 0.22);
  // header plaque
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d');
    g.fillStyle = '#1a1c20'; g.fillRect(0, 0, 1024, 160);
    g.fillStyle = '#f4f7fb'; g.font = '700 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EVA SUITS  \u00b7  RIDGE BASE', 512, 80);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.38), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    sign.position.set((xs[0] + xs[3]) / 2, y0 + 2.55, z + 0.18); rack.add(sign);
    add(new THREE.BoxGeometry(2.5, 0.42, 0.05), dark, (xs[0] + xs[3]) / 2, y0 + 2.55, z + 0.15);
  }

  const slots = [];
  const hits = [];
  EVA_CREW.forEach((crew, i) => {
    const x = xs[i];
    // hanger hook
    add(new THREE.BoxGeometry(0.08, 0.28, 0.28), steel, x, y0 + 2.20, z + 0.10);
    const stand = add(new THREE.BoxGeometry(0.50, 0.06, 0.16), dark, x, y0 + 0.10, z - 0.42);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.15),
      new THREE.MeshBasicMaterial({ map: nameplateTex(crew.name, crew.accentHex), toneMapped: false }));
    plate.position.set(x, y0 + 0.20, z - 0.50); rack.add(plate);

    const suit = makeSuit({ ...crew, envMap });
    suit.position.set(x, y0, z);
    suit.rotation.y = Math.PI;           // face into the cabin
    rack.add(suit);

    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.5, 10),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, y0 + 1.25, z);
    hit.userData.eva = crew.name;
    rack.add(hit); hits.push(hit);

    slots.push({ name: crew.name, suit, hit, accent: crew.accent, accentHex: crew.accentHex });
  });

  scene.add(rack);

  let worn = null;
  function wear(name) {
    if (worn === name) worn = null;
    else if (EVA_CREW.some(c => c.name === name)) worn = name;
    for (const s of slots) s.suit.visible = s.name !== worn;
    return worn;
  }

  return {
    rack, slots, hits, wear,
    get worn() { return worn; },
    hit(raycaster) {
      const h = raycaster.intersectObjects(hits, false)[0];
      return h && h.distance < 8 ? h : null;
    },
    press(raycaster) {
      const h = this.hit(raycaster);
      if (!h) return false;
      this.wear(h.object.userData.eva);
      return true;
    },
  };
}
