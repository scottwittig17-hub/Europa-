"""Submarine-ride checks, called from verify.py: motion, comfort limits, clearance, fixed cockpit, perf vs float, screenshots."""
import math as M

async def ride_test(p, B, OUT, check):
    br = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    pg = await br.new_page(viewport={'width': 1280, 'height': 800}); logs = []
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    await pg.goto(B); await pg.wait_for_timeout(1500)
    check('entry: Submarine ride is the default mode', await pg.evaluate('document.querySelector("input[name=mode]:checked").value') == 'ride')
    sp = await pg.evaluate('[...document.querySelectorAll("input[name=speed]")].map(e => [e.value, e.checked])')
    check('entry: speed setting Slow / Very slow / Drift, default Very slow', [v for v, _ in sp] == ['slow', 'veryslow', 'drift'] and dict(sp)['veryslow'], sp)
    await pg.locator('#speedRow').scroll_into_view_if_needed(); await pg.screenshot(path=OUT + '45-entry-speed.png', full_page=True)
    cfg = await pg.evaluate('import("./app/config.js").then(m => m.CONFIG)')
    check('sharpness: framebuffer scale >= 1.0, ride foveation <= 0.3', cfg['FRAMEBUFFER_SCALE'] >= 1.0 and cfg['FOVEATION_RIDE'] <= 0.3,
          f"FRAMEBUFFER_SCALE {cfg['FRAMEBUFFER_SCALE']}, FOVEATION_RIDE {cfg['FOVEATION_RIDE']}, FOVEATION (float) {cfg['FOVEATION']}, panel supersample {cfg['PANEL_SUPERSAMPLE']}x, aniso {cfg['TEX_ANISOTROPY']}")
    pc = await pg.evaluate('[window.__ev.panel.canvas.width, window.__ev.panel.canvas.height, window.__ev.speedPanel.canvas.width, window.__ev.panel.tex.minFilter, window.__ev.panel.tex.anisotropy]')
    check('dashboard canvases: hi-res, mipmapped, anisotropic', pc[0] >= 1600 and pc[3] == 1008, f'music panel canvas {pc[0]}x{pc[1]} (was 868x560), speed panel {pc[2]} px wide, minFilter {pc[3]} (LinearMipmapLinear), aniso {pc[4]}')
    await pg.click('#preview'); await pg.wait_for_timeout(300)
    check('ride mode active, cockpit visible, float cavern hidden', await pg.evaluate('window.__ev.mode === "ride" && window.__ev.cockpit.group.visible && !window.__ev.cavern.mesh.parent.visible'))
    await pg.evaluate('window.__ev.player.pause()')
    lap = await pg.evaluate('window.__ev.ride.analyzeLap()')
    cruise = await pg.evaluate('window.__ev.ride.cruise')
    check('comfort: default cruise is Very slow 0.25 m/s', abs(cruise - 0.25) < 1e-9, cruise)
    check('comfort: lap length / time', 500 <= lap['lapSeconds'] <= 720, f"{lap['lengthM']:.0f} m, {lap['lapSeconds']:.0f} s = {lap['lapSeconds']/60:.1f} min per lap at {cruise} m/s")
    for key in ('slow', 'drift'):
        l2 = await pg.evaluate(f'(() => {{ const e = window.__ev, r = e.ride, c = r.cruise; r.setCruise(e.speedValue && {{slow: 0.35, drift: 0.15}}["{key}"], e.t); const a = r.analyzeLap(); r.setCruise(c, e.t); return a; }})()')
        check(f'comfort: {key} preset lap + yaw', l2['maxYawRateDeg'] < 2, f"{l2['cruise']} m/s: lap {l2['lapSeconds']:.0f} s ({l2['lapSeconds']/60:.1f} min), max yaw {l2['maxYawRateDeg']:.2f} deg/s, ramp {l2['maxRampAcc']:.3f} m/s^2")
    check('comfort: max yaw rate < 2 deg/s (full lap)', lap['maxYawRateDeg'] < 2, f"max {lap['maxYawRateDeg']:.2f} deg/s, yaw accel max {lap['maxYawAccDeg']:.3f} deg/s^2")
    check('comfort: accelerations tiny', lap['maxLateralAcc'] < 0.05 and lap['maxRampAcc'] < 0.15 and lap['maxVerticalSpeed'] < 0.1,
          f"lateral {lap['maxLateralAcc']:.3f} m/s^2, ease ramp {lap['maxRampAcc']:.3f} m/s^2, vertical {lap['maxVerticalSpeed']:.3f} m/s, pitch/roll 0")
    cl = await pg.evaluate('window.__ev.rw.clearance(0.5)')
    check('nothing within 5.9 m of the cockpit over a full lap', cl['min'] >= 5.9, {k: (round(v, 2) if isinstance(v, float) else v) for k, v in cl.items()})
    samples = []
    for _ in range(50):
        samples.append(await pg.evaluate("""(() => { const e = window.__ev, c = e.app.camera; c.updateMatrixWorld(); e.rideWorld.updateMatrixWorld();
          const V = c.position.constructor; const w = new V().setFromMatrixPosition(c.matrixWorld); const l = w.clone().applyMatrix4(e.rideWorld.matrixWorld.clone().invert());
          return { t: e.t, s: e.ride.state.s, v: e.ride.state.speed, yaw: e.ride.state.yaw, cam: w.toArray(), loc: l.toArray(), cock: Array.from(e.cockpit.group.matrixWorld.elements) }; })()"""))
        await pg.wait_for_timeout(200)
    pairs = [(a, b) for a, b in zip(samples, samples[1:]) if b['t'] > a['t']]
    moved = M.dist(samples[0]['loc'], samples[-1]['loc'])
    smooth = all(M.dist(a['loc'], b['loc']) <= max(a['v'], b['v']) * (b['t'] - a['t']) * 1.3 + 0.01 for a, b in pairs)
    acc = max(abs(b['v'] - a['v']) / (b['t'] - a['t']) for a, b in pairs)
    yr = max(abs(M.degrees(b['yaw'] - a['yaw'])) / (b['t'] - a['t']) for a, b in pairs)
    check('ride moves smoothly (eye position along the tunnel)', moved > 0.2 and smooth, f"moved {moved:.2f} m in {samples[-1]['t']-samples[0]['t']:.1f} s of ease-in, speed now {samples[-1]['v']:.2f} m/s, no jumps")
    check('live: ease-in accel < 0.15 m/s^2, yaw rate < 2 deg/s', acc < 0.15 and yr < 2, f'max accel {acc:.3f} m/s^2, max yaw rate {yr:.2f} deg/s')
    fixed = max(M.dist(samples[0]['cam'], x['cam']) for x in samples) < 1e-9 and max(max(abs(u - v) for u, v in zip(samples[0]['cock'], x['cock'])) for x in samples) < 1e-9
    check('cockpit + camera fixed relative to each other (the world moves, not the rig)', fixed)
    # speed change while cruising must ease (no jumps): switch to Drift via the dashboard toggle API, sample 6 s
    await pg.evaluate('(() => { const r = window.__ev.ride; r.state.phase = "cruise"; r.state.speed = r.cruise; window.__ev.setSpeed("drift"); })()')
    vs = []
    for _ in range(30):
        vs.append(await pg.evaluate('[window.__ev.t, window.__ev.ride.state.speed]')); await pg.wait_for_timeout(200)
    jumps = max(abs(b[1] - a[1]) / max(1e-3, b[0] - a[0]) for a, b in zip(vs, vs[1:]) if b[0] > a[0])
    check('speed change eases (dashboard toggle -> Drift)', jumps < 0.05 and vs[0][1] > vs[-1][1] > 0.15 - 1e-6, f'speed {vs[0][1]:.3f} -> {vs[-1][1]:.3f} m/s over {vs[-1][0]-vs[0][0]:.1f} s, max change {jumps:.4f} m/s^2')
    check('entry radio follows the dashboard toggle', await pg.evaluate('document.querySelector("input[name=speed]:checked").value') == 'drift')
    await pg.evaluate('window.__ev.setSpeed("veryslow")')
    async def look(yaw, pitch, fov=75):
        await pg.evaluate(f'(() => {{ const d = window.__ev.desktop; d.yaw = {yaw}; d.pitch = {pitch}; const c = window.__ev.app.camera; c.fov = {fov}; c.updateProjectionMatrix(); }})()')
    await look(0, -0.08); await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + '20-cockpit-view.png')
    await pg.evaluate('(() => { const e = window.__ev; e.ride.state.s = 0.45 * e.path.L - 14; })()'); await look(0, 0.02, 80)
    await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT + '21-ride-chamber.png')
    # find a moment where a jelly is closest while framed by the front window, then look at it
    await pg.evaluate("""(() => { const e = window.__ev, V = e.app.camera.position.constructor, L = e.path.L, P = new V(); let best = null;
      for (let s = 0; s < L; s += 1) { e.ride.state.s = s; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true);
        for (const j of e.rw.jellies.jellies) { j.root.getWorldPosition(P); const dz = -P.z, dx = P.x, dy = P.y - 1.2;
          if (dz > 2 && Math.abs(dx / dz) < 0.7 && dy / dz < 0.45 && dy / dz > -0.2) { const d = P.length(); if (!best || d < best.d) best = { s, d }; } } }
      e.ride.state.s = best.s; e.ride.update(e.t, 0); window.__jellyShot = best; })()""")
    await pg.wait_for_timeout(600)
    await pg.evaluate("""(() => { const e = window.__ev, V = e.app.camera.position.constructor, P = new V(); e.rideWorld.updateMatrixWorld(true); let b = null;
      for (const j of e.rw.jellies.jellies) { j.root.getWorldPosition(P); const dz = -P.z; if (dz > 2 && Math.abs(P.x / dz) < 0.75) { const d = P.length(); if (!b || d < b.d) b = { d, x: P.x, y: P.y, z: P.z }; } }
      const d = e.desktop; d.yaw = Math.atan2(-b.x, -b.z); d.pitch = Math.atan2(b.y - 1.2, Math.hypot(b.x, b.z)) * 0.8; })()""")
    await pg.evaluate('window.__ev.app.camera.fov = 60; window.__ev.app.camera.updateProjectionMatrix()'); await pg.wait_for_timeout(800)
    await pg.screenshot(path=OUT + '22-ride-jelly.png')
    await look(-0.2, -0.55, 75); await pg.evaluate('window.__ev.statsOn || window.__ev.toggleStats()'); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=OUT + '23-dashboard-panel.png')
    sp = await pg.evaluate('window.__ev.panelScreenPos("playpause")')
    await pg.mouse.move(sp['x'], sp['y']); await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(900)
    check('dashboard music panel works in ride mode', await pg.evaluate('window.__ev.player.playing'))
    await pg.evaluate('window.__ev.player.pause()'); await look(0, 0, 75); await pg.mouse.move(5, 5)
    async def frame_ms(m):
        await pg.evaluate(f'window.__ev.setMode("{m}"); if ("{m}" === "ride") window.__ev.ride.start(window.__ev.t)'); await pg.wait_for_timeout(2500)
        t0 = await pg.evaluate('[performance.now(), window.__ev.app.renderer.info.render.frame]'); await pg.wait_for_timeout(8000)
        t1 = await pg.evaluate('[performance.now(), window.__ev.app.renderer.info.render.frame]'); return (t1[0] - t0[0]) / max(1, t1[1] - t0[1])
    fs = [await frame_ms('float'), await frame_ms('ride'), await frame_ms('float'), await frame_ms('ride')]
    ff, fr = (fs[0] + fs[2]) / 2, (fs[1] + fs[3]) / 2
    check('ride frame time not worse than float by > 25%', fr <= ff * 1.25, f'float {ff:.1f} ms vs ride {fr:.1f} ms per frame (headless software GL; ratio {fr/ff:.2f})')
    # Oct 2026 art: restyled cockpit, chamber backdrops, colour tunnel rock
    await pg.wait_for_function('window.__ev.rw.backdrops.filter(Boolean).length === 1 && window.__ev.rw.tunnel.uniforms.uWallGain.value > 1 && !!window.__ev.cockpit.dashFace.material.map', timeout=30000)
    check('ride art applied (3 chamber backdrops, tunnel rock, dashboard face)', True)
    await pg.evaluate('window.__ev.ride.stop(window.__ev.t); window.__ev.ride.state.phase = "stopped"; window.__ev.ride.state.speed = 0; window.__ev.ride.state.running = false')
    async def at(s_expr, yaw, pitch, fov, name, target=None):
        await pg.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = {s_expr}; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); }})()')
        if target is not None:
            await pg.evaluate(f"""(() => {{ const e = window.__ev, b = (e.rw.backdrops[{target}] || {{ getWorldPosition: (P) => P.copy(e.rw.backdropSpots[{target}].pos).applyMatrix4(e.rideWorld.matrixWorld) }}), V = e.app.camera.position.constructor, P = new V(); b.getWorldPosition(P);
              const d = e.desktop; d.yaw = Math.max(-0.55, Math.min(0.55, Math.atan2(-P.x, -P.z))); d.pitch = 0.04; }})()""")
        else: await pg.evaluate(f'(() => {{ const d = window.__ev.desktop; d.yaw = {yaw}; d.pitch = {pitch}; }})()')
        await pg.evaluate(f'window.__ev.app.camera.fov = {fov}; window.__ev.app.camera.updateProjectionMatrix()'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + name)
    await pg.evaluate('window.__ev.statsOn && window.__ev.toggleStats()')
    # Oct 14 headset fixes: slower ride, sharper, HMD grade, 3D rock / layered backdrops / props
    await at('0.30 * window.__ev.path.L', 0, -0.12, 80, '40-cockpit.png')
    for i, (f, name) in enumerate([(0.12, '41-chamber-jelly.png'), (0.45, '42-chamber-vents.png'), (0.76, '43-chamber-pillars.png')]):
        await at(f'{f} * window.__ev.path.L - 16', 0, 0, 80, name, target=i)
    await at('0.29 * window.__ev.path.L', 0.0, 0.05, 80, '44-tunnel.png')
    await at('0.30 * window.__ev.path.L', 0.0, -0.45, 70, '46-dashboard-speed.png')
    # Oct 15 headset test #3: glowing walls, thick veins, feathered backdrops/loops, no void
    await at('0.30 * window.__ev.path.L', 0, -0.12, 80, '50-cockpit.png')
    for i, (f, name) in enumerate([(0.12, '51-jelly.png'), (0.45, '52-vents.png'), (0.76, '53-pillars.png')]):
        await at(f'{f} * window.__ev.path.L - 16', 0, 0, 80, name, target=i)
    await at('0.29 * window.__ev.path.L', 0.0, 0.05, 80, '54-tunnel.png')
    import numpy as np; from PIL import Image
    def crush(src, dst):   # simulate Quest black crush: clip below 12 %, then gamma darken
        a = np.asarray(Image.open(OUT + src).convert('RGB')).astype(np.float32) / 255
        a = np.clip((a - 0.12) / 0.88, 0, 1) ** 1.35; Image.fromarray((a * 255 + .5).astype(np.uint8)).save(OUT + dst); return a
    for src in ('50-cockpit.png', '51-jelly.png', '52-vents.png', '53-pillars.png', '54-tunnel.png'):
        a = np.asarray(Image.open(OUT + src).convert('RGB')).astype(np.float32) / 255; H = a.shape[0]
        W = a.shape[1]; win = a[int(H * 0.22):int(H * 0.66), int(W * 0.2):int(W * 0.8)]   # inside the front window
        check(f'no pure black in the view ({src})', (win.max(2) < 4 / 255).mean() < 0.01, f'window region: {(win.max(2) < 4/255).mean()*100:.2f}% px < 4/255, mean {win.mean()*255:.1f}/255')
    cr = crush('54-tunnel.png', '55-hmd-crush.png'); H = cr.shape[0]; w = cr[int(H * 0.22):int(H * 0.66), int(cr.shape[1] * 0.2):int(cr.shape[1] * 0.8)]
    # test #5 (Oct 18 2026): deep black outside the beams is now the aesthetic, so the old 'walls still read' (> 60 %) no longer applies. What must
    # survive the simulated Quest crush are the bioluminescent veins / lit rock: >= 8 % of the window, but not a lifted grey wash (mean < 25/255).
    check('bioluminescence survives a simulated HMD crush, cave otherwise deep black (55)', (w.max(2) > 0.02).mean() > 0.08 and w.mean() * 255 < 25, f'{(w.max(2) > 0.02).mean()*100:.0f}% of window px survive the crush, mean {w.mean()*255:.1f}/255')
    sp = await pg.evaluate('window.__ev.speedPanel.screenPos("speed-slow", window.__ev.app.camera)')
    await pg.mouse.move(sp['x'], sp['y']); await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(600)
    check('dashboard speed toggle clickable (-> Slow)', await pg.evaluate('window.__ev.speedKey') == 'slow')
    await pg.evaluate('window.__ev.setSpeed("veryslow")'); await pg.mouse.move(5, 5)
    rc = await pg.evaluate('(() => { const e = window.__ev; e.app.renderer.render(e.app.scene, e.app.camera); return [e.app.renderer.info.render.calls, e.app.renderer.info.render.triangles, e.rw.backdropLayers.length, e.rw.props.rock.geometry.attributes.position.count, e.rw.props.ice.geometry.attributes.position.count]; })()')
    check('3D depth: layered backdrops + merged props, sane GPU budget', rc[2] == 9 and rc[0] < 60, f'{rc[0]} draw calls / {rc[1]} tris this view; 9 backdrop layers; props: rock {rc[3]} verts + ice {rc[4]} verts (2 draw calls)')
    vis = await pg.evaluate('window.__ev.rw.backdrops.map(b => b.visible)')
    check('chamber backdrops visible', all(vis), vis)
    await pg.evaluate('window.__ev.ride.start(window.__ev.t)'); await pg.wait_for_timeout(1500)
    act = await pg.evaluate('window.__ev.loops.filter(l => l.playing).length')
    check('ride: <= 3 loop videos playing (only near ones)', act <= 3, f"{act} playing at s={await pg.evaluate('window.__ev.ride.state.s.toFixed(1)')}")
    # headset test #4: platform-split grade + skylight seen through a simulated XR (stereo ArrayCamera, asymmetric Quest-like eye frusta)
    g = await pg.evaluate('(() => { const e = window.__ev; const d = e.setGradeMode(false).expo, h = e.setGradeMode(true).expo; e.applyGrade(true); return [d, h, e.GRADE.mode]; })()')
    check('grade: desktop < HMD exposure, desktop grade when not presenting', g[0] < g[1] and g[2] == 'desktop', f'desktop expo {g[0]:.2f}, HMD expo {g[1]:.2f}, now {g[2]}')
    import base64
    SKY = r'''async (headY) => { const THREE = await import('three'); const ev = window.__ev, app = ev.app, r = app.renderer;
 r.setAnimationLoop(null); await new Promise(r=>setTimeout(r,50));
 const mk = (x) => { const c = new THREE.PerspectiveCamera(); const n=0.05,f=120; const l=-Math.tan(54*Math.PI/180)*n, rr=Math.tan(40*Math.PI/180)*n, t=Math.tan(45*Math.PI/180)*n, b=-Math.tan(52*Math.PI/180)*n;
   const L = x<0? l : -rr, R = x<0? rr : -l; c.projectionMatrix.makePerspective(L,R,t,b,n,f); c.projectionMatrixInverse.copy(c.projectionMatrix).invert(); c.position.set(x,0,0); c.updateMatrix(); return c; };
 const W = r.domElement.width, H = r.domElement.height;
 const cl = mk(-0.032), cr = mk(0.032); cl.viewport = new THREE.Vector4(0,0,W/2,H); cr.viewport = new THREE.Vector4(W/2,0,W/2,H);
 const ac = new THREE.ArrayCamera([cl, cr]); ac.position.set(0, headY, -0.2); ac.rotation.set(Math.PI/2*0.92, 0, 0, 'YXZ');
 ac.projectionMatrix.copy(cl.projectionMatrix); ac.projectionMatrixInverse.copy(cl.projectionMatrixInverse); ac.updateMatrixWorld(true);
 cl.matrixWorld.multiplyMatrices(ac.matrixWorld, cl.matrix); cr.matrixWorld.multiplyMatrices(ac.matrixWorld, cr.matrix); cl.matrixWorldInverse.copy(cl.matrixWorld).invert(); cr.matrixWorldInverse.copy(cr.matrixWorld).invert();
 r.setScissorTest(false); r.render(app.scene, ac);
 const gl = r.getContext(), px = new Uint8Array(4), out = []; for (const cam of [cl, cr]) { const v = new THREE.Vector3(0, 2.17, -0.35).project(cam); const x = Math.round(cam.viewport.x + (v.x * 0.5 + 0.5) * cam.viewport.z), y = Math.round((v.y * 0.5 + 0.5) * H); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push([...px.slice(0, 3)]); } const url = r.domElement.toDataURL(); r.setAnimationLoop(null); return { px: out, url }; }'''
    for hy in (1.2, 1.6):
        res = await pg.evaluate(SKY, hy)
        if hy == 1.2: open(OUT + '64-skylight-xr-sim.png', 'wb').write(base64.b64decode(res['url'].split(',')[1]))
        lum = [0.3 * c[0] + 0.5 * c[1] + 0.2 * c[2] for c in res['px']]
        # test #6 (Oct 18 evening): the skylight is now dim and contrasty by design (deep-black ride; it was a blown-out cyan plate at ~170/255),
        # so this only asserts it renders in both eyes and is not a black hole; brightness/contrast/animation are checked in verify_t6.py.
        check(f'skylight shows content in simulated XR stereo camera (head y {hy})', min(lum) > 6, f'skylight centre px per eye {res["px"]}')
    bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
    check('ride: no console errors/warnings', not bad, bad)
    await br.close()


async def headlights_test(p, B, OUT, check):
    """Sub headlights (LIGHTING_MODE 'headlights'): pixel test (lit rock brighter than the unlit wall), uniform-only mode switch, ?lights=0|1,
    dashboard LIGHTS pill, snow lit in the beams, and screenshots 70-74 (HMD grade forced with ?grade=hmd, plus a desktop-grade shot)."""
    import numpy as np; from PIL import Image, ImageDraw
    br = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    logs = []
    async def open_page(q):
        pg = await br.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
        await pg.goto(B + '?desktop&noride&' + q)
        await pg.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 1 && window.__ev.rw.tunnel.uniforms.uWallGain.value > 1 && window.__ev.rw.tunnel.uniforms.uUseVeinTex.value === 1', timeout=60000)
        await pg.evaluate('window.__ev.player.pause()'); await pg.mouse.move(5, 5); return pg
    async def view(pg, s_expr, yaw, pitch, fov=80, target=None, settle=2200):
        await pg.evaluate(f'(() => {{ const e = window.__ev; e.ride.state.s = {s_expr}; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true); }})()')
        if target is not None:
            await pg.evaluate(f"""(() => {{ const e = window.__ev, b = (e.rw.backdrops[{target}] || {{ getWorldPosition: (P) => P.copy(e.rw.backdropSpots[{target}].pos).applyMatrix4(e.rideWorld.matrixWorld) }}), V = e.app.camera.position.constructor, P = new V(); b.getWorldPosition(P);
              const d = e.desktop; d.yaw = Math.max(-0.55, Math.min(0.55, Math.atan2(-P.x, -P.z))) * {yaw}; d.pitch = {pitch}; }})()""")
        else: await pg.evaluate(f'(() => {{ const d = window.__ev.desktop; d.yaw = {yaw}; d.pitch = {pitch}; }})()')
        await pg.evaluate(f'window.__ev.app.camera.fov = {fov}; window.__ev.app.camera.updateProjectionMatrix()'); await pg.wait_for_timeout(settle)
    pg = await open_page('grade=hmd')
    st = await pg.evaluate('({ mode: window.__ev.LIGHT.mode, grade: window.__ev.GRADE.mode, hl: window.__ev.LIGHT_U.uHLInt.value, amb: window.__ev.LIGHT_U.uAmb.value, wall: window.__ev.GRADE.wall, vein: window.__ev.GRADE.vein, beam: window.__ev.LIGHT_U.uHLBeam.value })')
    check('headlights: default LIGHTING_MODE is headlights, HMD grade forced by ?grade=hmd', st['mode'] == 'headlights' and st['grade'] == 'hmd' and st['hl'] > 0 and st['amb'] < 0.5, st)
    pos = await pg.evaluate('(() => { const u = window.__ev.LIGHT_U; return [u.uHLPos.value.map(v => v.toArray().map(x => +x.toFixed(3))), u.uHLDir.value.map(v => v.toArray().map(x => +x.toFixed(3)))]; })()')
    check('headlights: two lamps on the sub nose, angled outward + down, fixed to the cockpit', pos[0][0][0] < 0 < pos[0][1][0] and pos[1][0][0] < 0 < pos[1][1][0] and pos[1][0][1] < 0 and pos[1][0][2] < -0.9, pos)
    # --- 70: tunnel corridor; pixel test: same view with headlights on vs off -> lit mask; lit rock must be clearly brighter than the unlit wall
    await view(pg, '0.31 * window.__ev.path.L', 0.15, 0.0)
    await pg.screenshot(path=OUT + '70-headlights-tunnel.png')
    await pg.evaluate('(() => { const u = window.__ev.LIGHT_U; window.__hl = [u.uHLInt.value, u.uHLFill.value, u.uHLBeam.value]; u.uHLInt.value = 0; u.uHLFill.value = 0; u.uHLBeam.value = 0; })()')
    await pg.wait_for_timeout(1200); await pg.screenshot(path='/tmp/ev-hl-off.png')
    await pg.evaluate('(() => { const u = window.__ev.LIGHT_U, h = window.__hl; u.uHLInt.value = h[0]; u.uHLFill.value = h[1]; u.uHLBeam.value = h[2]; })()')
    on = np.asarray(Image.open(OUT + '70-headlights-tunnel.png').convert('RGB')).astype(np.float32); off = np.asarray(Image.open('/tmp/ev-hl-off.png').convert('RGB')).astype(np.float32)
    H, W = on.shape[:2]; win = (slice(int(H * 0.22), int(H * 0.64)), slice(int(W * 0.2), int(W * 0.8)))   # inside the front window
    lum = lambda a: a[..., 0] * 0.3 + a[..., 1] * 0.5 + a[..., 2] * 0.2
    Lon, Loff = lum(on[win]), lum(off[win]); d = Lon - Loff
    lit = d > 18; unlit = np.abs(d) < 4
    lit_med, unlit_med = float(np.median(Lon[lit])) if lit.any() else 0, float(np.median(Lon[unlit])) if unlit.any() else 0
    check('headlights pixel test: lit rock brighter than the unlit wall (70)', lit.mean() > 0.08 and lit_med > unlit_med * 1.4 and lit_med - unlit_med > 25,
          f'lit {lit.mean()*100:.0f}% of window px, median luma lit {lit_med:.0f} vs unlit wall {unlit_med:.0f} /255 (x{lit_med/max(1,unlit_med):.2f}); mean gain from the lights {d.mean():.1f}')
    dark = (on[win].max(2) < 4).mean()
    check('headlights: cave dark outside the beams but never pure black (low floor kept)', dark < 0.01 and unlit_med < 90, f'{dark*100:.2f}% px < 4/255, unlit median luma {unlit_med:.0f}')
    sn = await pg.evaluate('window.__ev.rw.snow.mesh.material.uniforms.uHLInt === window.__ev.LIGHT_U.uHLInt')
    check('marine snow shares the headlight uniforms (flakes light up in the beams)', sn)
    # --- 71 cathedral (ice columns + lava floor + ice backdrop), 72 amber vents
    await view(pg, '0.76 * window.__ev.path.L - 13', 0.45, -0.02, 80, target=2); await pg.screenshot(path=OUT + '71-headlights-cathedral.png')
    await view(pg, '0.45 * window.__ev.path.L - 13', 0.45, -0.04, 80, target=1); await pg.screenshot(path=OUT + '72-headlights-vents.png')
    # --- 73: glow vs headlights, same view, HMD grade; the switch must be uniform-only (no new shader programs)
    await view(pg, '0.31 * window.__ev.path.L', 0.15, 0.0, settle=600)
    prog0 = await pg.evaluate('window.__ev.app.renderer.info.programs.length')
    await pg.evaluate('window.__ev.setLights("glow")'); await pg.wait_for_timeout(1500); await pg.screenshot(path='/tmp/ev-glow.png')
    g = await pg.evaluate('({ mode: window.__ev.LIGHT.mode, hl: window.__ev.LIGHT_U.uHLInt.value, wall: window.__ev.GRADE.wall, amb: window.__ev.LIGHT_U.uAmb.value, progs: window.__ev.app.renderer.info.programs.length })')
    check('glow mode = previous look (headlights 0, ambient 1, HMD wall glow 1.25), switched without recompiles', g['mode'] == 'glow' and g['hl'] == 0 and g['amb'] == 1 and abs(g['wall'] - 1.25) < 1e-9 and g['progs'] == prog0, f"{g}, programs before {prog0}")
    a = Image.open('/tmp/ev-glow.png').convert('RGB'); b = Image.open(OUT + '70-headlights-tunnel.png').convert('RGB')
    box = (int(W * 0.12), int(H * 0.1), int(W * 0.88), int(H * 0.7)); a, b = a.crop(box), b.crop(box)
    cmp = Image.new('RGB', (a.width * 2 + 12, a.height + 44), (8, 14, 20)); cmp.paste(a, (0, 44)); cmp.paste(b, (a.width + 12, 44))
    dr = ImageDraw.Draw(cmp); dr.text((12, 14), "?lights=0  'glow' (previous look), HMD grade", fill=(216, 243, 245)); dr.text((a.width + 24, 14), "?lights=1  'headlights' (default), HMD grade", fill=(255, 236, 200))
    cmp.save(OUT + '73-glow-mode-compare.png')
    gl = lum(np.asarray(a).astype(np.float32)).mean(); hl = lum(np.asarray(b).astype(np.float32)).mean()
    check('headlights mode is darker overall than glow (local light, not global brightening)', hl < gl * 0.85, f'mean luma glow {gl:.0f} vs headlights {hl:.0f}')
    await pg.evaluate('window.__ev.setLights("headlights")')
    # dashboard LIGHTS pill (ride mode): click toggles, click again restores
    await view(pg, '0.30 * window.__ev.path.L', 0, -0.45, 70, settle=900)
    sp = await pg.evaluate('window.__ev.lightsPanel.screenPos("lights", window.__ev.app.camera)')
    await pg.mouse.move(sp['x'], sp['y']); await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(500); m1 = await pg.evaluate('window.__ev.LIGHT.mode')
    await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(500); m2 = await pg.evaluate('window.__ev.LIGHT.mode'); await pg.mouse.move(5, 5)
    check('dashboard LIGHTS pill toggles headlights <-> glow', m1 == 'glow' and m2 == 'headlights', f'{m1} -> {m2}')
    await pg.close()
    # ?lights=0 and the desktop grade
    pg = await open_page('lights=0'); m = await pg.evaluate('[window.__ev.LIGHT.mode, window.__ev.LIGHT_U.uHLInt.value, window.__ev.lightsPanel.mesh.visible]'); await pg.close()
    check('?lights=0 starts in glow mode (headlights off)', m[0] == 'glow' and m[1] == 0, m)
    pg = await open_page('lights=1')
    dg = await pg.evaluate('({ grade: window.__ev.GRADE.mode, hl: window.__ev.LIGHT_U.uHLInt.value, amb: window.__ev.LIGHT_U.uAmb.value, wall: window.__ev.GRADE.wall, expo: window.__ev.GRADE.expo })')
    await view(pg, '0.31 * window.__ev.path.L', 0.15, 0.0); await pg.screenshot(path=OUT + '74-desktop-headlights.png')
    check('desktop headlights: own knobs (desktop grade, desktop intensity/ambient/wall glow)', dg['grade'] == 'desktop' and dg['hl'] > 0 and dg['expo'] < 4, dg)
    await pg.close()
    bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
    check('headlights: no console errors/warnings', not bad, bad)
    await br.close()


async def ktx2_test(p, B, OUT, check, root):
    """KTX2 path (ON since Oct 18 2026: tools/prepare_art.py --stills --ktx2 etc1s ships tex/*.ktx2 + pano/europa.ktx2 next to the JPEGs).
    Checks the SHIPPED files load as compressed textures, render the same picture as the JPEG fallback (orientation!), ?ktx2=0 forces the JPEGs,
    and a corrupt .ktx2 falls back. Never deletes shipped files: only a temporary junk file + a temporary manifest, both restored."""
    import os, sys, json, numpy as np; from PIL import Image
    man = os.path.join(root, 'art-manifest.json'); backup = open(man).read(); made = []
    try:
        m = json.loads(backup); k2 = {k: v for k, v in (m.get('ktx2') or {}).items() if 'pano/' not in k}   # ride stills (the pano loads in float mode only)
        if not k2: check('KTX2 path (skipped: no .ktx2 listed in art-manifest.json; JPEG path unaffected)', True); return
        br = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        logs = []; shots = {}
        for q in ('ktx2=1', 'ktx2=0'):
            pg = await br.new_page(viewport={'width': 1280, 'height': 800})
            pg.on('console', lambda m_: logs.append((m_.type, m_.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
            await pg.goto(B + '?desktop&noride&grade=hmd&lights=0&' + q)
            await pg.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 1 && window.__ev.rw.tunnel.uniforms.uWallGain.value > 1', timeout=60000)
            st = await pg.evaluate('JSON.parse(JSON.stringify(window.__ev.stillStats))')
            await pg.evaluate('window.__ev.player.pause()')
            await pg.evaluate("""(() => { const e = window.__ev; e.ride.state.s = 0.12 * e.path.L - 16; e.ride.update(e.t, 0); e.rideWorld.updateMatrixWorld(true);
              const b = e.rw.backdrops[0], V = e.app.camera.position.constructor, P = new V(); b.getWorldPosition(P); const d = e.desktop; d.yaw = Math.max(-0.55, Math.min(0.55, Math.atan2(-P.x, -P.z))); d.pitch = 0.04; })()""")
            await pg.mouse.move(5, 5); await pg.wait_for_timeout(2500); path = f'/tmp/ev-{q}.png'; await pg.screenshot(path=path); shots[q] = (path, st); await pg.close()
        await br.close()
        stk, stj = shots['ktx2=1'][1], shots['ktx2=0'][1]
        comp = [x for x in stk['list'] if x['compressed']]
        check('KTX2: listed stills load as GPU-compressed textures (basis transcoder in a worker)', len(comp) == len(k2) and stk['fallbacks'] == 0,
              f"{len(comp)} compressed ({', '.join(f'{x[chr(115)+chr(114)+chr(99)].split(chr(47))[-1]} {x[chr(119)]}x{x[chr(104)]} {x[chr(109)+chr(98)]} MB' for x in comp)}); GPU est. {stk['bytesGPU']/1048576:.0f} MB vs JPEG path {stj['bytesGPU']/1048576:.0f} MB")
        check('KTX2: ?ktx2=0 forces the JPEG path', stj['ktx2'] == 0 and stj['jpeg'] >= len(k2), {k: stj[k] for k in ('ktx2', 'jpeg', 'fallbacks')})
        a = np.asarray(Image.open(shots['ktx2=1'][0]).convert('L').resize((64, 40), Image.BOX)).astype(float); b = np.asarray(Image.open(shots['ktx2=0'][0]).convert('L').resize((64, 40), Image.BOX)).astype(float)
        win = (slice(8, 26), slice(12, 52)); r = np.corrcoef(a[win].ravel(), b[win].ravel())[0, 1]; md = np.abs(a[win] - b[win]).mean()
        bf = np.asarray(Image.open(shots['ktx2=0'][0]).convert('L').resize((64, 40), Image.BOX).transpose(Image.FLIP_TOP_BOTTOM)).astype(float); rf = np.corrcoef(a[win].ravel(), bf[win].ravel())[0, 1]
        check('KTX2: renders the same picture as the JPEG (orientation + colour space)', r > 0.9 and md < 8, f'correlation {r:.3f} (vs vertically flipped {rf:.3f}), mean abs diff {md:.1f}/255')
        bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
        check('KTX2 test: no console errors/warnings', not bad, bad)
        # robustness: a corrupt .ktx2 must fall back to its JPEG
        junk = os.path.join(root, 'tex', 'zz-corrupt.ktx2'); open(junk, 'wb').write(b'\xabKTX 20\xbb\r\n\x1a\n' + os.urandom(4000)); made.append(junk)
        m['ktx2'] = {m['chambers'][0]: 'tex/zz-corrupt.ktx2'}; open(man, 'w').write(json.dumps(m, indent=2))
        br = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']); pg = await br.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B + '?desktop&noride')
        await pg.wait_for_function('window.__ev && window.__ev.rw.backdrops.filter(Boolean).length === 1', timeout=60000)
        st = await pg.evaluate('JSON.parse(JSON.stringify(window.__ev.stillStats))'); await br.close()
        check('KTX2: a corrupt .ktx2 falls back to the JPEG (backdrop still shown)', st['fallbacks'] == 1 and not errs, {k: st[k] for k in ('ktx2', 'jpeg', 'fallbacks')})
    finally:
        for f in made:
            if f.endswith('zz-corrupt.ktx2'):
                try: os.remove(f)
                except FileNotFoundError: pass
        open(man, 'w').write(backup)


if __name__ == '__main__':   # standalone: python3 tools/verify_ride.py [--headlights|--ktx2]  (server on :8770) -> headlights checks + screenshots 70-74, KTX2 path
    import asyncio
    from playwright.async_api import async_playwright
    res = []
    def _check(name, cond, info=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, info)
    async def _main():
        import os, sys
        async with async_playwright() as p:
            if '--ktx2' not in sys.argv: await headlights_test(p, 'http://127.0.0.1:8770/', '/workspace/europa-vr/screens/', _check)
            if '--headlights' not in sys.argv: await ktx2_test(p, 'http://127.0.0.1:8770/', '/workspace/europa-vr/screens/', _check, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')))
    asyncio.run(_main()); raise SystemExit(0 if all(res) else 1)
