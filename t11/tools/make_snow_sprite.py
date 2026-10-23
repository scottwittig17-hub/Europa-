"""tex/snow.png: 64x64 RGBA soft cyan speck with real alpha.
The art source (a JPG with a baked fake checkerboard) has a clipped white core and its glow is composited onto the
checkerboard, so clean alpha can't be extracted. The speck is recreated to match its colours: cyan-white core -> cyan glow."""
import numpy as np, sys
from PIL import Image
N = 64; y, x = np.mgrid[0:N, 0:N] + 0.5; r = np.hypot(x - N / 2, y - N / 2) / (N / 2)
core = np.array([0.86, 1.0, 1.0]); glow = np.array([0.30, 0.90, 0.96])          # sampled from the source (r<4 / r 15-25), core tamed off pure white
a = 0.85 * np.exp(-(r / 0.16) ** 2) + 0.35 * np.exp(-(r / 0.45) ** 2)
a *= np.clip((1 - r) / 0.25, 0, 1)                                                  # exactly 0 at the sprite edge
t = np.exp(-(r / 0.2) ** 2)[..., None]
rgb = core * t + glow * (1 - t)
img = np.dstack([rgb, np.clip(a, 0, 1)])
Image.fromarray((img * 255 + .5).astype(np.uint8), 'RGBA').save(sys.argv[1] if len(sys.argv) > 1 else 'tex/snow.png', optimize=True)
