"""Rewrite art-manifest.json (the art drop-in manifest; manifest.json is reserved for a PWA manifest) from what is actually in pano/, tex/, loops/ (so the app never probes for missing files).
Stills may be .jpg or .webp (jpg wins if both exist). A <still>.ktx2 next to a still (tools/prepare_art.py --ktx2) is listed under "ktx2"; the app
loads it first (ASTC/BC7, ~4x less GPU memory) and falls back to the JPEG/WebP. A .ktx2 older than its still is ignored (stale)."""
import json, os, glob
root = os.path.join(os.path.dirname(__file__), '..'); os.chdir(root)
def first(*cands):
    for c in cands:
        if os.path.isfile(c): return c
    return None
still = lambda base: first(base + '.jpg', base + '.webp')
m = {"_comment": "Optional art drop-ins. Regenerate with: python3 tools/scan_assets.py",
     "pano": still('pano/europa'),
     "tex": {"walls": still('tex/walls'), "snow": first('tex/snow.png'), "tunnel": still('tex/tunnel'), "veins": first('tex/tunnel-veins.png'), "dash": still('tex/cockpit-dash'), "rock": still('tex/rock'), "creatures": still('tex/creatures')},
     "chambers": [c for c in (still('tex/chamber-jelly'), still('tex/chamber-vents'), still('tex/chamber-pillars')) if c],   # ride chambers 1..3 in order
     "loops": sorted(glob.glob('loops/*.mp4'))[:6]}   # portrait ~720x1280, ~6 s loops, black bg
# test #11: ice-wall / glassy-ice textures + generated normal/roughness maps (tools/make_t11_maps.py); *-nr maps are LINEAR (UASTC KTX2, PNG fallback)
for key, base, nr in [('icewall', 'icewall', 0), ('icecol', 'icecol', 0), ('icedet', 'icedet', 0), ('icewallNr', 'icewall-nr', 1), ('icecolNr', 'icecol-nr', 1), ('icedetNr', 'icedet-nr', 1), ('rockNr', 'rock-nr', 1), ('tunnelNr', 'tunnel-nr', 1), ('wallsNr', 'walls-nr', 1)]:
    f = first('tex/' + base + '.png') if nr else still('tex/' + base)
    if f: m['tex'][key] = f
k2 = {}
for s in [m['pano'], m['tex']['walls'], m['tex']['tunnel'], m['tex']['dash'], m['tex']['rock'], m['tex']['creatures'], *m['chambers'], *[m['tex'].get(k) for k in ('icewall', 'icecol', 'icedet', 'icewallNr', 'icecolNr', 'icedetNr', 'rockNr', 'tunnelNr', 'wallsNr')]]:
    if not s: continue
    k = os.path.splitext(s)[0] + '.ktx2'
    if os.path.isfile(k) and os.path.getmtime(k) >= os.path.getmtime(s) - 1: k2[s] = k
if k2: m['ktx2'] = k2
json.dump(m, open('art-manifest.json', 'w'), indent=2); print(json.dumps(m, indent=2))
