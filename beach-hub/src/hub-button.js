// Small in-VR "Back to hub" button (Next Steps item 11). Self-contained; three r160.
// A small pill parented to the player rig, low and to the left, so it is out of the way until you look down for it.
// First trigger pull arms it ("Hub? pull again"), a second pull within 3 s leaves. Leaving is an INSTANT fade
// (black in ~0.12 s, no motion), then the VR session ends and the page goes to the hub. Desktop: same, via the
// on-screen link. Browsers end immersive VR on navigation, so you land on the hub page in the 2D browser.
import * as THREE from 'three';

export function createHubButton({ renderer, camera, parent, hubUrl = '../', position = [-0.42, 0.9, -0.62], tiltX = -0.6, width = 0.15 }) {
  const H = width / 3.2;
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.position.set(...position); mesh.rotation.x = tiltX; mesh.renderOrder = 1001; mesh.visible = false; mesh.name = 'hub-button';
  parent.add(mesh);
  let hover = false, armedUntil = 0, leaving = false, lastDraw = '';
  function draw(now) {
    const armed = now < armedUntil, key = `${hover}|${armed}`;
    if (key === lastDraw) return; lastDraw = key;
    const g = c.getContext('2d'); g.clearRect(0, 0, 512, 160);
    g.fillStyle = armed ? 'rgba(120,70,20,0.88)' : hover ? 'rgba(40,90,140,0.85)' : 'rgba(6,16,28,0.7)';
    g.strokeStyle = armed ? 'rgba(255,200,120,0.9)' : 'rgba(120,190,240,0.55)'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(4, 4, 504, 152, 76); g.fill(); g.stroke();
    g.fillStyle = '#e8f4ff'; g.font = '600 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(armed ? 'Hub? pull again' : '\u2302 Back to hub', 256, 84);
    tex.needsUpdate = true;
  }
  draw(0);
  // camera-attached black shell for the instant fade (no world motion, just black)
  const fade = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false }));
  fade.renderOrder = 10000; fade.visible = false; fade.frustumCulled = false; camera.add(fade);
  const domFade = document.getElementById('fade');
  function leave() {
    if (leaving) return; leaving = true;
    fade.visible = true; const t0 = performance.now();
    if (domFade) { domFade.style.transition = 'opacity 0.12s'; domFade.style.opacity = 1; }
    const go = () => { location.href = hubUrl; };
    // a timer, not window rAF (window rAF does not tick during an XR session)
    const iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 120); fade.material.opacity = k;
      if (k < 1) return;
      clearInterval(iv);
      const s = renderer.xr.getSession && renderer.xr.getSession();
      if (s) { s.end().then(go, go); setTimeout(go, 800); } else go();
    }, 16);
  }
  const ray = new THREE.Raycaster(), _m = new THREE.Matrix4();
  function rayFrom(ctl) {
    _m.identity().extractRotation(ctl.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(ctl.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(_m);
    return ray;
  }
  // returns true when the ray hit the button (caller should then ignore the click)
  function press(raycaster) {
    if (!mesh.visible || leaving) return false;
    if (!raycaster.intersectObject(mesh, false)[0]) return false;
    const now = performance.now();
    if (now < armedUntil) leave(); else armedUntil = now + 3000;
    draw(now); return true;
  }
  const ctls = [renderer.xr.getController(0), renderer.xr.getController(1)];
  function tick() {
    const now = performance.now();
    let h = false; if (mesh.visible) for (const ctl of ctls) h = h || !!rayFrom(ctl).intersectObject(mesh, false)[0];
    hover = h; draw(now);
  }
  renderer.xr.addEventListener('sessionstart', () => { mesh.visible = true; });
  renderer.xr.addEventListener('sessionend', () => { mesh.visible = false; });
  return { mesh, press, pressFromController: ctl => press(rayFrom(ctl)), tick, leave };
}
