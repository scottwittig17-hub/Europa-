/* Ridge Base b19-story-crisp - wall screens with Europa science and the 9-page story
 * (crew portraits + 8-panel storyboard). The Story board is a crisp 2048x1152 (exact 16:9)
 * canvas with mipmapped anisotropic filtering, a solid matte background, and larger
 * high-contrast type so it stays sharp and rock-steady in the headset.
 * The Science screen is unchanged from b18. Each screen cycles its pages every 18 s;
 * point and pull the trigger (VR) or click (desktop) to turn the page.
 * Science figures are published values (NASA / ESA); where scientists' estimates vary, the screen says so. */
import * as THREE from 'three';

const SCIENCE = [
  { title: 'EUROPA \u00b7 MOON OF JUPITER', accent: '#7fd8ff', credit: 'Source: NASA / ESA', lines: [
    ['Size', '3,122 km across \u2014 a little smaller than our Moon'],
    ['Gravity', '1.315 m/s\u00b2, 13% of Earth\u2019s (80 kg feels like 10.7 kg)'],
    ['Orbit', 'once round Jupiter every 3.55 days, about 671,000 km out'],
    ['Locked', 'the same side always faces Jupiter, so Jupiter never moves in our sky'],
    ['Found', 'by Galileo Galilei, January 1610'],
  ] },
  { title: 'ATMOSPHERE & SURFACE', accent: '#ffc46b', credit: 'Source: NASA / ESA', lines: [
    ['Air', 'almost none: a trace of oxygen (O\u2082), made when Jupiter\u2019s radiation splits the ice'],
    ['Pressure', 'about a trillionth of Earth\u2019s at sea level'],
    ['Cold', 'about \u2212160 \u00b0C at the equator, about \u2212220 \u00b0C at the poles'],
    ['Radiation', 'about 5.4 sieverts a day on the open ice \u2014 lethal without shielding'],
    ['Young ice', 'very few craters; the surface is thought to be only about 40\u201390 million years old'],
  ] },
  { title: 'THE HIDDEN OCEAN', accent: '#8fe0c8', credit: 'Source: NASA / ESA', lines: [
    ['Ice shell', 'estimates vary, most around 15\u201325 km thick'],
    ['Ocean', 'perhaps 60\u2013150 km deep \u2014 about twice the water in all of Earth\u2019s oceans'],
    ['Salty', 'sodium chloride (table salt) has been seen on the surface, likely from the ocean'],
    ['Clipper', 'NASA Europa Clipper launched Oct 2024, arrives at Jupiter in 2030'],
    ['JUICE', 'ESA\u2019s JUICE launched 2023; it will fly past Europa twice in 2032'],
  ] },
];

const STORY = [
  { title: 'OUR CREW \u00b7 EUROPA RIDGE BASE', accent: '#f3d27a', crew: true,
    caption: 'Leyra & Kai (sisters) and Mars \u2014 building and exploring Europa together with Scott.' },
  { title: '1 \u00b7 MINING ON THE ASTEROID', accent: '#f3d27a', para: [
    'Long before Europa, the work began out in the quiet dark of the belt \u2014 anchored to a tumbling asteroid, cutting ore and buried ice in near-zero gravity.',
    'Dust drifted like slow smoke across the floodlights while the haulers filled their holds: patient frontier work, one anchor and one cut at a time.',
  ] },
  { title: '2 \u00b7 COMING TO EUROPA', accent: '#f3d27a', para: [
    'The big stainless ship carried the crew across the dark and settled into high orbit above Europa, Jupiter filling the sky like a storm in amber and cream.',
    'The ship stayed aloft. The gold lander dropped to the Jupiter-side rim, engines kissing the snow, its ramp lowering toward the ridge.',
  ] },
  { title: '3 \u00b7 RIDGE BASE & MINING RIG E-7', accent: '#f3d27a', para: [
    'Ridge Base stands on four steel legs over a ten-metre canyon cut along the ice ridge. Inside the glass cabin, the vacuum stays on the far side of the panes.',
    'Below the glass floor, the E-7 Ice Mining Rig still crawls the trench \u2014 treads rolling, cutter teeth grinding, kicking up slow plumes of frost as it passes under your boots.',
  ] },
  { title: '4 \u00b7 DRILLING INTO THE ICE', accent: '#f3d27a', para: [
    'Across the trench on the far rim, opposite the lander, stands Leyra\u2019s silver drill tower, its red warning beacon pulsing against the stars.',
    'Beneath it, a one-way cylindrical boring machine melted and ground straight down through fifteen to twenty-five kilometres of ice. When it broke through, it sank into the dark ocean. It was never meant to return.',
  ] },
  { title: '5 \u00b7 DEPLOYING THE SUBMARINE', accent: '#f3d27a', para: [
    'What the boring machine left behind became the doorway. At the borehead, the crew lowered the submarine nose-first into the vertical shaft, easing it down past miles of gleaming blue ice.',
    'As the hatch sealed and the tether paid out, Jupiter\u2019s radiation and the starfield vanished overhead.',
  ] },
  { title: '6 \u00b7 THE HIDDEN OCEAN', accent: '#f3d27a', para: [
    'Below the ice shell lies a saltwater ocean deeper than any on Earth. The submarine drifts through the dark while fine ice particles settle like underwater snow from the ceiling miles above.',
    'Far below, faint amber light blooms along the seafloor: hydrothermal vents warming the dark, a living hearth under the ice.',
  ] },
  { title: '7 \u00b7 SATURN & ENCELADUS', accent: '#f3d27a', para: [
    'Europa isn\u2019t the only horizon. Further out along the outer-system route, Saturn\u2019s vast rings arch high above Enceladus\u2019s bright ice plain \u2014 sharp silver light, crisp shadows, and a sky that makes every mile of the journey feel worth it.',
  ] },
  { title: '8 \u00b7 THE BLACK SAND BEACH', accent: '#f3d27a', para: [
    'Between the steel, the drilling, and the deep water, there is a quieter shore \u2014 the black sand beach under two moons, where the waves roll slow and music plays softly against the night.',
    'This world belongs to Scott and Leyra, with sisters Leyra and Kai and Mars sharing the journey: a place to watch the light, listen to the music, and breathe together at the far end of the solar system.',
  ] },
];

const CREW_KEYS = ['leyra', 'kai', 'mars'];
const CREW_NAMES = ['Leyra', 'Kai', 'Mars'];
const crewImgs = {};
for (const k of CREW_KEYS) {
  const img = typeof Image !== 'undefined' ? new Image() : { complete: false, naturalWidth: 0, src: '' };
  img.src = `./assets/crew-${k}.jpg`;
  crewImgs[k] = img;
}

function wrap(g, text, maxW) {
  const words = text.split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}

/* ---------- Science screen (unchanged from b18): 1280x720, original type and palette ---------- */
function drawSciencePage(g, W, H, page, idx, total) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b1724'); gr.addColorStop(1, '#050b12'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = page.accent; g.lineWidth = 6; g.strokeRect(12, 12, W - 24, H - 24);
  g.fillStyle = page.accent; g.font = '600 56px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(page.title, 60, 96);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(60, 116, W - 120, 3);
  let y = 180;
  if (page.lines) for (const [k, v] of page.lines) {
    g.fillStyle = page.accent; g.font = '600 38px sans-serif'; g.fillText(k, 60, y);
    g.fillStyle = '#e8f4ff'; g.font = '36px sans-serif';
    for (const l of wrap(g, v, W - 380)) { g.fillText(l, 300, y); y += 42; }
    y += 22;
  }
  g.fillStyle = '#7f98ad'; g.font = '26px sans-serif'; g.textBaseline = 'alphabetic';
  if (page.credit) { g.textAlign = 'left'; g.fillText(page.credit, 60, H - 44); }
  g.textAlign = 'right';
  g.fillText(`${idx + 1} / ${total}  \u00b7  tap for next`, W - 50, H - 44);
}

/* ---------- Story board (b19): 2048x1152, solid matte field, no hairlines/gradients, larger type ---------- */
const STORY_BG = '#0a101a';
const STORY_TEXT = '#f4f7fb';
const STORY_ACCENT = '#f3d27a';
const STORY_PAD = 80;
const STORY_FRAME = 18;

function fillFrame(g, W, H, color, t) {
  g.fillStyle = color;
  g.fillRect(0, 0, W, t);
  g.fillRect(0, H - t, W, t);
  g.fillRect(0, t, t, H - 2 * t);
  g.fillRect(W - t, t, t, H - 2 * t);
}

function drawCrewCrisp(g, W, H, page) {
  const size = 520, gap = 72, frame = 22, inset = 8;
  const total = 3 * size + 2 * gap;
  const x0 = (W - total) / 2, y0 = 210;
  g.imageSmoothingEnabled = true;
  if (g.imageSmoothingQuality) g.imageSmoothingQuality = 'high';
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (size + gap);
    g.fillStyle = '#16181e'; g.fillRect(x - frame, y0 - frame, size + frame * 2, size + frame * 2);
    g.fillStyle = '#c4a45a'; g.fillRect(x - inset, y0 - inset, size + inset * 2, size + inset * 2);
    const img = crewImgs[CREW_KEYS[i]];
    if (img && img.complete && img.naturalWidth) g.drawImage(img, x, y0, size, size);
    else { g.fillStyle = '#121820'; g.fillRect(x, y0, size, size); }
    g.fillStyle = STORY_ACCENT; g.font = '700 48px sans-serif';
    g.fillText(CREW_NAMES[i], x + size / 2, y0 + size + 62);
  }
  g.fillStyle = STORY_TEXT; g.font = '600 44px sans-serif';
  let y = y0 + size + 124;
  for (const l of wrap(g, page.caption, W - STORY_PAD * 2)) { g.fillText(l, W / 2, y); y += 58; }
}

function drawStoryPage(g, W, H, page, idx, total) {
  g.fillStyle = STORY_BG; g.fillRect(0, 0, W, H);
  fillFrame(g, W, H, STORY_ACCENT, STORY_FRAME);
  g.fillStyle = STORY_ACCENT; g.font = '700 92px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(page.title, STORY_PAD, 140);
  g.fillStyle = STORY_ACCENT; g.fillRect(STORY_PAD, 164, W - STORY_PAD * 2, 12);
  if (page.crew) drawCrewCrisp(g, W, H, page);
  if (page.para) {
    let y = 220;
    g.fillStyle = STORY_TEXT; g.font = '600 72px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (const p of page.para) {
      for (const l of wrap(g, p, W - STORY_PAD * 2)) { g.fillText(l, STORY_PAD, y); y += 96; }
      y += 24;
    }
  }
  g.fillStyle = '#c5d0dc'; g.font = '600 40px sans-serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'right';
  g.fillText(`${idx + 1} / ${total}  \u00b7  tap for next`, W - STORY_PAD, H - 52);
}

function prepTexture(tex, { crisp, maxAniso }) {
  tex.colorSpace = THREE.SRGBColorSpace;
  if (crisp) {
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = maxAniso;
  } else {
    tex.anisotropy = 4;
  }
  return tex;
}

export function buildInfoScreens({ scene, list, maxAniso = 4 }) {
  const screens = [];
  for (const { pages, x, y, z, ry, w, crisp } of list) {
    const W = crisp ? 2048 : 1280, H = crisp ? 1152 : 720;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const tex = prepTexture(new THREE.CanvasTexture(c), { crisp: !!crisp, maxAniso });
    const h = w * 9 / 16, grp = new THREE.Group();
    const bezMat = crisp
      ? new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.7, metalness: 0.2 })
      : new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.4, metalness: 0.6 });
    const bez = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06), bezMat);
    // Story face sits 18 mm in front of the bezel front (no coplanar z-fighting). Science keeps the b18 offset.
    bez.position.z = crisp ? -0.04 : -0.035;
    grp.add(bez);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    if (crisp) face.position.z = 0.008;
    grp.add(face);
    grp.position.set(x, y, z); grp.rotation.y = ry; scene.add(grp);
    const sc = {
      face, pages, i: 0, t: 0, crisp: !!crisp, W, H,
      draw() {
        if (this.crisp) drawStoryPage(g, this.W, this.H, pages[this.i], this.i, pages.length);
        else drawSciencePage(g, this.W, this.H, pages[this.i], this.i, pages.length);
        tex.needsUpdate = true;
      },
      next() { this.i = (this.i + 1) % pages.length; this.t = 0; this.draw(); },
    };
    face.userData.infoScreen = sc; sc.draw(); screens.push(sc);
  }
  // Redraw any screen that shows the crew page once each portrait finishes loading.
  const redrawCrew = () => { for (const s of screens) if (s.pages.some(p => p.crew)) s.draw(); };
  for (const img of Object.values(crewImgs)) {
    if (img.complete && img.naturalWidth) redrawCrew();
    else img.onload = redrawCrew;
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
