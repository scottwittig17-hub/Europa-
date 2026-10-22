# Europa's Hidden Ocean — VR (placeholder engine)

An audio-reactive WebXR music visualizer for Meta Quest 3, set in a bioluminescent ocean under Europa's ice. The world breathes with your music.

There are two modes, chosen on the entry page:
- **Submarine ride** (the default): sit in a dim cockpit while a slow, hands-off sub glides through a looping tunnel of glowing chambers.
- **Float**: the original experience. Hang still in one cavern and look around. It is a static site with no build step. three.js r160 is vendored, and the shared XR core (`core/`) is copied from zippy-vr.

The first art pass is in: `pano/europa.jpg`, `tex/walls.jpg`, `tex/snow.png`, and three loops (`loops/01-jelly-drifter.mp4`, `02-light-ribbon.mp4`, `03-amber-vent-plume.mp4`). The jellyfish, shafts, vents and veins are still procedural, and more art drops in by filename (see **Art drop-ins**).

When a panorama is present, the procedural veins drop to about 30% while idle so the painting reads. They still flash on beats and bass, and the ripple rings still run.

## Headset test #5 fixes (Oct 18 2026)
- **New hi-res art (7168×4032 sources):** jelly / vents / pillars window views → `tex/chamber-*.jpg` (window frame cropped, 4096 wide); cockpit concept → `tex/cockpit-dash.jpg`;
  grey rock + cyan veins (an upscale of the old tunnel source) → `tex/tunnel.jpg` (2048 seamless, vein mask rebuilt). The darker rock with faint blue veins was the other tunnel
  candidate; it is now `tex/rock.jpg`, used on the rock props and vent chimneys. Soft frosty ice → `tex/walls.jpg` (float cavern) **and** the frost detail inside the ice
  columns (same texture, no extra memory). Dark veined cave → **back half of the float panorama**. Rebuild: `python3 tools/prepare_art.py --hires <attachments dir>`, then
  `--stills --q 86 --ktx2 etc1s`, then `tools/scan_assets.py`. The tile maker now uses a 4-way offset blend (the older 2-way one left an edge seam in the centre band).
- **Float panorama:** `tools/make_panorama.py <front> pano/europa.jpg --front-equirect --back <back painting> --overlap 320` puts the front painting on the front 180° and the
  new painting on the back 180°, tone-matched, joined at ±90° by min-cost seams with a 40 px feather and colour ramps, with soft pole fades. Capped at **4096×2048**
  (`prepare_art.py` now caps `pano/europa` there: 7168 px would be ~115 MB of GPU memory).
- **1. Headlights:** cone 34° → 19° with the penumbra from 74 % (crisper, still soft), near fill 0.45 → 0.07, ambient 0.20 → 0.05, colour near-white `[1, .97, .91]`.
  The in-water beam is now 3 taps along the view ray (3/7/13 m), a visible shaft. **Ice** is clear: neutral near-white body, mostly transparent, fresnel rim, frost
  detail, fake-refraction internal streaks and a sharp glint. Beams light it with their own near-white colour, with no blue from the beams or the ambient (`ICE_CLEAR`).
- **2. Backdrop life (`BACKDROP_ANIM`, `BACKDROP_AUDIO`):** inside the existing 3 layers, so no extra draws: slow in-plane drift per layer (far 0.12 m, mid 0.32, fore 0.55 m; parallax),
  water shimmer and a caustic ripple on lit areas, slow breathing of bright features (energy-reactive, × CALM), and procedural marine-snow motes in the fore layer.
  Per-chamber `BACKDROP_GAIN` evens out the new paintings, and the painted-vein glow now scales with it.
- **3. Jelly seam:** it was `01-jelly-drifter` (side chamber spot); its loop point jumped 2.96× the median frame step. It is rebuilt from the original render with
  `tools/make_loops.py pingpong-eased` (cosine speed ramps at both turnarounds, sub-frame blends, an exact wrap): wrap step 0.42× median. Metrics: `tools/loop_metrics.py`.
- **4. Plume:** `03-amber-vent-plume` is now a true forward loop (`make_loops.py crossfade`, 20-frame smootherstep dissolve, 5.1 s). Revisited-frame score 0.016
  (ping-pong ≈ 0.98), wrap 1.39× median.
- **5. Vents:** 17 chimneys (14 in the vents chamber on both sides, the left row in front of the painting, plus 3 lone corridor vents), all with glowing mouths.
  14 plume planes stand on the mouths, all fed by ONE decoding video, with varied height, mirror, crop and tilt, facing the sub (yaw only).
- **7. Rays:** 3 extra gliding rays (same 05 video) on slow circuits in the three chambers, plus **one big ray (9 m)**, once per lap in the cathedral. Its pose follows the sub's
  progress through a 30 m stretch: it comes from ~28 m ahead, high and left, dips ~3 m as it drifts diagonally over the window, and leaves behind on the right.
  Closest approach is 7.0 m (the plane faces the cockpit, so its nearest point is its centre). Relative speed is ~0.37 m/s, with a slow bank and no motion toward the face.
  Video budget: each loop counts the nearest of ALL the planes it feeds, and at most 3 decode anywhere on the lap (verified).
- **6. Music:** a multi-file pick becomes the queue, and picking again appends (placeholders get replaced). The panel has prev · play · next · shuffle · volume and shows *Track n of N*.
  Tracks auto-advance at the end, and a full pass of unplayable files stops instead of looping. The picker filter is lenient (Quest can report empty MIME types).
  **+ Add** on the in-VR panel ends the session (a picker can't open inside immersive mode) and highlights the page's music button; on desktop it opens the picker directly.
  **Bug fixed:** on XR session end the music pauses and the AudioContext suspends; Enter VR or the play button resumes. Thumbstick left/right = prev/next; P/N keys.
- **8. Deep black:** headlights mode now has wall glow 0.05, shadow lift 0.008, fog teal 0.015, vein glow 1.5 (HMD), dimmer floor caustics and procedural veins, and backdrops at 0.42.
  The cave outside the beams is black with faint veins. Glow mode is unchanged.
- **Roadmap (not this build):** a rounder sub hull and a ship's computer panel.
- **Budget:** in the same headless SwiftShader harness, the ride is ~8 % slower than the previous build (137 vs 127 ms/frame; float/ride ratio 1.47 vs 1.31, so the old "ride ≤ 1.25× float"
  check still fails, as before). Quest timing is unmeasured, and it was at 13.8 / 13.9 ms. If it goes over, cut these first: `PLUME_PLANES` (14 → 6), `BACKDROP_ANIM` 0, `BEAM_OPACITY` 0, `EXTRA_RAYS` 0.

## Headset test #6 fixes (Oct 18 2026, evening)
- **1. Roof skylight:** it read as a flat, static, saturated cyan plate. `uTime` was updating; the cause was the shader itself: a base colour of
  (0.35, 0.85, 1.0) that the soft clip squashed together with the caustics into one cyan level, caustic cells ~2 m wide on the sheet (one blurry
  blob in the 0.26 m hole) drifting at ~0.06 m/s, so only a 15 % global breathing was visible. New shader (`createCockpit`, still 1 draw, unlit):
  deep-black base, three parallax layers (rippling ice underside at 0.35 m that refracts what is behind it + drifting motes; a sharp animated caustic
  web at 2.2 m; a soft wide glow with slowly sweeping light shafts at 7 m) plus a dark shape gliding across every ~70 s, and a dark rim.
  Mean ~29/255, caustic cores ~70-180/255 (was a flat ~175/255). Knob: `SKYLIGHT_GAIN`. Check: `verify_t6.py` (animated between t and t+2 s, contrast, not black).
- **2a. Plumes on their chimneys:** the plume fire base is at u 0.494 / v 0.015 of `03`, but the crop was centred on u 0.46 (with jitter, flipped by the
  mirrored copies), the tilt pivoted about the plane centre, and the generic feather faded out the bottom 20 % (the whole fire base), so plumes floated
  ~1 m above and beside the mouths. The crop is now centred on the plume axis, the plane pivots at its bottom centre (yaw billboard, lean about the base),
  and the base sits 0.015 h + 8 cm below the mouth centre. The plume feather (`uPlume`) narrows toward the base and does not fade the bottom.
  **Also:** 7 of the 17 chimneys stood partly or wholly behind the tunnel rock (corridor radius 12 m, outcrops), so their plumes came out of a wall.
  `fitVents()` moves each vent (inward / along the path / other side) until stack, mouth and line of sight are inside the real tunnel cross-section,
  stands it on the actual bed, and keeps the stacks apart. All 17 are now in the open (ray-cast check), and clearance is still ≥ 5.9 m (props 7.5 m, plumes 7.6 m).
- **2b. Plumes fire from distance:** the plume video lost its decode slot to nearer loops and only started (then took ~4 s to fade in) when you got close.
  `PLUME_ALWAYS_DECODE` keeps ONE slot for it all lap (it feeds all 14 plume planes), so the plumes are already animating when you see them from 45+ m.
  The other loops share the other 2 slots (nearest first); a loop that is paused now fades out instead of freezing on a still frame. Still ≤ 3 decodes (verified over the lap).
- **2c. Rock chimneys:** a lathe profile (flared foot, tapering stack, raised lip, an inner throat), noise-displaced, standing on a wide low rocky mound;
  shaded as dark basalt from `tex/rock.jpg` (desaturated, no cyan veins) with amber lava cracks that strengthen toward the glowing mouth. The cones in the
  vents chamber are basalt too. Still one merged rock mesh (1 draw call); ~21k extra vertices. `VENT_ROCK: 0` restores the old blue cones.
- **3. Scott's video:** not integrated (see the report: the attachment was not reachable from the box, and the parent's frame analysis says it is a 5 s
  forward camera push with a baked-in window frame for the first ~3 s, no seamless loop and vection risk). A locked-off camera re-render is needed.
- Screenshots: `screens/90-vents-distance.png`, `91-vents-mid.png`, `92-vents-close.png`, `93-vents-chimney-zoom.png`, `94-cockpit.png`,
  `95-skylight-xr-sim.png` (+ `-t2`, 2 s later), `96-skylight-closeup.png` (+ `-t2`).

## Headset test #7 fixes (Oct 18 2026, night)

- **Darker caverns, no photo planes.** Jelly hall and pillars/ice-cathedral backdrops (`BACKDROP_DARK` 1): the smooth water/haze fill of the
  painting is crushed to ~1/9 of its light; only fine bright detail (cyan rims, veins, jellies, pillar edges: luma above its own blurred mip) and
  the brightest spots keep their light. A radial vignette into black (colour *and* coverage, `BACKDROP_VIGNETTE`) dissolves every layer into the
  dark tunnel, so no rectangle edge is left; rims survive the vignette, the fill does not. The fog veil over dark backdrops is darker too.
  Slow drift/shimmer/caustics/motes unchanged (motes dimmer). Lava-vent cavern (`BACKDROP_DARK` 0): painting as before, vignette 0.85.
  Same shader, same texture fetches, no extra draws.
- **Skylight = moving ice/water surface, see-through.** Frost from the already-loaded ice texture (two drifting samples, near/deep parallax),
  ripple warp, caustic web and far glow; all motion slowed into the backdrop speed family (ripple 0.11 rad/s, drift ~0.026 m/s, caustic 0.16
  rad/s). The disc is now translucent (premultiplied blend): ~50 % of the world above shows through (`SKYLIGHT_CLEAR`).
- **Big manta overhead.** Second big-ray pass, once per lap in the jelly hall (`BIG_RAY_OVERHEAD`): comes from ~24 m ahead high up, glides
  straight over the sub (centre 9.0 m above the eye = 8.05 m above the cockpit roof, ~5-6 m below the hall roof), slows while overhead (~29 s
  within 20 deg of the zenith at cruise) and leaves behind. Over the sub it lies flat, belly down, head along its travel (no billboard flip).
  Slow wing flex in the vertex shader (`BIG_RAY_FLEX`, 0.5 m at the tips; counted in the clearance check). While it is overhead the ice's own
  glow steps back (`SKYLIGHT_PART`) so its outline reads. The cathedral side pass is kept. During a pass the ray video gets decode priority
  (still <= 3 decodes; a jelly-hall loop pauses/fades for those ~2 min).
- **New creature art:** not done - the four images were never on the box (checked at start and after the other items).
- Checks: `tools/verify_t7.py` (also run by `verify.py`), screenshots 100-108.

## Headset test #8 (Oct 18 2026, late night)

- **Art mapping** (originals kept in `art-src/new-t8/`):
  - `fish1.jpg` = (a) sail-finned glowing glass fish. It swims near the lava vents, at about 0.44 of the lap, on the inner side of the curve.
  - `fish3.png` = (b) angler-jelly with a lure orb. It swims in the dark corridor between the vents and the pillars, at about 0.665 of the lap (`ANGLER_S`).
  - `fish4.jpg` = (d) veil creature. It swims in the jelly hall.
  - `rockyfloor-tex.jpg` = (c) crystal spires with cyan veins and a light shaft. It is not a floor texture, so the floors are unchanged.
    It replaces the pillars/ice-cathedral backdrop (`tex/chamber-pillars`, ETC1S 4096 + 3072 JPEG) and gets the test-#7 dark treatment and
    vignette. The old pair is backed up in `art-src/old-t7/`.
- **Creatures** (`tools/prepare_creatures.py`):
  - **Matte.** Each image is cropped inside its porthole. A luminance key against the local background (grey-opening, blurred) mattes out
    the frame and the water. A feathered hull mask means no rectangle or porthole edge shows.
  - **Atlas.** One additive atlas holds all three: `tex/creatures.ktx2` (UASTC + zstd, 3072x1536, about 1.5K per animal) plus a
    `tex/creatures.jpg` fallback at 2048.
  - **Draw calls.** Everything is one mesh and one draw call: the three animals, plus a second, dimmer card 0.3 m behind each one for depth,
    plus the lure orb.
  - **Motion.**
    - Each card is gently curved.
    - The shader sways each animal: the fish body waves toward the tail and its fins flutter; the angler's tentacles sway and its stalk bobs;
      waves roll down the veil.
    - Each animal drifts slowly on a loop (0.05-0.14 m/s, turns of 3 deg/s or less). It always stays at least 6 m from the cockpit; the
      clearance check includes the sway envelope.
    - The fish and the angler face along their own path. The veil turns slowly toward the viewer about the vertical axis only, so nothing spins.
  - **Lure orb.** The angler's orb is an emissive cyan core plus halo. It pulses gently (about 5 s) and swells with the music energy (`ANGLER_ORB`).
  - **Fade-in.** The animals fade in within about 70 m, and each one is in front of the sub for 50-60 s per lap.
- **Skylight 2x.**
  - Radius 0.26 -> 0.52 m (`SKYLIGHT_R`), with a wider frame/rim. The moving ice and the see-through treatment are unchanged.
  - The 9 m overhead manta now fits about 90 % inside the skylight cone at the top of its pass. Its glow is raised while it is overhead
    (`BIG_RAY_OVERHEAD_GAIN` 1.6), and the ice steps back (`SKYLIGHT_PART`) as before.
- **New knobs:** `SKYLIGHT_R`, `BIG_RAY_OVERHEAD_GAIN`, `CREATURES_ON`, `CREATURES` (per-animal on/off [fish, angler, veil]),
  `CREATURE_GAIN`, `CREATURE_SWAY`, `ANGLER_ORB`, `ANGLER_S`.
- **Checks:** `tools/verify_t8.py` (also run by `verify.py`).
- **Screenshots 110-118:** creatures in situ, the 2x skylight with the manta (single shot and pass sequence), the pillars backdrop, and creature close-ups.

## Headset test #10b (Oct 19 2026, evening): creatures swim in VR again + ice-blue cave rock

- **"Dead" creatures: the root cause.** Every swimming video (the overhead manta, the gliding rays, the jelly loops and the vent plumes)
  depends on three.js's `VideoTexture`. It only uploads a new frame from `requestVideoFrameCallback`, and inside an immersive WebXR session
  the Quest browser stops calling it. So each texture froze on the frame that was showing when you entered VR, while the planes kept
  moving: things floated without swimming.
  - The t8 and t10 code for this is identical, and the t8 backup matches the t8 zip byte for byte. The t10 backdrop/slot changes were not
    involved. The bug is the same in both builds, so t8 most likely just happened not to trigger it.
- **The fix** (`app/main.js`, `core/media.js`):
  - `pumpVideoTextures()` runs every XR frame and flags a video texture for upload whenever its `currentTime` has moved.
  - A wanted video that the browser paused on its own is resumed.
  - A stalled or blocked `play()` is retried after 4 s instead of hiding that loop for good. Only a media error is permanent.
  - The Enter VR / Preview click starts every loop once, so later `play()` calls are allowed.
  - "Ready" is also detected from `timeupdate`, not just from `requestVideoFrameCallback`.
- **Cave rock v2** (Scott: "flat matte grey-teal cutouts, the same with the lights on or off").
  - **Cause:** the fog colour was filling the rock in.
  - **Lighting:** the rock is near-black when unlit, and fog only darkens it. Lit, it is icy blue with per-pixel form: faceted normals with a
    bevel grain, N.L from both lamps, a translucent wrap glow, a frosty specular and a fresnel rim, all scaled by how much headlight
    reaches the pixel.
  - **Shapes:** slim tapered and kinked columns with a waist, irregular kinked stalactites, thin bent spires, and broken angular rock
    chunks in place of the round blobs.
  - **Cost:** still 1 draw call, about 7.6k triangles.
- **Screenshots 150-158:** one triple per area (jelly hall, former pillars, dark corridor).
  - The first image of each is a before (t10a) / after (t10b) grid, headlights on and off.
  - The other two are XR-sim views of t10b with the headlights on and off.

## Headset test #10 (Oct 19 2026), built from test #8 (none of the test #9 changes)

- **Why.** In the headset the painted cave backdrops looked pixelated and fake. Everything else in t8 stays as it was.
- **Backdrops removed.** The jelly-hall (`tex/chamber-jelly`) and pillars/crystal-spires (`tex/chamber-pillars`) paintings are gone from the
  manifest and the build. Their originals are kept in `art-src/old-t8-backdrops/`, which is not in the deploy zip. **The lava-vent backdrop
  (`tex/chamber-vents`), the vents, the plumes and the lava cave are unchanged.** `main.js` now slots each chamber by file name
  (jelly / vent / pillar), so a manifest that lists only the vents painting still puts it in slot 1. `tools/scan_assets.py` keeps working.
  The float-mode panorama (`pano/europa`) is unchanged; the ride never shows it.
- **Procedural cave rock** (`buildCaveRock()` in `app/ride.js`). It is one merged, flat-faceted mesh: 1 draw call and about 4.8k triangles.
  - **Jelly hall:** 6 floor-to-roof columns, 6 boulders and buttresses, 4 stalactites.
  - **Pillars cave:** 6 columns, 5 basalt spires rising through the cathedral floor, 2 buttresses, 2 stalactites.
  - **Dark corridor:** 3 low buttresses and 2 stalactites.
  - **The tunnel wall** on the former backdrop side of the jelly and pillars chambers gets its full rocky relief back. Only the vents
    chamber keeps that side smooth.
- **Material.** Black basalt with flecks of ice:
  - Near-zero ambient. The rock shows only where the sub's headlight cones hit it, and the lamp term is soft-capped so a close lamp never
    blooms into a pale slab.
  - A fine procedural grain perturbs the normal, which gives sharp detail in the beam.
  - The rock gets less beam haze than the tunnel does, plus a trace of the tunnel's own dim teal glow, so it never reads as a hole cut in
    the wall.
  - The jelly hall alone gets a very faint cyan silhouette rim (`CAVE_RIM`). Floors are untouched and no new floor slabs were added.
- **Comfort.** Each formation is pushed outward until every vertex is at least 6.6 m from the path (measured minimum: about 8 m). Nothing moves,
  and the ride's speed, yaw-only motion, and the absence of pitch, roll and bob are all unchanged.
- **Performance.** The new rock adds 1 draw call and about 4.8k triangles. Video decodes are unchanged (MAX_LOOP_VIDEOS / `PLUME_ALWAYS_DECODE`).
  The zip shrinks by about 4.5 MB.
- **New knobs:** `CAVE_ROCK` (0 = off), `CAVE_ROCK_GAIN` (how strongly the beams reveal the rock), `CAVE_RIM`.
- **Checks:** `tools/verify_t10.py`, adapted from `verify_t8.py`, with the cave checks in `tools/verify_t10_caves.py`. `verify.py` now calls it
  in place of the t8 suite.
  - Set `EV_URL`, and optionally `EV_T8_URL` pointing at a server on the t8 source, to get the lava-cave t10-vs-t8 diff.
  - The legacy suites that look up the removed backdrops report a FAIL instead of aborting the run.
- **Screenshots 130-147:**
  - 130-137: desktop and XR-sim views of the jelly hall, the former pillars cave, the dark corridor and the lava-vent cave.
  - 138: the lava cave, t10 vs t8.
  - 139: the cave rock rendered alone.
  - 140-145: creatures.
  - 146-147: the skylight manta.

## Deploy (Netlify Drop)
1. Go to https://app.netlify.com/drop.
2. Drag `europa-vr-netlify.zip` onto the page, or drag the unzipped folder.
3. Netlify gives you an HTTPS URL. WebXR needs HTTPS.

## Use it on Quest 3
- Open the URL in the Meta Quest Browser.
- Pick music: **Choose music files…** (your own audio, several files at once; nothing is uploaded), or **Use placeholder tracks**.
- Press **Enter VR**, then stay still and look around. There is no locomotion.
- The music panel floats front-left. It is fixed in place as a steady visual anchor.
  - Point at a button and pull the trigger, or pinch with hand tracking, or poke it with a fingertip.
  - **A / X** plays or pauses. **Thumbstick right** skips to the next track.

### Desktop preview (testing)
- Use **Preview on desktop**, or open `index.html?desktop`.
- Controls: drag to look, wheel to zoom, **Space** play/pause, **N** next track, **L** sub headlights on/off, **D** debug overlay (beat/bass/energy/mood/centroid/bpm/swim speed/ripples/fps), **Esc** back to the menu.
- **I** toggles the stats panel, the same one you get in VR.
- URL params: `?debug`, `?stats`, `yaw=`, `pitch=` (radians), `fov=`, `snow=` (particle count), `speed=slow|veryslow|drift|<m/s>` (ride speed; numbers snap the toggle to the nearest preset, capped at 0.5), `hmd=0` (preview without the HMD grade), `grade=hmd` (force the headset grade on desktop, for screenshots), `lights=1|0` (sub headlights / old all-glow look), `ktx2=0` (ignore .ktx2 stills, use the JPEGs).

### In-headset stats panel
There are two ways to show it:
- Point at the small round **i** button just below and to the right of the music panel, then pull the trigger, pinch, or poke it.
- Or hold down the **left thumbstick** (click it in) for 1 second.

A small panel appears below the music panel. It updates twice a second with:
- fps and the target rate (72)
- average and maximum frame time in ms
- beat, bass, mood and bpm
- the number of active videos
- the music panel's texture-upload count

Do the same again to hide it.

## What's inside
```
index.html            entry page (music picker, Enter VR, desktop preview), importmap
app/main.js           wiring: world, music, analysis -> visuals, input, entry page, test hooks (window.__ev)
app/analysis.js       AudioAnalysis: Web Audio AnalyserNode -> beat / bass / energy / centroid / mood / bpm / swim speed
app/ride.js           submarine ride: path, tunnel, cockpit, ride controller, ride-world placement, clearance check
app/config.js         comfort/perf constants (grade, headlights, stills)
app/textures.js       hi-res stills loader: JPEG/WebP, optional KTX2 (Basis -> ASTC/BC7) with JPEG fallback
app/scene.js          procedural world: cavern vein shader, marine snow, light shafts, jellyfish, amber vents, video-loop planes
core/                 shared XR core (createXRApp, panels, input, media/VideoManager, MusicPlayer) — see core/README.md
vendor/               three.js r160; vendor/three-examples/ = KTX2Loader + Basis transcoder (wasm) from three r160, loaded only if .ktx2 stills exist
assets/music/         2 PLACEHOLDER tracks (procedural): under-the-ice.mp3 (mellow pad, 72 s), vent-pulse.mp3 (84 BPM pulse, 91 s)
art-manifest.json     which optional art files exist (see below); manifest.json is reserved for a future PWA manifest
pano/ loops/ tex/     art drop-in folders (empty for now)
tools/                make_music.py, scan_assets.py, cap_video.sh, verify.py,
                      make_panorama.py (16:9 art -> seamless 4096x2048), make_walls_tile.py (photo -> 1024² seamless tile), make_snow_sprite.py
```

## The world (style-bible rules)
- **Cavern.** An inverted, gently displaced sphere, about 32 m across. It has a lakebed about 7 m below and an ice ceiling with a faint glow.
- **Veins.** Procedural cyan veins cover the walls. Caustic shimmer plays on the floor and ceiling, and the walls fade toward abyssal blue for depth. Nothing is ever pure black.
- **Particles and light.** About 1,400 marine-snow points drift slowly downward. All of the drift happens on the GPU, and the particles fade out within 1.6 m of your eyes. Five soft additive light shafts sway from the ice.
- **Water bob.** The snow and shafts bob very gently (3.5 cm). The cavern and the music panel never move.
- **Jellyfish.** Six translucent jellyfish pulse and glide on slow orbits 6–16 m away. They never come within 6 m of you, so they are well outside the 3 m limit. One has a warm amber eye-shine.
- **Amber accents.** Two distant amber vent glows breathe slowly.
- **Lighting.** Float mode: no sun and no lights; everything is emissive. Ride mode: the sub's two headlights carve the rock out of the dark (see **Sub headlights**); the veins stay bioluminescent. The world "breathes" on a 7.5 s cycle even with no audio.

## Audio-reactive hooks (app/analysis.js → app/main.js)
| Signal | How it's computed | What it drives |
|---|---|---|
| `beat` (0–1 envelope) + `beats` count | Onsets in the kick band (30–150 Hz): positive spectral flux above 1.8× its 1 s running average. 280 ms refractory, decays at about 4.5/s. | Vein brightness on the walls (`uBeat`), plus a slight lift in the light shafts. |
| `bass` (0–1) | Smoothed low-band level (τ 0.15 s). | Overall vein glow. Each beat with bass above 0.25 sends a slow light-ripple ring across the walls, at most one every 1.3 s, with 4 rings alive at once. |
| `mood` (0–1) | Spectral centroid (500–2000 Hz → 0–1, weight 0.65) plus overall energy (weight 0.35), smoothed over about 3 s. | Palette temperature: mellow tracks lean deep blue, bright or energetic ones lean cyan. This applies to the veins, ripples, shafts and jellyfish. |
| `bpm` → `speed` | Median of the last 8 beat intervals (0.33–1.5 s). Speed = bpm/90, clamped to 0.75–1.3 and smoothed over 3 s. | Jellyfish swim speed. It is never frantic. |

The visuals never freeze. The frame loop doesn't depend on audio at all. When audio pauses, drops or fails, every signal eases back to idle: beat to 0, bass to 0, mood to 0.3 (deep blue), speed to 1. The world keeps breathing.

## Art drop-ins
1. Put the files in the folders below.
2. Run `python3 tools/scan_assets.py`. It rewrites `art-manifest.json`, which you can also edit by hand.
3. Re-zip.

The app only loads what the manifest lists, so missing art never causes 404s. If an asset fails to load, the procedural version is kept.

| File | Spec | Used for |
|---|---|---|
| `pano/europa.jpg` | 4096×2048 equirectangular JPG (up to 8192×4096 accepted), q90-92. Front (u = 0.5) faces forward, and the horizon sits at the image's vertical middle. | Replaces the procedural base colour of the cavern walls, floor and ceiling. The veins, ripples, caustics and vents are still drawn on top, so paint it fairly dark with no strong light sources of its own. |
| `tex/walls.jpg` | 1024² to 2048² seamless, tileable rock or ice detail, mid-grey average. | Multiplied into the walls as detail (tiled 8× around, 4× vertically). |
| `tex/snow.png` | 64×64 PNG with alpha, a soft speck or flake. | Marine-snow particle sprite. |
| `loops/*.mp4` (up to 4, alphabetical) | **Portrait**, about 720×1280 (any portrait aspect is fine), H.264 with faststart and no audio, about 6 s clean seamless loop, ≤ 2 MB each. Use a black background: the loops are blended additively, so black becomes transparent. Run `tools/cap_video.sh (in the source zip, not the deploy zip)` on each one. | Soft-edged planes sized from each clip's real aspect: portrait clips are about 8 m tall (720×1280 gives 4.5 × 8 m), with no distortion. Landscape clips also work (width capped at 12 m). Placed 16–20 m away (for distant swimmers, glowing schools, vent plumes). |

## TODO
- Roadmap: rounder sub hull; ship's computer panel (art director's horizon items, not in the Oct 18 build).
- **Plex:** stream from a Plex server through a CORS proxy later. The analyser needs CORS-clean audio, so a proxy must add `Access-Control-Allow-Origin`.
- Replace the placeholder music with the real soundtrack.

## Verify
```
python3 -m http.server 8770 --bind 127.0.0.1 &
python3 tools/verify.py
```
Sub headlights + KTX2 only (faster): `python3 tools/verify_ride.py [--headlights|--ktx2]`. The headlights test does a pixel test (same view with the lights on vs off: lit rock must be ≥ 1.4× the unlit wall's median luma) and checks the uniform-only glow/headlights switch, `?lights=0`, the dashboard pill and the desktop knobs. It writes `screens/70-headlights-tunnel.png`, `71-headlights-cathedral.png`, `72-headlights-vents.png`, `73-glow-mode-compare.png` (all `?grade=hmd`) and `74-desktop-headlights.png`. The KTX2 test needs `toktx` or `basisu` (otherwise it is skipped and reported) and cleans up after itself.

`verify.py` checks the entry page, beat count, bass variation, tempo, ripples, the mood difference between the two tracks, that animation continues while paused and signals decay to idle, the jellyfish distance limit, the panel click, the D and Space keys, and that the console is clean. It also writes the screenshots in `screens/`.

## Art pipeline notes (first pass)
- **Panorama:** built with `python3 tools/make_panorama.py <src.jpg> pano/europa.jpg`. It uses the same approach as zippy-vr:
  - The front 180° is the painting, centred straight ahead.
  - The back 180° is a slightly widened copy, not mirrored. It is joined to the front by min-cost seams through the rock masses.
  - The ceiling and floor fade softly to dark abyssal blue.
- **Loops:** the art came in as 1280×720 landscape, 6.04 s, with AAC audio. I trimmed each one to a 5.5 s loop with a 0.5 s crossfade so the first and last frames match, removed the audio, and encoded it as H.264 with faststart. The loop shader crushes near-black below 3.5% (`uKey`) so compression noise doesn't show a rectangle.
- **Snow:** the source JPG had a fake checkerboard baked in and a clipped white core, so `tools/make_snow_sprite.py` recreates the speck with real alpha, using colours sampled from the source.

## Comfort and performance settings (`app/config.js`)
Settings: `CALM` (scales every audio reaction), `BEAT_FLASH`, `RIPPLES` on/off, `RIPPLE_INTENSITY/SPEED/LIFE/WIDTH/MIN_INTERVAL`, `CAUSTIC_SPEED`, `SNOW_COUNT` (700), `MAX_LOOP_VIDEOS` (3), `TARGET_FPS` (72).

**Headset sharpness (Oct 14 headset test: "soft")**

| Setting | Now | Was | Notes |
|---|---|---|---|
| `FOVEATION_RIDE` | 0.2 | 0.7 | Ride mode. The dashboard panels sit low in the periphery, where foveation smears most. Try 0 if the stats panel still shows 72 fps. |
| `FOVEATION` | 0.5 | 0.7 | Float mode. Applied per mode via `renderer.xr.setFoveation`. |
| `FRAMEBUFFER_SCALE` | 1.2 | 1.0 | Clamped to ≥ 1.0 in `main.js`. 1.2 = 1.44× the pixels: the main GPU cost of these changes. Drop to 1.0 first if fps dips below 72. |
| `PANEL_SUPERSAMPLE` | 2 | 1 | Music, speed, **i** and stats canvases are drawn at 2× texel density (music panel 1736×1120 instead of 868×560), mipmapped (LinearMipmapLinear) and anisotropic. Uploads stay rate-limited. |
| `TEX_ANISOTROPY` | 8 | 4 (tunnel), 1 (backdrops) | Tunnel rock, backdrops, dashboard face. Clamped to the GPU max. |

Trade-offs at 72 fps: lower foveation plus 1.2× scale means roughly 1.5–1.8× the fragment work at the edges of the view, and the tunnel shader covers most of the screen. The headset had headroom at 71-72 fps, but this has not been measured on a Quest yet. If it drops below 72, set `FRAMEBUFFER_SCALE` back to 1.0 first (biggest win), then `FOVEATION_RIDE` to 0.35. Supersampled panels and anisotropy cost little: a few MB of VRAM, and uploads happen only on change.

**HMD grade (Quest lenses crush blacks).** This is done in the shaders, so the art files stay untouched and the grade is repeatable. It applies to the tunnel, all backdrop layers and the rock props.
- `HMD_BRIGHTNESS` (1.0 stop exposure lift).
- `HMD_SHADOW_LIFT` (0.035 floor).
- `HMD_CONTRAST` (1.18).
- `VEIN_GLOW` (1.6): emissive gain on a vein mask taken from the texture's cyan, saturated pixels, so the veins glow and partly punch through fog.
- `FOG_DENSITY` (0.026, was 0.038).
- `FOG_LIFT` (fog colour = abyss × 1.6).

Use `?hmd=0` to compare against the old look.

Anti-judder rules the engine follows:
- **Nothing moves the camera, the reference space or `world` per frame.** The water bob moves only the particle and light-shaft group.
- **Panel redraws are debounced and rate-limited.** See `core/panels.js`.
- **No per-frame allocations in the render loop.**
- **Video textures upload only on new frames** (`requestVideoFrameCallback`).
- **Shaders are precompiled** at start and again after art loads.

## Sub headlights (Oct 2026, `LIGHTING_MODE`)
Art direction: local light carving detail out of darkness, not global brightening. Two forward headlight cones come from the sub's nose
(lamps 0.9 m either side, 0.65 m below eye level). Each is angled 12° outward and 6° down, with a soft 34° cone. They fall off smoothly to zero
at 30 m, and a faint wide near fill keeps the rock right outside the window from going to void. They are **analytic terms in the custom shaders**,
not three.js SpotLights or shadow maps:
- **Per pixel:** cone attenuation × N·L with the interpolated displaced-geometry normals, so rock relief, outcrops, boulders, stalagmites, ice spires and the cathedral floor catch the light as you pass.
- **Per vertex:** the lamp-to-surface vectors (affine, so interpolation is exact), the distance falloff and range window, the near fill and the beam haze. These are smooth over a triangle.
- Lamp positions and directions are uniforms refreshed each frame from the cockpit's world matrix. The lamps are bolted to the sub, so they move with the ride and never flicker. Nothing in the lighting is time-varying or audio-reactive; all audio reactions are unchanged.
- **Applied to:** the tunnel, cathedral floor, rock props and vent chimneys (two-sided |N·L|). The translucent ice gets a wrap term plus a soft glint and turns more opaque where lit. The backdrop paintings get a light touch (35 %). Marine-snow flakes inside the cones light up (per vertex, ~free), which sells the beams in the water.
- **Beam haze:** an analytic in-scatter term along the view ray, with no extra geometry and no overdraw. Because the eye sits ~1.5 m behind the lamps, the cone factor is taken at a point 7 m down the ray, and the falloff integral is k·atan(D/k). The haze is subtle and soft-edged.

**Modes:** `LIGHTING_MODE: 'headlights'` (default) or `'glow'` (the previous all-emissive look, pixel-identical apart from animation). You can also use `?lights=1|0`,
the **LIGHTS ON/OFF** pill on the dashboard (left of the **i** button, clear of the sonar) or the **L** key on desktop. Switching only changes shared uniforms:
nothing recompiles and there's no hitch. In headlights mode, the ambient (the old fake eye headlamp) and the dim-teal wall glow drop a lot, and the fog is a darker blue.
The cyan veins keep their full glow, and a low floor (shadow lift + wall glow + fog) stays in place so the Quest never crushes to a void.
The backdrop paintings stay at 90 %, so they read as distant glowing chambers.

| Knob (`app/config.js`) | HMD | Desktop | Notes |
|---|---|---|---|
| `HEADLIGHT_INTENSITY` | 6.5 | 5.5 | Spot gain on the rock albedo, before the grade. First knob if it's too dark or too bright. |
| `HEADLIGHT_RANGE` | 30 m | (shared) | Soft window to zero; 1/(1+d²/15²) falloff before that. |
| `HEADLIGHT_ANGLE` | 34° | (shared) | Outer half-angle; the penumbra starts at 60 % of it. `HEADLIGHT_TOE_OUT` 12°, `HEADLIGHT_TILT_DOWN` 6°. |
| `HEADLIGHT_FILL` | 0.45 | 0.40 | Wide near fill (about 10 m). |
| `BEAM_OPACITY` | 0.14 | 0.12 | Beam haze in the water; 0 = off. |
| `AMBIENT_IN_HEADLIGHTS` | 0.20 | 0.18 | Glow mode = 1. |
| `WALL_GLOW_IN_HEADLIGHTS` | 0.30 | 0.14 | Glow mode: `HMD_WALL_GLOW` 1.25 / `DESKTOP_WALL_GLOW` 0.6. |
| `SHADOW_LIFT_IN_HEADLIGHTS` | 0.035 | 0.015 | Glow mode 0.07 / 0.035. |
| `FOG_TEAL_IN_HEADLIGHTS`, `FOG_LIFT_IN_HEADLIGHTS` | 0.10, 1.15 | (shared) | Glow mode 0.55, 1.6. |
| `BACKDROP_IN_HEADLIGHTS` | 0.9 | (shared) | Painting gain. |

Vein glow (`HMD_VEIN_GLOW` 4.0 / `DESKTOP_VEIN_GLOW` 2.2), exposure, contrast and the soft-clip knee are unchanged.

**GPU cost (estimate, not yet measured on a Quest).** Per pixel on the tunnel, floor and props: 2 normalizes, 2 cone smoothsteps and 2 N·L, about 25-30 ALU ops.
That is roughly +10-15 % of the tunnel fragment shader. Per vertex, about 60 ops (negligible at this vertex count). There's no extra geometry or overdraw:
the haze is folded into the existing passes, and snow lighting is per vertex. Headless SwiftShader measures **+2.6 %** whole-frame render time, headlights vs glow, in the tunnel view.
The first per-pixel-only version measured +11 %, which is why the smooth terms moved to the vertex shader. Expect roughly **+0.2-0.5 ms** on the Quest.
At the last measured 13.8 ms against a 13.9 ms budget, **that may go over budget**. Check the in-headset stats panel. Fallbacks, cheapest first:
1. `FOVEATION_RIDE` 0.1 → 0.25. The periphery is now mostly dark, so foveation is much less visible than in the old glowing look. This is the biggest win.
2. `BEAM_OPACITY: 0` (small saving).
3. `LIGHTING_MODE: 'glow'` or `?lights=0`: the old look at the old cost. The uniform branch skips all the light maths; only ~10 extra varyings remain.
4. KTX2 stills (below) cut texture bandwidth.

## Submarine ride (`app/ride.js`)
**Path and tunnel**
- The path is a closed CatmullRom loop of about 153 m, at eye height with ±1.4 m of gentle rise. At the default 0.25 m/s a lap takes about 614 s (10.2 min), and the ride never ends.
- The tunnel is real 3D rock built around the path:
  - 12 m radius in the corridors, swelling to about 18.5 m in three chambers.
  - The walls are displaced inward by 3D fbm noise: sparse, chunky outcrops of up to about 3 m, plus fine roughness. Outcrops are reduced in the chambers, and on the backdrop side most of all, so the paintings stay visible.
  - Radius is hard-clamped to ≥ 7 m. Normals are smoothed over the whole grid, and the shader adds headlamp and top-light shading so the relief and parallax read.
  - A bumpy lakebed 6.9 m below (was 5.5 m).
  - Split into chunks for frustum culling (56 radial × 0.65 m rings).
- The walls use the vein, beat, bass, ripple and caustic shader, plus `tex/tunnel.jpg` (UV-mapped), the HMD grade, the emissive vein mask and depth fog.

**Layered chamber backdrops (depth).** Each painting is split into 3 planes on the ray from the approach viewpoint (14 m before the chamber). Each plane is scaled by its distance, so from that viewpoint they line up as the original painting. As you glide past, they slide against each other:
- **far:** the whole painting on a curved plane (edges curl toward the sub), about 20 m away.
- **mid:** only the lit features (luminance mask), at 0.9 of that distance.
- **fore:** dark rock silhouettes cut from the painting's dark outer band (a blurred, mip-biased luminance mask plus an edge mask), at 0.8 of that distance.

That makes 9 transparent planes in total; only those in the frustum are drawn.

**3D props (2 draw calls for the whole loop):**
- One merged rock mesh: stalagmites and stalactites in all three chambers, plus five amber vent chimneys with glowing crater mouths in the vents chamber.
- One merged translucent ice mesh: seven twisted floor-to-roof ice columns with fresnel rims and slow internal light bands in the pillars chamber.
- Props use about 7.7k vertices in total.
- There's no panorama in ride mode. A fixed sky-sphere doesn't work when you travel, so fog and walls carry the depth instead.

**What you pass**
- 8 jellyfish, all in the chambers, high up and to the side.
- The 3 video loops, one per chamber, 13 m to the side.
- Light shafts in two chambers.
- An amber vent in the middle chamber.

**Comfort**
- Speed: three presets on the entry page (**Slow** 0.35, **Very slow** 0.25 (default), **Drift** 0.15 m/s), `?speed=`, and a small **Speed** toggle on the dashboard in VR (centre, just below the window line).
  - Every change eases over 12 s (`RIDE_EASE_S`, smootherstep), from the current speed. Speed never jumps.
  - The same 12 s ease applies to start and stop.
  - Lap times: 438 s (Slow), 614 s (Very slow), 1023 s (Drift).
  - Yaw rate scales with speed, because heading is a function of the path position: max 1.13, 0.81 and 0.48 °/s.
- Heading turns only (yaw), smoothed along the path; there is no pitch or roll.
- The world moves past you; the camera and its reference space are never moved.
- The cockpit and dashboard panels are fixed to your seat.
- You have no control over motion.
- The ride speed never follows the music; creature speed can.
- There's an optional comfort vignette, off by default.

**Measured** (`tools/verify_ride.py`)

| Measure | Value |
|---|---|
| Measure (default 0.25 m/s) | Value (was at 0.5 m/s) |
|---|---|
| Lap time | 614 s / 10.2 min (5.1 min) |
| Max yaw rate | 0.81°/s (1.61) |
| Max yaw acceleration | 0.03°/s² (0.06) |
| Lateral acceleration | 0.004 m/s² (0.014) |
| Ease-in/out ramp | 0.039 m/s² (0.117) |
| Vertical speed | 0.032 m/s (0.064) |
| Closest approach over a full lap (≥ 5.9 m required) | backdrop layers 5.97 m, rock walls 6.75 m, shafts 6.44 m, jellies ≥ 6.5 m (worst-case size guard), props 9.6 m |

**Videos:** a loop plays only when its chamber is within 45 m along the path (`RIDE_VIDEO_NEAR_M`). Never more than 3 play at once.

**Settings in `app/config.js`:** `RIDE_SPEEDS` (`{ slow: 0.35, veryslow: 0.25, drift: 0.15 }`), `RIDE_SPEED_DEFAULT` (`'veryslow'`), `RIDE_SPEED` (fallback 0.25), `RIDE_EASE_S` (12), `RIDE_VIDEO_NEAR_M`, `COMFORT_VIGNETTE`.

**URL params:** `?mode=ride|float`, `?speed=slow|veryslow|drift|<m/s>`, `?hmd=0`, `?grade=hmd`, `?lights=1|0`, `?vignette`, `?rides=<metres>` (start position along the loop), `?noride` (desktop preview without motion).

## High-res stills (Oct 2026: stills 2K-4K, loops stay 720p)
Static stills (panoramas, chamber backdrops, large-surface textures) now come in at 2K-4K. There are **no downscale caps** in the tools or the loaders any more
(the old 1536 px chamber cap and 1024 px tile cap are gone). The limits only stop absurd sizes:

| Still | Limit | Format |
|---|---|---|
| `tex/chamber-{jelly,vents,pillars}` backdrops | ≤ 4096 px wide (and high) | JPEG q92 4:4:4 (q90 above 6 MB) or WebP q90 |
| `tex/tunnel`, `tex/walls` tiling textures | ≤ 2048 px (square, seamless) | same |
| `tex/cockpit-dash` | ≤ 2048 px wide | same |
| `pano/europa` equirect (float mode) | 4096×2048 baseline, up to 8192×4096 | same |

At runtime every still is mipmapped (trilinear) with anisotropy 8 (`TEX_ANISOTROPY`, clamped to the GPU max). The only hard cap is the GPU's `maxTextureSize`
(8192 in headless SwiftShader; Quest 3 should be at least that but this was not measured here; three.js downscales anything larger). The float-mode panorama now loads only when float mode is first used, so the ride doesn't hold ~43 MB for it.
The panorama/wall LOD in the float shader reads the real texture size, not a hard-coded 4096. `tex/tunnel-veins.png` scales with the tile: half its size, ≤ 1024.

**How Scott drops in new hi-res chamber images**
1. Crop the painted window frame off (or don't, if the art has none), and keep the full resolution (up to 4096 wide; bigger is downscaled to 4096).
2. Name the file after the chamber it replaces and put it in `tex/`: `chamber-jelly`, `chamber-vents` (amber vents) or `chamber-pillars` (ice cathedral), as `.png`, `.jpg`, `.jpeg`, `.tif` or `.webp`.
   The newest file with that name wins. Same for `tex/tunnel` (must already be seamless), `tex/walls`, `tex/cockpit-dash` and `pano/europa`.
3. Run `python3 tools/prepare_art.py --stills`. Files that are already a `.jpg` within the limits are left byte-for-byte untouched. Anything else is converted to q92 JPEG
   (add `--webp` for WebP), and the original PNG/TIFF is moved to `art-src/` so it stays out of the deploy zip.
   Optional: `--ktx2` (see below), or `--force` to re-encode everything.
4. Run `python3 tools/scan_assets.py` to rewrite `art-manifest.json`.
5. Re-zip. The backdrop planes size themselves from the image aspect ratio, so a different aspect just works. The grade, headlights and fog are applied at runtime and need no re-tuning.

**KTX2 / Basis (Mars's ASTC 4x4 / 5x5 suggestion): optional path added. Recommended once the 4K stills arrive.**
- **Why:** three.js uploads a JPEG as RGBA8 (4 B/texel + 1/3 for mips). One 4096×2061 backdrop is ~43 MB of GPU memory, three of them ~130 MB, and a 2048² tile ~21 MB.
  UASTC transcodes to **ASTC 4x4** on Quest 3 (1 B/texel, ~11 MB per backdrop: **4x less memory**, and less texture bandwidth in a frame that is already at budget).
  Desktop gets BC7/ETC2.
  It also removes the multi-hundred-ms main-thread JPEG decode and mipmap generation for each 4K still (the mips come from the file).
- **Cost:** bigger downloads with UASTC. The 4096-wide test backdrop was 5.6 MB as UASTC+zstd vs 1.4 MB as JPEG q92. ETC1S (`--ktx2 etc1s`) is about JPEG-sized but visibly lossier on painted gradients.
  Encoding takes seconds per image. The transcoder is ~560 KB (wasm + js), fetched only when a `.ktx2` is listed.
- **Implementation:** `python3 tools/prepare_art.py --stills --ktx2` writes `<still>.ktx2` next to each still using `toktx` (KTX-Software 4.4.2) or `basisu`.
  The output is UASTC level 2, RDO 1.0, zstd 18, a full mip chain, sRGB, the origin flipped to match three's UVs, and sizes rounded to multiples of 4.
  With neither encoder installed, it says so and the JPEG path is untouched. `scan_assets.py` lists each `.ktx2` (ignoring stale ones) under `"ktx2"` in the manifest.
  `app/textures.js` lazily imports three r160's `KTX2Loader` (vendored in `vendor/three-examples/` with `basis_transcoder.wasm`) and transcodes in a worker.
  **Any failure falls back to the JPEG**, and `?ktx2=0` / `USE_KTX2: false` forces JPEG. Verified headlessly: compressed upload, same picture as the JPEG
  (correlation 0.996, mean diff 0.4/255; a flipped image would correlate about 0), and a corrupt `.ktx2` falls back to the JPEG.
- **Shipped since Oct 18 2026 (ETC1S).** With the 4K stills in, every still has a `.ktx2` next to its JPEG: `python3 tools/prepare_art.py --stills --q 86 --ktx2 etc1s`.
  ETC1S rather than UASTC because of the 25 MB chat limit on the deploy zip: UASTC was 6.3 MB per 4K backdrop vs 1.3 MB for ETC1S (clevel 3, qlevel 220).
  On Quest 3, three's KTX2Loader transcodes ETC1S to ETC2 RGB (0.5 B/texel); desktop gets BC7 (1 B/texel). The JPEG fallbacks were re-encoded at q86 4:2:0 from the
  lossless crops in `art-src/` to make room. **GPU memory for the stills (with mips): ride ≈ 33 MB on Quest via KTX2** (3 backdrops ≈ 18 MB, tunnel/walls/rock tiles ≈ 8.4 MB,
  dash 0.7 MB, vein mask PNG 5.6 MB), **vs ≈ 220 MB on the JPEG fallback**. The float panorama adds ≈ 5.6 MB (KTX2) / ≈ 45 MB (JPEG), and only once float mode is used.
  `?ktx2=0` still forces the JPEGs. Verified headlessly: all 7 ride stills load compressed, the picture matches the JPEG path, and a corrupt `.ktx2` falls back.

## Ride art (Oct 2026)
- `tex/tunnel.jpg` — colour, seamless 1024² rock tile with cyan veins for the ride tunnel (gain 1.25 + lighter fog 0.038 so the view through the window is a little brighter). `tex/walls.jpg` stays for float mode.
- `tex/cockpit-dash.jpg` — instrument console cropped from the cockpit concept, on the dashboard slope right of the music panel. Cockpit: gunmetal palette, oval (superellipse) front window with a raised frame, round skylight.
- `tex/chamber-{jelly,vents,pillars}.jpg` — window-framed paintings with the frame cropped off, shown as soft-edged backdrops (dark rock fades out by luminance) on the inside wall of chambers 1-3.
- Loops 04 (jelly portrait, cropped off its vent) and 05 (ice ray) sit in front of the jelly-hall and ice-pillar backdrops. At most `MAX_LOOP_VIDEOS` (3) decode at once: nearest within 45 m in the ride, first three in float mode.
- Regenerate the stills from the original attachments: `python3 tools/prepare_art.py <attachments dir>` (full source resolution now; see **High-res stills**); manifest: `python3 tools/scan_assets.py`. The HMD grade (brightness, contrast, vein glow, fog) is applied at runtime from `config.js`, not baked into the JPEGs, so re-running `prepare_art.py` keeps it.
- Screenshots after the Oct 14 headset fixes: `screens/40-cockpit.png`, `41-chamber-jelly.png`, `42-chamber-vents.png`, `43-chamber-pillars.png`, `44-tunnel.png`, `45-entry-speed.png`, `46-dashboard-speed.png`. `30-34` show the earlier look, for comparison.
