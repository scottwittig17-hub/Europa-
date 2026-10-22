# core/ — reusable WebXR storybook core (three.js r160, ES modules)

Import with the same importmap as index.html (`"three": "./vendor/three.module.js"`). Nothing here is book-specific; `app/book.js` is the reference consumer.

## xr-core.js
- `createXRApp({canvas, eye=1.2, fov, near, far, foveation=0.6, maxPixelRatio=2, background, preserveDrawingBuffer, localClipping})`
  → `{renderer, scene, camera, world, eye, maxAniso, enterVR({optionalFeatures, onStart, onEnd}), vrSupport() → Promise<{ok, reason}>, onFrame(cb(dt, t, frame)), fps, isPresenting}`.
  Handles resize and the `local-floor` request with a `local` fallback (world lowered by `eye` once at session start, never per frame). Calls `onFrame` callbacks in order, then renders.
  Options `framebufferScale` (default 1) and `foveation` are applied before any session starts. `targetFrameRate` (default 72) is requested with `session.updateTargetFrameRate` when supported.
  `compile()` precompiles every scene material. `stats` = `{fps, frameMs, maxFrameMs, targetFrameRate}`, refreshed twice a second.
- `LoadTracker(el).track(promise, label)`: shows `el` while any load is pending and always hides it on settle (success **or** failure).
- `loadTexture(url, {anisotropy, timeoutMs=15000})` → Promise<Texture> (rejects on 404/decode error/timeout).
- `withTimeout(p, ms, label)`, `cubicBezier(x1,y1,x2,y2)`.

## panels.js
- `CanvasPanel(wM, hM, pxPerM, draw(ctx, panel), {anisotropy, renderOrder, hoverStableMs = 70, minRedrawMs = 100})`: hover is debounced (a new hover must hold for `hoverStableMs`, about 5 frames), redraws and texture uploads are capped at one per `minRedrawMs` (10/s), and `uploads` counts them. Call `refresh(now)` every frame. a mesh with a canvas texture. Methods: `hit(uv)` returns a region id; `setHover(id)`; `press(id)` flashes the region, then calls `onPress(id)`; `refresh()`; `screenPos(id, camera)`. Regions are set as `panel.regions = [{id,x,y,w,h}]` in canvas px.
- `StableHover({stableMs, minIntervalMs})`: the same debounce for custom targets. `set(v)` runs every frame and `update(now)` returns true when the committed value changes.
- Drawing helpers: `roundRect`, `spacedText`, `chevron`, `circleBtn`; `regionScreenPos(mesh, canvas, r, camera)`.

## input.js
- `Interaction({getTargets})`: raycast hit-testing over targets that implement `{mesh, hit(uv), press(id), setHover(id)}`.
- `XRInput({renderer, scene, camera, interaction, onAxisX(dir), onButton(idx)})`: controller rays with trigger/pinch select, thumbstick paging (`axes[2]`), A/X·B/Y (buttons 4/5), hand-joint spheres, index-tip poke. Call `update()` each frame.
- `DesktopControls({canvas, camera, renderer, interaction, yawDeg, pitchDeg})`: drag to look, click to press. Call `update()` each frame.

## media.js
- `createPanorama({url, radius=60, eyeY, rotationY, tracker, fallbackStops=WARM_SKY_STOPS})` → `{mesh, ready: Promise<{ok}>}`. Uses a warm gradient sphere if the image fails.
- `StillCache({tracker, anisotropy, timeoutMs})`: `get(url)` returns a Promise<Texture> and is cached; `prefetch(urls)`. On rejection the caller draws its own fallback (the book uses `gradientTexture`).
- `VideoManager({stallMs=8000, maxLongSide=1280, handoffMs})`: `get(key, url)` → entry; `play(entry, {onReady(tex), onFail(reason)})`; `stop(entry)`. Plays one video at a time. A media error is permanent; a stall or no first frame within `stallMs` calls `onFail` and is retried on the next play. Logs a warning if the video's long side is over `maxLongSide`.
- `applyCoverUV(tex, imgAspect, panelAspect, scale, tx, ty)`, `gradientTexture(stops, w, h)`.

## music.js
- `MusicPlayer({tracks, volume})`: `list, i, volume, playing, error, started`; `onChange(cb)`, `setPlaylist(tracks)`, `load(i)`, `play()`, `pause()`, `toggle()`, `next()`, `setVolume(v)`.
- `createMusicPanel(player, {theme, width, height, pxPerM, anisotropy})` → CanvasPanel with regions `voldown | playpause | next | volup`.
