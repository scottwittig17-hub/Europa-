"""Europa test #11 verify (Oct 23 2026). Serve the t11 folder first (EV_URL, default http://127.0.0.1:8771/).
Checks: shaders compile / no console errors, t11 textures loaded (KTX2), ice walls + glass built, comfort clearance >= 5.9 m incl. the t11 ice,
manta = a live <video> (H.264 mp4, muted) never a flipbook, manta plane >= 6 m from the path, <= 3 loop decodes at any point of a lap,
Quest freeze fix still present (pumpVideoTextures / 4 s retry / unlockVideos on Enter VR)."""
import os, sys, json, asyncio, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..'))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
res = []
def check(name, cond, info=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, info)

async def main(B):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br = await p.chromium.launch(channel='chrome', args=ARGS); logs = []
        pg = await br.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
        await pg.goto(B + '?desktop&noride&grade=hmd')
        await pg.wait_for_function('window.__ev && window.__ev.loops.length >= 6', timeout=150000); await pg.wait_for_timeout(8000)
        r = json.loads(await pg.evaluate('''(async () => { const e = window.__ev, rw = e.rw, V = e.app.camera.position.constructor;
          const { T11_TEX } = await import('./app/ice11.js'); const tex = {}; for (const k in T11_TEX) { const t = T11_TEX[k].value; tex[k] = !!(t && (t.isCompressedTexture || (t.image && t.image.width > 1))); }
          const c = rw.clearance(0.5); const m = e.loops[5]; const el = m.entry.el; const pl = m.rplane; pl.updateMatrixWorld(true);
          // manta plane (with its hover drift envelope ~0.5 m) vs every path point, in rideWorld-local space
          let mn = 1e9; const q = new V(), a = new V(), inv = e.rideWorld.matrixWorld.clone().invert();
          for (let u = -0.5; u <= 0.5; u += 0.1) for (let v = -0.5; v <= 0.5; v += 0.1) { q.set(u, v, 0); pl.localToWorld(q); q.applyMatrix4(inv);
            for (let s = 0; s < e.path.L; s += 1) { e.path.pointOf(s, a); mn = Math.min(mn, q.distanceTo(a)); } }
          let maxDec = 0; for (let s = 0; s < e.path.L; s += 2) { e.ride.state.s = s; e.ride.update(e.t, 0); e.updateVideos(true); maxDec = Math.max(maxDec, e.loops.filter(l => !l.entry.el.paused).length); }
          return JSON.stringify({ tex, ice: rw.ice11.report, clear: c, mantaMin: mn - 0.5, src: el.currentSrc, isVideo: el.tagName, muted: el.muted, maxDec, mantaTex: pl.material.uniforms.uMap.value.isVideoTexture }); })()'''))
        check('t11 textures loaded (ice wall / glass / detail albedo + 6 normal-roughness maps)', all(r['tex'].values()), r['tex'])
        check('ice walls, brinicles, shards, glass columns built', r['ice']['walls'] >= 6 and r['ice']['brinicles'] > 0 and r['ice']['shards'] > 0 and r['ice']['columns'] > 0, r['ice'])
        cmin = r['clear'].get('min', 0) if isinstance(r['clear'], dict) else r['clear']
        check('comfort: whole ride world incl. t11 ice >= 5.9 m from the path', cmin >= 5.9, {k: v for k, v in r['clear'].items() if not isinstance(v, (list, dict))} if isinstance(r['clear'], dict) else r['clear'])
        check('manta: LIVE <video> H.264 mp4 on a VideoTexture, muted (no flipbook)', r['isVideo'] == 'VIDEO' and r['src'].endswith('06-giant-manta.mp4') and r['mantaTex'] and r['muted'], r['src'])
        check('manta: plane (incl. hover drift) >= 6 m from the path', r['mantaMin'] >= 6.0, f"{r['mantaMin']:.2f} m")
        check('<= 3 loop videos decoding anywhere on the lap', r['maxDec'] <= 3, r['maxDec'])
        src = open(os.path.join(ROOT, 'app', 'main.js')).read()
        check('Quest freeze fix intact (pumpVideoTextures, paused restart, 4 s retry, unlockVideos)', all(k in src for k in ('pumpVideoTextures', 'unlockVideos')) and re.search(r'4000', src), '')
        bad = [l for l in logs if l[0] in ('error', 'pageerror') or (l[0] == 'warning' and 'GPU stall' not in l[1])]
        check('no console errors/warnings', not bad, [b[1][:200] for b in bad[:3]])
        await br.close()

asyncio.run(main(os.environ.get('EV_URL', 'http://127.0.0.1:8771/'))); raise SystemExit(0 if all(res) else 1)
