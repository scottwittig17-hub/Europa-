/* Ridge Base b13-screens - wall screens with Europa science, the base's story and the upgrade list (Next Steps item 7).
 * Each screen cycles its pages every 18 s; point and pull the trigger (VR) or click (desktop) to turn the page.
 * Science figures are published values (NASA / ESA); where scientists' estimates vary, the screen says so. */
import * as THREE from 'three';

const SCIENCE = [
  { title: 'EUROPA \u00b7 MOON OF JUPITER', accent: '#7fd8ff', lines: [
    ['Size', '3,122 km across \u2014 a little smaller than our Moon'],
    ['Gravity', '1.315 m/s\u00b2, 13% of Earth\u2019s (80 kg feels like 10.7 kg)'],
    ['Orbit', 'once round Jupiter every 3.55 days, about 671,000 km out'],
    ['Locked', 'the same side always faces Jupiter, so Jupiter never moves in our sky'],
    ['Found', 'by Galileo Galilei, January 1610'],
  ] },
  { title: 'ATMOSPHERE & SURFACE', accent: '#ffc46b', lines: [
    ['Air', 'almost none: a trace of oxygen (O\u2082), made when Jupiter\u2019s radiation splits the ice'],
    ['Pressure', 'about a trillionth of Earth\u2019s at sea level'],
    ['Cold', 'about \u2212160 \u00b0C at the equator, about \u2212220 \u00b0C at the poles'],
    ['Radiation', 'about 5.4 sieverts a day on the open ice \u2014 lethal without shielding'],
    ['Young ice', 'very few craters; the surface is thought to be only about 40\u201390 million years old'],
  ] },
  { title: 'THE HIDDEN OCEAN', accent: '#8fe0c8', lines: [
    ['Ice shell', 'estimates vary, most around 15\u201325 km thick'],
    ['Ocean', 'perhaps 60\u2013150 km deep \u2014 about twice the water in all of Earth\u2019s oceans'],
    ['Salty', 'sodium chloride (table salt) has been seen on the surface, likely from the ocean'],
    ['Clipper', 'NASA Europa Clipper launched Oct 2024, arrives at Jupiter in 2030'],
    ['JUICE', 'ESA\u2019s JUICE launched 2023; it will fly past Europa twice in 2032'],
  ] },
];
const STORY = [
  { title: 'RIDGE BASE \u00b7 OUR STORY', accent: '#f3d27a', para: [
    'Ridge Base stands on four legs over the trench that the E-7 Ice Mining Rig cut along the ridge. The rig still crawls the trench, and passes right under the glass floor.',
    'Crew and science gear come down in the gold lander on the Jupiter-side rim. The big ship stays in orbit; look up and you can see it pass.',
  ] },
  { title: 'THE SHAFT TO THE OCEAN', accent: '#8fe0c8', para: [
    'On the far rim, across from the lander, stands the drill tower over the bore. The shaft was cut by a one-way cylindrical boring machine. It melted and ground its way straight down through the ice shell.',
    'When it broke through, it kept going and sank into the dark ocean below. It was never meant to come back. The bore it left is the way down for the submarine.',
  ] },
  { title: 'BASE UPGRADES \u00b7 NOV 24 TESTS', accent: '#f3d27a', list: [
    '1  Railing join flashing fixed  (b13-railing)',
    '2  Bigger lander and rig  (b13-scale)',
    '3  Drill tower over the sub bore  (b13-drill)',
    '4  Sit in a chair or on the couch  (b13-sit)',
    '5  Your own music files  (b13-mymusic)',
    '7  These wall screens  (b13-screens)',
    '8  Comet head first  (surface-r12t-comet)',
    '9  Enceladus e6 on the hub  (hub-test)',
    '10 Clean 8K Milky Way  (surface-r12w)',
    '11 Back to hub buttons  (e7-hub, beach-hub)',
    '6  Ride the rig  \u2014 not built yet',
  ] },
];

function wrap(g, text, maxW) {
  const words = text.split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
function drawPage(g, W, H, page, idx, total) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b1724'); gr.addColorStop(1, '#050b12'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = page.accent; g.lineWidth = 6; g.strokeRect(12, 12, W - 24, H - 24);
  g.fillStyle = page.accent; g.font = '600 56px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(page.title, 60, 100);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(60, 122, W - 120, 3);
  let y = 180;
  if (page.lines) for (const [k, v] of page.lines) {
    g.fillStyle = page.accent; g.font = '600 38px sans-serif'; g.fillText(k, 60, y);
    g.fillStyle = '#e8f4ff'; g.font = '36px sans-serif';
    for (const l of wrap(g, v, W - 380)) { g.fillText(l, 300, y); y += 42; }
    y += 22;
  }
  if (page.para) for (const p of page.para) { g.fillStyle = '#e8f4ff'; g.font = '38px sans-serif'; for (const l of wrap(g, p, W - 120)) { g.fillText(l, 60, y); y += 50; } y += 28; }
  if (page.list) { g.font = '32px sans-serif'; page.list.forEach((t, i) => { g.fillStyle = /not built/.test(t) ? '#9aa6b2' : '#e8f4ff'; g.fillText(t, 60, 172 + i * 44); }); }
  g.fillStyle = '#7f98ad'; g.font = '28px sans-serif'; g.textAlign = 'right';
  g.fillText(`${idx + 1} / ${total}  \u00b7  tap for next`, W - 50, H - 44);
}

export function buildInfoScreens({ scene, list }) {
  const screens = [];
  for (const { pages, x, y, z, ry, w } of list) {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const h = w * 9 / 16, grp = new THREE.Group();
    const bez = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.4, metalness: 0.6 }));
    bez.position.z = -0.035; grp.add(bez);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); grp.add(face);
    grp.position.set(x, y, z); grp.rotation.y = ry; scene.add(grp);
    const sc = { face, pages, i: 0, t: 0, draw() { drawPage(g, 1280, 720, pages[this.i], this.i, pages.length); tex.needsUpdate = true; },
      next() { this.i = (this.i + 1) % pages.length; this.t = 0; this.draw(); } };
    face.userData.infoScreen = sc; sc.draw(); screens.push(sc);
  }
  const faces = screens.map(s => s.face);
  return {
    screens, faces,
    hit(raycaster) { const h = raycaster.intersectObjects(faces, false)[0]; return h && h.distance < 25 ? h : null; },
    press(raycaster) { const h = this.hit(raycaster); if (!h) return false; h.object.userData.infoScreen.next(); return true; },
    tick(dt) { for (const s of screens) { s.t += dt; if (s.t > 18) s.next(); } },
  };
}
export const PAGES = { SCIENCE, STORY };
