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
im = Image.open(SRC).convert('RGB')
src = np.asarray(im).astype(np.float64) / 255.0
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
