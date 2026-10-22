# EUROPA — Surface Section Spike

Engineering spike for the Europa surface experience (PC Link target).
Built by Mars, October 2026. **Kai integrates into the main Europa build** —
he's the builder of record; Leyra oversees.

## What this proves

- **The look**: sunlit Europan ice under a black sky, Jupiter hanging motionless
  (~12° across, tidally locked — it never rises or sets), hard sunlight with real
  shadows, helmet-rim suit presence.
- **The 90 fps budget** on PC Link: watch the HUD fps meter in-headset.
- **The architecture**: start-menu-split-friendly scene design with per-teleport
  asset groups (`registerLocation` / `loadLocation` in `src/main.js`) — only the
  active location's group is resident.

## The three survey points

1. **Open Ice Plain** — flat ice, distant pressure ridges, Jupiter ahead.
2. **Crevasse** — walkable canyon between fractured ice walls, fallen slabs.
3. **Ridge Overlook** — raised platform over heavy ridging, big Jupiter view.

Teleport via the glowing rings (XR controller select, or click on desktop),
or the buttons at the bottom of the screen.

## How to run (Scott)

1. `cd europa-surface-spike` and serve it: `npx serve .`
   (any static server works; WebXR needs `http://localhost` or https)
2. In Chrome or Edge, open the local URL.
3. With Quest Link active: click **Enter VR**, put the headset on.
4. Desktop check first is fine: drag to look, click rings to teleport.

Link settings that matter (Quest Link PC app): wired cable, 90 Hz,
render resolution 1.0× to start (push up only if fps holds),
encoding bitrate as high as the cable allows, codec HEVC
(this card has no AV1 encode — that comes with the 40/50-series upgrade).

## Controls

| | VR | Desktop |
|---|---|---|
| Look | headset | drag mouse |
| Teleport | point + trigger on a glowing ring | click a ring / bottom buttons |

## What's stubbed (for Kai's integration pass)

- **Textures**: procedural canvas ice (1024²). Production path: generated 4K/8K
  ice → KTX2/Basis (transcodes to BC7 on desktop — the existing pipeline
  carries over unchanged). Swap `makeIceTextures()` for `KTX2Loader` assets.
- **Per-location dispose**: `loadLocation` currently hides the previous group;
  production should `dispose()` geometries/materials/textures on unload.
- **Menu**: this spike starts directly on the surface. The main build's start
  menu (Surface / Depths) wraps it; never keep both scenes resident.
- **Audio**: no-atmosphere sound design still open — muffled suit interior,
  radio crackle, silence outside the helmet.
- **fps meter**: HUD overlay only. Consider an in-XR readout for tuning.

## Asset credits

- Jupiter texture: NASA/JPL-Caltech/SwRI/MSSS — JunoCam PIA21384 (public domain).
  Used with credit; no NASA endorsement implied.
- Everything else procedural (Mars).

## Perf notes (RTX 2060 Super target)

- Shadow map 2048, follows the player (frustum ±45 m). Raise to 4096 only if
  the fps budget allows.
- `setPixelRatio` capped at 2. On Link, the app's render-resolution slider is
  the main supersampling lever — validate at 1.0× first.
- Stars are a single `Points` draw call; Jupiter one sphere. Cheap by design.
