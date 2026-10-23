"""Test #10 cave checks + screenshots 130-139 (used by verify_t10.py). Desktop shots via the page camera, XR-sim via a stereo ArrayCamera
(Quest-3-like asymmetric frusta, same rig as verify_t6.SKY) aimed at the same view."""
import os, json, base64, io, numpy as np
from PIL import Image
from verify_t6 import lum, ARGS
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

AIM = r'''([s, lat, up, clamp]) => { const e = window.__ev, V = e.app.camera.position.constructor, P = new V(); e.path.pointOf(s, P); const yw = e.path.yawOf(s);
  P.x += Math.cos(yw) * lat; P.z += -Math.sin(yw) * lat; P.y += up; e.rideWorld.updateMatrixWorld(true); P.applyMatrix4(e.rideWorld.matrixWorld);
  let yaw = Math.atan2(-P.x, -P.z); yaw = Math.max(-clamp, Math.min(clamp, yaw)); const pitch = Math.atan2(P.y - 1.2, Math.hypot(P.x, P.z)) * 0.5;
  e.desktop.yaw = yaw; e.desktop.pitch = pitch; return [yaw, pitch]; }'''
# render now (desktop camera or XR stereo), optionally with the cave rock hidden and/or headlights off, all in one synchronous call (same frame time)
SNAP = r'''async ([xr, yaw, pitch, variants]) => { const THREE = await import('three'); const e = window.__ev, app = e.app, r = app.renderer, rock = e.rw.caveRock && e.rw.caveRock.mesh;
  let cam = app.camera;
  if (xr) { const mk = (x) => { const c = new THREE.PerspectiveCamera(); const n = 0.05, f = 200; const l = -Math.tan(54*Math.PI/180)*n, rr = Math.tan(40*Math.PI/180)*n, t = Math.tan(45*Math.PI/180)*n, b = -Math.tan(52*Math.PI/180)*n;
      const L = x < 0 ? l : -rr, R = x < 0 ? rr : -l; c.projectionMatrix.makePerspective(L, R, t, b, n, f); c.projectionMatrixInverse.copy(c.projectionMatrix).invert(); c.position.set(x, 0, 0); c.updateMatrix(); return c; };
    const W = r.domElement.width, H = r.domElement.height; const cl = mk(-0.032), cr = mk(0.032); cl.viewport = new THREE.Vector4(0, 0, W/2, H); cr.viewport = new THREE.Vector4(W/2, 0, W/2, H);
    const ac = new THREE.ArrayCamera([cl, cr]); ac.position.set(0, 1.2, 0); ac.rotation.set(pitch, yaw, 0, 'YXZ'); ac.projectionMatrix.copy(cl.projectionMatrix); ac.projectionMatrixInverse.copy(cl.projectionMatrixInverse); ac.updateMatrixWorld(true);
    for (const c of [cl, cr]) { c.matrixWorld.multiplyMatrices(ac.matrixWorld, c.matrix); c.matrixWorldInverse.copy(c.matrixWorld).invert(); } cam = ac; }
  const hl = rock ? rock.material.uniforms.uHLInt : null, hl0 = hl ? hl.value : 0, out = {};
  r.info.autoReset = false; if (!xr) { const sz = r.getSize(new THREE.Vector2()); r.setViewport(0, 0, sz.x, sz.y); }
  for (const v of variants) { if (rock) rock.visible = v !== 'norock' && v !== 'nolight-norock'; if (hl) hl.value = v.startsWith('nolight') ? 0 : hl0;
    r.setScissorTest(false); r.info.reset(); r.render(app.scene, cam); out[v] = { url: r.domElement.toDataURL(), calls: r.info.render.calls, tris: r.info.render.triangles }; }
  r.info.autoReset = true; { const sz = r.getSize(new THREE.Vector2()); r.setViewport(0, 0, sz.x, sz.y); } if (rock) rock.visible = true; if (hl) hl.value = hl0; return out; }'''

def img(url): return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB')).astype(np.float32)

async def t10_caves(pg, B, OUT, check, L, at):
    ev = lambda js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
    # ---- assets: only the lava-vent painting is left
    st = json.loads(await ev('JSON.stringify({ bd: window.__ev.rw.backdrops.map(b => !!b), layers: window.__ev.rw.backdropLayers.length })'))
    man = json.load(open(os.path.join(ROOT, 'art-manifest.json'))); left = [f for f in os.listdir(os.path.join(ROOT, 'tex')) if 'chamber-jelly' in f or 'chamber-pillars' in f]
    check('t10: jelly + pillars backdrop paintings removed; only the lava-vent backdrop (slot 1, 3 layers) remains', [bool(b) for b in st['bd']] == [False, True] and st['layers'] == 3 and man['chambers'] == ['tex/chamber-vents.jpg'] and not left, {**st, 'manifest': man['chambers'], 'tex_left': left})
    cr = json.loads(await ev('JSON.stringify({ count: window.__ev.rw.caveRock.count, tris: window.__ev.rw.caveRock.tris, minClear: window.__ev.rw.caveRock.minClear })'))
    check('t10: procedural cave rock built (columns, buttresses, boulders, stalactites, spires), modest triangle count (< 10k)', cr['count'] >= 25 and cr['tris'] < 10000, cr)
    check('t10: cave rock >= 6 m from the cockpit along the whole path', cr['minClear'] >= 6.0, f"{cr['minClear']:.2f} m")
    cl = json.loads(await ev('JSON.stringify(window.__ev.rw.clearance(1.0))'))
    check('t10: whole-ride clearance still >= 5.9 m (MIN_CLEARANCE) with the new rock', cl['min'] >= 5.9, {k: round(v, 2) for k, v in cl.items() if isinstance(v, (int, float))})
    # ---- views
    views = [('130', '131', 'jelly-hall', 0.12 * L - 12, (0.12 * L + 2, -13, 1.0), 0.6),
             ('132', '133', 'former-pillars-spires', 0.76 * L - 10, (0.76 * L + 4, -11, 1.0), 0.6),
             ('134', '135', 'dark-corridor', 0.60 * L, (0.635 * L, -1, 0.5), 0.45),
             ('136', '137', 'lava-vent-cave', 0.45 * L - 16, (0.45 * L + 2, -13, -1.0), 0.6)]
    stats = {}
    await ev('window.__ev.app.camera.fov = 75; window.__ev.app.camera.updateProjectionMatrix()')
    for nd, nx, name, s_eye, (st_, lat, up), clamp in views:
        await at(f'{s_eye}', fov=75, settle=3500)
        yaw, pitch = await ev(AIM, [st_, lat, up, clamp]); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + f'{nd}-{name}-desktop.png')
        d = await ev(SNAP, [False, yaw, pitch, ['on', 'norock', 'nolight', 'nolight-norock']])
        await ev("(() => { const e = window.__ev, r = e.rw.caveRock.mesh; window.__hid = []; e.app.scene.traverse(o => { if ((o.isMesh || o.isPoints || o.isSprite) && o !== r && o.visible) { o.visible = false; window.__hid.push(o); } }); })()")
        so = await ev(SNAP, [False, yaw, pitch, ['on', 'norock', 'nolight']]); await ev('window.__hid.forEach(o => o.visible = true)')
        sa, sb, sn = (lum(img(so[k]['url'])) for k in ('on', 'norock', 'nolight'))
        if nd == '130': Image.fromarray(img(so['on']['url']).clip(0, 255).astype(np.uint8)).save(OUT + '139-jelly-hall-cave-rock-alone.png')
        x = await ev(SNAP, [True, yaw, pitch, ['on']]); open(OUT + f'{nx}-{name}-xr-sim.png', 'wb').write(base64.b64decode(x['on']['url'].split(',')[1]))
        a, b, c0, c1 = (lum(img(d[k]['url'])) for k in ('on', 'norock', 'nolight', 'nolight-norock'))
        m = np.abs(a - b) > 2; ml = np.abs(c0 - c1) > 2
        m = np.abs(sa - sb) > 1; rk = sa[m] if m.any() else np.zeros(1); rgb = img(so['on']['url'])[m] if m.any() else np.zeros((1, 3))   # the rock's OWN colour (rendered alone: nothing translucent in front)
        stats[name] = {'rock_px_%': round(m.mean() * 100, 1), 'rock_mean': round(float(rk.mean()), 1), 'rock_p99': round(float(np.percentile(rk, 99)), 1), 'rock_std': round(float(rk.std()), 1),
                       'lit_blue_minus_red': round(float((rgb[:, 2] - rgb[:, 0])[rk > 30].mean()) if (rk > 30).any() else 0, 1),
                       'frame_mean': round(float(a.mean()), 1), 'calls': d['on']['calls'], 'calls_no_rock': d['norock']['calls'], 'tris': d['on']['tris'], 'tris_no_rock': d['norock']['tris'],
                       'unlit_rock_mean': round(float(sn[m].mean()) if m.any() else 0, 1), 'composite_rock_mean': round(float(a[m].mean()) if m.any() else 0, 1)}
    await ev('window.__ev.app.camera.fov = 60; window.__ev.app.camera.updateProjectionMatrix()')
    for name in ('jelly-hall', 'former-pillars-spires', 'dark-corridor'):
        s = stats[name]
        check(f't10b {name}: headlit rock turns ICE BLUE with form (rock alone: p99 >= 60, shading std >= 8, lit px blue-red >= 25) and no glare slab (mean <= 50)',
              s['rock_p99'] >= 60 and s['rock_std'] >= 8 and s['lit_blue_minus_red'] >= 25 and s['rock_mean'] <= 50, s)
        check(f't10 {name}: rock is essentially black outside the headlights (mean <= 12/255 with the beams off)', s['unlit_rock_mean'] <= 12, f"{s['unlit_rock_mean']}/255")
        check(f't10 {name}: rock costs <= 1 extra draw call', s['calls'] - s['calls_no_rock'] <= 1, f"{s['calls']} vs {s['calls_no_rock']}, tris {s['tris']} vs {s['tris_no_rock']}")
    check('t10 lava-vent cave: no procedural rock in the vents chamber', stats['lava-vent-cave']['rock_px_%'] < 0.5, stats['lava-vent-cave'])
    # ---- lava cave unchanged vs. the t8 build (optional: EV_T8_URL serves the t8 backup source)
    u8 = os.environ.get('EV_T8_URL')
    if u8:
        br = pg.context.browser; pg8 = await br.new_page(viewport={'width': 1280, 'height': 800})
        await pg8.goto(u8 + '?desktop&noride&grade=hmd'); await pg8.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 3 && window.__ev.loops.length === 5', timeout=90000)
        await pg8.evaluate('window.__ev.player.pause()'); await pg8.mouse.move(5, 5)
        imgs = []
        for P in (pg, pg8):
            await P.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = {0.45 * L - 16}; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); e.updateVideos(true); e.app.camera.fov = 75; e.app.camera.updateProjectionMatrix(); }})()')
            yaw, pitch = await P.evaluate(AIM, [0.45 * L + 2, -13, -1.0, 0.6]); await P.wait_for_timeout(4000)
            imgs.append(img((await P.evaluate(SNAP, [False, yaw, pitch, ['on']]))['on']['url']))
        await pg8.close()
        Image.fromarray(np.concatenate(imgs, 1).clip(0, 255).astype(np.uint8)).save(OUT + '138-lava-vent-cave-t10-vs-t8.png')
        dl = np.abs(lum(imgs[0]) - lum(imgs[1])); 
        check('t10 lava-vent cave matches t8 (mean |dL| <= 4/255; residual = plume video frame / snow timing)', dl.mean() <= 4, f'mean |dL| {dl.mean():.2f}, p99 {np.percentile(dl, 99):.1f}')
    return stats
