// xr-core.js — renderer / scene / session plumbing shared by WebXR "panel" apps.
import * as THREE from 'three';

/** CSS-style cubic-bezier easing: cubicBezier(.22,1,.36,1)(t) */
export function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 6; i++) { const d = dsx(t); if (Math.abs(d) < 1e-6) break; t -= (sx(t) - x) / d; } return sy(Math.min(1, Math.max(0, t))); };
}

/** Rejects with Error(label) if `promise` hasn't settled within `ms`. */
export function withTimeout(promise, ms, label = 'timeout') {
  if (!ms) return promise;
  let id;
  return Promise.race([promise, new Promise((_, rej) => { id = setTimeout(() => rej(new Error(label)), ms); })]).finally(() => clearTimeout(id));
}

/** Counts in-flight loads and shows/hides an indicator element. Settles cleanly on success AND failure. */
export class LoadTracker {
  constructor(el) { this.el = el; this.pending = 0; this.failures = []; if (el) el.hidden = true; }
  track(promise, label = '') {
    this.pending++; if (this.el) this.el.hidden = false;
    const done = () => { this.pending = Math.max(0, this.pending - 1); if (this.pending === 0 && this.el) this.el.hidden = true; };
    promise.then(done, (err) => { this.failures.push(label || String(err)); done(); });
    return promise;
  }
}

const texLoader = new THREE.TextureLoader();
/** Load an sRGB texture. Rejects on 404 / decode error / timeout. */
export function loadTexture(url, { anisotropy = 1, timeoutMs = 15000 } = {}) {
  const p = new Promise((res, rej) => texLoader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; res(t);
  }, undefined, () => rej(new Error('texture failed: ' + url))));
  return withTimeout(p, timeoutMs, 'texture timed out: ' + url);
}

/**
 * createXRApp({ canvas, eye, fov, near, far, foveation, maxPixelRatio, framebufferScale, targetFrameRate, background, preserveDrawingBuffer, localClipping })
 * -> { renderer, scene, camera, world, eye, maxAniso, onFrame(cb), enterVR(opts), vrSupport(), compile(), fps, frameMs, stats }
 * Foveation + framebufferScale are set BEFORE any session starts; on session start the XR frame rate is
 * requested at targetFrameRate (72 on Quest = more headroom) when the device supports it.
 * `world` holds the content; it is shifted down by eye.y when the session only grants a head-origin 'local' space.
 */
export function createXRApp({
  canvas, eye = new THREE.Vector3(0, 1.2, 0), fov = 60, near = 0.05, far = 200,
  foveation = 0.6, maxPixelRatio = 2, framebufferScale = 1.0, targetFrameRate = 72, background = 0x070b14, preserveDrawingBuffer = false, localClipping = true,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = localClipping;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(foveation);
  renderer.xr.setFramebufferScaleFactor(framebufferScale);   // must be set before the session starts
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
  camera.position.copy(eye);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const world = new THREE.Group();
  scene.add(world);

  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  const frameCbs = [];
  // stats: fps + mean/max frame interval, averaged and published twice a second (no per-frame allocation)
  const stats = { fps: 0, frameMs: 0, maxFrameMs: 0, targetFrameRate: null };
  let frames = 0, fpsT = performance.now(), lastT = fpsT, maxDt = 0;
  renderer.setAnimationLoop((t, frame) => {
    const now = performance.now(); const dt = now - lastT; lastT = now; if (dt > maxDt) maxDt = dt;
    for (let i = 0; i < frameCbs.length; i++) frameCbs[i](now, frame);
    renderer.render(scene, camera);
    frames++; if (now - fpsT >= 500) { stats.fps = frames * 1000 / (now - fpsT); stats.frameMs = (now - fpsT) / frames; stats.maxFrameMs = maxDt; frames = 0; fpsT = now; maxDt = 0; }
  });

  /** Resolves { ok, reason } — reason: 'no-webxr' | 'insecure' | 'unsupported' | 'error' */
  async function vrSupport() {
    if (!(navigator.xr && navigator.xr.isSessionSupported)) return { ok: false, reason: window.isSecureContext ? 'no-webxr' : 'insecure' };
    try { return (await navigator.xr.isSessionSupported('immersive-vr')) ? { ok: true } : { ok: false, reason: 'unsupported' }; }
    catch { return { ok: false, reason: 'error' }; }
  }

  /**
   * Must be called from a user gesture. requestSession is issued first (keeps transient activation),
   * then onStart(session) runs (start audio/video there), then reference space is picked:
   * 'local-floor' if granted, else 'local' with world shifted down by eye.y.
   */
  async function enterVR({ optionalFeatures = ['local-floor', 'hand-tracking'], onStart, onEnd } = {}) {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures });
    onStart?.(session);
    const floor = !session.enabledFeatures || session.enabledFeatures.includes('local-floor');
    renderer.xr.setReferenceSpaceType(floor ? 'local-floor' : 'local');
    world.position.y = floor ? 0 : -eye.y;
    session.addEventListener('end', () => { world.position.y = 0; onEnd?.(); });
    await renderer.xr.setSession(session);
    // truth check: what the compositor actually got (three applies setFoveation/setFramebufferScaleFactor inside setSession)
    try {
      const bl = session.renderState.baseLayer, pl = renderer.xr.getBaseLayer && renderer.xr.getBaseLayer();
      const layer = bl || pl; stats.xr = {
        requestedFoveation: renderer.xr.getFoveation(), framebufferScale: framebufferScale,
        layer: bl ? 'XRWebGLLayer' : (pl ? (pl.constructor && pl.constructor.name) || 'projection' : 'none'),
        fixedFoveation: layer && layer.fixedFoveation !== undefined ? layer.fixedFoveation : 'unsupported',
        framebuffer: bl ? [bl.framebufferWidth, bl.framebufferHeight] : (pl && pl.textureWidth ? [pl.textureWidth, pl.textureHeight] : null) };
      console.info('[xr] applied', JSON.stringify(stats.xr));
    } catch (e) { console.info('[xr] layer check failed', e && e.message); }
    // ask for a steady 72 Hz (headroom) when supported; harmless no-op elsewhere
    try {
      const rates = session.supportedFrameRates;
      if (targetFrameRate && rates && session.updateTargetFrameRate && Array.from(rates).includes(targetFrameRate)) {
        await session.updateTargetFrameRate(targetFrameRate); stats.targetFrameRate = targetFrameRate;
      } else stats.targetFrameRate = session.frameRate || null;
    } catch (e) { console.info('[xr] frame rate unchanged', e && e.message); }
    return session;
  }

  return {
    renderer, scene, camera, world, eye, maxAniso, enterVR, vrSupport, stats,
    /** Precompile every material in the scene now, so no shader compiles hitch the first VR frames. */
    compile: () => renderer.compile(scene, camera),
    onFrame: (cb) => frameCbs.push(cb),
    get fps() { return stats.fps; },
    get frameMs() { return stats.frameMs; },
    get isPresenting() { return renderer.xr.isPresenting; },
  };
}
