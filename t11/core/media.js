// media.js — panorama sphere, still-texture cache, video textures (one active video, stall/error fallback).
import * as THREE from 'three';
import { loadTexture } from './xr-core.js';

/** Vertical-gradient CanvasTexture; stops = [[offset, cssColor], ...] */
export function gradientTexture(stops, { width = 64, height = 256, glow = null } = {}) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, height); for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, width, height);
  if (glow) { const r = x.createRadialGradient(width * glow.x, height * glow.y, 0, width * glow.x, height * glow.y, Math.max(width, height) * glow.r); r.addColorStop(0, glow.color); r.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = r; x.fillRect(0, 0, width, height); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const WARM_SKY_STOPS = [[0, '#c9b49a'], [0.3, '#ecc994'], [0.49, '#f6d9a6'], [0.52, '#8c8452'], [0.75, '#6b5d3c'], [1, '#4a3f29']];

/**
 * createPanorama({ url, radius, eyeY, rotationY, tracker, fallbackStops })
 * -> { mesh, ready: Promise<{ ok: boolean }> }
 * Equirect sphere (inside-out) centred at eye height; u=0.5 of the image faces -Z with rotationY=-PI/2.
 * On load failure the sphere gets a soft warm gradient instead (never black).
 */
export function createPanorama({ url, radius = 60, eyeY = 1.2, rotationY = -Math.PI / 2, tracker = null, fallbackStops = WARM_SKY_STOPS, timeoutMs = 20000 } = {}) {
  const geo = new THREE.SphereGeometry(radius, 96, 48); geo.scale(-1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = rotationY; mesh.position.y = eyeY; mesh.renderOrder = -10;
  let p = loadTexture(url, { anisotropy: 1, timeoutMs });
  if (tracker) p = tracker.track(p, 'panorama');
  const ready = p.then((t) => { mat.map = t; mat.needsUpdate = true; return { ok: true }; }, (err) => {
    console.warn('[media] panorama failed, using gradient fallback:', err.message);
    mat.map = gradientTexture(fallbackStops); mat.needsUpdate = true; return { ok: false };
  });
  return { mesh, ready };
}

/** Cached still textures. get(url) -> Promise<Texture> (rejects on failure; failures are cached too). */
export class StillCache {
  constructor({ tracker = null, anisotropy = 8, timeoutMs = 15000 } = {}) { Object.assign(this, { tracker, anisotropy, timeoutMs }); this.map = new Map(); }
  get(url) {
    if (!this.map.has(url)) {
      let p = loadTexture(url, { anisotropy: this.anisotropy, timeoutMs: this.timeoutMs });
      if (this.tracker) p = this.tracker.track(p, url);
      p.catch((e) => console.warn('[media] still failed:', e.message));
      this.map.set(url, p);
    }
    return this.map.get(url);
  }
  prefetch(urls) { for (const u of urls) this.get(u).catch(() => {}); }
}

/** object-fit: cover (plus optional zoom s and translate tx/ty in box units) of an image into a panel. */
export function applyCoverUV(tex, imgAspect, panelAspect, s = 1, tx = 0, ty = 0) {
  const fx = Math.min(1, panelAspect / imgAspect), fy = Math.min(1, imgAspect / panelAspect);
  const cxp = .5 + tx, cyp = .5 + ty;
  const u0 = (s / 2 - cxp) / s, v0d = (s / 2 - cyp) / s, ext = 1 / s;
  const ru = ext * fx, rv = ext * fy;
  const ou = .5 + (u0 - .5) * fx, ovd = .5 + (v0d - .5) * fy;
  tex.repeat.set(ru, rv); tex.offset.set(ou, 1 - (ovd + rv));
}

/**
 * VideoManager — muted/inline/looping <video> + VideoTexture per key, created lazily.
 *  play(entry, { onReady, onFail }) : restart from 0 and play; onReady fires on the first decoded frame.
 *     Calls onFail and pauses on: media error / 404 (entry marked failed, never retried), no first frame
 *     within stallMs, or playback that stops progressing for stallMs (stalls are retried on the next play()).
 *  stop(entry) : pause. Policy: only one active video — starting another schedules the previous one's pause
 *     after `handoffMs` (lets a page-turn finish), unless it becomes active again.
 *  Warns (once) when a video's long side exceeds maxLongSide.
 */
export class VideoManager {
  constructor({ stallMs = 8000, maxLongSide = 1280, handoffMs = 0 } = {}) {
    Object.assign(this, { stallMs, maxLongSide, handoffMs }); this.entries = new Map(); this.active = null;
    this._watch = setInterval(() => this._checkStall(), 1000);
  }
  get(key, url) {
    if (!this.entries.has(key)) {
      const v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = url;
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
      const entry = { key, url, el: v, tex, failed: false, error: null, handlers: null, lastProgress: 0, lastTime: -1, ready: false };
      v.addEventListener('loadedmetadata', () => {
        if (Math.max(v.videoWidth, v.videoHeight) > this.maxLongSide) console.warn(`[media] video ${url} is ${v.videoWidth}x${v.videoHeight} (> ${this.maxLongSide}px long side); using it anyway — cap it with tools/cap_video.sh`);
      });
      v.addEventListener('error', () => { if (v.getAttribute('src')) this._fail(entry, 'media error ' + (v.error ? v.error.code : ''), true); });
      v.addEventListener('timeupdate', () => { if (v.currentTime !== entry.lastTime) { entry.lastTime = v.currentTime; entry.lastProgress = performance.now(); } });
      this.entries.set(key, entry);
    }
    return this.entries.get(key);
  }
  play(entry, { onReady, onFail } = {}) {
    if (entry.failed) { onFail?.(entry.error); return; }
    const prev = this.active;
    if (prev && prev !== entry) setTimeout(() => { if (this.active !== prev) prev.el.pause(); }, this.handoffMs);
    this.active = entry;
    entry.handlers = { onReady, onFail }; entry.ready = false; entry.startedAt = entry.lastProgress = performance.now();
    const v = entry.el;
    let fired = false;
    const ready = () => { if (fired || entry.failed || !entry.handlers || entry.handlers.onReady !== onReady) return; fired = true; entry.ready = true; entry.lastProgress = performance.now(); onReady?.(entry); };
    try { v.currentTime = 0; } catch { /* not seekable yet */ }
    const p = v.play(); if (p) p.catch((e) => { if (e.name !== 'AbortError') console.warn('[media] video play blocked', e); });
    if (v.readyState >= 2) { if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(ready); else ready(); }
    else v.addEventListener('playing', ready, { once: true });
    v.addEventListener('timeupdate', () => { if (v.currentTime > 0) ready(); }, { once: true });   // t10b: rVFC can be suspended in an immersive session (Quest), so also accept the first time update
  }
  stop(entry) { if (!entry) return; entry.el.pause(); if (this.active === entry) this.active = null; }
  _checkStall() {
    const e = this.active; if (!e || e.failed) return;
    const now = performance.now();
    if (document.hidden) { e.startedAt = e.lastProgress = now; return; }   // browsers throttle hidden tabs
    if (!e.ready && now - e.startedAt > this.stallMs) this._fail(e, `no frame after ${this.stallMs} ms`);
    else if (e.ready && !e.el.paused && now - e.lastProgress > this.stallMs) this._fail(e, `stalled for ${this.stallMs} ms`);
  }
  /** permanent=true for media errors (never retried); stalls only fall back for this play() call. */
  _fail(entry, why, permanent = false) {
    if (entry.failed) return;
    console.warn(`[media] video ${entry.url} failed (${why}); falling back to still`);
    if (permanent) { entry.failed = true; entry.error = why; try { entry.el.removeAttribute('src'); entry.el.load(); } catch { /* ignore */ } }
    try { entry.el.pause(); } catch { /* ignore */ }
    if (this.active === entry) this.active = null;
    const h = entry.handlers; entry.handlers = null;
    h?.onFail?.(why);
  }
}
