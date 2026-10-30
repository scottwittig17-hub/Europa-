#!/usr/bin/env python3
"""Fill the photo's Pleiades (M45) blob in the committed Milky Way texture, in place.

The eso0932a photo shows the Pleiades as a bright fuzzy white blob at l=163.8 b=-25.2 (texture px ~184,1311),
~3 deg off the cluster's nominal l=166.6 b=-23.5 -- the same systematic offset as the photo's M31. The Hipparcos
catalog (stars.json) already draws the Pleiades' bright stars at their true position, so the photo blob reads as
a stray white 'object' beside them. Same fill as the M31 blob (tools/paint-m31.py step 1 / prep-milkyway.py):
feathered disc blended to ~120px median background + grain (src - median) of a clean patch 70px above. Run ONCE on the 4K texture (idempotent-ish: a
second run re-fills an already-filled patch, a no-op at noise level).
Usage: python3 tools/fill-blob.py [texture.jpg]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

TEX = sys.argv[1] if len(sys.argv) > 1 else 'surface/assets/milkyway-eso0932a-4k.jpg'
GRAIN_DY = 70                    # source offset (px) of the grain patch
BLOBS = [(163.8, -25.2, 14.0)]   # (l, b, fill radius px) -- photo Pleiades

im = Image.open(TEX).convert('RGB'); W, H = im.size
src = np.asarray(im).astype(np.float64) / 255.0
fill = np.asarray(im.resize((W // 8, H // 8), Image.BOX).filter(ImageFilter.MedianFilter(15))
                  .resize((W, H), Image.BICUBIC)).astype(np.float64) / 255.0
for l0, b0, r in BLOBS:
    cx = (0.5 - l0 / 360) * W; cy = (0.5 - b0 / 180) * H
    y0, y1, x0, x1 = int(cy - 2 * r), int(cy + 2 * r), int(cx - 2 * r), int(cx + 2 * r)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    wgt = np.clip((1.6 * r - np.hypot(yy - cy, xx - cx)) / (0.6 * r), 0, 1)[..., None]
    # median background + the grain of a clean neighbouring patch (GRAIN_DY px above), so the fill doesn't read
    # as a smooth dark disc against the photo's noise
    grain = (src - fill)[y0 - GRAIN_DY:y1 - GRAIN_DY, x0:x1]
    rep = np.clip(fill[y0:y1, x0:x1] + grain, 0, 1)
    src[y0:y1, x0:x1] = src[y0:y1, x0:x1] * (1 - wgt) + rep * wgt
    print('filled l=%.1f b=%.1f at px (%.0f,%.0f) r=%.0f' % (l0, b0, cx, cy, r))
Image.fromarray((src * 255 + 0.5).astype(np.uint8)).save(TEX, quality=95, subsampling=0)
print('wrote', TEX)
