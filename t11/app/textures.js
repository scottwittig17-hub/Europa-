// textures.js — high-res stills loader (Oct 2026: stills come in at 2K-4K; loops stay 720p).
// - JPEG / WebP / PNG via core loadTexture (sRGB, browser-decoded). No downscale caps here: the GPU limit (maxTextureSize) is the only cap.
// - Optional KTX2 (Basis UASTC / ETC1S) when art-manifest.json lists a .ktx2 next to a still: transcoded in a worker to the GPU's native
//   compressed format (ASTC 4x4 on Quest 3, BC7 / ETC2 on desktop, RGBA8 as a last resort) -> ~4x less GPU memory than RGBA8 and cheaper sampling.
//   Lazy: the KTX2Loader + basis transcoder (vendor/three-examples/) are only fetched if a .ktx2 is actually listed. Any KTX2 failure falls back
//   to the JPEG path, so the JPEG path never breaks. ?ktx2=0 (or CONFIG.USE_KTX2 = false) forces JPEG.
import * as THREE from 'three';
import { loadTexture } from '../core/xr-core.js';
import { CONFIG } from './config.js';

const QS = new URLSearchParams(location.search);
const KTX2_ON = CONFIG.USE_KTX2 !== false && QS.get('ktx2') !== '0';
let ktx2Loader = null;
async function getKTX2(renderer) {
  if (!ktx2Loader) ktx2Loader = import('../vendor/three-examples/loaders/KTX2Loader.js').then(({ KTX2Loader }) =>
    new KTX2Loader().setTranscoderPath('vendor/three-examples/libs/basis/').setWorkerLimit(1).detectSupport(renderer));
  return ktx2Loader;
}
export const stillStats = { ktx2: 0, jpeg: 0, fallbacks: 0, bytesGPU: 0, list: [] };   // test hook / stats

/** Mipmapped, anisotropic, sRGB still. opts: { ktx2: url|null, renderer, anisotropy, repeat, timeoutMs }. Resolves a THREE.Texture
 *  (CompressedTexture for KTX2: mips come from the file, never generated at runtime). */
export async function loadStill(url, { ktx2 = null, renderer, anisotropy = CONFIG.TEX_ANISOTROPY, repeat = false, timeoutMs = 20000, colorSpace = THREE.SRGBColorSpace } = {}) {
  let t = null, src = url;
  if (ktx2 && KTX2_ON && renderer) {
    try { const L = await getKTX2(renderer); t = await L.loadAsync(ktx2); src = ktx2; stillStats.ktx2++; }
    catch (e) { console.info('[tex] KTX2 failed, using', url, '-', e && e.message); stillStats.fallbacks++; t = null; }
  }
  if (!t) { t = await loadTexture(url, { timeoutMs }); stillStats.jpeg++; }
  const maxA = renderer ? renderer.capabilities.getMaxAnisotropy() : anisotropy;
  t.anisotropy = Math.max(1, Math.min(anisotropy, maxA));
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (t.isCompressedTexture) { t.generateMipmaps = false; t.minFilter = t.mipmaps && t.mipmaps.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; }
  else { t.colorSpace = colorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  const w = t.image?.width || 0, h = t.image?.height || 0, bpp = t.isCompressedTexture ? 1 : 4;   // ASTC 4x4 / BC7 = 1 B/texel, RGBA8 = 4
  const bytes = Math.round(w * h * bpp * 4 / 3); stillStats.bytesGPU += bytes; stillStats.list.push({ src, w, h, compressed: !!t.isCompressedTexture, mb: +(bytes / 1048576).toFixed(1) });
  const max = renderer?.capabilities.maxTextureSize; if (max && Math.max(w, h) > max) console.info(`[tex] ${src} ${w}x${h} exceeds GL max ${max}; three.js will downscale it`);
  return t;
}
/** Set t.generateMipmaps etc. safely on a texture that may be compressed (never ask WebGL to generate mips for compressed formats). */
export const isCompressed = (t) => !!t?.isCompressedTexture;
