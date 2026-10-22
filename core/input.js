// input.js — pointing/pressing floating panels with XR controllers, hands, and a desktop mouse.
// A "target" is any PlaneGeometry mesh whose mesh.userData.panel implements:
//   hit(uv) -> region {id,...} | null,   press(id),   setHover(id | null)
import * as THREE from 'three';

/** Shared ray-casting + hover bookkeeping. getTargets() returns the meshes that are interactive right now. */
export class Interaction {
  constructor({ getTargets }) {
    this.getTargets = getTargets; this.raycaster = new THREE.Raycaster();
    this.hoverState = new Map(); this.known = new Set(); this._hits = []; this._want = new Map(); this._hit = {};   // reused: no per-frame allocation
  }
  /** -> { point, distance, panel, region } for the nearest target hit (region may be null), or null */
  hitTest(origin, dir) {
    this.raycaster.set(origin, dir); this.raycaster.far = 10;
    const hits = this._hits; hits.length = 0;
    this.raycaster.intersectObjects(this.getTargets(), false, hits);
    if (!hits.length) return null;
    const h = hits[0], panel = h.object.userData.panel; this.known.add(panel);
    return { point: h.point, distance: h.distance, panel, region: panel.hit(h.uv) };
  }
  press(hit) { if (hit && hit.region) hit.panel.press(hit.region.id); }
  setHover(sourceKey, hit) { this.hoverState.set(sourceKey, hit); }
  clearHover(sourceKey) { this.hoverState.delete(sourceKey); }
  applyHover() {
    const want = this._want; want.clear();
    for (const v of this.hoverState.values()) if (v && v.region) want.set(v.panel, v.region.id);
    for (const t of this.getTargets()) this.known.add(t.userData.panel);
    for (const p of this.known) p.setHover(want.get(p) ?? null);
  }
}

export const HAND_JOINTS = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip', 'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip', 'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip', 'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip', 'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];

/**
 * XR controllers + hands for 2 input sources:
 *  - tracked-pointer ray (line + cursor dot), trigger/pinch 'select' presses the pointed region
 *  - thumbstick X flick -> onAxisX(+1|-1); A/X -> onButton('a'), B/Y -> onButton('b')
 *  - hand-tracking: joint spheres + index-fingertip "poke" on target planes
 * Call update() once per frame (after app state updates, before render).
 */
export class XRInput {
  constructor({ renderer, scene, camera, interaction, onAxisX, onButton, rayColor = 0xf3ecda, handColor = 0xe9dcc0 }) {
    Object.assign(this, { renderer, camera, interaction, onAxisX, onButton });
    this.tmpM = new THREE.Matrix4(); this.tmpO = new THREE.Vector3(); this.tmpD = new THREE.Vector3(); this.tmpV = new THREE.Vector3();
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.controllers = [];
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: rayColor, transparent: true, opacity: .55 }));
      line.scale.z = 3; line.visible = false; c.add(line);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(.012, 20), new THREE.MeshBasicMaterial({ color: rayColor, transparent: true, opacity: .9, depthTest: false }));
      dot.renderOrder = 20; dot.visible = false; scene.add(dot);
      c.userData = { line, dot, source: null, hit: null, stickArmed: true, btnPrev: {} };
      c.addEventListener('connected', (e) => { c.userData.source = e.data; line.visible = e.data.targetRayMode === 'tracked-pointer'; });
      c.addEventListener('disconnected', () => { c.userData.source = null; line.visible = false; dot.visible = false; interaction.clearHover(c); });
      c.addEventListener('selectstart', () => { c.userData.hitAtStart = c.userData.hit; });
      c.addEventListener('select', () => interaction.press(c.userData.hit || c.userData.hitAtStart));
      scene.add(c);
      const grip = renderer.xr.getControllerGrip(i);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.012, .02, .11, 16), new THREE.MeshBasicMaterial({ color: 0x2a3142 }));
      body.rotation.x = -Math.PI / 2 + .5; body.position.z = .02; grip.add(body);
      grip.addEventListener('connected', (e) => { grip.visible = !e.data.hand; });
      scene.add(grip);
      const hand = renderer.xr.getHand(i);
      hand.userData = { pokeArmed: true };
      scene.add(hand);
      const jm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: handColor, transparent: true, opacity: .8 }), 25);
      jm.frustumCulled = false; jm.visible = false; scene.add(jm);
      this.controllers.push({ c, grip, hand, jm });
    }
  }
  update() {
    const session = this.renderer.xr.getSession(); if (!session) return;
    const { tmpM, tmpO, tmpD, tmpV, interaction } = this;
    for (const { c, hand, jm } of this.controllers) {
      const ud = c.userData, src = ud.source;
      if (!src) { jm.visible = false; continue; }
      c.updateMatrixWorld(true);
      tmpM.identity().extractRotation(c.matrixWorld);
      tmpO.setFromMatrixPosition(c.matrixWorld); tmpD.set(0, 0, -1).applyMatrix4(tmpM);
      const h = interaction.hitTest(tmpO, tmpD); ud.hit = h; interaction.setHover(c, h);
      ud.line.visible = src.targetRayMode === 'tracked-pointer';
      ud.line.material.opacity = src.hand ? .3 : .55;
      ud.line.scale.z = h ? h.distance : 3;
      ud.dot.visible = !!h && ud.line.visible;
      if (h) { ud.dot.position.copy(h.point); ud.dot.quaternion.copy(this.camera.quaternion); }
      const gp = src.gamepad;
      if (gp) {
        const ax = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
        if (ud.stickArmed && Math.abs(ax) > .6) { ud.stickArmed = false; this.onAxisX?.(ax > 0 ? 1 : -1); }
        if (Math.abs(ax) < .3) ud.stickArmed = true;
        const a = gp.buttons[4]?.pressed, b = gp.buttons[5]?.pressed;
        if (a && !ud.btnPrev.a) this.onButton?.('a');
        if (b && !ud.btnPrev.b) this.onButton?.('b');
        ud.btnPrev.a = a; ud.btnPrev.b = b;
      }
      if (src.hand) {
        hand.updateMatrixWorld(true);
        let n = 0;
        for (let j = 0; j < HAND_JOINTS.length; j++) {
          const jt = hand.joints[HAND_JOINTS[j]]; if (!jt || !jt.visible) continue;
          jt.getWorldPosition(tmpV); const r = (jt.jointRadius || .008) * .9;
          tmpM.makeScale(r, r, r).setPosition(tmpV); jm.setMatrixAt(n++, tmpM);
        }
        jm.count = n; jm.instanceMatrix.needsUpdate = true; jm.visible = n > 0;
        const tip = hand.joints['index-finger-tip'];
        if (tip && tip.visible) { tip.getWorldPosition(tmpV); this.poke(hand, tmpV); }
      } else jm.visible = false;
    }
    interaction.applyHover();
  }
  poke(hand, p) {
    const ud = hand.userData; let best = null;
    for (const mesh of this.interaction.getTargets()) {
      const local = mesh.worldToLocal(this.tmpO.copy(p));
      const pw = mesh.geometry.parameters.width, ph = mesh.geometry.parameters.height;
      if (Math.abs(local.x) > pw / 2 || Math.abs(local.y) > ph / 2) continue;
      if (local.z < -0.05 || local.z > 0.06) continue;
      best = { mesh, local };
    }
    if (!best) { ud.pokeArmed = true; return; }
    const { mesh, local } = best;
    if (local.z > 0.03) ud.pokeArmed = true;
    if (ud.pokeArmed && local.z < 0.008) {
      ud.pokeArmed = false;
      const n = new THREE.Vector3(0, 0, -1).transformDirection(mesh.matrixWorld);
      const o = p.clone().addScaledVector(n, -0.1);
      this.interaction.press(this.interaction.hitTest(o, n));
    }
  }
}

/**
 * Desktop fallback: drag to look (yaw/pitch, grab-style), click to press, hover cursor, wheel zoom.
 * update() applies yaw/pitch to the camera when not in XR.
 */
export class DesktopControls {
  constructor({ canvas, camera, renderer, interaction, yawDeg = 0, pitchDeg = 0, fovMin = 35, fovMax = 95 }) {
    Object.assign(this, { canvas, camera, renderer, interaction });
    this.yaw = THREE.MathUtils.degToRad(yawDeg); this.pitch = THREE.MathUtils.degToRad(pitchDeg); this.drag = null;
    const ndc = new THREE.Vector2();
    const mouseHit = (e) => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      interaction.raycaster.setFromCamera(ndc, camera);
      return interaction.hitTest(interaction.raycaster.ray.origin.clone(), interaction.raycaster.ray.direction.clone());
    };
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (renderer.xr.isPresenting) return;
      const d = this.drag;
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.hypot(dx, dy) > 4) { d.moved = true; canvas.classList.add('dragging'); }
        const k = (camera.fov * Math.PI / 180) / window.innerHeight;
        this.yaw = d.yaw + dx * k; this.pitch = THREE.MathUtils.clamp(d.pitch + dy * k, -1.4, 1.4);
      } else {
        const h = mouseHit(e); interaction.setHover('mouse', h); interaction.applyHover();
        canvas.classList.toggle('pointing', !!(h && h.region));
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      canvas.classList.remove('dragging');
      if (this.drag && !this.drag.moved) interaction.press(mouseHit(e));
      this.drag = null;
    });
    canvas.addEventListener('wheel', (e) => { camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * .03, fovMin, fovMax); camera.updateProjectionMatrix(); e.preventDefault(); }, { passive: false });
  }
  update() { if (!this.renderer.xr.isPresenting) this.camera.rotation.set(this.pitch, this.yaw, 0); }
}
