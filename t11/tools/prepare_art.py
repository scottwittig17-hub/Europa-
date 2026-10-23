"""Stills pipeline (Oct 2026 decision: static stills = panoramas, chamber backdrops, large-surface textures come in at 2K-4K; loops stay 720p).

Usage (from the europa-vr folder):
  python3 tools/prepare_art.py --stills [--webp] [--ktx2 [uastc|etc1s]] [--force]
      Normalise hi-res DROP-INS that already sit in tex/ and pano/ under the standard names (any of .png .tif .tiff .jpeg .jpg .webp):
        tex/chamber-jelly|chamber-vents|chamber-pillars   backdrops     <= 4096 px wide (and <= 4096 high)
        tex/tunnel, tex/walls                              tiling tiles  <= 2048 px (square recommended, must already be seamless)
        tex/cockpit-dash                                   console face  <= 2048 px wide
        pano/europa                                        equirect 2:1  <= 8192 px wide (4096x2048 is the baseline)
      Nothing is downscaled unless it is over those limits. A .jpg that is already within the limits is left byte-for-byte untouched
      (no generation loss) unless --force. Other formats are converted to high-quality JPEG (q92, 4:4:4 chroma so cyan veins stay crisp;
      q90 if a file would exceed 6 MB) or, with --webp, to WebP q90. The original non-JPEG source is moved to art-src/ (kept out of the deploy zip).
      tex/tunnel-veins.png (vein mask, half the tunnel tile size, <= 1024) is rebuilt whenever tex/tunnel changes.
      --ktx2 also writes <name>.ktx2 next to each still (Basis UASTC + zstd, full mip chain; 'etc1s' = ~5x smaller files, lower quality) using
      toktx (KTX-Software) or basisu if installed. If neither is found it says so and the JPEG path is used unchanged. The app loads the
      .ktx2 when art-manifest.json lists it (run tools/scan_assets.py afterwards) and falls back to the JPEG if it fails.
  python3 tools/prepare_art.py <attachments dir> [--webp] [--ktx2 ...]
      The Oct 2026 concept-art crops (ULID file names): window frames cropped off, kept at FULL source resolution (only the limits above apply).
  python3 tools/prepare_art.py
      Just rebuild tex/tunnel-veins.png from tex/tunnel.jpg.

HMD grading (shadow/midtone lift, contrast, cyan vein glow, fog) and the headlights are NOT baked here: they are applied in the ride shaders from
app/config.js, so re-running this keeps them."""
import sys, os, glob, shutil, subprocess, argparse, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
Image.MAX_IMAGE_PIXELS = 300_000_000
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); T = os.path.join(ROOT, 'tex'); SRC = os.path.join(ROOT, 'art-src')
# name -> (folder, max width, max height, kind)
STILLS = {'chamber-jelly': ('tex', 4096, 4096, 'backdrop'), 'chamber-vents': ('tex', 4096, 4096, 'backdrop'), 'chamber-pillars': ('tex', 4096, 4096, 'backdrop'),
          'tunnel': ('tex', 2048, 2048, 'tile'), 'walls': ('tex', 2048, 2048, 'tile'), 'cockpit-dash': ('tex', 2048, 2048, 'ui'), 'rock': ('tex', 2048, 2048, 'tile'),
          'europa': ('pano', 4096, 2048, 'pano')}   # pano capped at 4096x2048 (art director, Oct 18 2026: 7168 px = ~115 MB GPU)
EXTS = ('.png', '.tif', '.tiff', '.jpeg', '.webp', '.jpg')

def fit(img, mw, mh):
    s = min(1.0, mw / img.width, mh / img.height)
    return img if s >= 1.0 else img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)

JPEG_Q = None   # --q N: fixed JPEG quality (4:2:0 below 90) to keep the deploy zip under the 25 MB chat limit when KTX2 files ship alongside
def save_still(img, base, webp=False):
    """High-quality JPEG (q92, 4:4:4; q90 above 6 MB) or WebP q90. Returns the written path."""
    img = img.convert('RGB')
    if webp:
        path = base + '.webp'; img.save(path, quality=90, method=6)
    else:
        path = base + '.jpg'
        for q in ((JPEG_Q,) if JPEG_Q else (92, 90)):
            img.save(path, quality=q, subsampling=0 if q >= 90 else 2, optimize=True, progressive=False)
            if os.path.getsize(path) <= 6_000_000: break
    print(f'  wrote {os.path.relpath(path, ROOT)} {img.size[0]}x{img.size[1]} {os.path.getsize(path)/1e6:.2f} MB')
    return path

def find_toktx():
    cands = [os.environ.get('TOKTX'), shutil.which('toktx')] + sorted(glob.glob('/home/box/tools/KTX-Software-*/bin/toktx')) + sorted(glob.glob(os.path.expanduser('~/tools/KTX-Software-*/bin/toktx')))
    for c in cands:
        if c and os.path.isfile(c): return c
    return None

def make_ktx2(path, mode='uastc'):
    """<still>.ktx2 with a full mip chain, sRGB, origin flipped to match three.js UVs (compressed textures cannot be flipped at upload)."""
    out = os.path.splitext(path)[0] + '.ktx2'; tk = find_toktx(); bu = shutil.which('basisu')
    if tk:
        env = dict(os.environ); env['LD_LIBRARY_PATH'] = os.path.join(os.path.dirname(os.path.dirname(tk)), 'lib') + ':' + env.get('LD_LIBRARY_PATH', '')
        enc = ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1.0', '--zcmp', '18'] if mode == 'uastc' else ['--encode', 'etc1s', '--clevel', '3', '--qlevel', '220']
        src = path; im = Image.open(path)
        if path.endswith('.webp') or im.width % 4 or im.height % 4:   # toktx reads PNG/JPEG only; UASTC/ETC1S want multiple-of-4 sizes (< 0.3 % stretch)
            src = os.path.join('/tmp', os.path.basename(path) + '.ktx2src.png')
            im.convert('RGB').resize((max(4, round(im.width / 4) * 4), max(4, round(im.height / 4) * 4)), Image.LANCZOS).save(src)
        r = subprocess.run([tk, '--t2', '--genmipmap', '--assign_oetf', 'srgb', '--lower_left_maps_to_s0t0', *enc, out, src], env=env, capture_output=True, text=True)
        ok = r.returncode == 0 and os.path.isfile(out)
        if not ok: print('  toktx failed:', r.stderr.strip()[:300])
    elif bu:
        args = [bu, '-ktx2', '-mipmap', '-y_flip', '-file', path, '-output_file', out] + (['-uastc', '-uastc_rdo_l', '1.0'] if mode == 'uastc' else ['-q', '192'])
        r = subprocess.run(args, capture_output=True, text=True); ok = r.returncode == 0 and os.path.isfile(out)
        if not ok: print('  basisu failed:', r.stderr.strip()[:300])
    else:
        print('  [ktx2] neither toktx (KTX-Software) nor basisu found: skipping KTX2, the JPEG path stays. Install: https://github.com/KhronosGroup/KTX-Software/releases'); return None
    if ok: print(f'  wrote {os.path.relpath(out, ROOT)} ({mode}) {os.path.getsize(out)/1e6:.2f} MB')
    return out if ok else None

def vein_mask(T):
    """Thickened cyan-vein mask (tex/tunnel-veins.png) so veins survive HMD resolution + foveation: same cyan test as the shader's
    veinMask(), then grey dilation (~4 px at 1024, scaled with the tile) + soft gaussian, all with wrap-around so the tile stays seamless.
    Output is half the tunnel tile size (512 for 1024, 1024 for 2048), never larger than 1024."""
    from scipy.ndimage import grey_dilation
    src = next((os.path.join(T, 'tunnel' + e) for e in ('.jpg', '.webp') if os.path.isfile(os.path.join(T, 'tunnel' + e))), None)
    if not src: print('no tex/tunnel.jpg|webp: vein mask not rebuilt'); return
    im0 = Image.open(src).convert('RGB'); N = im0.width; k = N / 1024
    t = np.asarray(im0).astype(np.float32) / 255
    ss = lambda a, b, x: (lambda u: u * u * (3 - 2 * u))(np.clip((x - a) / (b - a), 0, 1))
    m = ss(0.04, 0.20, np.minimum(t[..., 1], t[..., 2]) - t[..., 0]) * ss(0.12, 0.45, np.maximum(t[..., 1], t[..., 2]))
    R = max(2, round(4 * k)); yy, xx = np.mgrid[-R:R + 1, -R:R + 1]; fp = (xx * xx + yy * yy) <= R * R
    d = grey_dilation(m, footprint=fp, mode='wrap'); wide = gaussian_filter(m, 7.0 * k, mode='wrap')
    d = np.maximum(gaussian_filter(d, 2.0 * k, mode='wrap'), 0.6 * wide / max(1e-3, wide.max()))   # core + wide halo
    d = np.clip(d / max(1e-3, np.percentile(d, 99.7)), 0, 1)
    M = min(1024, max(256, N // 2))
    im = Image.fromarray((d * 255 + .5).astype(np.uint8), 'L').resize((M, M), Image.LANCZOS); out = os.path.join(T, 'tunnel-veins.png'); im.save(out, optimize=True)
    a = np.asarray(im).astype(float); print('veins', im.size, os.path.getsize(out), 'cover', (a > 64).mean().round(3), 'wrap x', np.abs(a[:, 0] - a[:, -1]).mean().round(2), 'y', np.abs(a[0] - a[-1]).mean().round(2))

def stills(args):
    """Normalise drop-ins by filename. Returns the list of final still paths."""
    done = []
    for name, (folder, mw, mh, kind) in STILLS.items():
        d = os.path.join(ROOT, folder); base = os.path.join(d, name)
        found = [base + e for e in EXTS if os.path.isfile(base + e)]
        if not found: continue
        newest = max(found, key=os.path.getmtime)   # the most recent drop-in wins
        img = Image.open(newest); W, H = img.size; over = W > mw or H > mh
        target = base + ('.webp' if args.webp else '.jpg')
        print(f'{os.path.relpath(newest, ROOT)}: {W}x{H} ({kind}, limit {mw}x{mh})')
        if kind == 'tile' and W != H: print(f'  note: tiling texture is not square ({W}x{H}); it must still tile seamlessly')
        if newest == target and not over and not args.force:
            print('  within limits, left untouched'); path = target
        else:
            path = save_still(fit(img, mw, mh), base, args.webp)
            if newest != path and os.path.splitext(newest)[1] not in ('.jpg', '.webp'):
                os.makedirs(SRC, exist_ok=True); shutil.move(newest, os.path.join(SRC, os.path.basename(newest))); print(f'  original moved to art-src/{os.path.basename(newest)}')
            for e in ('.jpg', '.webp'):   # one runtime format per still: drop the stale other one
                other = base + e
                if other != path and os.path.isfile(other): os.makedirs(SRC, exist_ok=True); shutil.move(other, os.path.join(SRC, os.path.basename(other) + '.old')); print(f'  stale {os.path.basename(other)} moved to art-src/')
            if name == 'tunnel': vein_mask(T)
        stale = base + '.ktx2'
        if args.ktx2: make_ktx2(path, args.ktx2)
        elif os.path.isfile(stale) and os.path.getmtime(stale) < os.path.getmtime(path):
            os.remove(stale); print(f'  removed stale {os.path.relpath(stale, ROOT)} (older than the still; re-run with --ktx2 to rebuild)')
        done.append(path)
    return done

# crop boxes (fractions) inside the painted window frames of the Oct 2026 concept art
CROPS = {'chamber-jelly': ('01M4YG0PZ5PDF9KJFE9CNCTT7V.png', (.08, .09, .93, .85)),
         'chamber-vents': ('01M4YG11QSETMYMH9SY0RWNMSZ.png', (.08, .10, .92, .82)),
         'chamber-pillars': ('01M4YG1CMDVXG0F28435GR1E28.png', (.08, .09, .93, .84)),
         'cockpit-dash': ('01M4YG04SDHWG2AXB9Z081VE5T.png', (.2, .58, .8, .86))}
def from_attachments(A, args):
    for out, (f, b) in CROPS.items():
        m = Image.open(os.path.join(A, f)).convert('RGB'); W, H = m.size
        c = m.crop((int(b[0] * W), int(b[1] * H), int(b[2] * W), int(b[3] * H)))
        _, mw, mh, _ = STILLS[out]; p = save_still(fit(c, mw, mh), os.path.join(T, out), args.webp)   # full source resolution (no 1536/1024 caps any more)
        if args.ktx2: make_ktx2(p, args.ktx2)
    # tunnel: colour seamless tile (offset + cross-blend, per channel), gently brightened. Tile size = the source's short side, capped at 2048.
    im = Image.open(os.path.join(A, '01M4YG3QVQ1HSMMRT4YK7WCWQY.jpg')).convert('RGB'); s = min(im.size); l = (im.width - s) // 2; t = (im.height - s) // 2
    N = min(2048, s - s % 8); k = N / 1024
    X = np.asarray(im.crop((l, t, l + s, t + s)).resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
    lum = X.mean(2); X = X * (lum.mean() / np.maximum(gaussian_filter(lum, 120 * k, mode='reflect'), 1e-3))[..., None]   # flatten lighting
    S = np.roll(X, (N // 2, N // 2), (0, 1)); c = np.abs(np.arange(N) - N / 2)
    band = np.clip(1 - (c - 90 * k) / (140 * k), 0, 1); band = band * band * (3 - 2 * band); m = np.maximum(band[None, :], band[:, None])
    rng = np.random.default_rng(3); n = gaussian_filter(rng.standard_normal((N, N)), 40 * k, mode='wrap'); n /= n.std()
    m = np.clip(m + 0.25 * n * (m * (1 - m)) * 4, 0, 1)[..., None]
    out = S * (1 - m) + X * m
    out = out / out.mean() * 0.56            # gentle brighten: mid-grey 0.56 (old walls.jpg ~0.5)
    img = Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8))
    p = save_still(img, os.path.join(T, 'tunnel'), args.webp)
    a = np.asarray(img).astype(float)
    print('tunnel mean', a.mean().round(1), 'wrap x', np.abs(a[:, 0] - a[:, -1]).mean().round(2), 'y', np.abs(a[0] - a[-1]).mean().round(2), 'neighbour', np.abs(a[:, 1] - a[:, 0]).mean().round(2))
    vein_mask(T)
    if args.ktx2: make_ktx2(p, args.ktx2)

def seamless_tile(src, N=2048, mean=0.56, grey=False, contrast=None):
    """Square centre crop -> flatten lighting -> half-offset + noisy cross-blend (wrap-seamless). Returns a PIL RGB image (N x N)."""
    im = Image.open(src).convert('RGB'); s = min(im.size); l = (im.width - s) // 2; t = (im.height - s) // 2; k = N / 1024
    X = np.asarray(im.crop((l, t, l + s, t + s)).resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
    if grey: X = X.mean(2, keepdims=True).repeat(3, 2)
    lum = X.mean(2); X = X * (lum.mean() / np.maximum(gaussian_filter(lum, 120 * k, mode='reflect'), 1e-3))[..., None]
    S = np.roll(X, (N // 2, N // 2), (0, 1)); c = np.abs(np.arange(N) - N / 2)
    band = np.clip(1 - (c - 90 * k) / (140 * k), 0, 1); band = band * band * (3 - 2 * band); m = np.maximum(band[None, :], band[:, None])
    rng = np.random.default_rng(3); n = gaussian_filter(rng.standard_normal((N, N)), 40 * k, mode='wrap'); n /= n.std()
    # Four-way blend so NO image edge survives anywhere (the older 2-way cross put X's own left/right edges back in the centre-row band):
    # S = roll both axes (seams at the centre cross), Xv = roll rows only, Xh = roll columns only, X at the cross intersection.
    nz = lambda w: np.clip(w + 0.25 * n * (w * (1 - w)) * 4, 0, 1)[..., None]
    wv = nz(np.broadcast_to(band[None, :], (N, N))); wh = nz(np.broadcast_to(band[:, None], (N, N)))
    Xv = np.roll(X, N // 2, 0); Xh = np.roll(X, N // 2, 1)
    out = S * (1 - wv) * (1 - wh) + Xv * wv * (1 - wh) + Xh * wh * (1 - wv) + X * wv * wh
    if contrast: out = (out - out.mean()) / max(out.std(), 1e-3) * contrast + out.mean()
    out = out / out.mean() * mean
    img = Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)); a = np.asarray(img).astype(float)
    print(f'  tile {os.path.basename(src)} -> {N}^2 mean {a.mean():.1f} wrap x {np.abs(a[:, 0] - a[:, -1]).mean():.2f} y {np.abs(a[0] - a[-1]).mean():.2f} neighbour {np.abs(a[:, 1] - a[:, 0]).mean():.2f}')
    return img

# Oct 18 2026 hi-res drop (7168x4032 each). Writes full-res PNG drop-ins under the standard names; then run --stills [--ktx2] to normalise them.
HIRES = {'chamber-pillars': ('01M58BDV4ZE9Y3QX3B56HF22GJ.jpg', (.07, .06, .93, .86)),
         'chamber-vents': ('01M58DN1V6MNG99M9XZQ5M7FVB.jpg', (.08, .07, .92, .88)),
         'chamber-jelly': ('01M58DZGTS2BSCQEVSKYNXSMZC.jpg', (.07, .06, .93, .86)),
         'cockpit-dash': ('01M58CMPBD01BCXPYFZWTGWQB9.jpg', (.2, .58, .8, .86))}
HIRES_TILES = {'tunnel': ('01M58CQ5VR61GASDBDQ6Z6A6MN.jpg', dict(mean=0.56)),             # grey rock + cyan veins (upscale of the old tunnel source)
               'rock': ('01M58CN2QPWF8TJKPMFCF2Y915.jpg', dict(mean=0.42)),               # darker rock, faint blue veins -> rock props / vent chimneys
               'walls': ('01M58CZBJ6Z90P3NATF8295CZ4.jpg', dict(mean=0.5, grey=True, contrast=0.11))}   # frosty ice -> float cavern + ice detail
def from_hires(A):
    for out, (f, b) in HIRES.items():
        m = Image.open(os.path.join(A, f)).convert('RGB'); W, H = m.size
        c = m.crop((int(b[0] * W), int(b[1] * H), int(b[2] * W), int(b[3] * H))); c.save(os.path.join(T, out + '.png')); print(f'{f} -> tex/{out}.png {c.size}')
    for out, (f, kw) in HIRES_TILES.items():
        seamless_tile(os.path.join(A, f), 2048, **kw).save(os.path.join(T, out + '.png')); print(f'{f} -> tex/{out}.png')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('attachments', nargs='?'); ap.add_argument('--stills', action='store_true'); ap.add_argument('--webp', action='store_true'); ap.add_argument('--force', action='store_true'); ap.add_argument('--hires', metavar='DIR'); ap.add_argument('--q', type=int, default=None)
    ap.add_argument('--ktx2', nargs='?', const='uastc', choices=('uastc', 'etc1s'), default=None)
    args = ap.parse_args(); JPEG_Q = args.q
    if args.hires: from_hires(args.hires)
    if args.stills: stills(args); print('next: python3 tools/scan_assets.py')
    elif args.attachments and not args.hires: from_attachments(args.attachments, args); print('next: python3 tools/scan_assets.py')
    elif not args.hires: vein_mask(T)
