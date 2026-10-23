"""Headset test #11 texture maps (no Materialize): seamless tiles + packed normal/roughness maps, KTX2.
  python3 tools/make_t11_maps.py
Inputs: art-src/new-t11/ (Mars's ice-rock wall, Ted-ns blue-ice columns CC BY 4.0, Pexels ice-bubbles detail) and the existing
tex/rock.jpg, tex/tunnel.jpg, tex/walls.jpg (already seamless).
Outputs (tex/):  <name>.jpg (sRGB albedo, seamless)  +  <name>-nr.png (LINEAR: R,G = tangent-space normal x,y * 0.5 + 0.5, B = roughness)
and a .ktx2 for each (albedo ETC1S sRGB, nr UASTC linear: normals need UASTC quality). Normal strength is tuned in-engine (uniforms);
the baked maps use a moderate fixed strength.
Tiling: centre square crop -> flatten low-frequency lighting -> half-offset -> blend the un-offset image back in over a noisy cross mask
(same method as make_walls_tile.py, colour version). Height for the normals = blurred luminance, with crack/vein lines pushed DOWN
(ice-rock: the cyan veins are cracks). Roughness = smooth ice faces low, cracks / bubbles / frost higher. All filters wrap (seamless)."""
import os, sys, subprocess, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, sobel
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..')); sys.path.insert(0, HERE)
from prepare_art import find_toktx
SRC = os.path.join(ROOT, 'art-src', 'new-t11'); T = os.path.join(ROOT, 'tex')
ss = lambda a, b, x: (lambda u: u * u * (3 - 2 * u))(np.clip((x - a) / (b - a), 0, 1))
lum = lambda a: a[..., 0] * 0.3 + a[..., 1] * 0.5 + a[..., 2] * 0.2

def tile(path, N, flatten=True, crop=None):
    im = Image.open(path).convert('RGB')
    if crop: im = im.crop(crop)
    s = min(im.size); l = (im.width - s) // 2; t = (im.height - s) // 2
    A = np.asarray(im.crop((l, t, l + s, t + s)).resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
    if flatten:   # remove the photo's lighting gradient (per channel, keep the mean colour)
        for c in range(3): A[..., c] = A[..., c] - gaussian_filter(A[..., c], N * 0.12, mode='reflect') + A[..., c].mean()
    S = np.roll(A, (N // 2, N // 2), (0, 1)); c = np.abs(np.arange(N) - N / 2)
    band = np.clip(1 - (c - N * 0.09) / (N * 0.14), 0, 1); band = band * band * (3 - 2 * band)
    m = np.maximum(band[None, :], band[:, None])
    rng = np.random.default_rng(3); n = gaussian_filter(rng.standard_normal((N, N)), N / 25, mode='wrap'); n /= n.std()
    m = np.clip(m + 0.3 * n * (m * (1 - m)) * 4, 0, 1)[..., None]
    out = S * (1 - m) + A * m
    hp = out - gaussian_filter(out, (N / 128, N / 128, 0), mode='wrap'); var = gaussian_filter((hp ** 2).mean(-1), N / 25, mode='wrap')
    out = gaussian_filter(out, (N / 128, N / 128, 0), mode='wrap') + hp * np.clip(np.sqrt(np.median(var) / (var + 1e-7)), 1, 1.6)[..., None]
    return np.clip(out, 0, 1)

def normal_rough(A, strength, crack_w=0.0, rough_base=0.4, rough_gain=0.5, blur=1.0, cyan_crack=False, invert=False):
    N = A.shape[0]; L = lum(A)
    h = gaussian_filter(L, blur * N / 1024, mode='wrap')
    if invert: h = 1 - h
    if cyan_crack:   # ice-rock: cyan vein lines are cracks -> push them down; keep big slabs as raised plates
        cy = ss(0.04, 0.16, A[..., 1] + A[..., 2] * 0.5 - A[..., 0] * 1.6 - 0.25)
        h = h - crack_w * gaussian_filter(cy, 1.2 * N / 1024, mode='wrap') + 0.6 * gaussian_filter(L, 6 * N / 1024, mode='wrap')
    h = (h - h.mean()) / (h.std() + 1e-6)
    gx = sobel(h, 1, mode='wrap') / 8; gy = sobel(h, 0, mode='wrap') / 8
    k = strength * N / 1024
    nx, ny, nz = -gx * k, gy * k, np.ones_like(h)   # image rows go DOWN, texture v goes UP (flipY / lower_left): +y = -row
    ln = np.sqrt(nx * nx + ny * ny + nz * nz); nx, ny = nx / ln, ny / ln
    detail = np.sqrt(gaussian_filter((h - gaussian_filter(h, 3 * N / 1024, mode='wrap')) ** 2, 2 * N / 1024, mode='wrap'))
    rough = np.clip(rough_base + rough_gain * ss(0.1, 0.9, detail / (np.percentile(detail, 95) + 1e-6)), 0.04, 1)
    if cyan_crack: rough = np.clip(rough + 0.35 * cy, 0, 1)
    return np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, rough], -1), (nz / ln)

def save_rgb(a, path, q=90): Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8)).save(path, quality=q, optimize=True) if path.endswith('.jpg') else Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8)).save(path, optimize=True)

def ktx2(path, linear):
    tk = find_toktx(); out = os.path.splitext(path)[0] + '.ktx2'
    env = dict(os.environ); env['LD_LIBRARY_PATH'] = os.path.join(os.path.dirname(os.path.dirname(tk)), 'lib')
    enc = ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '0.5', '--zcmp', '18'] if linear else ['--encode', 'etc1s', '--clevel', '3', '--qlevel', '220']
    r = subprocess.run([tk, '--t2', '--genmipmap', '--assign_oetf', 'linear' if linear else 'srgb', *(['--assign_primaries', 'none'] if linear else []), '--lower_left_maps_to_s0t0', *enc, out, path], env=env, capture_output=True, text=True)
    if r.returncode: raise SystemExit('toktx failed: ' + r.stderr[:400])
    print(f'  {os.path.relpath(out, ROOT)}  {os.path.getsize(out) / 1e6:.2f} MB')

def seam(a):   # wrap-around discontinuity vs. neighbour step (1.0 ~ seamless)
    g = lum(a) * 255; return round(float(np.abs(g[:, 0] - g[:, -1]).mean() / (np.abs(g[:, 1] - g[:, 0]).mean() + 1e-6)), 2), round(float(np.abs(g[0] - g[-1]).mean() / (np.abs(g[1] - g[0]).mean() + 1e-6)), 2)

if __name__ == '__main__':
    report = {}
    # 1) Mars's ice-rock wall (1408 px source -> 1024 seamless). Albedo kept dark (it must vanish unlit; the shader only lights it).
    A = tile(os.path.join(SRC, 'ice-rock-wall-diffuse.jpg'), 1024)
    save_rgb(A, os.path.join(T, 'icewall.jpg')); nr, _ = normal_rough(A, 3.2, crack_w=1.6, rough_base=0.22, rough_gain=0.45, cyan_crack=True); save_rgb(nr, os.path.join(T, 'icewall-nr.png'))
    report['icewall'] = seam(A)
    # 2) Ted-ns blue-ice columns (CC BY 4.0), 3200x2133 -> 2048 seamless base; Pexels bubbles close-up 4839x3147 -> 1024 seamless detail layer
    B = tile(os.path.join(SRC, 'blue-ice-columns-base_cc-by-4.0-Ted-ns.jpg'), 2048)
    save_rgb(B, os.path.join(T, 'icecol.jpg'), 88); nr, _ = normal_rough(B, 1.6, rough_base=0.06, rough_gain=0.35, blur=1.5); nr_s = np.asarray(Image.fromarray((nr * 255 + .5).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)) / 255.0
    save_rgb(nr_s, os.path.join(T, 'icecol-nr.png')); report['icecol'] = seam(B)
    D = tile(os.path.join(SRC, 'ice-bubbles-detail_pexels-license.jpg'), 1024)
    save_rgb(D, os.path.join(T, 'icedet.jpg'), 88); nr, _ = normal_rough(D, 2.4, rough_base=0.05, rough_gain=0.4, blur=1.0); save_rgb(nr, os.path.join(T, 'icedet-nr.png')); report['icedet'] = seam(D)
    # 3) existing tiles: rock (props/chimneys), tunnel (walls/bed), walls (frost / float cavern). Already seamless: maps only, 1024.
    for name, st, rb, rg in (('rock', 3.0, 0.55, 0.4), ('tunnel', 2.6, 0.5, 0.45), ('walls', 2.0, 0.3, 0.5)):
        E = np.asarray(Image.open(os.path.join(T, name + '.jpg')).convert('RGB').resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255
        nr, _ = normal_rough(E, st, rough_base=rb, rough_gain=rg); save_rgb(nr, os.path.join(T, name + '-nr.png'))
    print('seam ratios (x, y; ~1 = seamless):', report)
    for n in ('icewall', 'icecol', 'icedet'): ktx2(os.path.join(T, n + '.jpg'), False)
    for n in ('icewall', 'icecol', 'icedet', 'rock', 'tunnel', 'walls'): ktx2(os.path.join(T, n + '-nr.png'), True)
