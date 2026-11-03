import asyncio,sys,math,json
from playwright.async_api import async_playwright
# VIEWS: [name, x, eyeY, z, yawDeg(+right), pitchDeg, fov]  or [name,'lie',0,0,0,0,fov]
PORT,OUT,TAG=sys.argv[1:4]; VIEWS=json.loads(sys.argv[4])
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(channel='chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=await br.new_page(viewport={'width':1280,'height':720}); pg.on('console',lambda m: print('CONSOLE',m.text) if m.type in ('error','warning') else None); pg.on('pageerror',lambda e: print('PAGEERR',e))
    await pg.goto(f'http://127.0.0.1:{PORT}/beach/'); await pg.wait_for_function('window.__beach',timeout=180000)
    await pg.evaluate("window.__beachTime=12.3;document.getElementById('overlay').classList.add('hidden');document.querySelectorAll('#hud,#ui').forEach(e=>e.style.display='none');const c=window.__beach.camera;c.aspect=1280/720;c.updateProjectionMatrix()")
    await pg.wait_for_timeout(3000)
    for name,x,y,z,yw,pt,fv in VIEWS:
      await pg.evaluate(f"const c=window.__beach.camera;c.fov={fv};c.updateProjectionMatrix()")
      if x=='lie': await pg.evaluate("window.__beach.standUp();window.__beach.lieDown()")
      else: await pg.evaluate(f"window.__beach.standUp();window.__beach.setPos({x},{y},{z});window.__beach.look({math.radians(-yw)},{math.radians(pt)})")
      await pg.wait_for_timeout(1500)
      await pg.screenshot(path=f'{OUT}/{TAG}-{name}.png')
    await br.close()
asyncio.run(main())
