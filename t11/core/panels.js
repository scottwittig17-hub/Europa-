// panels.js — floating canvas-texture UI panels with hit regions (works with input.js).
import * as THREE from 'three';

export function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
export function spacedText(ctx, text, x, y, spacingPx) {
  if ('letterSpacing' in ctx) { ctx.letterSpacing = spacingPx + 'px'; const w = ctx.measureText(text).width; ctx.fillText(text, x + spacingPx / 2, y); ctx.letterSpacing = '0px'; return w; }
  ctx.fillText(text.split('').join('\u200A'), x, y);
}
export function chevron(ctx, x, y, size, dir, color, lw) {
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - dir * size * .25, y - size * .5); ctx.lineTo(x + dir * size * .25, y); ctx.lineTo(x - dir * size * .25, y + size * .5); ctx.stroke();
}
/** Round button that registers its own hit region on `panel` (hover/pressed states handled). */
export function circleBtn(ctx, panel, id, x, y, r, disabled, drawIcon) {
  const hov = panel.hover === id && !disabled, pr = panel.pressed === id;
  ctx.save(); ctx.globalAlpha = disabled ? .35 : 1;
  ctx.fillStyle = pr ? 'rgba(243,236,218,.3)' : hov ? 'rgba(7,11,20,.72)' : 'rgba(7,11,20,.5)';
  ctx.beginPath(); ctx.arc(x, y, r * (pr ? .94 : 1), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hov ? 'rgba(243,236,218,.7)' : 'rgba(243,236,218,.18)'; ctx.lineWidth = r * .04; ctx.stroke();
  drawIcon(ctx, x, y, r); ctx.restore();
  panel.regions.push({ id, x: x - r * 1.1, y: y - r * 1.1, w: r * 2.2, h: r * 2.2, disabled });
}

/**
 * new CanvasPanel(widthM, heightM, pxPerM, drawFn(ctx, panel), { anisotropy, renderOrder, hoverStableMs, minRedrawMs })
 *  - drawFn redraws everything and pushes {id,x,y,w,h,disabled} into panel.regions (canvas px)
 *  - set panel.dirty = true to redraw; call panel.refresh() once per frame (cheap no-op when clean)
 *  - panel.onPress = (id) => {}     (input.js calls panel.press(id): flash + onPress)
 * Anti-judder rules (a canvas redraw = full texture upload + mipmap rebuild, a visible hitch on Quest):
 *  - hover changes are DEBOUNCED: a new hover id must stay the same for hoverStableMs (~5 frames at 72 Hz)
 *    before it is committed, so ray/hand jitter at a button edge never toggles the highlight;
 *  - redraws are RATE-LIMITED to one per minRedrawMs (default 100 ms = max 10 uploads/s); pending changes are kept, not lost;
 *  - nothing is uploaded unless something visibly changed (hover over a non-hoverable spot = no-op).
 * panel.uploads counts texture uploads (for tests / stats).
 * Implements the input.js target interface: hit(uv) / press(id) / setHover(id).
 */
export class CanvasPanel {
  constructor(wM, hM, pxPerM, drawFn, { anisotropy = 8, renderOrder = 4, hoverStableMs = 70, minRedrawMs = 100, superSample = 1 } = {}) {
    // superSample: the canvas is allocated k× larger and drawn with a k× transform, so draw functions keep using LOGICAL px
    // (ctx.lw / ctx.lh, regions in logical px) while the headset gets k× the texel density. Mipmapped + anisotropic.
    this.ss = superSample; this.lw = Math.round(wM * pxPerM); this.lh = Math.round(hM * pxPerM);
    this.canvas = document.createElement('canvas'); this.canvas.width = Math.round(this.lw * superSample); this.canvas.height = Math.round(this.lh * superSample);
    this.ctx = this.canvas.getContext('2d'); this.ctx.lw = this.lw; this.ctx.lh = this.lh;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = anisotropy;
    this.tex.generateMipmaps = true; this.tex.minFilter = THREE.LinearMipmapLinearFilter; this.tex.magFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = renderOrder; this.mesh.userData.panel = this;
    this.w = wM; this.h = hM; this.regions = []; this.hover = null; this.pressed = null; this.drawFn = drawFn; this.dirty = true; this.onPress = null;
    this.hoverStableMs = hoverStableMs; this.minRedrawMs = minRedrawMs; this.uploads = 0;
    this._cand = null; this._candSince = 0; this._lastDraw = -1e9;
  }
  hit(uv) {
    const x = uv.x * this.lw, y = (1 - uv.y) * this.lh;
    for (const r of this.regions) if (!r.disabled && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    return null;
  }
  _hoverable(id) { if (id == null) return false; for (const r of this.regions) if (r.id === id && !r.disabled) return true; return false; }
  /** Called every frame by Interaction.applyHover (and on desktop mouse moves). Only records a candidate; refresh() commits it once stable. */
  setHover(id, now = performance.now()) {
    if (!this._hoverable(id)) id = null;
    if (id !== this._cand) { this._cand = id; this._candSince = now; }
  }
  flash(id) { this.pressed = id; this.dirty = true; setTimeout(() => { if (this.pressed === id) { this.pressed = null; this.dirty = true; } }, 160); }
  press(id) { this.flash(id); this.onPress?.(id); }
  refresh(now = performance.now()) {
    if (this._cand !== this.hover && now - this._candSince >= this.hoverStableMs) { this.hover = this._cand; this.dirty = true; }
    if (!this.dirty || now - this._lastDraw < this.minRedrawMs) return;
    this.dirty = false; this._lastDraw = now; this.regions.length = 0;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.ctx.setTransform(this.ss, 0, 0, this.ss, 0, 0); this.drawFn(this.ctx, this);
    this.tex.needsUpdate = true; this.uploads++;
  }
  /** Screen-space (CSS px) centre of a region — for desktop tests. */
  screenPos(id, camera) { return regionScreenPos(this.mesh, { width: this.lw, height: this.lh }, this.regions.find((r) => r.id === id), camera); }
}

/** Project the centre of a canvas-px rect on a PlaneGeometry mesh to CSS px. */
export function regionScreenPos(mesh, canvas, r, camera) {
  if (!r) return null;
  const pw = mesh.geometry.parameters.width, ph = mesh.geometry.parameters.height;
  const v = new THREE.Vector3(((r.x + r.w / 2) / canvas.width - .5) * pw, (.5 - (r.y + r.h / 2) / canvas.height) * ph, 0);
  mesh.updateMatrixWorld(true); v.applyMatrix4(mesh.matrixWorld).project(camera);
  return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
}

/**
 * StableHover: the same debounce + rate limit CanvasPanel uses, for custom input targets (e.g. a button drawn on a big page canvas).
 *   const sh = new StableHover({ stableMs: 70, minIntervalMs: 100 });
 *   target.setHover = (id) => sh.set(id);           // every frame from Interaction.applyHover
 *   if (sh.update(now)) redraw(sh.value);            // once per frame; true only when the committed value changed
 */
export class StableHover {
  constructor({ stableMs = 70, minIntervalMs = 100, initial = null } = {}) { Object.assign(this, { stableMs, minIntervalMs }); this.value = initial; this._cand = initial; this._since = 0; this._last = -1e9; }
  set(v, now = performance.now()) { if (v !== this._cand) { this._cand = v; this._since = now; } }
  update(now = performance.now()) {
    if (this._cand === this.value || now - this._since < this.stableMs || now - this._last < this.minIntervalMs) return false;
    this.value = this._cand; this._last = now; return true;
  }
}
