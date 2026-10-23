"""Test #5 checks + screenshots 80-87 (?grade=hmd). Serve the folder on :8770 first. Standalone: python3 tools/verify_t5.py; also called from verify.py."""
import os, sys, json, asyncio, numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..')); sys.path.insert(0, HERE)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
lum = lambda a: a[..., 0] * 0.3 + a[..., 1] * 0.5 + a[..., 2] * 0.2

async def t5_test(p, B, OUT, check):
    from loop_metrics import metrics
    m3 = metrics(os.path.join(ROOT, 'loops/03-amber-vent-plume.mp4')); m1 = metrics(os.path.join(ROOT, 'loops/01-jelly-drifter.mp4'))
    check('plume loop (03) is a true forward loop: no reversal', m3['revisits'] < 0.1 and m3['wrap_ratio'] < 2.0,
          f"revisited-frame fraction {m3['revisits']} (ping-pong ~0.98), wrap step {m3['wrap_step']} = {m3['wrap_ratio']}x median step, worst step {m3['spike_ratio']}x median")
    check('jelly-drifter (01) loop point is seamless (eased ping-pong)', m1['wrap_ratio'] < 1.5 and m1['spike_ratio'] < 2.0,
          f"wrap step {m1['wrap_ratio']}x median (was 2.96x), worst step {m1['spike_ratio']}x median at frame {m1['max_at']}, near-still turnaround frames {m1['dup_steps']}")
    br = await p.chromium.launch(channel='chrome', args=ARGS); logs = []
    async def page(q):
        pg = await br.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
        await pg.goto(B + '?desktop&noride&grade=hmd&' + q)
        await pg.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 1 && window.__ev.loops.length === 5', timeout=90000)
        await pg.evaluate('window.__ev.player.pause()'); await pg.mouse.move(5, 5); return pg
    pg = await page('')
    async def at(s_expr, yaw=0.0, pitch=0.0, fov=80, target=None, settle=2500):
        await pg.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = {s_expr}; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); e.updateVideos(true); }})()')
        if target is not None:
            await pg.evaluate(f"""(() => {{ const e = window.__ev, b = (e.rw.backdrops[{target}] || {{ getWorldPosition: (P) => P.copy(e.rw.backdropSpots[{target}].pos).applyMatrix4(e.rideWorld.matrixWorld) }}), V = e.app.camera.position.constructor, P = new V(); b.getWorldPosition(P);
              const d = e.desktop; d.yaw = Math.max(-0.6, Math.min(0.6, Math.atan2(-P.x, -P.z))); d.pitch = 0.03; }})()""")
        else: await pg.evaluate(f'(() => {{ const d = window.__ev.desktop; d.yaw = {yaw}; d.pitch = {pitch}; }})()')
        await pg.evaluate(f'window.__ev.app.camera.fov = {fov}; window.__ev.app.camera.updateProjectionMatrix()'); await pg.wait_for_timeout(settle)
    # clearance (6 m comfort rule) incl. the new chimneys, plume/ray instances and the big ray
    c = await pg.evaluate('JSON.stringify(window.__ev.rw.clearance(0.5))'); c = json.loads(c)
    check('comfort: everything >= 5.9 m from the cockpit (incl. 17 chimneys, plume + ray instances)', c['min'] >= 5.9, {k: round(v, 2) for k, v in c.items() if isinstance(v, float)})
    br_ = json.loads(await pg.evaluate('JSON.stringify(window.__ev.rw.bigRayClearance(0.05))'))
    check('big ray: closest approach to the cockpit >= 6 m', br_['min'] >= 6.0, f"min {br_['min']:.2f} m (centre {br_['centre']:.2f} m) at sub s={br_['s']:.1f}, pass progress u={br_['u']:.2f}")
    n = await pg.evaluate('[window.__ev.rw.VENTS.length, window.__ev.rw.instances.filter(p => p.userData.kind === "plume").length, window.__ev.rw.instances.filter(p => p.userData.kind === "ray").length, window.__ev.rw.instances.filter(p => p.userData.kind === "bigray").length]')
    check('more vents/plumes/rays (17 chimneys, 14 plume planes, 3 extra rays + 1 big ray)', n[0] >= 15 and n[1] >= 10 and n[2] >= 2 and n[3] == 1, n)
    # video decode budget along the whole lap
    mx = await pg.evaluate("""(async () => { const e = window.__ev; let mx = 0, worst = 0; for (let s = 0; s < e.path.L; s += 3) { e.ride.state.s = s; e.updateVideos(true); const k = e.loops.filter(l => l.playing).length; if (k > mx) { mx = k; worst = s; } } return [mx, worst]; })()""")
    check('video decode budget: <= 3 loops decoding anywhere on the lap', mx[0] <= 3, f'max {mx[0]} at s={mx[1]}')
    # --- screenshots ---
    L = 'window.__ev.path.L'
    await at(f'0.30 * {L}', 0.0, -0.04, 80); await pg.screenshot(path=OUT + '80-tunnel-beams.png')
    a = np.asarray(Image.open(OUT + '80-tunnel-beams.png').convert('RGB')).astype(np.float32); H, W = a.shape[:2]
    out = a[int(H * .18):int(H * .32), int(W * .22):int(W * .38)]; cen = a[int(H * .45):int(H * .6), int(W * .4):int(W * .6)]   # rock beside the beams vs the beam footprint (inside the window)
    cy = ((a[..., 1] > a[..., 0] + 25) & (a[..., 2] > a[..., 0] + 25) & (a.max(2) > 45)).mean()
    check('headlights: deep black outside the beams, beams carve light, faint veins present', lum(out).mean() < 22 and lum(cen).mean() > lum(out).mean() * 1.6 and cy > 0.0005,
          f'outside-beam luma {lum(out).mean():.1f}, beam-centre luma {lum(cen).mean():.1f}, cyan-vein px {cy*100:.2f}%')
    await at(f'0.76 * {L} - 13', target=2); await pg.screenshot(path=OUT + '81-cathedral.png')
    await at(f'0.45 * {L} - 12', target=1); await pg.screenshot(path=OUT + '82-vents.png')
    await at(f'0.12 * {L} - 16', target=0); await pg.screenshot(path=OUT + '83-jelly.png')
    # big ray: a moment before its closest approach (u ~ 0.5), looking up at it
    await pg.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = (e.rw.BIG.s0 + e.rw.BIG.D * 0.52) % {L}; e.ride.update(e.t, 0); e.updateVideos(true); }})()')
    await pg.wait_for_function('window.__ev.loops[4].playing && window.__ev.rw.instances.find(p => p.name === "big-ray").userData.on', timeout=30000)
    await pg.wait_for_timeout(2500)
    await pg.evaluate("""(() => { const e = window.__ev; e.rideWorld.updateMatrixWorld(true); const pl = e.rw.instances.find(p => p.name === 'big-ray'), V = e.app.camera.position.constructor, P = new V(); pl.getWorldPosition(P);
      const d = e.desktop; d.yaw = Math.atan2(-P.x, -P.z); d.pitch = Math.min(0.9, Math.atan2(P.y - 1.2, Math.hypot(P.x, P.z))) * 0.75; e.app.camera.fov = 90; e.app.camera.updateProjectionMatrix(); })()""")
    await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + '84-big-ray-pass.png')
    await at(f'0.30 * {L}', 0.0, -0.32, 72); await pg.screenshot(path=OUT + '85-cockpit.png')
    # --- music queue + session end ---
    q = await pg.evaluate("""(async () => { const e = window.__ev, buf = await (await fetch('assets/music/under-the-ice.mp3')).arrayBuffer();
      const mk = (n) => new File([buf], n, { type: n.endsWith('.opus') ? '' : 'audio/mpeg' });
      const r = {}; r.added = e.addFiles([mk('Deep Current.mp3'), mk('Ice Shelf.mp3'), mk('Thermal Vent.mp3'), mk('Lantern Fish.mp3'), mk('Night Swim.opus')]); r.len1 = e.player.list.length;
      r.added2 = e.addFiles([mk('Surface Light.mp3'), mk('Cathedral.mp3')]); r.len2 = e.player.list.length;
      e.player.load(0, true); await new Promise(res => setTimeout(res, 800)); r.i0 = e.player.i;
      e.player.audio.dispatchEvent(new Event('ended')); await new Promise(res => setTimeout(res, 600)); r.iAfterEnd = e.player.i;
      e.player.next(); r.iNext = e.player.i; e.player.audio.currentTime = 0; e.player.prev(); r.iPrev = e.player.i;
      e.player.setShuffle(true); const seen = new Set([e.player.i]); for (let k = 0; k < 6; k++) { e.player.next(); seen.add(e.player.i); } r.shuffleDistinct = seen.size; e.player.setShuffle(false);
      e.player.load(1, true); await new Promise(res => setTimeout(res, 900)); r.playing = e.player.playing; r.panelText = 'Track ' + (e.player.i + 1) + ' of ' + e.player.list.length; return r; })()""")
    check('music queue: multi-file pick queues all, a second pick appends', q['added'] == 5 and q['len1'] == 5 and q['len2'] == 7, q)
    check('music queue advances: track end -> next, next/prev buttons, shuffle', q['iAfterEnd'] == q['i0'] + 1 and q['iNext'] == q['iAfterEnd'] + 1 and q['iPrev'] == q['iAfterEnd'] and q['shuffleDistinct'] >= 4,
          {k: q[k] for k in ('i0', 'iAfterEnd', 'iNext', 'iPrev', 'shuffleDistinct')})
    await pg.evaluate("window.__ev.setMode('ride')")
    await pg.evaluate("""(() => { const e = window.__ev, p = e.panel.mesh, V = e.app.camera.position.constructor, P = new V(); p.getWorldPosition(P); const d = e.desktop; d.yaw = Math.atan2(-P.x, -P.z); d.pitch = Math.atan2(P.y - 1.2, Math.hypot(P.x, P.z)); e.app.camera.fov = 42; e.app.camera.updateProjectionMatrix(); })()""")
    await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + '87-music-queue.png')
    sp = await pg.evaluate('window.__ev.panelScreenPos("next")'); await pg.mouse.move(sp['x'], sp['y']); await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(500)
    i_btn = await pg.evaluate('window.__ev.player.i'); await pg.mouse.move(5, 5)
    check('panel Next button advances the queue (Track n of N)', i_btn == 2, f'player.i after click {i_btn} (panel shows Track {i_btn + 1} of {q["len2"]})')
    se = await pg.evaluate("""(async () => { const e = window.__ev; e.analysis.connect(); e.player.play(); await new Promise(r => setTimeout(r, 900)); const before = [e.player.playing, e.analysis.ctx && e.analysis.ctx.state];
      e.app.renderer.xr.dispatchEvent({ type: 'sessionend' }); await new Promise(r => setTimeout(r, 700));
      return { before, after: [e.player.playing, e.player.audio.paused, e.analysis.ctx && e.analysis.ctx.state] }; })()""")
    check('music stops on XR session end (audio paused + AudioContext suspended)', se['before'][0] and not se['after'][0] and se['after'][1] and se['after'][2] in ('suspended', None), se)
    bad = [l for l in logs if l[0] in ('error', 'pageerror') or (l[0] == 'warning' and 'GPU stall' not in l[1])]
    check('test #5 ride page: no console errors/warnings', not bad, bad[:5])
    # backdrop life (BACKDROP_ANIM): frame loop frozen, the jelly-hall painting rendered at shader time T and T+6 s, with the animation on vs off.
    # (Run last on this page: it stops the render loop.)
    await at(f'0.12 * {L} - 16', target=0, settle=1500)
    dd = await pg.evaluate('''(async () => { const e = window.__ev, r = e.app.renderer, U = e.rw.tunnel.uniforms, cv = r.domElement; r.setAnimationLoop(null); await new Promise(res => setTimeout(res, 100));
      const grab = (t, anim) => { U.uTime.value = t; e.BACKDROP_ANIM_U.value = anim; r.render(e.app.scene, e.app.camera); const c = document.createElement('canvas'); c.width = 160; c.height = 100; const x = c.getContext('2d'); x.drawImage(cv, 0, 0, 160, 100); return x.getImageData(0, 0, 160, 100).data; };
      const d = (a, b) => { let s = 0, n = 0; for (let y = 10; y < 60; y++) for (let x = 24; x < 136; x++) { const i = (y * 160 + x) * 4; s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; } return s / n; };
      const off = d(grab(100, 0), grab(106, 0)), on = d(grab(100, 1), grab(106, 1)); e.BACKDROP_ANIM_U.value = 1; return { off, on }; })()''')
    check('backdrops animate (BACKDROP_ANIM): 6 s of shader time changes the painting view more with the animation on', dd['on'] > dd['off'] * 1.3 and dd['on'] > 0.2, f"mean |diff| anim=0 {dd['off']:.3f}, anim=1 {dd['on']:.3f} (0-255, 160x100 readback)")
    await pg.close()
    # float mode, facing backward: the new back half of the panorama
    pg = await br.new_page(viewport={'width': 1280, 'height': 800}); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    await pg.goto(B + '?desktop&mode=float&grade=hmd'); await pg.wait_for_function('window.__ev && window.__ev.cavern.uniforms.uUsePano.value === 1', timeout=90000)
    await pg.evaluate('window.__ev.player.pause()'); await pg.evaluate('(() => { const d = window.__ev.desktop; d.yaw = Math.PI; d.pitch = 0.05; window.__ev.app.camera.fov = 90; window.__ev.app.camera.updateProjectionMatrix(); })()')
    await pg.mouse.move(5, 5); await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT + '86-float-back-pano.png')
    await pg.evaluate('(() => { const d = window.__ev.desktop; d.yaw = 0; })()'); await pg.wait_for_timeout(1500); await pg.screenshot(path='/tmp/t5-front.png')
    st = await pg.evaluate('JSON.parse(JSON.stringify(window.__ev.stillStats))')
    pano = [x for x in st['list'] if 'europa' in x['src']]
    fa = np.asarray(Image.open('/tmp/t5-front.png').convert('L').resize((64, 40))).astype(float); ba = np.asarray(Image.open(OUT + '86-float-back-pano.png').convert('L').resize((64, 40))).astype(float)
    r = np.corrcoef(fa[8:30].ravel(), ba[8:30].ravel())[0, 1]
    check('float: back of the panorama is the new back painting (not the front repeated), pano <= 4096x2048', pano and pano[0]['w'] <= 4096 and pano[0]['h'] <= 2048 and r < 0.8,
          f"pano {pano[0]['src'] if pano else '-'} {pano[0]['w'] if pano else 0}x{pano[0]['h'] if pano else 0} ({pano[0]['mb'] if pano else 0} MB GPU); front/back view correlation {r:.2f}")
    await br.close()

if __name__ == '__main__':
    from playwright.async_api import async_playwright
    res = []
    def _check(name, cond, info=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, info)
    async def _main():
        async with async_playwright() as p: await t5_test(p, 'http://127.0.0.1:8770/', os.path.join(ROOT, 'screens') + '/', _check)
    asyncio.run(_main()); raise SystemExit(0 if all(res) else 1)
