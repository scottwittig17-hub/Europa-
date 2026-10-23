"""Headless desktop verification for europa-vr. Serve the folder on :8770 first:  python3 -m http.server 8770 --bind 127.0.0.1"""
import asyncio, math, statistics, sys, os, subprocess, shutil
from playwright.async_api import async_playwright
B = os.environ.get('EV_URL', 'http://127.0.0.1:8770/'); OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'screens') + '/'   # t10: this folder's screens (was hard-wired to /workspace/europa-vr)
ok_all = True
def check(name, cond, info=''):
    global ok_all; ok_all &= bool(cond); print(('PASS ' if cond else 'FAIL ') + name, info)
async def sample(pg, secs, step=0.25):
    out = []
    for _ in range(int(secs / step)):
        out.append(await pg.evaluate('(({analysis:a}) => ({beat:a.beat, beats:a.beats, flux:a.flux, bass:a.bass, mood:a.mood, bpm:a.bpm, speed:a.speed, active:a.active, centroid:a.centroid}))(window.__ev)'))
        await pg.wait_for_timeout(int(step * 1000))
    return out
async def aim(pg, x, y, z):
    await pg.evaluate(f'''(() => {{ const d = window.__ev.desktop; const dx={x}, dy={y}-1.2, dz={z};
      d.yaw = Math.atan2(-dx, -dz); d.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }})()''')
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        pg = await br.new_page(viewport={'width': 1280, 'height': 800}); logs = []
        pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
        await pg.goto(B); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + '01-entry-page.png')
        check('entry lists 2 placeholder tracks', await pg.evaluate('document.querySelectorAll("#trackList li").length') == 2)
        await pg.check('input[name=mode][value=float]')   # float checks first; the ride has its own test (verify_ride.py)
        await pg.click('#preview'); await pg.wait_for_timeout(1500)
        check('entry hidden after Preview', await pg.evaluate('document.getElementById("entry").hidden'))
        import json
        art = json.load(open(os.path.join(ROOT, 'art-manifest.json')))
        if art.get('loops'):
            await pg.wait_for_function(f'window.__ev.loopPlanes.length === {min(len(art["loops"]), 6)} && window.__ev.loopPlanes.filter(p => p.userData.floatSlot).every(p => p.userData.on)', timeout=30000)   # float plays the first MAX_LOOP_VIDEOS
            info = await pg.evaluate('window.__ev.loopPlanes.filter(p => p.userData.floatSlot).map(p => ({url: p.userData.url, aspect: p.userData.aspect, d: Math.hypot(p.position.x, p.position.z)}))')
            check('art loops playing on correctly-shaped planes', all(16 <= i['d'] <= 20 for i in info), [(i['url'].split('/')[-1], round(i['aspect'], 3), round(i['d'], 1)) for i in info])
        if art.get('pano'):
            await pg.wait_for_function('window.__ev.cavern.uniforms.uUsePano.value === 1', timeout=30000)
            check('panorama art applied', True)
        if art.get('tex', {}).get('walls'):
            await pg.wait_for_function('window.__ev.cavern.uniforms.uUseWallTex.value === 1', timeout=30000); check('wall texture applied', True)
        if art.get('tex', {}).get('snow'):
            check('snow sprite applied', await pg.evaluate('window.__ev.snow.uniforms.uUseMap.value === 1'))
        # idle wide view (paused)
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(300)
        await pg.evaluate('window.__ev.player.pause()'); await pg.wait_for_timeout(5000)
        await pg.evaluate('(() => { const d = window.__ev.desktop; d.yaw = 0.35; d.pitch = 0.12; window.__ev.app.camera.fov = 90; window.__ev.app.camera.updateProjectionMatrix(); })()')
        await pg.wait_for_timeout(1200); await pg.screenshot(path=OUT + '02-wide-idle.png'); await pg.screenshot(path=OUT + '10-art-wide.png')
        # beat track
        await pg.evaluate('(() => { const e = window.__ev; e.player.load(1, true); })()'); await pg.wait_for_timeout(500)
        await pg.evaluate('(() => { const d = window.__ev.desktop; d.yaw = 0; d.pitch = 0.05; window.__ev.app.camera.fov = 80; window.__ev.app.camera.updateProjectionMatrix(); })()')
        s = await sample(pg, 16)
        beats = s[-1]['beats']; bass = [x['bass'] for x in s[8:]]; mood_beat = statistics.mean(x['mood'] for x in s[-8:])
        check('beat track: playing + analyser live', s[-1]['active'], s[-1])
        check('beat count > 0', beats > 0, f'beats={beats} in ~16 s (track is 84 BPM)')
        check('bass varies', max(bass) - min(bass) > 0.05, f'bass min {min(bass):.2f} max {max(bass):.2f} sd {statistics.pstdev(bass):.3f}')
        check('tempo estimate + gentle swim speed', 0.75 <= s[-1]['speed'] <= 1.3, f"bpm {s[-1]['bpm']:.1f} speed {s[-1]['speed']:.2f}")
        check('bass ripples spawned', await pg.evaluate('window.__ev.ripples') > 0, await pg.evaluate('window.__ev.ripples'))
        # capture a beat frame (veins bright)
        best = 0
        for _ in range(150):
            b = await pg.evaluate('window.__ev.analysis.beat')
            if b > 0.5: await pg.screenshot(path=OUT + '03-beat-veins-bright.png'); await pg.screenshot(path=OUT + '11-art-beat.png'); best = b; break
            await pg.wait_for_timeout(40)
        check('captured frame during a beat', best > 0.5, f'beat env {best:.2f}')
        # mellow track mood
        await pg.evaluate('window.__ev.player.load(0, true)'); s2 = await sample(pg, 22)
        mood_mellow = statistics.mean(x['mood'] for x in s2[-8:])
        check('mood differs between tracks (beat track leans cyan)', mood_beat - mood_mellow > 0.08, f'mood beat {mood_beat:.2f} vs mellow {mood_mellow:.2f}; centroid {s[-1]["centroid"]:.0f} Hz vs {s2[-1]["centroid"]:.0f} Hz; beats during mellow {s2[-1]["beats"] - s2[0]["beats"]}')
        # pause -> visuals keep animating, values decay to idle
        await pg.evaluate('window.__ev.player.pause()')
        j0 = await pg.evaluate('window.__ev.jellies.jellies.map(j => j.root.position.toArray())'); t0 = await pg.evaluate('window.__ev.t')
        await pg.wait_for_timeout(5000)
        j1 = await pg.evaluate('window.__ev.jellies.jellies.map(j => j.root.position.toArray())'); t1 = await pg.evaluate('window.__ev.t')
        a = await pg.evaluate('(({analysis:a}) => ({beat:a.beat, bass:a.bass, active:a.active, speed:a.speed}))(window.__ev)')
        moved = max(math.dist(x, y) for x, y in zip(j0, j1))
        check('paused: frame loop + jellies keep animating', t1 - t0 > 3 and moved > 0.05, f'clock +{t1-t0:.1f}s, max jelly move {moved:.2f} m')
        check('paused: audio values decayed to idle', not a['active'] and a['beat'] < 0.05 and a['bass'] < 0.1, a)
        dmin = await pg.evaluate('Math.min(...window.__ev.jellies.jellies.map(j => j.dist))')
        check('jellies never within 3 m of user', dmin >= 3, f'closest horizontal distance {dmin:.2f} m')
        # art loops view (aim between the first two loop planes) + look behind
        if art.get('loops'):
            await pg.evaluate('(() => { const d = window.__ev.desktop; d.yaw = 0.05; d.pitch = 0.1; window.__ev.app.camera.fov = 100; window.__ev.app.camera.updateProjectionMatrix(); })()')
            await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + '12-art-loops.png')
        await pg.evaluate('(() => { const d = window.__ev.desktop; d.yaw = Math.PI; d.pitch = 0.05; window.__ev.app.camera.fov = 90; window.__ev.app.camera.updateProjectionMatrix(); })()')
        await pg.wait_for_timeout(1200); await pg.screenshot(path=OUT + '13-art-look-behind.png')
        # jellyfish close-ish
        pos = await pg.evaluate('(() => { const js = window.__ev.jellies.jellies.slice().sort((a,b)=>a.dist-b.dist); return js[0].root.position.toArray(); })()')
        await aim(pg, pos[0], pos[1] - 0.6, pos[2]); await pg.evaluate('window.__ev.app.camera.fov = 45; window.__ev.app.camera.updateProjectionMatrix()')
        await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + '04-jellyfish.png')
        # music panel view + click play via panel
        await pg.evaluate('window.__ev.app.camera.fov = 70; window.__ev.app.camera.updateProjectionMatrix()')
        await aim(pg, -0.78, 1.02, -1.45); await pg.wait_for_timeout(500)
        sp = await pg.evaluate('window.__ev.panelScreenPos("playpause")')
        await pg.mouse.move(sp['x'], sp['y']); await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(900)
        check('panel play/pause click plays', await pg.evaluate('window.__ev.player.playing'))
        await pg.mouse.move(5, 5); await pg.wait_for_timeout(500)
        await pg.keyboard.press('d'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + '05-music-panel.png')
        check('D toggles debug overlay', await pg.evaluate('!document.getElementById("debug").hidden'))
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(300)
        check('Space toggles play/pause', not await pg.evaluate('window.__ev.player.playing'))
        # --- anti-judder: panel upload behaviour (synthetic 72 Hz frames, real CanvasPanel code) ---
        up = await pg.evaluate('''(() => { const P = window.__ev.panel; const hz = 1000 / 72; let t = performance.now() + 1e5;
          const run = (frames, hoverFn, dirtyEvery) => { const u0 = P.uploads; for (let i = 0; i < frames; i++, t += hz) { P.setHover(hoverFn(i), t); if (dirtyEvery && i % dirtyEvery === 0) P.dirty = true; P.refresh(t); } return P.uploads - u0; };
          run(72, () => null);                                   // settle
          const settle = run(72, () => 'playpause');             // hover once -> exactly one redraw
          const steady = run(720, () => 'playpause');            // 10 s steady hover -> 0 uploads
          const jitter = run(720, (i) => (i % 2 ? 'playpause' : null));         // ray flickering on a button edge every frame
          const jitter3 = run(720, (i) => ((i >> 2) % 2 ? 'playpause' : null)); // flicker every 4 frames (just under debounce)
          const flood = run(720, () => null, 1);                 // something marks the panel dirty EVERY frame
          return { settle, steady, jitterPerSec: jitter / 10, jitter4PerSec: jitter3 / 10, floodPerSec: flood / 10 }; })()''')
        check('panel: steady hover -> no texture uploads', up['settle'] == 1 and up['steady'] == 0, up)
        check('panel: jittery ray at button edge -> <= 10 uploads/s', up['jitterPerSec'] <= 10 and up['jitter4PerSec'] <= 10, up)
        check('panel: redraw rate-limited to <= 10/s even if dirtied every frame', up['floodPerSec'] <= 10.5, up)
        # in-VR stats panel via the 'i' button (click it like a ray press)
        await pg.evaluate('window.__ev.app.camera.fov = 70; window.__ev.app.camera.updateProjectionMatrix()')
        await aim(pg, -0.6, 0.9, -1.4); await pg.wait_for_timeout(600)
        sp = await pg.evaluate('window.__ev.infoBtn.screenPos("info", window.__ev.app.camera)')
        await pg.mouse.move(sp['x'], sp['y']); await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(1500)
        u0 = await pg.evaluate('window.__ev.statsPanel.uploads'); await pg.wait_for_timeout(3000); u1 = await pg.evaluate('window.__ev.statsPanel.uploads')
        await pg.mouse.move(5, 5); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + '14-stats-panel.png')
        check("'i' button shows stats panel, updated <= 2x/s", await pg.evaluate('window.__ev.statsOn && window.__ev.statsPanel.mesh.visible') and 1 <= (u1 - u0) <= 7, f'{u1-u0} stats redraws in 3 s')
        print('headless swiftshader fps (not representative):', round(await pg.evaluate('window.__ev.fps'), 1))
        bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
        check('no console errors/warnings', not bad, bad)
        await br.close()
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from verify_ride import ride_test, headlights_test, ktx2_test
        await _guard('ride_test', ride_test(p, B, OUT, check))
        await _guard('headlights_test', headlights_test(p, B, OUT, check))
        await _guard('ktx2_test', ktx2_test(p, B, OUT, check, ROOT))
        await _guard('loop_test', loop_test(p))
        from verify_t5 import t5_test
        await _guard('t5_test', t5_test(p, B, OUT, check))   # test #5: lights, backdrop life, loops, vents, rays + big ray clearance, music queue/session end, screenshots 80-87
        from verify_t6 import t6_test
        await _guard('t6_test', t6_test(p, B, OUT, check))   # test #6: skylight life, plume alignment + distance firing, rock chimneys, screenshots 90-96
        from verify_t7 import t7_test
        await _guard('t7_test', t7_test(p, B, OUT, check))   # test #7: dark caverns + vignettes, see-through moving skylight, manta overhead pass, screenshots 100-108
        from verify_t10 import t10_test
        await t10_test(p, B, OUT, check)  # test #10 (replaces the t8 suite, whose pillars-backdrop check no longer applies): cave rock, creatures, skylight, screenshots 130-147
    sys.exit(0 if ok_all else 1)

async def _guard(name, coro):   # t10: a legacy suite that still assumes the removed jelly/pillars backdrops reports a FAIL instead of aborting the run
    try: await coro
    except Exception as ex: check(f'{name}: legacy suite aborted (test #10 removed the jelly + pillars backdrops)', False, str(ex).splitlines()[0][:200])
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
async def loop_test(p):
    """Throwaway portrait (720x1280) + landscape (1280x720) black-bg loops in loops/: planes must match each clip's aspect. Cleaned up afterwards."""
    clips = {'loops/zz-test-portrait.mp4': (720, 1280), 'loops/zz-test-wide.mp4': (1280, 720)}
    man = os.path.join(ROOT, 'art-manifest.json'); backup = open(man).read()
    try:
        for rel, (w, h) in clips.items():
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'color=black:s={w}x{h}:d=6:r=30',
                            '-f', 'lavfi', '-i', f'color=0x40e0f0:s={w//4}x{h//4}:d=6:r=30', '-filter_complex', '[0][1]overlay=(W-w)/2:(H-h)/2+sin(t*1.047)*H/8',
                            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', os.path.join(ROOT, rel)], check=True)
        import json
        m = json.loads(backup); m['loops'] = list(clips); open(man, 'w').write(json.dumps(m, indent=2))   # test clips only
        br = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        pg = await br.new_page(viewport={'width': 1280, 'height': 800}); logs = []
        pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
        await pg.goto(B + '?desktop&mode=float'); await pg.wait_for_function('window.__ev && window.__ev.loopPlanes.length === 2 && window.__ev.loopPlanes.every(p => p.userData.on)', timeout=30000)
        await pg.wait_for_timeout(4000)
        info = await pg.evaluate('''window.__ev.loopPlanes.map(p => ({ url: p.userData.url, size: p.userData.size, aspect: p.userData.aspect,
            dist: Math.hypot(p.position.x, p.position.z), op: p.material.uniforms.uOpacity.value }))''')
        for it in info:
            w, h = clips[it['url']]; want = w / h
            check(f"loop plane aspect matches {it['url'].split('/')[-1]} ({w}x{h})", abs(it['aspect'] - want) < 0.01 and 16 <= it['dist'] <= 20,
                  f"plane {it['size'][0]:.2f} x {it['size'][1]:.2f} m (aspect {it['aspect']:.4f} vs {want:.4f}), {it['dist']:.1f} m away, opacity {it['op']:.2f}")
        port = [i for i in info if 'portrait' in i['url']][0]
        check('portrait loop plane ~8 m tall', abs(port['size'][1] - 8) < 0.01, port['size'])
        await pg.evaluate('(() => { const p = window.__ev.loopPlanes.find(p => p.userData.url.includes("portrait")); const d = window.__ev.desktop; d.yaw = Math.atan2(-p.position.x, -p.position.z); d.pitch = 0.08; })()')
        await pg.wait_for_timeout(1500); await pg.screenshot(path='/tmp/ev-loop-test.png')
        bad = [l for l in logs if l[0] in ('error', 'warning', 'pageerror')]
        check('loop test: no console errors/warnings', not bad, bad)
        await br.close()
    finally:
        for rel in clips: 
            try: os.remove(os.path.join(ROOT, rel))
            except FileNotFoundError: pass
        open(man, 'w').write(backup)
asyncio.run(main())
