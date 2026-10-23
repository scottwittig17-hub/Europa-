"""Headset test #6 (Oct 18 2026, evening): skylight life, vent plume alignment / distance firing, rock chimneys. Screenshots 90+ (?grade=hmd).
Serve the folder on :8770 first. Standalone: python3 tools/verify_t6.py [--prefix tag] ; also called from verify.py."""
import os, sys, json, asyncio, base64, numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..'))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
lum = lambda a: a[..., 0] * 0.3 + a[..., 1] * 0.5 + a[..., 2] * 0.2

# simulated XR stereo render looking up at the skylight (same rig as verify_ride's test #4 check); returns both eyes + the disc centre pixels
SKY = r'''async ([headY, tAdv]) => { const THREE = await import('three'); const ev = window.__ev, app = ev.app, r = app.renderer;
 r.setAnimationLoop(null); await new Promise(r=>setTimeout(r,50));
 if (tAdv) ev.cockpit.update(tAdv);
 const mk = (x) => { const c = new THREE.PerspectiveCamera(); const n=0.05,f=120; const l=-Math.tan(54*Math.PI/180)*n, rr=Math.tan(40*Math.PI/180)*n, t=Math.tan(45*Math.PI/180)*n, b=-Math.tan(52*Math.PI/180)*n;
   const L = x<0? l : -rr, R = x<0? rr : -l; c.projectionMatrix.makePerspective(L,R,t,b,n,f); c.projectionMatrixInverse.copy(c.projectionMatrix).invert(); c.position.set(x,0,0); c.updateMatrix(); return c; };
 const W = r.domElement.width, H = r.domElement.height;
 const cl = mk(-0.032), cr = mk(0.032); cl.viewport = new THREE.Vector4(0,0,W/2,H); cr.viewport = new THREE.Vector4(W/2,0,W/2,H);
 const ac = new THREE.ArrayCamera([cl, cr]); ac.position.set(0, headY, -0.2); ac.rotation.set(Math.PI/2*0.92, 0, 0, 'YXZ');
 ac.projectionMatrix.copy(cl.projectionMatrix); ac.projectionMatrixInverse.copy(cl.projectionMatrixInverse); ac.updateMatrixWorld(true);
 cl.matrixWorld.multiplyMatrices(ac.matrixWorld, cl.matrix); cr.matrixWorld.multiplyMatrices(ac.matrixWorld, cr.matrix); cl.matrixWorldInverse.copy(cl.matrixWorld).invert(); cr.matrixWorldInverse.copy(cr.matrixWorld).invert();
 r.setScissorTest(false); r.render(app.scene, ac);
 const sk = ev.cockpit.skylight; const ctr = []; for (const cam of [cl, cr]) { const v = new THREE.Vector3(sk.x, sk.y + 0.02, sk.z).project(cam); const e = new THREE.Vector3(sk.x + sk.r * 0.95, sk.y + 0.02, sk.z).project(cam);
   ctr.push([cam.viewport.x + (v.x * 0.5 + 0.5) * cam.viewport.z, (1 - (v.y * 0.5 + 0.5)) * H, Math.abs(e.x - v.x) * 0.5 * cam.viewport.z]); }
 const url = r.domElement.toDataURL(); return { url, ctr, W, H }; }'''

def disc_stats(png, ctr, frac=0.85):
    a = np.asarray(Image.open(png).convert('RGB')).astype(np.float32); out = []
    for cx, cy, rad in ctr:
        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]; m = (xx - cx) ** 2 + (yy - cy) ** 2 < (rad * frac) ** 2
        L = lum(a[m]); px = a[m]; out.append({'mean': float(L.mean()), 'p95': float(np.percentile(L, 95)), 'p5': float(np.percentile(L, 5)), 'std': float(L.std()),
            'sat': float((px.max(1) - px.min(1)).mean()), 'mask': m})
    return a, out

async def t6_test(p, B, OUT, check, prefix=''):
    br = await p.chromium.launch(channel='chrome', args=ARGS); logs = []
    pg = await br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    await pg.goto(B + '?desktop&noride&grade=hmd')
    await pg.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 1 && window.__ev.loops.length === 5', timeout=90000)
    await pg.evaluate('window.__ev.player.pause()'); await pg.mouse.move(5, 5)
    nm = lambda n: OUT + (prefix + n)
    async def at(s_expr, aim=None, yaw=0.0, pitch=0.0, fov=80, settle=3000):
        await pg.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = {s_expr}; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); e.updateVideos(true); }})()')
        if aim is not None:   # aim = JS expr for a rideWorld-local point
            await pg.evaluate(f"""(() => {{ const e = window.__ev, V = e.app.camera.position.constructor, P = ({aim}).clone().applyMatrix4(e.rideWorld.matrixWorld);
              const d = e.desktop; d.yaw = Math.atan2(-P.x, -P.z); d.pitch = Math.atan2(P.y - 1.2, Math.hypot(P.x, P.z)) * 0.85; }})()""")
        else: await pg.evaluate(f'(() => {{ const d = window.__ev.desktop; d.yaw = {yaw}; d.pitch = {pitch}; }})()')
        await pg.evaluate(f'window.__ev.app.camera.fov = {fov}; window.__ev.app.camera.updateProjectionMatrix()'); await pg.wait_for_timeout(settle)
    L = await pg.evaluate('window.__ev.path.L'); sc = await pg.evaluate('(() => { const V = window.__ev.rw.VENTS; return V.slice(0, 14).reduce((a, v) => a + v[0], 0) / 14; })()')
    # ---- vents: alignment of every plume base on its chimney mouth (geometry, sub-relative orientation at several sub positions)
    al = json.loads(await pg.evaluate("""JSON.stringify((() => { const e = window.__ev, rw = e.rw, out = []; const V = e.app.camera.position.constructor;
      for (const s of [%f - 40, %f - 10, %f + 10]) { e.ride.state.s = s; e.ride.update(e.t, 0); rw.updateInstances(s, e.t);
        for (const pl of rw.instances.filter(p => p.userData.kind === 'plume')) { pl.updateMatrix(); const b = new V(0, pl.userData.baseV ?? -0.5, 0).applyMatrix4(pl.matrix);
          const m = pl.userData.mouth || pl.userData.base; out.push([Math.hypot(b.x - m.x, b.z - m.z), b.y - m.y]); } }
      return out; })())""" % (sc, sc, sc)))
    dh = max(a[0] for a in al); dv = [a[1] for a in al]
    check('vents: every plume base sits on its chimney mouth (horizontal offset, vertical offset)', dh < 0.05 and -0.4 < min(dv) and max(dv) < 0.05,
          f'{len(al)} plume poses: max horizontal offset {dh:.3f} m, vertical {min(dv):.2f}..{max(dv):.2f} m')
    # ---- vents fire from distance: plume video must be decoding (and the planes lit) from far away all round the lap; budget <= 3
    fd = json.loads(await pg.evaluate("""JSON.stringify((() => { const e = window.__ev, res = []; let mx = 0;
      for (let s = 0; s < e.path.L; s += 3) { e.ride.state.s = s; e.updateVideos(true); const k = e.loops.filter(l => l.playing).length; mx = Math.max(mx, k); res.push(e.loops[2].playing ? 1 : 0); }
      return { frac: res.reduce((a, b) => a + b, 0) / res.length, mx }; })())"""))
    check('vents: plume video (03) decoding around the whole lap (fires from distance), <= 3 decodes anywhere', fd['frac'] > 0.99 and fd['mx'] <= 3, fd)
    # ---- screenshots
    await at(f'{sc} - 46', yaw=0.0, pitch=-0.12, fov=80, settle=5000)
    await pg.screenshot(path=nm('90-vents-distance.png'))
    op = await pg.evaluate('(() => { const ps = window.__ev.rw.instances.filter(p => p.userData.kind === "plume"); return [Math.min(...ps.map(p => p.material.uniforms.uOpacity.value)), window.__ev.loops[2].playing]; })()')
    check('vents: plumes lit (opacity) and playing when the chamber is ~45 m ahead', op[0] > 0.5 and op[1], op)
    await at(f'{sc} - 25', yaw=0.0, pitch=-0.15, fov=80, settle=3000); await pg.screenshot(path=nm('91-vents-mid.png'))
    PICK = '''(() => { const e = window.__ev, V = e.app.camera.position.constructor; e.rideWorld.updateMatrixWorld(true); let b = null;
      for (const pl of e.rw.instances.filter(p => p.userData.kind === "plume")) { const m = (pl.userData.mouth || pl.userData.base), P = m.clone().applyMatrix4(e.rideWorld.matrixWorld);
        const d = Math.hypot(P.x, P.z), ang = Math.abs(Math.atan2(P.x, -P.z)); if (-P.z > 0 && d > %f && d < %f && ang < 1.25 && (!b || ang < b.ang)) b = { ang, m: m.clone().setY(m.y + 1.2) }; }
      return b ? b.m : new V(0, 0, -10).applyMatrix4(e.rideWorld.matrixWorld.clone().invert()); })()'''
    await at(f'{sc} - 12', aim=PICK % (9, 18), fov=70); await pg.screenshot(path=nm('92-vents-close.png'))
    best = json.loads(await pg.evaluate('''JSON.stringify((() => { const e = window.__ev; e.ride.state.s = %f - 12; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); let b = null;
      e.rw.instances.filter(p => p.userData.kind === "plume").forEach((pl, k) => { const P = pl.userData.mouth.clone().applyMatrix4(e.rideWorld.matrixWorld); const a = Math.abs(Math.atan2(P.x, -P.z));
        if (-P.z > 0 && (!b || a < b.a)) b = { k, a, d: Math.hypot(P.x, P.z) }; }); return b; })())''' % sc))
    MK = f'window.__ev.rw.instances.filter(p => p.userData.kind === "plume")[{best["k"]}].userData.mouth'
    await at(f'{sc} - 12', aim=f'{MK}.clone().setY({MK}.y + 0.9)', fov=34)
    await pg.screenshot(path=nm('93-vents-chimney-zoom.png'))
    await at(f'0.30 * {L}', yaw=0, pitch=-0.12, fov=80, settle=2000); await pg.screenshot(path=nm('94-cockpit.png'))
    # ---- skylight (simulated XR stereo, looking up); two times 2 s apart -> must move (animation), must not be a flat cyan plate
    res = []
    for k, tt in enumerate([100.0, 102.0]):
        r = await pg.evaluate(SKY, [1.2, tt]); png = nm(f'95-skylight-xr-sim{"-t2" if k else ""}.png'); open(png, 'wb').write(base64.b64decode(r['url'].split(',')[1])); res.append((png, r))
    a0, s0 = disc_stats(res[0][0], res[0][1]['ctr']); a1, s1 = disc_stats(res[1][0], res[1][1]['ctr'])
    mv = float(np.abs(lum(a0[s0[0]['mask']]) - lum(a1[s0[0]['mask']])).mean())
    check('skylight: alive (animated between t and t+2 s in the simulated XR eye)', mv > 2.0, f'mean |dL| {mv:.1f}/255 inside the disc over 2 s')
    check('skylight: dim, contrasty, not a flat cyan plate', all(s['mean'] < 70 and s['p95'] - s['p5'] > 30 and s['p5'] < 25 for s in s0),
          [{k: round(v, 1) for k, v in s.items() if k != 'mask'} for s in s0])
    check('skylight: never a black hole (still readable in the HMD)', all(s['mean'] > 8 for s in s0), [round(s['mean'], 1) for s in s0])
    # crop of the left eye for the report
    cx, cy, rad = res[0][1]['ctr'][0]; R = int(rad * 1.6)
    for k, (png, _) in enumerate(res):
        Image.open(png).crop((int(cx - R), int(cy - R), int(cx + R), int(cy + R))).resize((512, 512), Image.LANCZOS).save(nm(f'96-skylight-closeup{"-t2" if k else ""}.png'))
    await pg.evaluate('window.__ev.app.renderer.setAnimationLoop((t, f) => window.__ev.app.__loop && window.__ev.app.__loop(t, f))')
    bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
    check('test #6: no console errors/warnings', not bad, [b[1][:300] for b in bad[:3]])
    await br.close()

if __name__ == '__main__':
    from playwright.async_api import async_playwright
    res = []
    def _check(name, cond, info=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, info)
    prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else ''
    async def _main():
        async with async_playwright() as p: await t6_test(p, 'http://127.0.0.1:8770/', os.path.join(ROOT, 'screens') + '/', _check, prefix)
    asyncio.run(_main()); raise SystemExit(0 if all(res) else 1)
