"""Europa cavern: adapted from zippy-vr/tools/make_panorama_from_painting.py.
Differences: no sun removal, horizon at mid-height, poles fade to dark abyssal blue, no mirror mode needed.

Painting (16:9) -> seamless 2:1 equirectangular panorama (4096x2048).

Front (u=0.5, straight ahead behind the book) = the original painting, unstretched, covering 180 degrees.
Back 180 degrees = a second copy of the painting. Two ways to fill the back are supported:
  --mode mirror : horizontally mirrored copy (joins match exactly but read as an ink-blot at 90 deg L/R)
  --mode tile   : same-orientation copy, slightly widened, joined to the front copy with min-cost
                  (image-quilting) seams through the tree masses plus a colour-offset ramp so no step shows.
In both modes the duplicate sun in the back copy is painted out.
--back <painting> (Oct 18 2026): a SECOND painting fills the back 180 degrees instead of a copy of the front. It is joined at the two side
                  seams (90 deg L/R) by the same min-cost seams + colour-offset ramps, after a per-channel mean/std match of its edge bands
                  to the front. src may also be an existing equirect with --front-equirect (the front 180 deg band is cut back out of it).
Sky is extended to the zenith and ground to the nadir with a progressive wrap-blur so poles don't pinch."""
import sys, argparse, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, gaussian_filter1d

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--mode', default='tile'); ap.add_argument('--overlap', type=int, default=220); ap.add_argument('--horizon', type=float, default=0.5); ap.add_argument('--gain', type=float, default=1.0)
ap.add_argument('--back', default=None); ap.add_argument('--front-equirect', action='store_true')
args = ap.parse_args()
W, H = 4096, 2048
HORIZON = args.horizon
PW = W // 2
Image.MAX_IMAGE_PIXELS = 300_000_000
src = Image.open(args.src).convert('RGB')
if args.front_equirect:   # cut the front painting band back out of an equirect built by this script (front at [W/4, 3W/4), 16:9 band at the horizon)
    e = src.resize((W, H), Image.LANCZOS); ph = round(PW * 9 / 16); t0 = H // 2 - round(HORIZON * ph); src = e.crop((W // 4, t0, 3 * W // 4, t0 + ph))
PH = round(PW * src.height / src.width)       # 1152
P = np.asarray(src.resize((PW, PH), Image.LANCZOS)).astype(np.float32) / 255.0

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def remove_sun(img):
    lum = gaussian_filter(img.mean(2), 6)
    sy, sx = np.unravel_index(np.argmax(lum[: int(PH * .6)]), lum[: int(PH * .6)].shape)
    h, w = lum.shape; yy, xx = np.mgrid[0:h, 0:w]; r = np.hypot(yy - sy, xx - sx)
    mask = smooth(70, 26, r) * smooth(sy + 40, sy + 12, yy)       # disc + glow core, never below the horizon
    wgt = (r > 75).astype(np.float32)
    num = np.stack([gaussian_filter(img[..., c] * wgt, (2, 70)) for c in range(3)], -1)
    den = gaussian_filter(wgt, (2, 70))[..., None] + 1e-6
    out = img * (1 - mask[..., None]) + np.clip(num / den, 0, 1) * mask[..., None]
    print('removed back-copy sun at', sx, sy)
    return out

def min_seam(cost):
    """vertical min-cost path through cost (h, w); returns column index per row"""
    h, w = cost.shape; acc = cost.copy(); back = np.zeros((h, w), np.int32)
    for y in range(1, h):
        prev = acc[y - 1]
        cand = np.stack([np.r_[np.inf, prev[:-1]], prev, np.r_[prev[1:], np.inf]])
        k = np.argmin(cand, 0); back[y] = k - 1
        acc[y] += cand[k, np.arange(w)]
    path = np.zeros(h, np.int32); path[-1] = int(np.argmin(acc[-1]))
    for y in range(h - 1, 0, -1): path[y - 1] = path[y] + back[y, path[y]]
    return path

if args.mode == 'mirror':
    B = remove_sun(P[:, ::-1].copy())
    strip = np.roll(np.concatenate([P, B], 1), PW // 2, 1)
else:
    O = args.overlap
    BW = PW + 2 * O
    if args.back:
        bk = Image.open(args.back).convert('RGB'); bh = round(bk.width * PH / PW)
        if bh < bk.height: o = (bk.height - bh) // 2; bk = bk.crop((0, o, bk.width, o + bh))
        B = np.asarray(bk.resize((BW, PH), Image.LANCZOS)).astype(np.float32) / 255
        # tone match: back painting's overall mean/std per channel to the front's (keeps its own detail, kills a brightness step at the seams)
        for c in range(3): B[..., c] = (B[..., c] - B[..., c].mean()) / max(B[..., c].std(), 1e-3) * P[..., c].std() + P[..., c].mean()
        B = np.clip(B, 0, 1); print('back painting', args.back, '->', B.shape)
    else:
        B = np.asarray(Image.fromarray((P * 255).astype(np.uint8)).resize((BW, PH), Image.LANCZOS)).astype(np.float32) / 255
    # canvas coords: front P at [W/4, 3W/4); back copy B centred at x=0 (wrapping), spanning W/2 + 2O
    strip = np.zeros((PH, W, 3), np.float32)
    strip[:, W // 4: 3 * W // 4] = P
    bx = (np.arange(BW) + 3 * W // 4 - O) % W           # B column i -> canvas column
    # fill the non-overlapping back part
    core = np.arange(O, BW - O); strip[:, bx[core]] = B[:, core]
    for side in ('right', 'left'):
        if side == 'right':      # overlap [3W/4 - O, 3W/4): left = P (end), right = B (start)
            xs = np.arange(3 * W // 4 - O, 3 * W // 4)
            A = P[:, PW - O:]; Bo = B[:, :O]
        else:                     # overlap [W/4, W/4 + O): left = B (end), right = P (start)
            xs = np.arange(W // 4, W // 4 + O)
            A = B[:, BW - O:]; Bo = P[:, :O]
        diff = ((A - Bo) ** 2).sum(2)
        cost = gaussian_filter(diff, 2) + 1e-4
        mg = 12 if not args.back else 48; cost[:, :mg] += 1e3; cost[:, -mg:] += 1e3       # keep seam away from the overlap borders
        path = min_seam(cost)
        cols = np.arange(O)[None, :]
        fw = 6 if not args.back else 40   # two different paintings: much wider feather so the seam hides as a soft blend
        alpha = smooth(-fw, fw, cols - path[:, None])      # 0 -> use A (left), 1 -> use Bo (right)
        comp = A * (1 - alpha[..., None]) + Bo * alpha[..., None]
        strip[:, xs] = comp
        # colour-offset ramp: remove any residual step across the seam on the BACK-copy side
        rows = np.arange(PH)
        a_at = A[rows, np.clip(path - 3, 0, O - 1)]; b_at = Bo[rows, np.clip(path + 3, 0, O - 1)]
        off = gaussian_filter1d(a_at - b_at, 25, axis=0)          # (PH,3): left minus right at seam
        ramp_len = 320 if not args.back else 520
        if side == 'right':      # B is on the right: add +off fading to 0 going right
            for k in range(ramp_len):
                x = (3 * W // 4 - O + path + k) % W if False else None
            xx = (xs[0] + path[:, None] + np.arange(ramp_len)[None, :]) % W
            wgt = (1 - np.arange(ramp_len) / ramp_len)[None, :, None] * .5
            strip[rows[:, None], xx] += off[:, None, :] * wgt
        else:                     # B is on the left: subtract off fading going left
            xx = (xs[0] + path[:, None] - np.arange(ramp_len)[None, :]) % W
            wgt = (1 - np.arange(ramp_len) / ramp_len)[None, :, None] * .5
            strip[rows[:, None], xx] -= off[:, None, :] * wgt
        print(side, 'seam column range in overlap:', path.min(), path.max())
    strip = np.clip(strip, 0, 1)

# ---- place in equirect canvas ----
out = np.zeros((H, W, 3), np.float32)
top = H // 2 - round(HORIZON * PH); bot = top + PH
out[top:bot] = strip
topband = gaussian_filter(strip[:40].mean(0), (60, 0), mode=('wrap', 'nearest'))
sky_col = np.array([0.03, 0.10, 0.17], np.float32) * 0.6 + strip[:60].mean((0, 1)) * 0.4   # ice ceiling: dark abyssal blue
for y in range(top):
    t = 1 - y / top
    out[y] = topband * (1 - smooth(0, 0.85, t)) + sky_col * smooth(0, 0.85, t)
# ground: smear the painting's bottom band downward, then blur progressively — the blur starts ramping
# ~220 rows INSIDE the painting so there is no visible edge — and fade to an earthy path colour at the nadir
earth = np.array([0.02, 0.07, 0.11], np.float32) * 0.5 + strip[-60:].mean((0, 1)) * 0.5   # lakebed: dark abyssal blue
out[bot:] = gaussian_filter(strip[-24:].mean(0), (20, 0), mode=('wrap', 'nearest'))[None]
r0 = bot - 220
reg = out[r0:].copy(); n = reg.shape[0]
levels = [reg] + [gaussian_filter(reg, (sg * .8, sg, 0), mode=('nearest', 'wrap', 'nearest')) for sg in (5, 14, 35, 80)]
t = np.arange(n) / n
li = np.clip(smooth(0, 0.55, t) * 4, 0, 4 - 1e-6); i0 = li.astype(int); fr = (li - i0)[:, None, None]
L = np.stack(levels); rows = np.arange(n)
g = L[i0, rows] * (1 - fr) + L[i0 + 1, rows] * fr
e = smooth(0.45, 1.0, t)[:, None, None]
out[r0:] = g * (1 - e) + earth * e

lat = (0.5 - (np.arange(H) + 0.5) / H) * 180
ext = gaussian_filter(out, (25, 30, 0), mode=('nearest', 'wrap', 'nearest'))
fe = np.zeros(H, np.float32)
fe[top:top + 120] = 1 - np.linspace(0, 1, 120); fe[:top] = 1
fe[bot:] = 0  # ground extension is already continuous
fe = np.clip(fe, 0, 1)[:, None, None]
out = out * (1 - fe * 0.85) + ext * (fe * 0.85)
latc = lat[:, None, None]
heavy = gaussian_filter(out, (6, 90, 0), mode=('nearest', 'wrap', 'nearest'))
pole = np.maximum(smooth(55, 75, latc), smooth(-50, -72, latc))
out = out * (1 - pole) + heavy * pole
rowmean = out.mean(1, keepdims=True)
k = np.maximum(smooth(74, 88, latc), smooth(-72, -87, latc))
out = out * (1 - k) + rowmean * k
out = np.clip(out * args.gain + np.random.default_rng(1).normal(0, 0.006, (H, W, 1)), 0.008, 1)   # never pure black

img = Image.fromarray((out * 255 + .5).astype(np.uint8))
img.save(args.dst, quality=92, subsampling=0, optimize=True, progressive=True)   # hi-res stills: q92 4:4:4 (was q86). Bigger panos: drop a finished equirect in by filename (prepare_art.py --stills)
a = np.asarray(img).astype(float)
print('wrap seam diff', round(np.abs(a[:, 0] - a[:, -1]).mean(), 2), 'neighbour', round(np.abs(a[:, 1] - a[:, 0]).mean(), 2))
