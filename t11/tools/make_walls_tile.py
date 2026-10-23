"""16:9 stone photo -> tex/walls.jpg: 1024x1024 seamless, mid-grey, <=400 KB.
Centre square crop -> flatten low-frequency lighting -> half-offset (edges move to the middle, borders become seamless)
-> hide the resulting central cross by blending the un-offset image back in along min-cost-ish soft bands."""
import sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('L'); s = min(im.size); l = (im.width - s) // 2; t = (im.height - s) // 2
T = np.asarray(im.crop((l, t, l + s, t + s)).resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255
T = T - gaussian_filter(T, 120, mode='reflect') + T.mean()             # remove lighting gradient
N = 1024; S = np.roll(T, (N // 2, N // 2), (0, 1))                       # tileable, seam cross in the centre
c = np.abs(np.arange(N) - N / 2)
band = np.clip(1 - (c - 90) / 140, 0, 1); band = band * band * (3 - 2 * band)   # 1 within 90 px of centre, fades by 230 px
m = np.maximum(band[None, :], band[:, None])                              # cross mask (0 at the borders)
# break up the straight mask edge with low-frequency noise so no grid line can read
rng = np.random.default_rng(3); n = gaussian_filter(rng.standard_normal((N, N)), 40, mode='wrap'); n /= n.std()
m = np.clip(m + 0.25 * n * (m * (1 - m)) * 4, 0, 1)
out = S * (1 - m) + T * m
# match local contrast (blending two images lowers variance in the mix zone)
hp = out - gaussian_filter(out, 8, mode='wrap'); var = gaussian_filter(hp ** 2, 40, mode='wrap')
ref = np.median(var); out = gaussian_filter(out, 8, mode='wrap') + hp * np.clip(np.sqrt(ref / (var + 1e-6)), 1, 1.6)
out = (out - out.mean()) / out.std() * 0.11 + 0.5                         # mid-grey, moderate contrast
img = Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)).convert('RGB')
for q in (88, 84, 80, 75):
    img.save(dst, quality=q, optimize=True)
    import os
    if os.path.getsize(dst) <= 400_000: break
a = np.asarray(img)[..., 0].astype(float)
print('size', os.path.getsize(dst), 'mean', a.mean().round(1), 'wrap diff x', np.abs(a[:, 0] - a[:, -1]).mean().round(2), 'y', np.abs(a[0] - a[-1]).mean().round(2), 'neighbour', np.abs(a[:, 1] - a[:, 0]).mean().round(2))
