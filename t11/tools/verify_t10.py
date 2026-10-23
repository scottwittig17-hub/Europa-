"""Headset test #10 (Oct 19 2026): jelly + pillars backdrop paintings removed, procedural 3D cave rock instead (vents backdrop kept).
Screenshots 130+. Set EV_URL (default :8770) and optionally EV_T8_URL (a server on the t8 backup) for the lava-cave unchanged diff.
Adapted from: Headset test #8 (Oct 18 2026, late night): creatures (fish / angler + lure orb / veil, one additive atlas, one draw call), new crystal-spires
pillars backdrop, 2x skylight with the whole manta overhead. Screenshots 110+ (?grade=hmd). Serve the folder on :8770 first.
Standalone: python3 tools/verify_t8.py ; also called from verify.py."""
import os, sys, json, math, asyncio, base64, numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..')); sys.path.insert(0, HERE)
from verify_t6 import SKY, disc_stats, lum, ARGS
from verify_t10_caves import t10_caves
SKY_LIVE = SKY.replace("r.setAnimationLoop(null); await new Promise(r=>setTimeout(r,50));", '')

async def t10_test(p, B, OUT, check):
    br = await p.chromium.launch(channel='chrome', args=ARGS); logs = []
    pg = await br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    await pg.goto(B + '?desktop&noride&grade=hmd')
    await pg.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 1 && window.__ev.loops.length === 5 && window.__ev.rw.creU.uMap.value', timeout=90000)
    await pg.evaluate('window.__ev.player.pause()'); await pg.mouse.move(5, 5)
    L = await pg.evaluate('window.__ev.path.L')
    async def at(s_expr, aim=None, fov=60, settle=3000):
        await pg.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = {s_expr}; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); e.updateVideos(true); }})()')
        if aim is not None:   # creature index: aim the desktop camera at its current centre
            await pg.evaluate(f"""(() => {{ const e = window.__ev, rw = e.rw, c = rw.CRE[{aim}], V = e.app.camera.position.constructor; const P = rw.crePos(c, e.t, new V()).applyMatrix4(e.rideWorld.matrixWorld);
              const d = e.desktop; d.yaw = Math.atan2(-P.x, -P.z); d.pitch = Math.atan2(P.y - 1.2, Math.hypot(P.x, P.z)); }})()""")
        await pg.evaluate(f'window.__ev.app.camera.fov = {fov}; window.__ev.app.camera.updateProjectionMatrix()'); await pg.wait_for_timeout(settle)
    # ---- assets
    st = json.loads(await pg.evaluate('JSON.stringify({ list: window.__ev.stillStats.list, n: window.__ev.rw.CRE.length, compressed: !!window.__ev.rw.creU.uMap.value.isCompressedTexture, w: window.__ev.rw.creU.uMap.value.image?.width })'))
    check('creatures: atlas loaded (KTX2 path, one texture for all three animals)', st['compressed'] and st['n'] == 3, {'compressed': st['compressed'], 'width': st['w']})
    # ---- comfort + placement
    c = json.loads(await pg.evaluate('JSON.stringify(window.__ev.rw.creatureClearance(0.5))'))
    check('creatures: every card point (with sway/curve envelope) >= 6 m from the cockpit over the lap', c['min'] >= 6.0, c)
    mv = json.loads(await pg.evaluate('''JSON.stringify((() => { const e = window.__ev, rw = e.rw, V = e.app.camera.position.constructor, M = new e.app.camera.matrixWorld.constructor(), out = {};
        for (const c of rw.CRE) { let vmax = 0, ymax = 0; const a = new V(), b = new V(), eye = new V(); e.path.pointOf(c.s - 12, eye);
          for (let t = 0; t < c.per; t += 0.5) { rw.crePos(c, t, a); rw.crePos(c, t + 0.5, b); vmax = Math.max(vmax, a.distanceTo(b) / 0.5);
            rw.crePose(c, t, eye, M); const x0 = new V().setFromMatrixColumn(M, 0).normalize(); rw.crePose(c, t + 0.5, eye, M); const x1 = new V().setFromMatrixColumn(M, 0).normalize();
            ymax = Math.max(ymax, Math.acos(Math.min(1, x0.dot(x1))) * 180 / Math.PI / 0.5); }
          out[c.kind] = { speed: +vmax.toFixed(3), turnDegS: +ymax.toFixed(2) }; } return out; })())'''))
    check('creatures: slow swimmers (<= 0.15 m/s, turn <= 8 deg/s: no darting, no visible spin)', all(v['speed'] <= 0.15 and v['turnDegS'] <= 8 for v in mv.values()), mv)
    seen = json.loads(await pg.evaluate('''JSON.stringify((() => { const e = window.__ev, rw = e.rw, V = e.app.camera.position.constructor, out = {};
        for (const c of rw.CRE) { let sec = 0; const P = new V(), eye = new V();
          for (let s = 0; s < e.path.L; s += 0.5) { e.path.pointOf(s, eye); rw.crePos(c, s / e.ride.cruise, P); const d = P.clone().sub(eye); const dist = d.length();
            const fw = e.path.pointOf(s + 0.5, new V()).sub(eye).setY(0).normalize(); const ang = Math.acos(d.clone().setY(0).normalize().dot(fw)) * 180 / Math.PI;   // horizontal angle off the path heading
            if (dist < 26 && ang < 40) sec += 0.5 / e.ride.cruise; } out[c.kind] = Math.round(sec); } return out; })())'''))
    check('creatures: each one is in front of the sub (within 40 deg of the heading = front window, < 26 m) for a while every lap', all(v >= 20 for v in seen.values()), {k: f'{v} s' for k, v in seen.items()})
    # ---- in situ screenshots + undulation (frame difference on the creature only)
    names = {0: '140-creature-fish-vents.png', 1: '141-creature-angler-lure-dark-corridor.png', 2: '142-creature-veil-jelly-hall.png'}
    for i in range(3):
        sv = await pg.evaluate(f'''(() => {{ const e = window.__ev, rw = e.rw, c = rw.CRE[{i}], V = e.app.camera.position.constructor; const P = rw.crePos(c, e.t + 2, new V()), a = new V(), b = new V(); let best = null;
            for (let s = c.s - 40; s <= c.s + 10; s += 0.25) {{ e.path.pointOf(s, a); e.path.pointOf(s + 0.5, b); const fw = b.sub(a).setY(0).normalize(); const d = P.clone().sub(a); const dist = d.length();
              const ang = Math.acos(d.setY(0).normalize().dot(fw)) * 180 / Math.PI; if (ang < 26 && dist > 8 && (!best || dist < best.dist)) best = {{ s, dist, ang }}; }} return best ? best.s : c.s - 15; }})()''')
        await at(f'{sv}', aim=i, fov=50, settle=4000)
        await pg.screenshot(path=OUT + names[i])
        await pg.evaluate('window.__ev.rw.creMesh.material.uniforms.uGain.value = 0; window.__ev.rw.creMesh.material.uniforms.uOrb.value = 0'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/ev-t10-nocre.png')
        await pg.evaluate('window.__ev.rw.creMesh.material.uniforms.uGain.value = 1; window.__ev.rw.creMesh.material.uniforms.uOrb.value = 1')
        ld = lambda f: lum(np.asarray(Image.open(f).convert('RGB')).astype(np.float32))
        a = ld(OUT + names[i]); z = ld('/tmp/ev-t10-nocre.png'); m = (a - z) > 6
        check(f'creature {names[i][13:-4]}: visible in situ (adds light over >= 0.4 % of the frame)', m.mean() >= 0.004, f'{m.mean() * 100:.2f} % of px brighter by > 6/255, peak +{(a - z).max():.0f}')
        if m.any():   # close-up crop around the creature (from the with/without difference), 2x
            ys, xs = np.nonzero(m); x0, x1, y0, y1 = np.percentile(xs, 1), np.percentile(xs, 99), np.percentile(ys, 1), np.percentile(ys, 99); pad = 40
            box = (int(max(0, x0 - pad)), int(max(0, y0 - pad)), int(min(a.shape[1], x1 + pad)), int(min(a.shape[0], y1 + pad)))
            im = Image.open(OUT + names[i]).crop(box); im.resize((im.width * 2, im.height * 2), Image.LANCZOS).save(OUT + f'14{3 + i}-closeup-' + names[i][4:])
        if i == 1:
            pk = float((a - z).max()); check('angler: lure orb is a strong emissive (peak >= 120/255 above the scene)', pk >= 120, f'peak +{pk:.0f}/255')
        await pg.evaluate('window.__ev.rw.CRE.forEach(c => c.__per = c.per); window.__ev.rw.CRE.forEach(c => c.per = 1e9)')   # freeze the path: isolate the shader sway
        await pg.wait_for_timeout(400); await pg.screenshot(path='/tmp/ev-t10-a.png'); await pg.wait_for_timeout(2500); await pg.screenshot(path='/tmp/ev-t10-b.png')
        await pg.evaluate('window.__ev.rw.CRE.forEach(c => c.per = c.__per)')
        dd = np.abs(ld('/tmp/ev-t10-a.png') - ld('/tmp/ev-t10-b.png'))[m]
        check(f'creature {names[i][13:-4]}: fins/tentacles undulate (shader sway, frozen path)', dd.mean() > 1.0, f'mean |dL| {dd.mean():.1f}/255 on the creature over 2.5 s')
    calls = json.loads(await pg.evaluate('''(async () => { const e = window.__ev, r = e.app.renderer; const m = e.rw.creMesh; r.info.autoReset = false;
        const n = async (v) => { m.material.uniforms.uGain.value = 1; m.visible = v; r.info.reset(); r.render(e.app.scene, e.app.camera); return r.info.render.calls; };
        const a = await n(true), b = await n(false); r.info.autoReset = true; m.visible = true; return JSON.stringify([a, b]); })()'''))
    check('creatures: all three animals + lure orb = 1 draw call', calls[0] - calls[1] == 1, f'{calls[0]} vs {calls[1]} calls with / without')
    await t10_caves(pg, B, OUT, check, L, at)
    # ---- skylight 2x + whole manta overhead
    sk = await pg.evaluate('window.__ev.cockpit.skylight')
    check('skylight radius ~2x (0.52 m)', abs(sk['r'] - 0.52) < 0.03, sk)
    ov = json.loads(await pg.evaluate('''JSON.stringify((() => { const e = window.__ev, rw = e.rw, B = rw.BIG2, pl = rw.instances.find(p => p.name === 'big-ray'), V = e.app.camera.position.constructor, sk = e.cockpit.skylight;
        const eye = new V(); let best = null; const half = Math.atan(sk.r / (sk.y - 1.2));
        for (let s = B.s0; s <= B.s0 + B.D; s += 0.1) { e.path.pointOf(s, eye); rw.updateInstances(s, e.t); if (!pl.visible) continue; pl.updateMatrix(); let n = 0, k = 0;
          for (let a = -0.5; a <= 0.5001; a += 0.125) for (let b = -0.3; b <= 0.3001; b += 0.1) { const q = new V(a, b, 0).applyMatrix4(pl.matrix).sub(eye); q.z -= sk.z; k++; if (Math.atan2(Math.hypot(q.x, q.z), q.y) < half) n++; }
          if (!best || n / k > best.frac) best = { s, frac: n / k, halfDeg: half * 180 / Math.PI }; }
        return best; })())'''))
    check('manta overhead: >= 80 % of the ray (9 m span x body) inside the skylight cone at the best moment', ov['frac'] >= 0.8, ov)
    strip = []
    for k, ds in enumerate((-8.0, -4.0, -1.5, 0.0, 1.5, 4.0)):
        await at(f"{ov['s']} + {ds}", settle=3500 if k else 6000); r = await pg.evaluate(SKY_LIVE, [1.2, 0]); open('/tmp/ev-t10-strip.png', 'wb').write(base64.b64decode(r['url'].split(',')[1]))
        cx, cy, rad = r['ctr'][0]; R = int(rad * 1.15); strip.append(Image.open('/tmp/ev-t10-strip.png').convert('RGB').crop((int(cx - R), int(cy - R), int(cx + R), int(cy + R))).resize((300, 300), Image.LANCZOS))
        if ds == 0.0: open(OUT + '146-skylight-manta-overhead-xr-sim.png', 'wb').write(base64.b64decode(r['url'].split(',')[1])); ctr0 = r['ctr']
    st = Image.new('RGB', (300 * len(strip), 300)); [st.paste(im, (300 * k, 0)) for k, im in enumerate(strip)]; st.save(OUT + '147-skylight-manta-pass-sequence.png')
    await pg.evaluate('window.__ev.rw.instances.find(p => p.name === "big-ray").visible = false; window.__ev.cockpit.skyMat.uniforms.uSkyPart.value = 0')
    r0 = await pg.evaluate(SKY, [1.2, 0]); open('/tmp/ev-t10-noray.png', 'wb').write(base64.b64decode(r0['url'].split(',')[1]))
    _, s1 = disc_stats(OUT + '146-skylight-manta-overhead-xr-sim.png', ctr0, 0.9); _, s0 = disc_stats('/tmp/ev-t10-noray.png', r0['ctr'], 0.9)
    check('manta reads through the 2x skylight (its bright outline: disc p95 +20 %, contrast +15 % vs. the same frame without it)', s1[0]['p95'] > s0[0]['p95'] * 1.2 and s1[0]['std'] > s0[0]['std'] * 1.15,
          f"disc mean {s0[0]['mean']:.1f} -> {s1[0]['mean']:.1f}, std {s0[0]['std']:.1f} -> {s1[0]['std']:.1f}, p95 {s0[0]['p95']:.1f} -> {s1[0]['p95']:.1f}")
    check('skylight 2x: still dim / deep-black without the manta', s0[0]['mean'] < 60 and s0[0]['p5'] < 25, {k: round(v, 1) for k, v in s0[0].items() if k != 'mask'})
    bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
    check('test #10: no console errors/warnings', not bad, [b[1][:300] for b in bad[:3]])
    await br.close()

if __name__ == '__main__':
    from playwright.async_api import async_playwright
    res = []
    def _check(name, cond, info=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, info)
    async def _main():
        async with async_playwright() as p: await t10_test(p, os.environ.get('EV_URL', 'http://127.0.0.1:8770/'), os.path.join(ROOT, 'screens') + '/', _check)
    asyncio.run(_main()); raise SystemExit(0 if all(res) else 1)
