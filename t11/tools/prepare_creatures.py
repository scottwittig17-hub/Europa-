"""Test #8 creatures (Oct 18 2026): bioluminescent creature stills -> one additive atlas (premultiplied colour on black = the matte).

  python3 tools/prepare_creatures.py [--preview]

Sources (Scott's Drive, 4x upscales) in art-src/new-t8/:  fish1.jpg = sail-finned glass fish (a), fish3.png = lure angler-jelly (b),
fish4.jpg = veil creature (d). (rockyfloor-tex.jpg is really the crystal-spires image (c): it becomes the pillars backdrop, see README.)
Per creature: crop inside the porthole, a hand-drawn soft hull polygon (keeps rocks / spires / porthole frame / vent smoke out), then a
luminance key against the LOCAL background (grey-opening of the luma = the scene without thin bright structures), feathered, and the colour
multiplied by the matte, so black = fully transparent under additive blending (no alpha channel needed, no rectangle can show).
Output: tex/creatures.ktx2 (UASTC + zstd + mips, 3072x1536) + tex/creatures.jpg fallback (q92 4:4:4, 2048x1024). Layout (in 4096x2048 units, x SC):
  fish   x 0..2048,    y 0..1248      (head to the right)
  angler x 0..2048,    y 1248..2048   (lure orb to the right)
  veil   x 2048..3704, y 0..2048
UV rects are written to tex/creatures.json (the app reads them from app/ride.js constants; keep in sync)."""
import os, sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import grey_opening, gaussian_filter
Image.MAX_IMAGE_PIXELS = 300_000_000
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); SRC = os.path.join(ROOT, 'art-src', 'new-t8')
K = 4672 / 640   # source px per preview px (polygons were drawn on 640-wide previews)
# name: (file, crop box in 640-preview px, hull polygon in 640-preview px, key low/high (luma above local bg), slot (x, y, w, h) in the atlas)
CREATURES = {
  'fish':   ('fish1.jpg', (62, 62, 468, 310),
             [(64, 96), (96, 104), (150, 122), (200, 130), (240, 122), (262, 70), (300, 68), (330, 86), (352, 92), (372, 112), (392, 150), (430, 168), (462, 196),
              (452, 214), (420, 214), (400, 222), (380, 250), (348, 268), (320, 256), (300, 258), (262, 276), (228, 280), (176, 292), (132, 302), (108, 300),
              (118, 268), (96, 254), (64, 186)], (0.035, 0.16), (0, 0, 2048, 1248)),
  'angler': ('fish3.png', (84, 72, 562, 300),
             [(90, 92), (130, 82), (180, 86), (240, 100), (290, 120), (330, 150), (352, 172), (420, 190), (480, 210), (512, 222), (542, 230), (556, 252),
              (548, 272), (520, 270), (500, 250), (470, 232), (400, 210), (348, 205), (330, 240), (300, 270), (262, 290), (230, 296), (200, 282), (170, 290),
              (140, 288), (112, 270), (96, 220), (86, 150)], (0.012, 0.09), (0, 1248, 2048, 800)),
  'veil':   ('fish4.jpg', (130, 42, 420, 400),
             [(232, 48), (268, 46), (310, 58), (342, 80), (372, 120), (384, 160), (380, 190), (362, 218), (350, 250), (330, 290), (306, 330), (290, 360),
              (272, 386), (250, 392), (222, 386), (196, 370), (176, 352), (160, 330), (148, 300), (140, 270), (150, 248), (170, 236), (196, 226), (220, 214),
              (236, 186), (238, 150), (232, 110), (226, 70)], (0.035, 0.17), (2048, 0, 1656, 2048)),
}
SC = 0.75   # atlas scale (1.0 = 4096x2048; 0.75 = 3072x1536 keeps the deploy zip < 25 MB)
AW, AH = int(4096 * SC), int(2048 * SC)
GAIN = {'angler': 1.7}   # the angler's body is a dim purple-blue film in the source: lift it so it reads at 7+ m (the orb is added in the shader)

def matte_one(name, preview=False):
    f, box, poly, (k0, k1), slot = CREATURES[name]
    im = Image.open(os.path.join(SRC, f)).convert('RGB'); bx = [int(round(v * K)) for v in box]
    crop = im.crop(bx); W, H = crop.size
    a = np.asarray(crop).astype(np.float32) / 255; lum = a @ np.array([0.3, 0.5, 0.2], np.float32)
    # local background: opening of a 1/4-scale luma (removes thin bright fins/veins), blurred, back to full size
    s4 = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR)).astype(np.float32) / 255
    bg = gaussian_filter(grey_opening(s4, size=(31, 31)), 12)
    bg = np.asarray(Image.fromarray((bg * 255).clip(0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
    key = np.clip((lum - bg - k0) / (k1 - k0), 0, 1); key = key * key * (3 - 2 * key)
    # hull polygon, feathered (~1.5 % of the crop width)
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([((x - box[0]) * K, (y - box[1]) * K) for x, y in poly], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(W * 0.015)); hull = np.asarray(m).astype(np.float32) / 255
    mt = key * hull; mt = np.clip((mt - 0.04) / 0.96, 0, 1)   # hard zero below 4 % coverage: clean black compresses to nothing
    col = a - bg[..., None] * 0.85   # lift the creature off the scene behind it (the background glow is not part of the animal)
    out = np.clip(col * GAIN.get(name, 1.0), 0, 1) * mt[..., None]
    sx, sy, sw, sh = [int(round(v * SC)) for v in slot]
    o = Image.fromarray((out * 255 + 0.5).clip(0, 255).astype(np.uint8)).resize((sw, sh), Image.LANCZOS)
    if preview: o.resize((sw // 4, sh // 4), Image.LANCZOS).save(f'/tmp/cr/{name}.png')
    return o, slot

def main():
    pv = '--preview' in sys.argv; atlas = Image.new('RGB', (AW, AH), 0); rects = {}
    for n in CREATURES:
        o, sl = matte_one(n, pv); x, y, w, h = [int(round(v * SC)) for v in sl]; atlas.paste(o, (x, y)); rects[n] = [x / AW, 1 - (y + h) / AH, w / AW, h / AH]   # three.js UV (v up)
    if pv: atlas.resize((1024, 512), Image.LANCZOS).save('/tmp/cr/atlas.png'); return
    out = os.path.join(ROOT, 'tex', 'creatures.jpg'); atlas.save(out, quality=92, subsampling=0, optimize=True)
    src_ktx = '/tmp/creatures-ktxsrc.png'; atlas.save(src_ktx)   # KTX2 from the lossless atlas (no JPEG generation loss)
    json.dump({'size': [AW, AH], 'uv': rects, 'note': 'additive atlas: colour premultiplied by the matte (black = transparent)'}, open(os.path.join(ROOT, 'tex', 'creatures.json'), 'w'), indent=1)
    print('wrote', out, os.path.getsize(out), rects)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import prepare_art, shutil
    k = prepare_art.make_ktx2(src_ktx, 'uastc'); shutil.move(k, os.path.join(ROOT, 'tex', 'creatures.ktx2')); print('ktx2', os.path.getsize(os.path.join(ROOT, 'tex', 'creatures.ktx2')))
    fb = atlas.resize((AW * 2 // 3, AH * 2 // 3), Image.LANCZOS); fb.save(out, quality=92, subsampling=0, optimize=True)   # JPEG = fallback only (KTX2 path failed): 2048x1024
    print('fallback jpg', fb.size, os.path.getsize(out)); os.utime(os.path.join(ROOT, 'tex', 'creatures.ktx2'))   # ktx2 must not look older than its still (scan_assets)
    print('now run: python3 tools/scan_assets.py')

if __name__ == '__main__': main()
