"""Headset test #7 (Oct 18 2026, night): dark non-vent caverns + vignettes, see-through moving skylight, big manta overhead pass, (creatures if present).
Screenshots 100+ (?grade=hmd). Serve the folder on :8770 first. Standalone: python3 tools/verify_t7.py ; also called from verify.py."""
import os, sys, json, asyncio, base64, numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..')); sys.path.insert(0, HERE)
from verify_t6 import SKY, disc_stats, lum, ARGS
SKY_LIVE = SKY.replace("r.setAnimationLoop(null); await new Promise(r=>setTimeout(r,50));", '')   # render + read back in one task: the app loop keeps running

async def t7_test(p, B, OUT, check):
    br = await p.chromium.launch(channel='chrome', args=ARGS); logs = []
    pg = await br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    await pg.goto(B + '?desktop&noride&grade=hmd')
    await pg.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 1 && window.__ev.loops.length === 5', timeout=90000)
    await pg.evaluate('window.__ev.player.pause()'); await pg.mouse.move(5, 5)
    L = await pg.evaluate('window.__ev.path.L')
    async def at(s_expr, yaw=0.0, pitch=0.0, fov=80, target=None, settle=2500):
        await pg.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = {s_expr}; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); e.updateVideos(true); }})()')
        if target is not None:
            await pg.evaluate(f"""(() => {{ const e = window.__ev, b = (e.rw.backdrops[{target}] || {{ getWorldPosition: (P) => P.copy(e.rw.backdropSpots[{target}].pos).applyMatrix4(e.rideWorld.matrixWorld) }}), V = e.app.camera.position.constructor, P = new V(); b.getWorldPosition(P);
              const d = e.desktop; d.yaw = Math.max(-0.6, Math.min(0.6, Math.atan2(-P.x, -P.z))); d.pitch = 0.03; }})()""")
        else: await pg.evaluate(f'(() => {{ const d = window.__ev.desktop; d.yaw = {yaw}; d.pitch = {pitch}; }})()')
        await pg.evaluate(f'window.__ev.app.camera.fov = {fov}; window.__ev.app.camera.updateProjectionMatrix()'); await pg.wait_for_timeout(settle)
    SETBD = '''((dark, vig) => { for (const m of window.__ev.rw.backdropLayers) { const u = m.material.uniforms, i = window.__ev.rw.backdrops.indexOf(m) >= 0 ? window.__ev.rw.backdrops.indexOf(m) : null;
        if (!u.__d) u.__d = [u.uDark.value, u.uVig.value]; u.uDark.value = dark < 0 ? u.__d[0] : dark; u.uVig.value = vig < 0 ? u.__d[1] : vig; } })'''
    # ---- 1 + 2: caverns. Same view with the old look (dark 0, vignette 0) vs the new one; mean luma of the backdrop's screen rect and its outer band
    RECT = '''((i) => { const e = window.__ev, c = e.app.camera, b = e.rw.backdrops[i]; b.updateMatrixWorld(true); const g = b.geometry.parameters, V = c.position.constructor;
        const pts = []; for (const [x, y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]) { const v = new V(x * g.width, y * g.height, 0).applyMatrix4(b.matrixWorld).project(c); pts.push([(v.x * .5 + .5) * innerWidth, (1 - (v.y * .5 + .5)) * innerHeight]); } return pts; })'''
    names = {0: '100-cavern-jelly.png', 1: '101-cavern-vents.png', 2: '102-cavern-pillars.png'}
    # (a) shader-level: each backdrop's 3 layers rendered face-on, alone, into a render target (black behind) = exactly what the painting adds.
    #     old look (BACKDROP_DARK 0 / VIGNETTE 0) vs new; centre = UV radius < 0.4, edge = outer 10 % of the rectangle.
    FACE = """(async ([i, dark, vig]) => { const THREE = await import('three'); const e = window.__ev, r = e.app.renderer; const sc = new THREE.Scene();
        const ms = e.rw.backdropLayers.filter(m => m.userData.spot === e.rw.backdrops[i].userData.spot); let W0 = 0, H0 = 0;
        for (const m of ms) { const u = m.material.uniforms; const keep = [u.uDark.value, u.uVig.value]; if (dark >= 0) { u.uDark.value = dark; u.uVig.value = vig; }
          const c = new THREE.Mesh(m.geometry, m.material); c.renderOrder = m.renderOrder; c.userData.keep = [u, keep]; sc.add(c); const g = m.geometry.parameters; if (g.width > W0) { W0 = g.width; H0 = g.height; } }
        const D = 20, cam = new THREE.PerspectiveCamera(2 * Math.atan(H0 / 2 / D) * 180 / Math.PI, W0 / H0, 1, 100); cam.position.set(0, 0, D); cam.updateMatrixWorld(true);
        const w = 320, h = Math.round(320 * H0 / W0), rt = new THREE.WebGLRenderTarget(w, h); const prev = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
        r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(sc, cam); const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px);
        r.setRenderTarget(prev); r.setClearColor(cc, ca); rt.dispose(); for (const c of sc.children) { const [u, k] = c.userData.keep; u.uDark.value = k[0]; u.uVig.value = k[1]; }
        return { w, h, px: Array.from(px) }; })"""
    for i in range(3):
        res = {}
        for tag, args in (('old', [i, 0, 0]), ('new', [i, -1, -1])):
            d = await pg.evaluate(FACE, args); A = np.array(d['px'], np.float32).reshape(d['h'], d['w'], 4)[::-1, :, :3]; res[tag] = lum(A)
        o, n = res['old'], res['new']; H, W = o.shape; yy, xx = np.mgrid[0:H, 0:W]; u, v = (xx + 0.5) / W, (yy + 0.5) / H
        ctr = np.hypot((u - 0.5) * 2, (v - 0.5) * 2) < 0.4; edge = (np.minimum(u, 1 - u) < 0.1) | (np.minimum(v, 1 - v) < 0.1)
        Image.fromarray(np.concatenate([o, n], 1).clip(0, 255).astype(np.uint8)).resize((W * 4, H * 2)).save(OUT + f'10{5 + i}-backdrop-{names[i][11:-4]}-alone-old-vs-new.png')
        info = f'painting alone, old -> new: centre mean {o[ctr].mean():.1f} -> {n[ctr].mean():.1f}, edge band mean {o[edge].mean():.1f} -> {n[edge].mean():.1f}, edge p99 {np.percentile(o[edge], 99):.1f} -> {np.percentile(n[edge], 99):.1f} /255'
        if i == 1: check('lava-vent backdrop: centre kept (>= 80 %), soft vignette pulls the edges into shadow (edge mean <= 35 %, p99 < 10)',
                         n[ctr].mean() >= 0.8 * o[ctr].mean() and n[edge].mean() <= 0.35 * max(o[edge].mean(), 1e-3) and np.percentile(n[edge], 99) < 10, info)
        else: check(f'{names[i][11:-4]} backdrop: deep shadow (centre 10-60 % of before, rims still glow) and edges black (p99 < 5): no rectangle',
                    0.10 * o[ctr].mean() <= n[ctr].mean() <= 0.6 * o[ctr].mean() and np.percentile(n[ctr], 99) > 40 and np.percentile(n[edge], 99) < 5, info + f', centre p99 now {np.percentile(n[ctr], 99):.0f}')
    # (b) in the ride, from the cockpit (screenshots)
    for i, f in [(0, 0.12), (1, 0.45), (2, 0.76)]:
        await at(f'{f} * {L} - 16', target=i, settle=4000); await pg.screenshot(path=OUT + names[i])
    # ---- 4: big manta overhead pass
    ov = json.loads(await pg.evaluate('''JSON.stringify((() => { const e = window.__ev, rw = e.rw, B = rw.BIG2, pl = rw.instances.find(p => p.name === 'big-ray'), V = e.app.camera.position.constructor;
        let best = null; const eye = new V();
        for (let s = B.s0; s <= B.s0 + B.D; s += 0.1) { e.path.pointOf(s, eye); rw.updateInstances(s, e.t); if (!pl.visible) continue; const d = pl.position.clone().sub(eye);
          const ang = Math.atan2(Math.hypot(d.x, d.z), d.y) * 180 / Math.PI; if (!best || ang < best.ang) best = { s, ang, up: d.y, dist: d.length(), pass: pl.userData.pass }; }
        let inSky = 0; for (let s = B.s0; s <= B.s0 + B.D; s += 0.25) { e.path.pointOf(s, eye); rw.updateInstances(s, e.t); const d = pl.position.clone().sub(eye); if (pl.visible && Math.atan2(Math.hypot(d.x, d.z), d.y) < 0.35) inSky += 0.25 / e.ride.cruise; }
        best.secondsInSkylightCone = inSky; return best; })())'''))
    check('manta: once per lap it glides straight over the sub (centre within 10 deg of the zenith)', ov['ang'] < 10 and ov['pass'] == 2, ov)
    check('manta overhead: 6-9 m above the cockpit roof (comfort: >= 6 m), lingers in the skylight', 6.0 <= ov['up'] - 0.95 <= 9.0 and ov['secondsInSkylightCone'] >= 15,
          f"centre {ov['up']:.2f} m above the eye = {ov['up'] - 0.95:.2f} m above the roof; {ov['secondsInSkylightCone']:.0f} s within 20 deg of the zenith at cruise")
    c = json.loads(await pg.evaluate('JSON.stringify(window.__ev.rw.bigRayClearance(0.05))'))
    check('manta: closest point of the (flexing) plane >= 6 m from the cockpit over both passes', c['min'] >= 6.0, c)
    await at(f"{ov['s']} - 3", settle=200)
    await pg.wait_for_function('window.__ev.loops[4].playing && window.__ev.rw.instances.find(p => p.name === "big-ray").userData.on', timeout=30000)
    vb = await pg.evaluate('window.__ev.loops.filter(l => l.playing).map(l => l.index)')
    check('manta video decoding during the overhead pass, <= 3 decodes', 4 in vb and len(vb) <= 3, vb)
    strip = []
    for k, ds in enumerate((-9.0, -4.5, -1.5, 1.5, 4.5)):   # the pass as seen through the skylight (left eye), sub moving forward
        await at(f"{ov['s']} + {ds}", settle=3500 if k else 6000); r = await pg.evaluate(SKY_LIVE, [1.2, 0]); open('/tmp/ev-t7-strip.png', 'wb').write(base64.b64decode(r['url'].split(',')[1]))
        cx, cy, rad = r['ctr'][0]; R = int(rad * 1.25); strip.append(Image.open('/tmp/ev-t7-strip.png').convert('RGB').crop((int(cx - R), int(cy - R), int(cx + R), int(cy + R))).resize((300, 300), Image.LANCZOS))
    st = Image.new('RGB', (300 * len(strip), 300)); [st.paste(im, (300 * k, 0)) for k, im in enumerate(strip)]; st.save(OUT + '108-skylight-manta-pass-sequence.png')
    await at(f"{ov['s']}", settle=4000)
    r = await pg.evaluate(SKY, [1.2, 0]); open(OUT + '103-skylight-manta-overhead-xr-sim.png', 'wb').write(base64.b64decode(r['url'].split(',')[1]))
    part = await pg.evaluate('window.__ev.cockpit.skyMat.uniforms.uSkyPart.value')
    check('skylight steps back (SKYLIGHT_PART) while the manta is overhead', part > 0.8, f'uSkyPart {part:.2f} at the overhead moment')
    await pg.evaluate('window.__ev.cockpit.skyMat.uniforms.uSkyPart.value = 0')   # baseline frame below: no ray, normal ice
    await pg.evaluate('window.__ev.rw.instances.find(p => p.name === "big-ray").visible = false')   # loop is stopped now: same frame without the ray
    r0 = await pg.evaluate(SKY, [1.2, 0]); open('/tmp/ev-t7-noray.png', 'wb').write(base64.b64decode(r0['url'].split(',')[1])); _, s0 = disc_stats('/tmp/ev-t7-noray.png', r0['ctr'], 0.9)
    am, sm = disc_stats(OUT + '103-skylight-manta-overhead-xr-sim.png', r['ctr'], 0.9)
    check('manta visible through the skylight (disc brighter / more structured than without it)', sm[0]['mean'] > s0[0]['mean'] * 1.15 or sm[0]['p95'] > s0[0]['p95'] * 1.3,
          f"disc mean {s0[0]['mean']:.1f} -> {sm[0]['mean']:.1f}, p95 {s0[0]['p95']:.1f} -> {sm[0]['p95']:.1f}")
    cx, cy, rad = r['ctr'][0]; R = int(rad * 1.6)
    Image.open(OUT + '103-skylight-manta-overhead-xr-sim.png').crop((int(cx - R), int(cy - R), int(cx + R), int(cy + R))).resize((512, 512), Image.LANCZOS).save(OUT + '104-skylight-manta-closeup.png')
    # ---- 3: skylight speed family + see-through: put a bright test card 8 m above the cockpit, compare the disc with / without it
    res = []
    for tt in (200.0, 204.0):
        r = await pg.evaluate(SKY, [1.2, tt]); png = f'/tmp/ev-t7-sky-{int(tt)}.png'; open(png, 'wb').write(base64.b64decode(r['url'].split(',')[1])); res.append((png, r))
    a0, s0 = disc_stats(res[0][0], res[0][1]['ctr']); a1, _ = disc_stats(res[1][0], res[1][1]['ctr'])
    mv = float(np.abs(lum(a0[s0[0]['mask']]) - lum(a1[s0[0]['mask']])).mean())
    check('skylight: slow continuous motion (changes over 4 s, gently)', 1.0 < mv < 25, f'mean |dL| {mv:.1f}/255 over 4 s')
    await pg.evaluate('''(async () => { const THREE = await import('three'); const e = window.__ev; const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x808080 }));
        m.rotation.x = Math.PI / 2; m.position.set(0, 1.2 + 8, -0.35); m.name = '__card'; e.app.scene.add(m); })()''')
    r = await pg.evaluate(SKY, [1.2, 200.0]); open('/tmp/ev-t7-card.png', 'wb').write(base64.b64decode(r['url'].split(',')[1]))
    await pg.evaluate('(() => { const e = window.__ev, m = e.app.scene.getObjectByName("__card"); e.app.scene.remove(m); })()')
    ac, sc = disc_stats('/tmp/ev-t7-card.png', r['ctr'], 0.6); _, sn = disc_stats(res[0][0], res[0][1]['ctr'], 0.6)
    tr = (sc[0]['mean'] - sn[0]['mean']) / 128.0
    check('skylight: see-through (a grey card 8 m above shows through the ice)', tr > 0.3, f'transmission ~{tr:.2f} (card 128/255: disc centre {sn[0]["mean"]:.0f} -> {sc[0]["mean"]:.0f})')
    bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
    check('test #7: no console errors/warnings', not bad, [b[1][:300] for b in bad[:3]])
    await br.close()

if __name__ == '__main__':
    from playwright.async_api import async_playwright
    res = []
    def _check(name, cond, info=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, info)
    async def _main():
        async with async_playwright() as p: await t7_test(p, 'http://127.0.0.1:8770/', os.path.join(ROOT, 'screens') + '/', _check)
    asyncio.run(_main()); raise SystemExit(0 if all(res) else 1)
