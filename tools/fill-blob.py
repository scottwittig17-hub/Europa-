#!/usr/bin/env python3
"""Fill the photo's Pleiades (M45) blob in the committed Milky Way texture, in place.

The eso0932a photo shows the Pleiades as a bright fuzzy white blob at l=163.8 b=-25.2 (texture px ~184,1311),
~3 deg off the cluster's nominal l=166.6 b=-23.5 -- the same systematic offset as the photo's M31. The Hipparcos
catalog (stars.json) already draws the Pleiades' bright stars at their true position, so the photo blob reads as
a stray white 'object' beside them. Same fill as the M31 blob (tools/paint-m31.py step 1 / prep-milkyway.py):
feathered disc blended to ~120px median background + grain (src - median) of a clean neighbouring patch.

STEPS -- each entry is applied ONCE and is ALREADY BAKED into the committed texture once its commit lands:
  step 1 (commit 5e57993): photo Pleiades core, r=14px, grain 70px above.
  step 2 (kai/blob2): the same blob's residual halo (+2..3 DN ring out to ~60px that step 1's r=14 left; it
           reads as a faint fuzzy patch beside the catalog Pleiades in the headset), r=40px (full to 40, feathered
           to 64), grain from a clean patch 250px to the right (l~142 b~-25; the 70px-above patch would overlap).
By default ONLY THE LAST STEP runs. Do NOT re-run older steps on the committed texture (that would re-fill a
patch with grain copied from an already-filled region). To rebuild from the raw prep-milkyway.py output run
  python3 tools/fill-blob.py <texture.jpg> all
Usage: python3 tools/fill-blob.py [texture.jpg] [all|<step number>]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

TEX = sys.argv[1] if len(sys.argv) > 1 else 'surface/assets/milkyway-eso0932a-4k.jpg'
# (step, l, b, fill radius px, grain patch offset dx, dy px)
BLOBS = [(1, 163.8, -25.2, 14.0, 0, -70),    # photo Pleiades core  -- baked in 5e57993
         (2, 163.8, -25.2, 40.0, 250, 0)]    # its residual halo    -- baked in kai/blob2
SEL = sys.argv[2] if len(sys.argv) > 2 else str(BLOBS[-1][0])
BLOBS = [e for e in BLOBS if SEL == 'all' or str(e[0]) == SEL]

im = Image.open(TEX).convert('RGB'); W, H = im.size
src = np.asarray(im).astype(np.float64) / 255.0
fill = np.asarray(im.resize((W // 8, H // 8), Image.BOX).filter(ImageFilter.MedianFilter(15))
                  .resize((W, H), Image.BICUBIC)).astype(np.float64) / 255.0
for step, l0, b0, r, gdx, gdy in BLOBS:
    cx = (0.5 - l0 / 360) * W; cy = (0.5 - b0 / 180) * H
    y0, y1, x0, x1 = int(cy - 2 * r), int(cy + 2 * r), int(cx - 2 * r), int(cx + 2 * r)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    wgt = np.clip((1.6 * r - np.hypot(yy - cy, xx - cx)) / (0.6 * r), 0, 1)[..., None]
    # median background + the grain of a clean neighbouring patch (per-step offset gdx, gdy), so the fill doesn't read
    # as a smooth dark disc against the photo's noise
    grain = (src - fill)[y0 + gdy:y1 + gdy, x0 + gdx:x1 + gdx]
    rep = np.clip(fill[y0:y1, x0:x1] + grain, 0, 1)
    src[y0:y1, x0:x1] = src[y0:y1, x0:x1] * (1 - wgt) + rep * wgt
    print('step %d: filled l=%.1f b=%.1f at px (%.0f,%.0f) r=%.0f' % (step, l0, b0, cx, cy, r))
Image.fromarray((src * 255 + 0.5).astype(np.uint8)).save(TEX, quality=95, subsampling=0)
print('wrote', TEX)
