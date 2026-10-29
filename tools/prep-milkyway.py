"""Preprocess ESO/S. Brunier eso0932a (CC BY 4.0) into the surface Milky Way texture.
Source: https://www.eso.org/public/archives/images/large/eso0932a.jpg (6000x3000, galactic equirect).
Steps: remove only BRIGHT point stars (masked median at full res, faint grain kept) -> unsharp detail -> smooth mosaic/JPEG blocking -> colour grade to
starlight (desaturate magenta, warm-white core, tan dust) -> even out band brightness along longitude
-> 4096x2048 JPEG q95 4:4:4.  Tunables below."""
import sys, numpy as np
from PIL import Image, ImageFilter
SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/eso_large.jpg'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'surface/assets/milkyway-eso0932a-4k.jpg'
W, H = 4096, 2048
KEEP_CHROMA = 0.22                 # fraction of the photo's own colour kept (rest -> neutral)
WARM = np.array([1.00, 0.90, 0.76])   # warm-white starlight tint for bright star clouds
DUST = np.array([1.00, 0.80, 0.60])   # tan/brown tint for faint regions / dust lanes
EQ_STRENGTH = 0.6                  # 0 = photo's own longitude falloff, 1 = fully flattened band
EQ_MAXGAIN = 2.6
STAR_K = 0.10                      # only stars brighter than median+STAR_K (sRGB) are removed (they duplicate catalog stars)
DETAIL = 0.6                       # high-pass "clarity" boost of the remaining star grain / dust lanes
# BIG-STAR inpaint: the 7px median can't erase stars/planets whose saturated core is wider than ~7px
# (eso0932a's spiked bright stars + a planet at l=69 b=-58); they survived as smeared fixed 'blobs'.
# Compact saturated cores (>= BIG_MIN_PX) are masked with a radius-scaled halo and replaced by a
# feathered large-scale (~36px) median background. Real compact nebulae/galaxies are protected.
BIG_L = 0.80                       # core luminance (sRGB 0-1) ...
BIG_DL = 0.35                      # ... and contrast above the ~36px median background
BIG_MIN_PX = 8                     # min saturated-core area (px @6000) to treat as a big star
BIG_HALO_K = 3.0                   # mask radius = BIG_HALO_K * core radius + BIG_HALO_PX
BIG_HALO_PX = 8
PROTECT = [(-151.0, -19.4, 3.0),   # Orion nebula M42/M43 (l=209)  (l, b, radius deg; l in -180..180)
           (121.2, -21.6, 5.0),    # M31 (photo's M31 core sits ~3.5 deg off nominal)
           (166.6, -23.5, 2.0),    # Pleiades
           (309.0 - 360, 15.0, 1.5),  # omega Cen
           (305.9 - 360, -44.9, 1.5), # 47 Tuc
           (-79.5, -32.9, 5.0),    # LMC
           (-57.2, -44.3, 3.0),    # SMC
           (-72.4, -0.6, 3.0)]     # Carina nebula / eta Car
PROTECT_B = 4.0                    # also never touch |b| < PROTECT_B (galactic-plane knots, clusters, nebulae)
im = Image.open(SRC).convert('RGB')
src = np.asarray(im).astype(np.float64) / 255.0
from scipy import ndimage as nd
_h, _w = src.shape[:2]
_L = src @ np.array([0.299, 0.587, 0.114])
_bgim = im.resize((_w // 4, _h // 4), Image.BOX).filter(ImageFilter.MedianFilter(9)).resize((_w, _h), Image.BILINEAR)
_bg = np.asarray(_bgim).astype(np.float64) / 255.0           # ~36px median: detection
_fill = np.asarray(im.resize((_w // 8, _h // 8), Image.BOX).filter(ImageFilter.MedianFilter(15))
                   .resize((_w, _h), Image.BICUBIC)).astype(np.float64) / 255.0   # ~120px median: fill (no halo leak)
_core = (_L > BIG_L) & (_L - _bg @ np.array([0.299, 0.587, 0.114]) > BIG_DL)
_lab, _n = nd.label(_core)
_area = nd.sum(_core, _lab, range(1, _n + 1)); _com = nd.center_of_mass(_core, _lab, range(1, _n + 1))
_yy, _xx = np.mgrid[0:_h, 0:_w]
_big = np.zeros((_h, _w), np.float64); _nbig = 0
for _a, (_cy, _cx) in zip(_area, _com):
    if _a < BIG_MIN_PX: continue
    _l = (0.5 - _cx / _w) * 360; _b = (0.5 - _cy / _h) * 180
    if abs(_b) < PROTECT_B: continue
    if any(np.hypot(((_l - pl + 180) % 360 - 180) * np.cos(np.radians(_b)), _b - pb) < pr for pl, pb, pr in PROTECT): continue
    _r = BIG_HALO_K * np.sqrt(_a / np.pi) + BIG_HALO_PX
    y0, y1, x0, x1 = int(max(0, _cy - 2 * _r)), int(min(_h, _cy + 2 * _r)), int(max(0, _cx - 2 * _r)), int(min(_w, _cx + 2 * _r))
    d = np.hypot(_yy[y0:y1, x0:x1] - _cy, _xx[y0:y1, x0:x1] - _cx)
    _big[y0:y1, x0:x1] = np.maximum(_big[y0:y1, x0:x1], np.clip((1.6 * _r - d) / (0.6 * _r), 0, 1))  # feathered disc
    _nbig += 1
print('big stars inpainted', _nbig)
# MANUAL inpaint: small leftover oval (~23x10px @6000, l=216.6 b=+66.3, not a catalogued object; planet-removal
# remnant) -> same feathered disc + ~120px median fill. Far from all PROTECT entries (M31 untouched).
for _l, _b, _r in [(216.64, 66.25, 16.0)]:
    _cx = (0.5 - ((_l + 180) % 360 - 180) / 360) * _w; _cy = (0.5 - _b / 180) * _h
    y0, y1, x0, x1 = int(_cy - 2 * _r), int(_cy + 2 * _r), int(_cx - 2 * _r), int(_cx + 2 * _r)
    d = np.hypot(_yy[y0:y1, x0:x1] - _cy, _xx[y0:y1, x0:x1] - _cx)
    _big[y0:y1, x0:x1] = np.maximum(_big[y0:y1, x0:x1], np.clip((1.6 * _r - d) / (0.6 * _r), 0, 1))
src = src * (1 - _big[..., None]) + np.minimum(_fill, src) * _big[..., None]
im = Image.fromarray((src * 255 + 0.5).astype(np.uint8))
med = np.asarray(im.filter(ImageFilter.MedianFilter(7))).astype(np.float64) / 255.0
# selective star removal: replace only bright point stars (and a 1px halo) by the median; faint grain stays
mask = ((src - med).max(-1) > STAR_K).astype(np.uint8) * 255
mask = np.asarray(Image.fromarray(mask).filter(ImageFilter.MaxFilter(3))) > 0
a6 = np.where(mask[..., None], med, src)
im = Image.fromarray((a6 * 255 + 0.5).astype(np.uint8)).resize((W, H), Image.LANCZOS)
a = np.asarray(im).astype(np.float64) / 255.0
lo = np.asarray(im.filter(ImageFilter.GaussianBlur(6))).astype(np.float64) / 255.0
a = np.clip(a + DETAIL * (a - lo), 0, 1)                     # unsharp: grain + lane edges, no 1.2px blur
lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
Y = lin @ np.array([0.2126, 0.7152, 0.0722])
# colour: neutral luminance tinted dust->warm by brightness, plus a little of the original hue
t = np.clip((Y / np.percentile(Y, 99.5)) ** 0.5, 0, 1)[..., None]
tint = DUST * (1 - t) + WARM * t
tint /= (tint @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
orig = lin / np.maximum(Y, 1e-6)[..., None]
orig[..., 1] *= 1.10; orig[..., 2] *= 1.05                   # pull the source's magenta cast (R,B>G)
orig /= np.maximum(orig @ np.array([0.2126, 0.7152, 0.0722]), 1e-6)[..., None]
lin = Y[..., None] * (tint * (1 - KEEP_CHROMA) + orig * KEEP_CHROMA)
# presence: equalise band peak along longitude (the anticentre is far fainter in the photo)
rows = slice(int(H * 0.44), int(H * 0.56))
prof = np.percentile(Y[rows], 85, axis=0)
k = int(W / 18); ker = np.ones(k) / k
prof = np.convolve(np.concatenate([prof[-k:], prof, prof[:k]]), ker, 'same')[k:-k]
ref = np.percentile(prof, 80)
gain = np.clip((ref / prof) ** EQ_STRENGTH, 1.0, EQ_MAXGAIN)
lat = np.linspace(1, -1, H)[:, None]
gain = 1 + (gain[None, :] - 1) * np.exp(-(lat / 0.25) ** 2)  # only boost near the plane
lin = lin * gain[..., None]
bg = np.percentile(Y[:int(H*0.1)], 50); print('bg', bg, 'gain range', gain.min(), gain.max())
lin = np.clip(lin, 0, 1)
s = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1/2.4) - 0.055)
Image.fromarray((s * 255 + 0.5).astype(np.uint8)).save(OUT, quality=95, subsampling=0)
print('wrote', OUT)
