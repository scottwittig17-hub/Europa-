#!/usr/bin/env python3
"""r12w sky: scrub the photo's baked-in pinpoint stars out of the approved 6k Upscayl Milky Way
(milkyway-eso0932a-6k-up.jpg, ESO/S. Brunier eso0932a, CC BY 4.0) and resample to 8192x4096.

Why the 6k-up and not a 16-bit original: ESO's largest public eso0932a file is the 6000x3000 8-bit RGB
"original" TIFF (https://cdn.eso.org/images/original/eso0932a.tif); the 800-Mpx 16-bit master is not public
(available only on request from S. Brunier). Scott's approved look (r11u, Nov 17 decision) is the Upscayl 2x
"naked-eye" grade of that image, so this keeps that grade and only removes point stars, then upsamples.

Steps: (1) bright stars (> BRIGHT above a 15px median) removed with a feathered halo -> median; (2) every remaining
pinpoint's light above a 7px median is pulled out and laid back as a soft gaussian glow, so star clouds keep their
brightness but no hard dots remain; (3) Lanczos resample to 8192x4096 + 0.6px blur; (4) the photo-Pleiades fill of tools/fill-blob.py
at 8K scale (radii doubled from the 4K values 14px/40px). The Hipparcos catalog (stars.json) stays the only star source.
Usage: python3 tools/prep-milkyway-8k.py SRC_6k.jpg OUT_8k.jpg
"""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd
Image.MAX_IMAGE_PIXELS = None
SRC, OUT = sys.argv[1], sys.argv[2]
W8, H8 = 8192, 4096
BRIGHT = 0.35      # stars this far (sRGB) above a 15px median are removed outright (catalog draws them)
SIG, KEEP = 2.5, 0.9   # remaining pinpoints: residual above a 7px median is redistributed as soft glow (sigma px @6k)
LUM = np.array([0.299, 0.587, 0.114], np.float32)
def u8(x): return Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))
def med(x, s): return np.asarray(u8(x).filter(ImageFilter.MedianFilter(s))).astype(np.float32) / 255.0
im = Image.open(SRC).convert('RGB'); W, H = im.size
a = np.asarray(im).astype(np.float32) / 255.0
m15 = med(a, 15)
bright = nd.binary_dilation(((a @ LUM) - (m15 @ LUM)) > BRIGHT, iterations=4)
wb = np.clip(nd.gaussian_filter(bright.astype(np.float32), 2.0) * 1.6, 0, 1)[..., None]
a = a * (1 - wb) + np.minimum(m15, a) * wb
print('bright stars removed: %.2f%% px' % (100 * bright.mean())); del m15, wb, bright
m7 = med(a, 7)
S = np.clip(a - m7, 0, None); del m7
G = np.stack([nd.gaussian_filter(S[..., c], SIG) for c in range(3)], -1)
a = a - S + KEEP * G; del S, G
print('pinpoints redistributed as glow (sigma %.1f px, keep %.2f)' % (SIG, KEEP))
out = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((W8, H8), Image.LANCZOS)
del a
out = out.filter(ImageFilter.GaussianBlur(0.6))
# de-block the faint sky: the 6k source's JPEG 8x8 grid shows in near-black areas once magnified; blend in a
# 2.5px blur where the sky is dark (band detail untouched)
_o = np.asarray(out).astype(np.float32) / 255.0
_b = np.asarray(out.filter(ImageFilter.GaussianBlur(2.5))).astype(np.float32) / 255.0
_w = np.clip(1 - (_b @ LUM) / 0.10, 0, 1)[..., None]
out = Image.fromarray((np.clip(_o * (1 - _w) + _b * _w, 0, 1) * 255 + 0.5).astype(np.uint8)); del _o, _b, _w
# Pleiades fill (tools/fill-blob.py, scaled to 8K)
src = np.asarray(out).astype(np.float32) / 255.0
fl = np.asarray(out.resize((W8 // 8, H8 // 8), Image.BOX).filter(ImageFilter.MedianFilter(15))
                .resize((W8, H8), Image.BICUBIC)).astype(np.float32) / 255.0
GRAIN_DY = 140
for l0, b0, r in [(163.8, -25.2, 28.0), (163.8, -25.2, 80.0)]:
    cx = (0.5 - l0 / 360) * W8; cy = (0.5 - b0 / 180) * H8
    y0, y1, x0, x1 = int(cy - 2 * r), int(cy + 2 * r), int(cx - 2 * r), int(cx + 2 * r)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    wgt = np.clip((1.6 * r - np.hypot(yy - cy, xx - cx)) / (0.6 * r), 0, 1)[..., None]
    grain = (src - fl)[y0 - GRAIN_DY:y1 - GRAIN_DY, x0:x1]
    rep = np.clip(fl[y0:y1, x0:x1] + grain, 0, 1)
    src[y0:y1, x0:x1] = src[y0:y1, x0:x1] * (1 - wgt) + rep * wgt
    print('pleiades fill l=%.1f b=%.1f px (%.0f,%.0f) r=%.0f' % (l0, b0, cx, cy, r))
Image.fromarray((np.clip(src, 0, 1) * 255 + 0.5).astype(np.uint8)).save(OUT, quality=95, subsampling=0, optimize=True)
print('wrote', OUT)
