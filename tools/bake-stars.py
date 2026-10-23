#!/usr/bin/env python3
"""Bake Hipparcos catalog (VizieR I/239) into a compact star field for the Europa sky.

Input : hip.tsv  (columns HIP, RAICRS_deg, DEICRS_deg, Vmag, B-V)
Output: stars.json — {count, magMax, stars: [x, y, z, r, g, b] * N}
        xyz on the unit sphere, three.js convention (+Y = north celestial pole),
        proper rotation (no mirroring); rgb pre-scaled by brightness from Vmag,
        tinted by B-V color index.

Source data: ESA Hipparcos catalog via CDS VizieR (public astronomical data).
"""
import json, math

MAG_MAX = 6.5   # keep stars brighter than this; tweak for density/perf

# B-V -> approximate RGB (piecewise linear)
BV_STOPS = [(-0.5, (0.55, 0.70, 1.00)), (0.0, (0.78, 0.86, 1.00)),
            (0.5, (1.00, 0.95, 0.85)), (1.0, (1.00, 0.80, 0.60)),
            (1.5, (1.00, 0.65, 0.45)), (2.0, (1.00, 0.55, 0.40))]

def bv_to_rgb(bv):
    if bv is None:
        return (0.85, 0.90, 1.00)
    if bv <= BV_STOPS[0][0]:
        return BV_STOPS[0][1]
    for (b0, c0), (b1, c1) in zip(BV_STOPS, BV_STOPS[1:]):
        if b0 <= bv <= b1:
            t = (bv - b0) / (b1 - b0)
            return tuple(c0[i] + t * (c1[i] - c0[i]) for i in range(3))
    return BV_STOPS[-1][1]

stars = []
with open('hip.tsv') as f:
    for line in f:
        if line.startswith('#') or not line.strip() or line.startswith(' ') and 'HIP' in line:
            continue
        parts = line.split('\t')
        if len(parts) < 5 or parts[0].strip() in ('HIP', '------', ''):
            continue
        try:
            ra = float(parts[1]); dec = float(parts[2]); mag = float(parts[3])
        except ValueError:
            continue
        if mag > MAG_MAX:
            continue
        bv = None
        try:
            bv = float(parts[4])
        except ValueError:
            pass
        r = math.radians(ra); d = math.radians(dec)
        cd, sd = math.cos(d), math.sin(d)
        x = cd * math.cos(r)
        y = sd
        z = -cd * math.sin(r)
        bright = max(0.04, 1.0 - (mag + 1.5) / (MAG_MAX + 1.5))
        cr, cg, cb = bv_to_rgb(bv)
        stars.append([round(x, 5), round(y, 5), round(z, 5),
                      round(cr * bright, 3), round(cg * bright, 3), round(cb * bright, 3)])

stars.sort(key=lambda s: -(s[3] + s[4] + s[5]))
out = {"count": len(stars), "magMax": MAG_MAX,
       "note": "Hipparcos (ESA) via CDS VizieR I/239; +Y = north celestial pole; rgb pre-scaled by Vmag, tinted by B-V",
       "stars": stars}
with open('stars.json', 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print(f"baked {len(stars)} stars (Vmag <= {MAG_MAX}) -> stars.json")
