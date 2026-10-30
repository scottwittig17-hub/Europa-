#!/usr/bin/env python3
"""Composite a real image of Andromeda (M31) into the committed Milky Way texture.

Operates on surface/assets/milkyway-eso0932a-4k.jpg in place (4096x2048 equirect in galactic l/b,
x = (0.5 - l/360) W, y = (0.5 - b/180) H, as sampled in surface/src/main.js):
  1. fill the photo's M31 blob (l=117.6 b=-23.3) with a feathered ~26px disc from a ~120px median background
     (same as the manual fill in prep-milkyway.py);
  2. additively composite the NASA/JPL-Caltech/UCLA WISE M31 image (public domain), background stars removed,
     desaturated/dimmed, rotated to M31's true on-sky position angle (38 deg E of N, which lands at ~48 deg in the
     texture = the old blob's tilt) and sized GAL_LEN deg along the major axis on the sky (texture x is stretched
     by 1/cos b at this latitude).
Usage: python3 tools/paint-m31.py [wise.jpg] [texture.jpg]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd
Image.MAX_IMAGE_PIXELS = None

WISE = sys.argv[1] if len(sys.argv) > 1 else '/workspace/m31-src/m31-wise.jpg'
TEX = sys.argv[2] if len(sys.argv) > 2 else 'surface/assets/milkyway-eso0932a-4k.jpg'
L0, B0, FILL_R = 117.6, -23.3, 26.0   # blob centre (deg) and fill radius (px), as in prep-milkyway.py
GAL_LEN = 2.75        # visible major-axis length on the sky (deg); M31 is ~3 deg, kept small and subtle
SKY_PA_TEX = 45.7     # major axis angle in a local undistorted sky frame (x right=-l, y down=-b), from PA 38 deg
WISE_PA = 25.3        # major axis angle in the WISE image (measured by weighted moments, x->y)
WISE_LEN_PX = 3000.0  # visible galaxy length in the 6666px WISE image
WISE_C = (3348.0, 3320.0)
PEAK = 0.06           # linear luminance added at the core (~sRGB 0.32 peak incl. background)
DESAT = 0.55          # fraction of chroma removed

im = Image.open(TEX).convert('RGB'); W, H = im.size
src = np.asarray(im).astype(np.float64) / 255.0
cx = (0.5 - L0 / 360) * W; cy = (0.5 - B0 / 180) * H

# 1. blob fill
fill = np.asarray(im.resize((W // 8, H // 8), Image.BOX).filter(ImageFilter.MedianFilter(15))
                  .resize((W, H), Image.BICUBIC)).astype(np.float64) / 255.0
r = FILL_R; y0, y1, x0, x1 = int(cy - 2 * r), int(cy + 2 * r), int(cx - 2 * r), int(cx + 2 * r)
yy, xx = np.mgrid[y0:y1, x0:x1]
wgt = np.clip((1.6 * r - np.hypot(yy - cy, xx - cx)) / (0.6 * r), 0, 1)[..., None]
src[y0:y1, x0:x1] = src[y0:y1, x0:x1] * (1 - wgt) + np.minimum(fill, src)[y0:y1, x0:x1] * wgt

# 2. WISE galaxy layer: downsample (stars -> ~1px), median out stars, subtract sky, mask to the galaxy
DS = 16
wi = Image.open(WISE).convert('RGB')
g = np.asarray(wi.resize((wi.width // DS, wi.height // DS), Image.BOX)).astype(np.float64) / 255.0
g = np.stack([nd.median_filter(g[..., k], 5) for k in range(3)], -1)
g = np.where(g <= 0.04045, g / 12.92, ((g + 0.055) / 1.055) ** 2.4)
Lw = g @ np.array([0.2126, 0.7152, 0.0722])
sky = np.median(Lw)
m = nd.gaussian_filter(Lw, 2) > sky + 0.02
lab, n = nd.label(m); k = np.argmax(nd.sum(m, lab, range(1, n + 1))) + 1
mask = nd.gaussian_filter(nd.binary_dilation(lab == k, iterations=4).astype(float), 4)   # soft galaxy-only mask
lum = np.clip(Lw - sky, 0, None) * mask
chroma = g / np.maximum(Lw, 1e-6)[..., None]
chroma = 1 + (chroma - 1) * (1 - DESAT)
chroma /= np.maximum(chroma @ np.array([0.2126, 0.7152, 0.0722]), 1e-6)[..., None]
layer = lum[..., None] * chroma
layer *= PEAK / np.percentile(lum, 99.95)

# map texture pixels -> WISE pixels (4x supersampled)
ppd = W / 360.0; cosb = np.cos(np.radians(B0)); SS = 4
R = int(GAL_LEN * 0.75 * ppd / cosb) + 4
ty0, tx0 = int(cy) - R, int(cx) - R
sy, sx = np.mgrid[0:2 * R * SS, 0:2 * R * SS]
dx = (tx0 + (sx + 0.5) / SS) - cx; dy = (ty0 + (sy + 0.5) / SS) - cy
ex, ey = dx * cosb / ppd, dy / ppd                       # local sky offsets (deg)
th = np.radians(WISE_PA - SKY_PA_TEX)
ix = (ex * np.cos(th) - ey * np.sin(th)) * WISE_LEN_PX / GAL_LEN
iy = (ex * np.sin(th) + ey * np.cos(th)) * WISE_LEN_PX / GAL_LEN
ix = (ix + WISE_C[0]) / DS - 0.5; iy = (iy + WISE_C[1]) / DS - 0.5
add = np.stack([nd.map_coordinates(layer[..., c], [iy, ix], order=1, cval=0) for c in range(3)], -1)
add = add.reshape(2 * R, SS, 2 * R, SS, 3).mean((1, 3))

lin = np.where(src <= 0.04045, src / 12.92, ((src + 0.055) / 1.055) ** 2.4)
lin[ty0:ty0 + 2 * R, tx0:tx0 + 2 * R] += add
lin = np.clip(lin, 0, 1)
s = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
out = (s * 255 + 0.5).astype(np.uint8)
nz = np.argwhere(add.max(-1) > 1e-4)
print('patch', (tx0, ty0, 2 * R), 'nonzero extent px (y,x)', nz.min(0), nz.max(0), 'peak add lin', add.max(),
      'peak sRGB', s[ty0:ty0 + 2 * R, tx0:tx0 + 2 * R].max())
Image.fromarray(out).save(TEX, quality=95, subsampling=0)
print('wrote', TEX)
